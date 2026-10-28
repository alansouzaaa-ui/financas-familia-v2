import { describe, it, expect } from 'vitest'
import { mergeIncoming, restoreItems, isTelegramItem } from '../../../api/lib/syncMerge'
import type { SyncPayload } from '../../../src/lib/syncService'
import type { MonthItem, MonthRecord } from '../../../src/types/finance'

const NOW = new Date('2026-10-26T12:00:00.000Z')

function item(id: string, over: Partial<MonthItem> = {}): MonthItem {
  return { id, description: id, value: 10, category: 'variableCosts', isPaid: true, ...over }
}
function tg(n: number, over: Partial<MonthItem> = {}): MonthItem {
  const id = `telegram:1:${n}`
  return item(id, { source: 'telegram', externalId: id, value: 50, ...over })
}
function month(m: MonthRecord['month'], year: number, items: MonthItem[], over: Partial<MonthRecord> = {}): MonthRecord {
  const t = { revenue: 0, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0, renegociacoes: 0 }
  for (const i of items) t[i.category] += i.value
  return { month: m, year, source: 'manual', items, ...t, ...over }
}
function payload(months: MonthRecord[], over: Partial<SyncPayload> = {}): SyncPayload {
  return { manual_months: months, goals: [], recurring_items: [], investment_positions: [], ...over }
}
const allIds = (p: SyncPayload) => p.manual_months.flatMap(m => (m.items ?? []).map(i => i.id))
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString()

describe('isTelegramItem', () => {
  it('detects by source, id prefix or externalId prefix', () => {
    expect(isTelegramItem(item('a', { source: 'telegram' }))).toBe(true)
    expect(isTelegramItem(item('telegram:1:2'))).toBe(true)
    expect(isTelegramItem(item('x', { externalId: 'telegram:1:2' }))).toBe(true)
    expect(isTelegramItem(item('x', { source: 'manual' }))).toBe(false)
  })
})

describe('mergeIncoming', () => {
  it('keeps a telegram item added to the Gist while the client was stale', () => {
    const current = payload([month('Out', 2026, [item('a'), tg(1)])])
    const incoming = payload([month('Out', 2026, [item('a')])])
    const { payload: merged, restored } = mergeIncoming(current, incoming, NOW)
    expect(restored).toBe(1)
    expect(allIds(merged)).toEqual(['a', 'telegram:1:1'])
  })

  it('does not resurrect a tombstoned telegram item (incoming tombstone)', () => {
    const current = payload([month('Out', 2026, [tg(1)])])
    const incoming = payload([month('Out', 2026, [item('a')])], { deleted_ids: [{ id: 'telegram:1:1', at: iso(1) }] })
    const { payload: merged, restored } = mergeIncoming(current, incoming, NOW)
    expect(restored).toBe(0)
    expect(allIds(merged)).toEqual(['a'])
  })

  it('does not resurrect when the tombstone only exists in the current Gist', () => {
    const current = payload([month('Out', 2026, [tg(1)])], { deleted_ids: [{ id: 'telegram:1:1', at: iso(1) }] })
    const incoming = payload([month('Out', 2026, [])])
    expect(mergeIncoming(current, incoming, NOW).restored).toBe(0)
  })

  it('does not duplicate an item the client edited or moved to another month', () => {
    const current = payload([month('Out', 2026, [tg(1)])])
    const incoming = payload([month('Nov', 2026, [tg(1, { description: 'editado' })])])
    const { payload: merged, restored } = mergeIncoming(current, incoming, NOW)
    expect(restored).toBe(0)
    expect(allIds(merged)).toEqual(['telegram:1:1'])
    expect(merged.manual_months).toHaveLength(1)
    expect(merged.manual_months[0].items?.[0].description).toBe('editado')
  })

  it('does not restore non-telegram items absent from incoming (client deletions work)', () => {
    const current = payload([month('Out', 2026, [item('a'), item('b', { source: 'manual' })])])
    const incoming = payload([month('Out', 2026, [item('a')])])
    const { payload: merged, restored } = mergeIncoming(current, incoming, NOW)
    expect(restored).toBe(0)
    expect(allIds(merged)).toEqual(['a'])
  })

  it('recomputes totals of the touched month from all categories incl. renegociacoes', () => {
    const reneg = item('r', { category: 'renegociacoes', value: 7 })
    const current = payload([month('Out', 2026, [reneg, tg(1)])])
    const incoming = payload([month('Out', 2026, [reneg], { renegociacoes: 7, variableCosts: 999 })])
    const { payload: merged } = mergeIncoming(current, incoming, NOW)
    const out = merged.manual_months[0]
    expect(out.variableCosts).toBe(50)
    expect(out.renegociacoes).toBe(7)
  })

  it('creates the month as manual when incoming does not have it', () => {
    const current = payload([month('Set', 2026, [tg(1, { category: 'cards', value: 30 })])])
    const incoming = payload([month('Out', 2026, [item('a')])])
    const { payload: merged, restored } = mergeIncoming(current, incoming, NOW)
    expect(restored).toBe(1)
    const set = merged.manual_months.find(m => m.month === 'Set')
    expect(set?.source).toBe('manual')
    expect(set?.cards).toBe(30)
    expect(set?.items).toHaveLength(1)
  })

  it('does not mutate inputs and leaves untouched months as-is', () => {
    const untouched = month('Ago', 2026, [item('z')])
    const current = payload([month('Out', 2026, [tg(1)])])
    const incoming = payload([untouched, month('Out', 2026, [])])
    const snapshot = JSON.stringify(incoming)
    const { payload: merged } = mergeIncoming(current, incoming, NOW)
    expect(JSON.stringify(incoming)).toBe(snapshot)
    expect(merged.manual_months.find(m => m.month === 'Ago')).toBe(untouched)
  })

  it('works when there is no current payload', () => {
    const incoming = payload([month('Out', 2026, [item('a')])])
    const { payload: merged, restored } = mergeIncoming(null, incoming, NOW)
    expect(restored).toBe(0)
    expect(allIds(merged)).toEqual(['a'])
  })

  it('unions tombstones keeping the newest at, drops > 90 days and caps at 2000', () => {
    const current = payload([], { deleted_ids: [{ id: 'x', at: iso(10) }, { id: 'old', at: iso(91) }] })
    const many = Array.from({ length: 2100 }, (_, i) => ({ id: `t${i}`, at: new Date(NOW.getTime() - 3 * 86_400_000 - i * 1000).toISOString() }))
    const incoming = payload([month('Out', 2026, [item('a')])], { deleted_ids: [{ id: 'x', at: iso(2) }, ...many] })
    const { payload: merged } = mergeIncoming(current, incoming, NOW)
    const ids = merged.deleted_ids ?? []
    expect(ids).toHaveLength(2000)
    expect(ids.find(t => t.id === 'old')).toBeUndefined()
    expect(ids.filter(t => t.id === 'x')).toHaveLength(1)
    expect(ids.find(t => t.id === 'x')?.at).toBe(iso(2))
    expect(ids.find(t => t.id === 't2099')).toBeUndefined() // os mais antigos caem no cap
  })
})

describe('restoreItems', () => {
  it('skips ids already present and reports restored count', () => {
    const base = payload([month('Out', 2026, [tg(1)])])
    const res = restoreItems(base, [
      { month: 'Out', year: 2026, item: tg(1) },
      { month: 'Out', year: 2026, item: tg(2) },
    ])
    expect(res.restored).toBe(1)
    expect(allIds(res.payload)).toEqual(['telegram:1:1', 'telegram:1:2'])
  })
})
