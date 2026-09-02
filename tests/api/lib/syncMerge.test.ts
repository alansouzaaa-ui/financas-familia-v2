import { describe, it, expect } from 'vitest'
import { mergeManualMonths, mergeSyncPayload } from '../../../api/lib/syncMerge'
import type { MonthRecord } from '../../../src/types/finance'
import type { SyncPayload } from '../../../src/lib/syncService'

function month(overrides: Partial<MonthRecord> = {}): MonthRecord {
  return {
    month: 'Set',
    year: 2026,
    revenue: 0,
    fixedCosts: 0,
    loans: 0,
    cards: 0,
    variableCosts: 0,
    source: 'manual',
    items: [],
    ...overrides,
  }
}

describe('mergeManualMonths', () => {
  it('preserves a server-only item that a stale client never pulled', () => {
    const serverItem = { id: 'telegram:1:1', description: 'mercado', value: 100, category: 'variableCosts' as const, isPaid: true }
    const current = [month({ items: [serverItem], variableCosts: 100 })]

    // Stale client pushes the same month with a *different* item set that
    // doesn't include the Telegram item (it never pulled it).
    const staleItem = { id: 'abr26-f1', description: 'Energia', value: 50, category: 'fixedCosts' as const, isPaid: true }
    const incoming = [month({ items: [staleItem], fixedCosts: 50 })]

    const merged = mergeManualMonths(current, incoming)
    expect(merged).toHaveLength(1)
    const items = merged[0].items!.map(i => i.id)
    expect(items).toContain('telegram:1:1')
    expect(items).toContain('abr26-f1')
  })

  it('recalculates month totals from the merged items', () => {
    const current = [month({ items: [{ id: 'a', description: 'x', value: 100, category: 'variableCosts', isPaid: true }] })]
    const incoming = [month({ items: [{ id: 'b', description: 'y', value: 50, category: 'fixedCosts', isPaid: true }] })]
    const merged = mergeManualMonths(current, incoming)
    expect(merged[0].variableCosts).toBe(100)
    expect(merged[0].fixedCosts).toBe(50)
  })

  it('incoming item wins when the same id is edited on both sides', () => {
    const current = [month({ items: [{ id: 'a', description: 'old', value: 10, category: 'variableCosts', isPaid: false }] })]
    const incoming = [month({ items: [{ id: 'a', description: 'new', value: 20, category: 'variableCosts', isPaid: true }] })]
    const merged = mergeManualMonths(current, incoming)
    expect(merged[0].items).toEqual([{ id: 'a', description: 'new', value: 20, category: 'variableCosts', isPaid: true }])
  })

  it('keeps a month that only exists on one side', () => {
    const current = [month({ month: 'Ago', year: 2026 })]
    const incoming = [month({ month: 'Set', year: 2026 })]
    const merged = mergeManualMonths(current, incoming)
    expect(merged.map(m => m.month).sort()).toEqual(['Ago', 'Set'])
  })
})

describe('mergeSyncPayload', () => {
  it('returns incoming as-is when there is no current server state', () => {
    const incoming: SyncPayload = { manual_months: [month()], goals: [], recurring_items: [], investment_positions: [] }
    expect(mergeSyncPayload(null, incoming)).toEqual(incoming)
  })

  it('union-merges goals/recurring_items/investment_positions by id', () => {
    const current: SyncPayload = {
      manual_months: [],
      goals: [{ id: 'g1', category: 'variableCosts', targetValue: 500 }],
      recurring_items: [],
      investment_positions: [],
    }
    const incoming: SyncPayload = {
      manual_months: [],
      goals: [{ id: 'g2', category: 'fixedCosts', targetValue: 800 }],
      recurring_items: [],
      investment_positions: [],
    }
    const merged = mergeSyncPayload(current, incoming)
    expect(merged.goals.map(g => g.id).sort()).toEqual(['g1', 'g2'])
  })
})
