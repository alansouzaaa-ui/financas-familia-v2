import { describe, it, expect } from 'vitest'
import { normalizeDesc, dedupeCopy } from '../src/lib/recurringSync'

describe('normalizeDesc', () => {
  it('trims, lowercases, strips accents, collapses spaces', () => {
    expect(normalizeDesc('  Água   e  LUZ ')).toBe('agua e luz')
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
