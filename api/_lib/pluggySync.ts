// Aplica as transações Pluggy no payload do Gist. Lib pura, sem I/O e sem mutar entradas.
import type { SyncPayload } from '../../src/lib/syncService'
import type { PluggyAccountLink, PluggySeen, PluggyState } from '../../src/lib/pluggyState'
import { MONTHS, type MonthAbbr, type MonthItem, type MonthRecord } from '../../src/types/finance'
import { totalsFromItems } from '../../src/lib/monthTotals'
import { mergeTombstones, type Tombstone } from '../../src/lib/tombstones'
import {
  addMonths, billMonthKey, describe, fingerprint, isIgnored, signedValue, spDate, tagFor,
  type PluggyBill, type PluggyTx,
} from './pluggyMapping'

export interface AccountFetch { account: PluggyAccountLink; transactions: PluggyTx[]; bills: PluggyBill[]; windowFrom: string }
export interface SyncCounts { created: number; updated: number; moved: number; removed: number; skippedDuplicates: number }

const SEEN_TTL_DAYS = 400
const keyOf = (m: Pick<MonthRecord, 'month' | 'year'>) => `${m.year}-${String(MONTHS.indexOf(m.month) + 1).padStart(2, '0')}`
const sameCents = (a: number, b: number) => Math.round(Math.abs(a - b) * 100) <= 1 // ±R$0,01 sem erro de ponto flutuante
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000
const withoutMatch = (e: PluggySeen): PluggySeen => {
  const copy = { ...e }
  delete copy.matchedItemId
  return copy
}

export function applyPluggySync(
  payload: SyncPayload,
  state: PluggyState,
  fetched: AccountFetch[],
  opts: { now: Date; cardDueDays: Record<string, number | undefined> },
): { payload: SyncPayload; state: PluggyState; counts: SyncCounts } {
  const months: MonthRecord[] = JSON.parse(JSON.stringify(payload.manual_months ?? []))
  const seen: Record<string, PluggySeen> = JSON.parse(JSON.stringify(state.seen ?? {}))
  const counts: SyncCounts = { created: 0, updated: 0, moved: 0, removed: 0, skippedDuplicates: 0 }
  const touched = new Set<MonthRecord>()
  const nowIso = opts.now.toISOString()
  // Ids apagados (tombstones): não reaproveitar ao recriar um item.
  const dead = new Set((payload.deleted_ids ?? []).map(t => t.id))
  const newTombstones: Tombstone[] = []
  // Itens Pluggy de contas que não existem mais (reconexão gera ids de conta novos).
  const live = new Set(state.accounts.map(a => a.id))
  const orphan = new Set(Object.values(seen).flatMap(e => (e.appItemId && !live.has(e.accountId) ? [e.appItemId] : [])))

  const monthFor = (ym: string): MonthRecord => {
    const [y, m] = ym.split('-').map(Number)
    const abbr = MONTHS[m - 1] as MonthAbbr
    let rec = months.find(r => r.year === y && r.month === abbr)
    if (!rec) {
      rec = { month: abbr, year: y, revenue: 0, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0, source: 'manual', items: [] }
      months.push(rec)
    }
    rec.items ??= []
    return rec
  }
  const find = (id: string): { rec: MonthRecord; idx: number } | null => {
    for (const rec of months) {
      const idx = (rec.items ?? []).findIndex(i => i.id === id)
      if (idx >= 0) return { rec, idx }
    }
    return null
  }
  const fpOf = (rec: MonthRecord, it: MonthItem) => fingerprint(it.value, it.description, keyOf(rec))
  const untouched = (loc: { rec: MonthRecord; idx: number }, entry: PluggySeen) =>
    !loc.rec.items![loc.idx].isPaid && fpOf(loc.rec, loc.rec.items![loc.idx]) === entry.fp

  /** Atualiza valor/descrição/mês de um item intocado. Devolve o novo fp. */
  const reconcileItem = (loc: { rec: MonthRecord; idx: number }, value: number, desc: string, ym: string): string => {
    const it = loc.rec.items![loc.idx]
    const changed = it.value !== value || it.description !== desc
    const updated: MonthItem = { ...it, value, description: desc }
    if (keyOf(loc.rec) !== ym) {
      loc.rec.items!.splice(loc.idx, 1)
      touched.add(loc.rec)
      const dest = monthFor(ym)
      dest.items!.push(updated)
      touched.add(dest)
      counts.moved++
    } else if (changed) {
      loc.rec.items![loc.idx] = updated
      touched.add(loc.rec)
      counts.updated++
    }
    return fingerprint(value, desc, ym)
  }

  /** Remove item Pluggy intocado (com tombstone). Devolve true se removeu. */
  const removeUntouched = (entry: PluggySeen): boolean => {
    if (!entry.appItemId) return false
    const loc = find(entry.appItemId)
    if (!loc || !untouched(loc, entry)) return false
    loc.rec.items!.splice(loc.idx, 1)
    touched.add(loc.rec)
    counts.removed++
    dead.add(entry.appItemId)
    newTombstones.push({ id: entry.appItemId, at: nowIso })
    return true
  }
  const startDate = state.startDate ?? null
  const beforeStart = (date: string) => !!startDate && date < startDate
  // Fatura importada por PDF manda no mês: Pluggy não cria item novo nele (mesmo cartão).
  const hasImport = (ym: string, cardId: string) =>
    months.some(r => keyOf(r) === ym && (r.items ?? []).some(it => it.source === 'import' && it.cardId === cardId))

  const processedAccounts = new Set<string>()
  for (const { account, transactions, bills, windowFrom } of fetched) {
    if (!account.cardId) continue
    processedAccounts.add(account.id)
    const billMap = new Map(bills.map(b => [b.id, b]))
    const fetchedIds = new Set(transactions.map(t => t.id))
    const reusedPending = new Set<string>()
    const usedManual = new Set<string>(Object.values(seen).flatMap(e => (e.matchedItemId ? [e.matchedItemId] : [])))
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

    for (const tx of sorted) {
      const date = spDate(tx.date)
      const ym = billMonthKey(tx, billMap, account, opts.cardDueDays[account.cardId])
      const value = signedValue(tx)
      const desc = describe(tx)
      const pending = tx.status === 'PENDING'
      let known: PluggySeen | undefined = seen[tx.id]
      // Pendente que cancelamos e voltou: trata como transação nova.
      if (known?.cancelled) {
        delete seen[tx.id]
        known = undefined
      }
      // Pulada pela data inicial ou pelo PDF e o motivo não vale mais: processa como nova.
      if (known && !known.appItemId && known.skip &&
        !(known.skip === 'start' ? beforeStart(date) : hasImport(ym, account.cardId))) {
        delete seen[tx.id]
        known = undefined
      }

      if (known) {
        if (known.appItemId && (isIgnored(tx) || beforeStart(date))) {
          // Passou a ser ignorada (ex.: linha de fatura anterior) ou é anterior à data inicial.
          if (removeUntouched(known)) {
            known.appItemId = null
            if (!isIgnored(tx)) known.skip = 'start'
          }
        } else if (known.appItemId) {
          const loc = find(known.appItemId)
          if (loc && untouched(loc, known)) known.fp = reconcileItem(loc, value, desc, ym)
        }
        known.pending = pending
        known.date = date
        known.value = value
        continue
      }

      const entry: PluggySeen = { appItemId: null, fp: '', at: nowIso, accountId: account.id, value, date, pending }
      if (isIgnored(tx)) { seen[tx.id] = entry; continue }
      if (beforeStart(date)) { seen[tx.id] = { ...entry, skip: 'start' }; continue }

      // Pendente antigo que sumiu e reaparece com id novo.
      const replaced = Object.entries(seen).find(([id, e]) =>
        !pending && e.pending && e.accountId === account.id && (e.appItemId || e.matchedItemId) &&
        !fetchedIds.has(id) && !reusedPending.has(id) &&
        sameCents(e.value, value) && dayDiff(e.date, date) <= 3)
      if (replaced) {
        const [oldId, oldEntry] = replaced
        reusedPending.add(oldId)
        if (!oldEntry.appItemId) {
          // O pendente tinha casado com um item manual/Telegram: o POSTED herda o casamento.
          entry.matchedItemId = oldEntry.matchedItemId
          seen[oldId] = { ...withoutMatch(oldEntry), pending: false }
          seen[tx.id] = entry
          counts.skippedDuplicates++
          continue
        }
        const loc = find(oldEntry.appItemId)
        entry.appItemId = oldEntry.appItemId
        entry.fp = loc && untouched(loc, oldEntry) ? reconcileItem(loc, value, desc, ym) : oldEntry.fp
        seen[oldId] = { ...oldEntry, appItemId: null, pending: false }
        seen[tx.id] = entry
        continue
      }

      // Duplicata de lançamento não-Pluggy (ou Pluggy órfão) do mesmo cartão, no mês da
      // fatura ou num mês vizinho (Telegram/manual podem cair um mês ao lado).
      // Item sem data (ex.: recorrente) só vale no próprio mês da fatura; nos vizinhos exige data a ≤ 3 dias.
      const candidates = [ym, addMonths(ym, -1), addMonths(ym, 1)].flatMap(k =>
        months.filter(r => keyOf(r) === k).flatMap(r => (r.items ?? []).map(it => ({ it, sameMonth: k === ym }))))
      // Parcela "(NN/TT)": casa pelo sufixo mesmo com data diferente (PDF usa a data da compra original).
      const instSuffix = /\(\d{2}\/\d{2,}\)/.exec(desc)?.[0]
      const dup = candidates.find(({ it, sameMonth }) =>
        !usedManual.has(it.id) && it.cardId === account.cardId &&
        (orphan.has(it.id) || (it.source !== 'pluggy' && !(it.externalId ?? '').startsWith('pluggy:'))) &&
        sameCents(it.value, value) &&
        ((instSuffix && it.description.includes(instSuffix)) ||
          (it.occurredAt ? dayDiff(spDate(it.occurredAt), date) <= 3 : sameMonth)))?.it
      if (dup) {
        usedManual.add(dup.id)
        entry.matchedItemId = dup.id
        counts.skippedDuplicates++
        seen[tx.id] = entry
        continue
      }
      if (hasImport(ym, account.cardId)) {
        counts.skippedDuplicates++
        seen[tx.id] = { ...entry, skip: 'import' }
        continue
      }

      // Id tombstonado (pendente cancelado que voltou): usa sufixo para o cliente não apagá-lo.
      let id = `pluggy:${tx.id}`
      for (let n = 2; dead.has(id); n++) id = `pluggy:${tx.id}:${n}`
      const target = monthFor(ym)
      const tag = value > 0 ? tagFor(desc, tx.category) : undefined
      target.items!.push({
        id, externalId: id, source: 'pluggy', description: desc, value, category: 'cards',
        isPaid: false, cardId: account.cardId, occurredAt: `${date}T15:00:00.000Z`,
        ...(tag ? { tag } : {}),
      })
      touched.add(target)
      counts.created++
      entry.appItemId = id
      entry.fp = fingerprint(value, desc, ym)
      seen[tx.id] = entry
    }

    // Pendentes que sumiram na janela consultada -> cancelados.
    // Lista vazia pode ser leitura incompleta: não cancela nada (é irreversível).
    if (transactions.length === 0) continue
    for (const [id, e] of Object.entries(seen)) {
      if (e.accountId !== account.id || !e.pending || fetchedIds.has(id) || reusedPending.has(id)) continue
      if (e.date < windowFrom) continue
      let kept = false // item pago/editado/apagado pelo usuário: não recriar se o id voltar
      if (e.appItemId && !removeUntouched(e)) kept = true
      // Sem matchedItemId: o item manual casado fica livre para outra transação.
      seen[id] = { ...withoutMatch(e), appItemId: null, pending: false, ...(kept ? {} : { cancelled: true }) }
    }
  }

  // Limpeza: itens Pluggy intocados de compras anteriores à data inicial (mesmo fora da janela lida).
  if (startDate) {
    for (const e of Object.values(seen)) {
      if (e.appItemId && beforeStart(e.date) && removeUntouched(e)) {
        e.appItemId = null
        e.skip = 'start'
      }
    }
  }

  // Poda: mais de 400 dias e sem item correspondente.
  const cutoff = opts.now.getTime() - SEEN_TTL_DAYS * 86_400_000
  for (const [id, e] of Object.entries(seen)) {
    if (Date.parse(e.at) < cutoff && (!e.appItemId || !find(e.appItemId))) delete seen[id]
  }

  for (const rec of touched) Object.assign(rec, totalsFromItems(rec.items ?? []))

  return {
    payload: {
      ...payload,
      manual_months: months,
      // Tombstone impede que push atrasado de outro aparelho traga o pendente cancelado de volta.
      ...(newTombstones.length ? { deleted_ids: mergeTombstones(payload.deleted_ids, newTombstones, opts.now) } : {}),
    },
    state: {
      ...state,
      seen,
      accounts: state.accounts.map(a => (processedAccounts.has(a.id) ? { ...a, syncedOnce: true } : a)),
    },
    counts,
  }
}
