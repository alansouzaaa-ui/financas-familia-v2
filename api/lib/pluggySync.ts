// Aplica as transações Pluggy no payload do Gist. Lib pura, sem I/O e sem mutar entradas.
import type { SyncPayload } from '../../src/lib/syncService'
import type { PluggyAccountLink, PluggySeen, PluggyState } from '../../src/lib/pluggyState'
import { MONTHS, type MonthAbbr, type MonthItem, type MonthRecord } from '../../src/types/finance'
import { totalsFromItems } from '../../src/lib/monthTotals'
import {
  billMonthKey, describe, fingerprint, isIgnored, signedValue, spDate, tagFor,
  type PluggyBill, type PluggyTx,
} from './pluggyMapping'

export interface AccountFetch { account: PluggyAccountLink; transactions: PluggyTx[]; bills: PluggyBill[]; windowFrom: string }
export interface SyncCounts { created: number; updated: number; moved: number; removed: number; skippedDuplicates: number }

const SEEN_TTL_DAYS = 400
const keyOf = (m: Pick<MonthRecord, 'month' | 'year'>) => `${m.year}-${String(MONTHS.indexOf(m.month) + 1).padStart(2, '0')}`
const sameCents = (a: number, b: number) => Math.round(Math.abs(a - b) * 100) <= 1 // ±R$0,01 sem erro de ponto flutuante
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000

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

  const processedAccounts = new Set<string>()
  for (const { account, transactions, bills, windowFrom } of fetched) {
    if (!account.cardId) continue
    processedAccounts.add(account.id)
    const billMap = new Map(bills.map(b => [b.id, b]))
    const fetchedIds = new Set(transactions.map(t => t.id))
    const reusedPending = new Set<string>()
    const usedManual = new Set<string>()
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

    for (const tx of sorted) {
      const date = spDate(tx.date)
      const ym = billMonthKey(tx, billMap, account, opts.cardDueDays[account.cardId])
      const value = signedValue(tx)
      const desc = describe(tx)
      const pending = tx.status === 'PENDING'
      const known = seen[tx.id]

      if (known) {
        if (known.appItemId) {
          const loc = find(known.appItemId)
          if (loc && untouched(loc, known)) known.fp = reconcileItem(loc, value, desc, ym)
        }
        known.pending = pending
        known.value = value
        continue
      }

      const entry: PluggySeen = { appItemId: null, fp: '', at: nowIso, accountId: account.id, value, date, pending }
      if (isIgnored(tx)) { seen[tx.id] = entry; continue }

      // Pendente antigo que sumiu e reaparece com id novo.
      const replaced = Object.entries(seen).find(([id, e]) =>
        e.pending && e.accountId === account.id && e.appItemId && !fetchedIds.has(id) && !reusedPending.has(id) &&
        sameCents(e.value, value) && dayDiff(e.date, date) <= 3)
      if (replaced) {
        const [oldId, oldEntry] = replaced
        reusedPending.add(oldId)
        const loc = find(oldEntry.appItemId!)
        entry.appItemId = oldEntry.appItemId
        entry.fp = loc && untouched(loc, oldEntry) ? reconcileItem(loc, value, desc, ym) : oldEntry.fp
        seen[oldId] = { ...oldEntry, appItemId: null, pending: false }
        seen[tx.id] = entry
        continue
      }

      // Duplicata de lançamento não-Pluggy do mesmo cartão no mesmo mês.
      const target = monthFor(ym)
      const dup = target.items!.find(it =>
        !usedManual.has(it.id) && it.cardId === account.cardId && it.source !== 'pluggy' &&
        !(it.externalId ?? '').startsWith('pluggy:') &&
        sameCents(it.value, value) &&
        (!it.occurredAt || dayDiff(spDate(it.occurredAt), date) <= 3))
      if (dup) {
        usedManual.add(dup.id)
        counts.skippedDuplicates++
        seen[tx.id] = entry
        continue
      }

      const id = `pluggy:${tx.id}`
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
    for (const [id, e] of Object.entries(seen)) {
      if (e.accountId !== account.id || !e.pending || fetchedIds.has(id) || reusedPending.has(id)) continue
      if (e.date < windowFrom) continue
      if (e.appItemId) {
        const loc = find(e.appItemId)
        if (loc && untouched(loc, e)) {
          loc.rec.items!.splice(loc.idx, 1)
          touched.add(loc.rec)
          counts.removed++
        }
      }
      seen[id] = { ...e, appItemId: null, pending: false }
    }
  }

  // Poda: mais de 400 dias e sem item correspondente.
  const cutoff = opts.now.getTime() - SEEN_TTL_DAYS * 86_400_000
  for (const [id, e] of Object.entries(seen)) {
    if (Date.parse(e.at) < cutoff && (!e.appItemId || !find(e.appItemId))) delete seen[id]
  }

  for (const rec of touched) Object.assign(rec, totalsFromItems(rec.items ?? []))

  return {
    payload: { ...payload, manual_months: months },
    state: {
      ...state,
      seen,
      accounts: state.accounts.map(a => (processedAccounts.has(a.id) ? { ...a, syncedOnce: true } : a)),
    },
    counts,
  }
}
