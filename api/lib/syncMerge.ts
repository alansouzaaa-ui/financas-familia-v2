import type { SyncPayload } from '../../src/lib/syncService'
import type { MonthAbbr, MonthItem, MonthRecord } from '../../src/types/finance'
import { totalsFromItems } from '../../src/lib/monthTotals'
import { mergeTombstones, type Tombstone } from '../../src/lib/tombstones'

export interface RestoreEntry {
  month: MonthAbbr
  year: number
  item: MonthItem
}

/** Item criado pelo webhook do Telegram (source ou prefixo do id/externalId). */
export function isTelegramItem(i: MonthItem): boolean {
  return i.source === 'telegram'
    || (typeof i.id === 'string' && i.id.startsWith('telegram:'))
    || (typeof i.externalId === 'string' && i.externalId.startsWith('telegram:'))
}

function allItemIds(months: MonthRecord[]): Set<string> {
  const ids = new Set<string>()
  for (const m of months) for (const i of m.items ?? []) ids.add(i.id)
  return ids
}

/**
 * Reinsere itens no mês/ano indicado (cria o mês se faltar, como 'manual') e
 * recalcula os totais dos meses tocados. Ignora ids que já existem em qualquer mês.
 * Não muta o payload de entrada.
 */
export function restoreItems(payload: SyncPayload, entries: RestoreEntry[]): { payload: SyncPayload; restored: number } {
  const months: MonthRecord[] = [...(payload.manual_months ?? [])]
  const present = allItemIds(months)
  const touched = new Set<string>()
  let restored = 0

  for (const e of entries) {
    if (present.has(e.item.id)) continue
    const idx = months.findIndex(m => m.month === e.month && m.year === e.year)
    const base: MonthRecord = idx >= 0
      ? months[idx]
      : { month: e.month, year: e.year, revenue: 0, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0, source: 'manual', items: [] }
    const next: MonthRecord = { ...base, items: [...(base.items ?? []), e.item] }
    if (idx >= 0) months[idx] = next
    else months.push(next)
    present.add(e.item.id)
    touched.add(`${e.year}-${e.month}`)
    restored++
  }

  if (restored === 0) return { payload, restored: 0 }

  const recomputed = months.map(m =>
    touched.has(`${m.year}-${m.month}`) ? { ...m, ...totalsFromItems(m.items ?? []) } : m)
  return { payload: { ...payload, manual_months: recomputed }, restored }
}

/**
 * Merge do POST /api/sync: o cliente continua autoritativo (edições e remoções
 * valem), mas itens do Telegram inseridos no Gist enquanto o cliente estava
 * desatualizado são preservados, a não ser que tenham sido apagados (tombstone).
 */
export function mergeIncoming(
  current: SyncPayload | null,
  incoming: SyncPayload,
  now: Date = new Date(),
): { payload: SyncPayload; restored: number } {
  const tombstones: Tombstone[] = mergeTombstones(current?.deleted_ids, incoming.deleted_ids, now)
  const base: SyncPayload = { ...incoming, deleted_ids: tombstones }

  const dead = new Set(tombstones.map(t => t.id))
  const incomingIds = allItemIds(incoming.manual_months ?? [])
  const entries: RestoreEntry[] = []
  for (const m of current?.manual_months ?? []) {
    for (const item of m.items ?? []) {
      if (!isTelegramItem(item)) continue
      if (incomingIds.has(item.id) || dead.has(item.id)) continue
      entries.push({ month: m.month, year: m.year, item })
    }
  }
  return restoreItems(base, entries)
}
