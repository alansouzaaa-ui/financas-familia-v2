import { describe, it, expect } from 'vitest'
import { removedItemIds, addedItemIds, normalizeTombstones } from '../src/lib/tombstones'
import type { MonthRecord, MonthItem } from '../src/types/finance'

function mkItem(id: string): MonthItem {
  return { id, description: id, value: 1, category: 'variableCosts', isPaid: false }
}
function m(month: MonthRecord['month'], ids: string[]): MonthRecord {
  return { month, year: 2026, revenue: 0, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0, source: 'manual', items: ids.map(mkItem) }
}

describe('removedItemIds', () => {
  it('returns ids that disappeared', () => {
    expect(removedItemIds([m('Out', ['a', 'b'])], [m('Out', ['a'])])).toEqual(['b'])
  })
  it('does not count moves between months', () => {
    expect(removedItemIds([m('Out', ['a'])], [m('Nov', ['a'])])).toEqual([])
  })
  it('counts items of a removed month', () => {
    expect(removedItemIds([m('Out', ['a', 'b'])], [])).toEqual(['a', 'b'])
  })
  it('ignores months without items', () => {
    const bare: MonthRecord = { month: 'Out', year: 2026, revenue: 1, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0, source: 'manual' }
    expect(removedItemIds([bare], [])).toEqual([])
  })
})

describe('addedItemIds', () => {
  it('returns new ids only', () => {
    expect(addedItemIds([m('Out', ['a'])], [m('Out', ['a', 'c'])])).toEqual(['c'])
  })
})

describe('normalizeTombstones', () => {
  const now = new Date('2026-10-26T00:00:00.000Z')
  it('drops invalid entries and dedupes', () => {
    const out = normalizeTombstones([
      { id: 'a', at: 'nope' },
      { id: 'b', at: '2026-10-01T00:00:00.000Z' },
      { id: 'b', at: '2026-10-10T00:00:00.000Z' },
    ], now)
    expect(out).toEqual([{ id: 'b', at: '2026-10-10T00:00:00.000Z' }])
  })
})
