import type { SyncPayload } from '../../src/lib/syncService'
import type { MonthAbbr, MonthItem, MonthRecord } from '../../src/types/finance'
import { totalsFromItems } from '../../src/lib/monthTotals'
import { mergeTombstones, type Tombstone } from '../../src/lib/tombstones'
import { unionClosedPositions, unionOperations } from '../../src/lib/operations'

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

/** Item gravado pelo servidor (Telegram ou Pluggy): preservado se o cliente desatualizado não o conhece. */
export function isServerItem(i: MonthItem): boolean {
  return isTelegramItem(i)
    || i.source === 'pluggy'
    || (typeof i.externalId === 'string' && i.externalId.startsWith('pluggy:'))
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
  // `pluggy` é do servidor: o cliente nunca sobrescreve (nem cria).
  const { pluggy: _ignored, ...incomingRest } = incoming
  void _ignored
  const dead = new Set(tombstones.map(t => t.id))
  // Item Pluggy tombstonado (pendente cancelado pelo servidor) que um cliente
  // desatualizado ainda tem: descarta e recalcula o total do mês.
  const incomingMonths = (incomingRest.manual_months ?? []).map(m => {
    const items = m.items ?? []
    const kept = items.filter(i => !(i.source === 'pluggy' && dead.has(i.id)))
    return kept.length === items.length ? m : { ...m, items: kept, ...totalsFromItems(kept) }
  })
  const base: SyncPayload = {
    ...incomingRest,
    manual_months: incomingMonths,
    deleted_ids: tombstones,
    ...(current?.pluggy ? { pluggy: current.pluggy } : {}),
  }

  const incomingIds = allItemIds(incoming.manual_months ?? [])
  const entries: RestoreEntry[] = []
  for (const m of current?.manual_months ?? []) {
    for (const item of m.items ?? []) {
      if (!isServerItem(item)) continue
      if (incomingIds.has(item.id) || dead.has(item.id)) continue
      entries.push({ month: m.month, year: m.year, item })
    }
  }
  const restoredItems = restoreItems(base, entries)

  // Livro de operações: união por id (a versão do cliente vence), sem os
  // tombstonados. Cliente antigo (campo ausente) mantém a lista atual do Gist.
  let result = restoredItems.payload
  let extra = 0
  const curOps = current?.investment_operations
  const inOps = incoming.investment_operations
  if (curOps || inOps) {
    const merged = unionOperations(curOps, inOps, dead)
    result = { ...result, investment_operations: merged }
    // Só conta quando o cliente conhece o campo; senão todo push de cliente antigo forçaria um pull.
    if (inOps) {
      const have = new Set(inOps.map(o => o.id))
      extra += merged.filter(o => !have.has(o.id)).length
    }
  }
  const curClosed = current?.closed_positions
  const inClosed = incoming.closed_positions
  if (curClosed || inClosed) {
    const merged = unionClosedPositions(curClosed, inClosed, dead)
    result = { ...result, closed_positions: merged }
    if (inClosed) {
      const have = new Set(inClosed.map(c => c.position.id))
      extra += merged.filter(c => !have.has(c.position.id)).length
    }
  }
  return { payload: result, restored: restoredItems.restored + extra }
}
