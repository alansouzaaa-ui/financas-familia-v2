import { describe, it, expect } from 'vitest'
import { mergeIncoming, isServerItem } from '../../api/lib/syncMerge'
import type { SyncPayload } from '../../src/lib/syncService'
import type { MonthItem } from '../../src/types/finance'

const item = (over: Partial<MonthItem>): MonthItem => ({
  id: 'x', description: 'd', value: 10, category: 'cards', isPaid: false, ...over,
})
const base = (items: MonthItem[], extra: Partial<SyncPayload> = {}): SyncPayload => ({
  manual_months: [{ month: 'Nov', year: 2026, revenue: 0, fixedCosts: 0, loans: 0, cards: 0, source: 'manual', items }],
  goals: [], recurring_items: [], investment_positions: [], ...extra,
})
const state = { itemId: 'it', itemStatus: 'UPDATED', itemError: null, consentExpiresAt: null, accounts: [], lastSyncAt: null, lastResult: null, seen: {} }

describe('mergeIncoming + pluggy', () => {
  it('isServerItem reconhece telegram e pluggy', () => {
    expect(isServerItem(item({ source: 'pluggy', id: 'pluggy:1' }))).toBe(true)
    expect(isServerItem(item({ id: 'telegram:1:2' }))).toBe(true)
    expect(isServerItem(item({ source: 'manual' }))).toBe(false)
  })
  it('preserva pluggy do servidor e ignora o do cliente', () => {
    const current = base([], { pluggy: state })
    const incoming = base([], { pluggy: { ...state, itemId: 'HACK' } })
    expect(mergeIncoming(current, incoming).payload.pluggy?.itemId).toBe('it')
    expect(mergeIncoming(current, base([])).payload.pluggy?.itemId).toBe('it')
  })
  it('sem pluggy no servidor, não aceita do cliente', () => {
    expect(mergeIncoming(base([]), base([], { pluggy: state })).payload.pluggy).toBeUndefined()
  })
  it('item pluggy que o cliente desconhece é preservado', () => {
    const p = item({ id: 'pluggy:abc', externalId: 'pluggy:abc', source: 'pluggy' })
    const out = mergeIncoming(base([p]), base([]))
    expect(out.payload.manual_months[0].items?.some(i => i.id === 'pluggy:abc')).toBe(true)
  })
  it('item pluggy tombstonado não volta', () => {
    const p = item({ id: 'pluggy:abc', externalId: 'pluggy:abc', source: 'pluggy' })
    const out = mergeIncoming(base([p]), base([], { deleted_ids: [{ id: 'pluggy:abc', at: new Date().toISOString() }] }))
    expect(out.payload.manual_months[0].items?.some(i => i.id === 'pluggy:abc')).toBe(false)
  })
  it('push atrasado com item pluggy tombstonado (pendente cancelado) não o traz de volta', () => {
    const at = new Date().toISOString()
    const p = item({ id: 'pluggy:pend', externalId: 'pluggy:pend', source: 'pluggy', value: 100 })
    const m = item({ id: 'm1', source: 'manual', value: 30 })
    const current = base([m], { deleted_ids: [{ id: 'pluggy:pend', at }] })
    const stale = base([m, p])
    stale.manual_months[0].cards = 130
    const out = mergeIncoming(current, stale)
    expect(out.payload.manual_months[0].items?.map(i => i.id)).toEqual(['m1'])
    expect(out.payload.manual_months[0].cards).toBe(30)
    expect(out.payload.deleted_ids?.map(t => t.id)).toEqual(['pluggy:pend'])
  })
  it('item manual do cliente não é afetado por tombstone de outro id', () => {
    const m = item({ id: 'm1', source: 'manual', value: 30 })
    const current = base([], { deleted_ids: [{ id: 'pluggy:x', at: new Date().toISOString() }] })
    const incoming = base([m])
    incoming.manual_months[0].cards = 30
    expect(mergeIncoming(current, incoming).payload.manual_months[0]).toMatchObject({ cards: 30, items: [m] })
  })
})
