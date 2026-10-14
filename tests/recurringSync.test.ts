import { describe, it, expect } from 'vitest'
import { normalizeDesc, findMissingRecurring, dedupeCopy } from '../src/lib/recurringSync'
import type { RecurringItem } from '../src/types/finance'

const rule = (o: Partial<RecurringItem>): RecurringItem => ({
  id: 'r1', description: 'Aluguel', value: 1000, category: 'fixedCosts', isActive: true, ...o,
})

describe('normalizeDesc', () => {
  it('trims, lowercases, strips accents, collapses spaces', () => {
    expect(normalizeDesc('  Água   e  LUZ ')).toBe('agua e luz')
  })
})

describe('findMissingRecurring', () => {
  it('no duplicates when all present by id', () => {
    const r = findMissingRecurring([rule({})], [{ description: 'x', category: 'fixedCosts', recurringId: 'r1' }])
    expect(r.missing).toEqual([])
    expect(r.links).toEqual([])
  })
  it('links legacy item by description ignoring case/accents', () => {
    const r = findMissingRecurring([rule({ description: 'Água' })], [{ description: ' AGUA ', category: 'fixedCosts' }])
    expect(r.missing).toEqual([])
    expect(r.links).toEqual([{ itemIndex: 0, recurringId: 'r1' }])
  })
  it('only the new rule is missing', () => {
    const rules = [rule({}), rule({ id: 'r2', description: 'Internet' })]
    const r = findMissingRecurring(rules, [{ description: 'Aluguel', category: 'fixedCosts', recurringId: 'r1' }])
    expect(r.missing.map(m => m.id)).toEqual(['r2'])
  })
  it('ignores inactive and cards rules', () => {
    const rules = [rule({ isActive: false }), rule({ id: 'r2', category: 'cards' })]
    expect(findMissingRecurring(rules, []).missing).toEqual([])
  })
  it('one item cannot satisfy two identical rules', () => {
    const rules = [rule({}), rule({ id: 'r2' })]
    const r = findMissingRecurring(rules, [{ description: 'Aluguel', category: 'fixedCosts' }])
    expect(r.links).toHaveLength(1)
    expect(r.missing.map(m => m.id)).toEqual(['r2'])
  })
})

describe('dedupeCopy', () => {
  const p = (o: { description?: string; category?: string; value?: number; recurringId?: string }) => ({ recurringId: undefined as string | undefined, description: 'Aluguel', category: 'fixedCosts', value: 1000, ...o })
  it('skips existing, keeps recurringId, drops cards', () => {
    const prev = [p({ recurringId: 'r1' }), p({ description: 'Net', recurringId: 'r2' }), p({ category: 'cards' })]
    const cur = [{ description: 'aluguel', category: 'fixedCosts', value: 1000.005 }]
    const out = dedupeCopy(prev, cur)
    expect(out).toHaveLength(1)
    expect(out[0].recurringId).toBe('r2')
  })
  it('skips by same recurringId', () => {
    const out = dedupeCopy([p({ recurringId: 'r1', value: 900 })], [{ description: 'Outro', category: 'fixedCosts', value: 5, recurringId: 'r1' }])
    expect(out).toEqual([])
  })
})
