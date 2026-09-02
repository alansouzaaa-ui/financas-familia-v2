import type { MonthRecord, MonthItem } from '../../src/types/finance'
import type { SyncPayload } from '../../src/lib/syncService'

/**
 * Union-merges two arrays of id-bearing records: any id present on either
 * side survives, incoming wins on id conflicts. This never loses an entry
 * that only one writer knows about (e.g. a Telegram-inserted item a stale
 * browser tab never pulled) — the trade-off is that a deletion made by one
 * writer does not propagate if another writer's payload still includes
 * that id. Acceptable for low-volume family use; see
 * docs/TELEGRAM_INTEGRATION.md.
 */
function unionById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of current) map.set(item.id, item)
  for (const item of incoming) map.set(item.id, item)
  return Array.from(map.values())
}

function recalcTotals(items: MonthItem[]): Pick<MonthRecord, 'revenue' | 'fixedCosts' | 'loans' | 'cards' | 'variableCosts'> {
  const totals = { revenue: 0, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0 }
  for (const item of items) totals[item.category] += item.value
  return totals
}

export function mergeManualMonths(current: MonthRecord[], incoming: MonthRecord[]): MonthRecord[] {
  const key = (m: MonthRecord) => `${m.year}-${m.month}`
  const currentMap = new Map(current.map(m => [key(m), m]))
  const incomingMap = new Map(incoming.map(m => [key(m), m]))
  const allKeys = new Set([...currentMap.keys(), ...incomingMap.keys()])

  const result: MonthRecord[] = []
  for (const k of allKeys) {
    const cur = currentMap.get(k)
    const inc = incomingMap.get(k)

    if (!cur) { result.push(inc!); continue }
    if (!inc) { result.push(cur); continue }

    const items = unionById(cur.items ?? [], inc.items ?? [])
    result.push({ ...cur, ...inc, ...recalcTotals(items), items })
  }
  return result
}

export function mergeSyncPayload(current: SyncPayload | null, incoming: SyncPayload): SyncPayload {
  if (!current) return incoming
  return {
    manual_months: mergeManualMonths(current.manual_months ?? [], incoming.manual_months ?? []),
    goals: unionById(current.goals ?? [], incoming.goals ?? []),
    recurring_items: unionById(current.recurring_items ?? [], incoming.recurring_items ?? []),
    investment_positions: unionById(current.investment_positions ?? [], incoming.investment_positions ?? []),
  }
}
