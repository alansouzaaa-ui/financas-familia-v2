// Orquestração da integração Pluggy (testável: dependências injetadas). Sem logs de dados.
import type { SyncPayload } from '../../src/lib/syncService'
import { toStatusView, type PluggyAccountLink, type PluggyState, type PluggyStatusView } from '../../src/lib/pluggyState'
import { PluggyError, type PluggyClient } from './pluggyClient'
import { applyPluggySync, type AccountFetch } from './pluggySync'
import { billMonthKey, isIgnored, signedValue, spDate, toYmd, windowStart, type PluggyBill } from './pluggyMapping'

export interface Deps {
  client: PluggyClient
  load: () => Promise<SyncPayload | null>
  save: (p: SyncPayload) => Promise<void>
  now: () => Date
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GUARD_MS = 60_000
const emptyPayload = (): SyncPayload => ({ manual_months: [], goals: [], recurring_items: [], investment_positions: [] })

/**
 * Lê as contas de cartão do item e herda o vínculo (cardId) das contas anteriores.
 * Item novo (reconectar): as contas mudam de id, então casa também pelos 4 últimos
 * dígitos; essas contas começam com syncedOnce=false (janela da 1ª sync).
 */
async function refreshAccounts(
  client: PluggyClient, itemId: string, prev: PluggyAccountLink[], newItem = false,
): Promise<PluggyAccountLink[]> {
  const accounts = await client.getCreditAccounts(itemId)
  return accounts.map(a => {
    const last4 = a.number ? String(a.number).slice(-4) : null
    const byId = prev.find(p => p.id === a.id)
    const byLast4 = !byId && newItem && last4 ? prev.find(p => p.last4 === last4) : undefined
    const old = byId ?? byLast4
    return {
      id: a.id,
      name: a.name,
      last4,
      cardId: old?.cardId ?? null,
      closeDate: toYmd(a.creditData?.balanceCloseDate),
      dueDate: toYmd(a.creditData?.balanceDueDate),
      syncedOnce: byId?.syncedOnce ?? false,
    }
  })
}

function itemFields(item: Awaited<ReturnType<PluggyClient['getItem']>>) {
  return {
    itemStatus: item.status,
    itemError: item.error?.code ?? null,
    consentExpiresAt: item.consentExpiresAt ?? null,
  }
}

export async function readStatus(deps: Deps): Promise<PluggyStatusView> {
  return toStatusView((await deps.load())?.pluggy, true)
}

export async function registerItem(deps: Deps, itemId: string): Promise<PluggyStatusView> {
  const id = itemId.trim()
  if (!UUID_RE.test(id)) throw new Error('ID da conexão inválido: copie o ID do item no painel da Pluggy.')
  const item = await deps.client.getItem(id)
  const current = (await deps.load()) ?? emptyPayload()
  const prev = current.pluggy
  const newItem = !!prev && prev.itemId !== id
  const accounts = await refreshAccounts(deps.client, id, prev?.accounts ?? [], newItem)
  const state: PluggyState = {
    itemId: id,
    ...itemFields(item),
    accounts,
    lastSyncAt: prev?.lastSyncAt ?? null,
    lastResult: newItem ? null : prev?.lastResult ?? null,
    seen: prev?.seen ?? {},
    startDate: prev?.startDate ?? null,
  }
  const fresh = (await deps.load()) ?? emptyPayload()
  await deps.save({ ...fresh, pluggy: state })
  return toStatusView(state, true)
}

export async function mapAccount(deps: Deps, accountId: string, cardId: string | null): Promise<PluggyStatusView> {
  const current = (await deps.load()) ?? emptyPayload()
  const state = current.pluggy
  if (!state) throw new Error('Nenhuma conexão registrada.')
  if (!state.accounts.some(a => a.id === accountId)) throw new Error('Conta não encontrada na conexão.')
  if (cardId && !(current.card_accounts ?? []).some(c => c.id === cardId)) throw new Error('Cartão do app não encontrado.')
  const next: PluggyState = { ...state, accounts: state.accounts.map(a => (a.id === accountId ? { ...a, cardId } : a)) }
  await deps.save({ ...current, pluggy: next })
  return toStatusView(next, true)
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const isValidYmd = (s: string) => {
  if (!YMD_RE.test(s)) return false
  const t = Date.parse(`${s}T12:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s
}

/** Data inicial do sync: compras anteriores nunca entram (e itens Pluggy intocados delas saem). */
export async function setStartDate(deps: Deps, startDate: string | null): Promise<PluggyStatusView> {
  if (startDate !== null && !isValidYmd(startDate)) throw new Error('Data inicial inválida: use AAAA-MM-DD.')
  const current = (await deps.load()) ?? emptyPayload()
  const state = current.pluggy
  if (!state) throw new Error('Nenhuma conexão registrada.')
  const next: PluggyState = { ...state, startDate }
  await deps.save({ ...current, pluggy: next })
  return toStatusView(next, true)
}

/** Janela de consulta: nunca antes da data inicial. */
function fetchFrom(acc: PluggyAccountLink, bills: PluggyBill[], state: PluggyState): string {
  const from = windowStart(acc, bills, state.lastSyncAt)
  return state.startDate && state.startDate > from ? state.startDate : from
}

export async function runSync(deps: Deps): Promise<PluggyStatusView> {
  const now = deps.now()
  const before = (await deps.load())?.pluggy
  if (!before) throw new Error('Nenhuma conexão registrada.')
  if (before.lastResult && now.getTime() - Date.parse(before.lastResult.at) < GUARD_MS) {
    return toStatusView(before, true)
  }

  let itemPart: Partial<PluggyState> = {}
  let accounts = before.accounts
  const fetched: AccountFetch[] = []
  const errors: string[] = []
  try {
    itemPart = itemFields(await deps.client.getItem(before.itemId))
    accounts = await refreshAccounts(deps.client, before.itemId, before.accounts)
    const dateTo = spDate(new Date(now.getTime() + 86_400_000).toISOString())
    for (const acc of accounts) {
      if (!acc.cardId) continue
      let stage = 'faturas'
      try {
        const bills = await deps.client.getBills(acc.id)
        stage = 'compras'
        const windowFrom = fetchFrom(acc, bills, before)
        const transactions = await deps.client.getTransactions(acc.id, windowFrom, dateTo)
        fetched.push({ account: acc, transactions, bills, windowFrom })
      } catch (err) {
        let detail = `erro inesperado (${err instanceof Error ? err.name : 'desconhecido'})`
        if (err instanceof PluggyError) {
          const m = /^Pluggy respondeu \d+: (.+)$/.exec(err.message)
          detail = m ? `${err.status} — ${m[1]}` : `${err.status}`
        }
        errors.push(`Falha ao ler ${acc.name} (${stage}: ${detail}).`)
      }
    }
  } catch {
    errors.push('Não foi possível falar com a Pluggy. Nova tentativa amanhã.')
  }

  // Relê o Gist logo antes de gravar para não pisar em push recente do app.
  const fresh = (await deps.load()) ?? emptyPayload()
  // Preserva cardId de um map-account feito durante o sync em andamento.
  const merged = accounts.map(a => {
    const live = fresh.pluggy?.accounts.find(x => x.id === a.id)
    return live ? { ...a, cardId: live.cardId } : a
  })
  const base: PluggyState = { ...(fresh.pluggy ?? before), ...itemPart, accounts: merged }
  const cardDueDays = Object.fromEntries((fresh.card_accounts ?? []).map(c => [c.id, c.dueDay]))
  const applied = applyPluggySync(fresh, base, fetched, { now, cardDueDays })
  // lastSyncAt só avança se ao menos uma conta foi lida (ou não havia erro algum).
  const advanced = fetched.length > 0 || errors.length === 0
  const state: PluggyState = {
    ...applied.state,
    lastSyncAt: advanced ? now.toISOString() : before.lastSyncAt,
    lastResult: { at: now.toISOString(), ok: errors.length === 0, ...applied.counts, ...(errors.length ? { error: errors.join(' ') } : {}) },
  }
  await deps.save({ ...applied.payload, pluggy: state })
  return toStatusView(state, true)
}

const tail = (s: string | null | undefined) => (s ? String(s).slice(-6) : null)

/** Diagnóstico somente leitura: nunca grava no Gist nem loga. Campos mínimos, ids truncados. */
export async function inspect(deps: Deps) {
  const payload = await deps.load()
  const state = payload?.pluggy
  if (!state) throw new Error('Nenhuma conexão registrada.')
  const now = deps.now()
  const item = await deps.client.getItem(state.itemId)
  const rawAccounts = await deps.client.getCreditAccounts(state.itemId)
  const dateTo = spDate(new Date(now.getTime() + 86_400_000).toISOString())
  const cardDueDays = Object.fromEntries((payload?.card_accounts ?? []).map(c => [c.id, c.dueDay]))
  const cards = []
  for (const acc of state.accounts) {
    if (!acc.cardId) continue
    const rawBills = await deps.client.getBillsRaw(acc.id)
    const bills = await deps.client.getBills(acc.id)
    const billMap = new Map(bills.map(b => [b.id, b]))
    const windowFrom = fetchFrom(acc, bills, state)
    const txs = await deps.client.getTransactions(acc.id, windowFrom, dateTo)
    cards.push({
      link: { name: acc.name, closeDate: acc.closeDate, dueDate: acc.dueDate, syncedOnce: acc.syncedOnce },
      windowFrom,
      bills: rawBills.map(b => ({ idTail: tail(b.id), dueDate: b.dueDate, billClosingDate: b.billClosingDate ?? null })),
      transactions: txs.map(tx => {
        const seen = state.seen[tx.id]
        const md = tx.creditCardMetadata
        return {
          idTail: tail(tx.id),
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          status: tx.status,
          category: tx.category,
          billIdTail: tail(md?.billId),
          installment: md?.installmentNumber && md?.totalInstallments ? `${md.installmentNumber}/${md.totalInstallments}` : null,
          ignored: isIgnored(tx),
          month: billMonthKey(tx, billMap, acc, cardDueDays[acc.cardId!]),
          signedValue: signedValue(tx),
          seen: seen ? { appItemTail: tail(seen.appItemId), matchedTail: tail(seen.matchedItemId), cancelled: !!seen.cancelled, pending: seen.pending } : null,
        }
      }),
    })
  }
  return {
    item: { status: item.status, executionStatus: item.executionStatus ?? null, lastUpdatedAt: (item as { lastUpdatedAt?: string | null }).lastUpdatedAt ?? null, consentExpiresAt: item.consentExpiresAt ?? null },
    accounts: rawAccounts.map(a => ({ id: tail(a.id), name: a.name, number: a.number ?? null, balanceCloseDate: a.creditData?.balanceCloseDate ?? null, balanceDueDate: a.creditData?.balanceDueDate ?? null })),
    lastSyncAt: state.lastSyncAt,
    cards,
  }
}
