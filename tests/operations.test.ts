import { describe, it, expect } from 'vitest'
import {
  applyOperationsToPositions, consolidationKey, heldOn, isManualPosition, migratePositions, openLots,
  planConsolidation, replayOperations, sortOperations, unionOperations, validateOperationChange,
} from '../src/lib/operations'
import type { InvestmentOperation, InvestmentPosition } from '../src/types/investment'

let seq = 0
function op(over: Partial<InvestmentOperation> & Pick<InvestmentOperation, 'type'>): InvestmentOperation {
  seq++
  return { id: `o${seq}`, positionId: 'p1', date: '2025-01-10', createdAt: `2025-01-10T00:00:${String(seq % 60).padStart(2, '0')}.000Z`, ...over }
}
function pos(over: Partial<InvestmentPosition> & Pick<InvestmentPosition, 'id'>): InvestmentPosition {
  return { ticker: 'PETR4', quantity: 10, avgPrice: 30, buyDate: '2024-03-01', assetType: 'acao', ...over }
}
const sum = (ps: InvestmentPosition[], f: (p: InvestmentPosition) => number) => ps.reduce((s, p) => s + f(p), 0)

describe('sortOperations', () => {
  it('orders by date, then opening < buy/deposit < withdraw/sell, then createdAt, then id', () => {
    const sell = op({ id: 'a', type: 'sell', date: '2025-02-01', createdAt: '2025-02-01T00:00:00.000Z' })
    const buy = op({ id: 'b', type: 'buy', date: '2025-02-01', createdAt: '2025-02-01T00:00:09.000Z' })
    const opening = op({ id: 'c', type: 'opening', date: '2025-02-01', createdAt: '2025-02-01T00:00:10.000Z' })
    const earlier = op({ id: 'd', type: 'sell', date: '2025-01-01' })
    const tieA = op({ id: 'e1', type: 'buy', date: '2025-02-01', createdAt: '2025-02-01T00:00:09.000Z' })
    expect(sortOperations([sell, buy, opening, earlier, tieA]).map(o => o.id)).toEqual(['d', 'c', 'b', 'e1', 'a'])
  })
})

describe('replayOperations', () => {
  it('a single opening returns exactly its quantity and price (no rounding)', () => {
    for (const [q, p] of [[0.1 + 0.2, 33.333333333333336], [7.123456789, 0.1], [1 / 3, 2 / 3], [1234.5678, 12.34], [0.000001, 1e-7]]) {
      const r = replayOperations([op({ type: 'opening', quantity: q, price: p })])
      expect(r.quantity).toBe(q)
      expect(r.avgPrice).toBe(p)
      expect(r.valid).toBe(true)
      expect(r.closed).toBe(false)
    }
  })

  it('weighted average with fees on buys', () => {
    const r = replayOperations([
      op({ type: 'opening', quantity: 10, price: 10, date: '2025-01-01' }),
      op({ type: 'buy', quantity: 10, price: 20, fees: 5, date: '2025-02-01' }),
    ])
    expect(r.quantity).toBe(20)
    expect(r.cost).toBeCloseTo(305, 9)
    expect(r.avgPrice).toBeCloseTo(15.25, 9)
  })

  it('sell realizes gain net of fees, keeps average cost', () => {
    const r = replayOperations([
      op({ type: 'opening', quantity: 10, price: 10, date: '2025-01-01' }),
      op({ type: 'sell', quantity: 4, price: 15, fees: 2, date: '2025-03-01' }),
    ])
    expect(r.valid).toBe(true)
    expect(r.quantity).toBe(6)
    expect(r.avgPrice).toBe(10)
    expect(r.realizedGain).toBeCloseTo((15 - 10) * 4 - 2, 9)
    expect(r.cost).toBeCloseTo(60, 9)
    expect(r.closed).toBe(false)
  })

  it('selling more than held is invalid and reports the first invalid op', () => {
    const bad = op({ type: 'sell', quantity: 11, price: 12, date: '2025-03-01' })
    const r = replayOperations([op({ type: 'opening', quantity: 10, price: 10, date: '2025-01-01' }), bad])
    expect(r.valid).toBe(false)
    expect(r.firstInvalid).toBe(bad)
    expect(r.quantity).toBe(10)
  })

  it('a sell dated before the buy is invalid', () => {
    const r = replayOperations([
      op({ type: 'buy', quantity: 10, price: 10, date: '2025-03-01' }),
      op({ type: 'sell', quantity: 5, price: 12, date: '2025-02-01' }),
    ])
    expect(r.valid).toBe(false)
    expect(r.firstInvalid?.type).toBe('sell')
  })

  it('same-day buy and sell: buy is applied first', () => {
    const r = replayOperations([
      op({ type: 'sell', quantity: 5, price: 12, date: '2025-03-01', createdAt: '2025-03-01T00:00:00.000Z' }),
      op({ type: 'buy', quantity: 5, price: 10, date: '2025-03-01', createdAt: '2025-03-01T09:00:00.000Z' }),
    ])
    expect(r.valid).toBe(true)
    expect(r.quantity).toBe(0)
    expect(r.realizedGain).toBeCloseTo(10, 9)
  })

  it('full sale closes the position', () => {
    const r = replayOperations([
      op({ type: 'opening', quantity: 10, price: 10, date: '2025-01-01' }),
      op({ type: 'sell', quantity: 10, price: 13, date: '2025-02-01' }),
    ])
    expect(r.closed).toBe(true)
    expect(r.quantity).toBe(0)
    expect(r.realizedGain).toBeCloseTo(30, 9)
  })

  it('tolerates sells within 1e-6 of the held quantity', () => {
    const r = replayOperations([
      op({ type: 'opening', quantity: 0.3, price: 10, date: '2025-01-01' }),
      op({ type: 'sell', quantity: 0.1 + 0.2, price: 10, date: '2025-02-01' }),
    ])
    expect(r.valid).toBe(true)
    expect(r.closed).toBe(true)
  })

  it('manual position: deposit raises cost, avgPrice = cost / quantity', () => {
    const r = replayOperations([
      op({ type: 'opening', quantity: 1, price: 1000, date: '2025-01-01' }),
      op({ type: 'deposit', amount: 500, date: '2025-02-01' }),
    ])
    expect(r.quantity).toBe(1)
    expect(r.avgPrice).toBe(1500)
  })

  it('withdraw removes proportional cost using balanceBefore', () => {
    const r = replayOperations([
      op({ type: 'opening', quantity: 1, price: 1000, date: '2025-01-01' }),
      op({ type: 'withdraw', amount: 600, balanceBefore: 1200, date: '2025-02-01' }),
    ])
    expect(r.cost).toBeCloseTo(500, 9)
    expect(r.avgPrice).toBeCloseTo(500, 9)
    expect(r.realizedGain).toBeCloseTo(100, 9) // 600 retirado - 500 de custo
    expect(r.closed).toBe(false)
  })

  it('withdraw without balanceBefore uses min(amount, cost) / cost', () => {
    const r = replayOperations([
      op({ type: 'opening', quantity: 1, price: 1000, date: '2025-01-01' }),
      op({ type: 'withdraw', amount: 250, date: '2025-02-01' }),
    ])
    expect(r.cost).toBeCloseTo(750, 9)
    expect(r.realizedGain).toBeCloseTo(0, 9)
  })

  it('manual position closes when the withdraw empties cost and balance', () => {
    const r = replayOperations([
      op({ type: 'opening', quantity: 1, price: 1000, date: '2025-01-01' }),
      op({ type: 'withdraw', amount: 1300, balanceBefore: 1300, date: '2025-02-01' }),
    ])
    expect(r.closed).toBe(true)
    expect(r.realizedGain).toBeCloseTo(300, 9)
    const reopened = replayOperations([
      op({ type: 'opening', quantity: 1, price: 1000, date: '2025-01-01' }),
      op({ type: 'withdraw', amount: 1300, balanceBefore: 1300, date: '2025-02-01' }),
      op({ type: 'deposit', amount: 100, date: '2025-03-01' }),
    ])
    expect(reopened.closed).toBe(false)
  })

  it('reports firstDate ignoring dateUnknown openings', () => {
    const r = replayOperations([
      op({ type: 'opening', quantity: 5, price: 1, date: '2000-01-01', dateUnknown: true }),
      op({ type: 'buy', quantity: 5, price: 1, date: '2025-02-01' }),
    ])
    expect(r.firstDate).toBe('2025-02-01')
  })
})

describe('heldOn and openLots', () => {
  const ops = [
    op({ type: 'opening', quantity: 10, price: 10, date: '2025-01-01' }),
    op({ type: 'buy', quantity: 10, price: 20, date: '2025-02-01' }),
    op({ type: 'sell', quantity: 10, price: 30, date: '2025-03-01' }),
  ]
  it('heldOn gives end-of-day quantity', () => {
    expect(heldOn(ops, '2024-12-31')).toBe(0)
    expect(heldOn(ops, '2025-01-01')).toBe(10)
    expect(heldOn(ops, '2025-02-01')).toBe(20)
    expect(heldOn(ops, '2025-03-01')).toBe(10)
  })
  it('openLots reduces all lots proportionally on sells and flags unknown dates', () => {
    const lots = openLots([
      op({ type: 'opening', quantity: 10, price: 10, date: '2000-01-01', dateUnknown: true }),
      ...ops.slice(1),
    ])
    expect(lots).toHaveLength(2)
    expect(lots[0]).toMatchObject({ dateUnknown: true })
    expect(lots[0].quantity).toBeCloseTo(5, 9)
    expect(lots[1].quantity).toBeCloseTo(5, 9)
    expect(lots[1].cost).toBeCloseTo(100, 9)
  })
})

describe('validateOperationChange', () => {
  const opening = op({ id: 'op', type: 'opening', quantity: 10, price: 10, date: '2025-01-01' })
  const buy = op({ id: 'bu', type: 'buy', quantity: 10, price: 10, date: '2025-02-01' })
  const sell = op({ id: 'se', type: 'sell', quantity: 15, price: 12, date: '2025-03-01' })
  const list = [opening, buy, sell]

  it('refuses deleting a buy a later sell depends on (pt-BR message)', () => {
    const msg = validateOperationChange(list, { kind: 'remove', id: 'bu' })
    expect(msg).toMatch(/venda/i)
    expect(msg).toContain('01/03/2025')
  })
  it('refuses selling more than held on that date, even if held later', () => {
    const early = op({ type: 'sell', quantity: 12, price: 10, date: '2025-01-15' })
    expect(validateOperationChange(list, { kind: 'add', op: early })).toMatch(/maior que a quantidade/)
  })
  it('accepts valid changes and rejects bad fields', () => {
    expect(validateOperationChange(list, { kind: 'add', op: op({ type: 'buy', quantity: 1, price: 1, date: '2025-04-01' }) })).toBeNull()
    expect(validateOperationChange(list, { kind: 'remove', id: 'se' })).toBeNull()
    expect(validateOperationChange(list, { kind: 'add', op: op({ type: 'buy', quantity: 1, price: 1, date: '2025-13-40' }) })).toBe('Data inválida.')
    expect(validateOperationChange(list, { kind: 'remove', id: 'nope' })).toBe('Operação não encontrada.')
  })
  it('update that moves the sell before the buy is refused', () => {
    expect(validateOperationChange(list, { kind: 'update', op: { ...sell, date: '2025-01-20' } })).not.toBeNull()
  })
})

describe('consolidation key and plan', () => {
  it('normalizes ticker, broker and purpose', () => {
    const a = pos({ id: 'a', ticker: ' petr4 ', broker: ' XP ', purpose: 'Longo' })
    const b = pos({ id: 'b', ticker: 'PETR4', broker: 'xp', purpose: 'longo ' })
    expect(consolidationKey(a)).toBe(consolidationKey(b))
  })
  it('pilar vazio e pilar escolhido igual ao detectado são a mesma chave; o escolhido é mantido', () => {
    const a = pos({ id: 'a', ticker: 'Tesouro Selic 2031', assetType: 'tesouro', buyDate: '2026-09-29' })
    const b = pos({ id: 'b', ticker: 'Tesouro Selic 2031', assetType: 'tesouro', buyDate: '2026-10-07', reservePillar: 'selic' })
    expect(consolidationKey(a)).toBe(consolidationKey(b))
    const out = migratePositions([a, b], [])
    expect(out.positions).toHaveLength(1)
    expect(out.positions[0].reservePillar).toBe('selic')
  })

  it('different broker or purpose or pillar is not merged', () => {
    const base = pos({ id: 'a' })
    expect(consolidationKey(base)).not.toBe(consolidationKey(pos({ id: 'b', broker: 'Rico' })))
    expect(consolidationKey(base)).not.toBe(consolidationKey(pos({ id: 'c', purpose: 'Aposentadoria' })))
    expect(consolidationKey(base)).not.toBe(consolidationKey(pos({ id: 'd', reservePillar: 'selic' })))
    const r = migratePositions([base, pos({ id: 'b', broker: 'Rico' })], [])
    expect(r.positions).toHaveLength(2)
    expect(r.merged).toBe(0)
  })
  it('manual positions never merge', () => {
    const m1 = pos({ id: 'm1', ticker: 'Poupança', assetType: 'poupanca', quantity: 1, avgPrice: 1000 })
    const m2 = pos({ id: 'm2', ticker: 'Poupança', assetType: 'poupanca', quantity: 1, avgPrice: 2000 })
    const m3 = pos({ id: 'm3', ticker: 'CDB', assetType: 'renda_fixa', quantity: 1, avgPrice: 500, manualValue: 520 })
    const m4 = pos({ id: 'm4', ticker: 'CDB', assetType: 'renda_fixa', quantity: 1, avgPrice: 500, manualValue: 520 })
    expect(isManualPosition(m3)).toBe(true)
    expect(planConsolidation([m1, m2, m3, m4]).groups).toEqual([])
    expect(migratePositions([m1, m2, m3, m4], []).positions).toHaveLength(4)
  })
  it('reports ticker groups', () => {
    const { groups } = planConsolidation([pos({ id: 'a' }), pos({ id: 'b', buyDate: '2023-01-01' }), pos({ id: 'z', ticker: 'VALE3' })])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ keptId: 'b', ticker: 'PETR4', totalQuantity: 20 })
    expect(groups[0].rows.map(r => r.id)).toEqual(['b', 'a'])
  })
})

describe('migratePositions', () => {
  it('single rows are preserved exactly (awkward floats, Tesouro fractions, poupança with manualValue)', () => {
    const positions: InvestmentPosition[] = [
      pos({ id: 'a', ticker: 'AAA3', quantity: 0.1 + 0.2, avgPrice: 33.333333333333336 }),
      pos({ id: 'b', ticker: 'BBB3', quantity: 7.123456789, avgPrice: 0.1 }),
      pos({ id: 't', ticker: 'Tesouro Selic 2029', assetType: 'tesouro', quantity: 0.37, avgPrice: 14523.77, buyDate: '' }),
      pos({ id: 'p', ticker: 'Poupança', assetType: 'poupanca', quantity: 1, avgPrice: 2512.4, manualValue: 2600.55, notes: 'x' }),
    ]
    const before = JSON.stringify(positions)
    const r = migratePositions(positions, [])
    expect(JSON.stringify(r.positions)).toBe(before)
    expect(r.merged).toBe(0)
    expect(r.operations).toHaveLength(4)
    for (const p of positions) {
      const rep = replayOperations(r.operations.filter(o => o.positionId === p.id))
      expect(rep.quantity).toBe(p.quantity)
      expect(rep.avgPrice).toBe(p.avgPrice)
    }
    expect(applyOperationsToPositions(r.positions, r.operations)).toBe(r.positions)
  })

  it('flags invalid dates with 2000-01-01 + dateUnknown and fixed createdAt', () => {
    const r = migratePositions([pos({ id: 'a', buyDate: 'ontem' }), pos({ id: 'b', ticker: 'X', buyDate: '2025-02-30' }), pos({ id: 'c', ticker: 'Y' })], [])
    expect(r.operations[0]).toMatchObject({ id: 'open:a', date: '2000-01-01', dateUnknown: true, createdAt: '2000-01-01T00:00:00.000Z', type: 'opening', positionId: 'a' })
    expect(r.operations[1]).toMatchObject({ date: '2000-01-01', dateUnknown: true })
    expect(r.operations[2].date).toBe('2024-03-01')
    expect(r.operations[2].dateUnknown).toBeUndefined()
  })

  it('consolidation preserves total quantity and total cost', () => {
    const positions = [
      pos({ id: 'a', quantity: 100, avgPrice: 30.1234, buyDate: '2024-05-01', notes: 'n1' }),
      pos({ id: 'k', ticker: 'VALE3', quantity: 5, avgPrice: 60 }),
      pos({ id: 'b', ticker: ' petr4', quantity: 50, avgPrice: 28.5, buyDate: '2023-01-10', notes: 'n2' }),
      pos({ id: 'c', quantity: 12.5, avgPrice: 35.77, buyDate: 'x', notes: 'n1' }),
    ]
    const r = migratePositions(positions, [])
    expect(r.merged).toBe(2)
    expect(r.positions.map(p => p.id)).toEqual(['b', 'k'])
    const s = r.positions[0]
    expect(s.buyDate).toBe('2023-01-10')
    expect(s.notes).toBe('n2 · n1')
    expect(s.manualValue).toBeUndefined()
    expect(Math.abs(sum(r.positions, p => p.quantity) - sum(positions, p => p.quantity))).toBeLessThan(0.01)
    expect(Math.abs(sum(r.positions, p => p.quantity * p.avgPrice) - sum(positions, p => p.quantity * p.avgPrice))).toBeLessThan(0.01)
    // todas as aberturas apontam para a sobrevivente
    expect(r.operations.filter(o => o.positionId === 'b').map(o => o.id).sort()).toEqual(['open:a', 'open:b', 'open:c'])
    // replay das operações reproduz o cache da sobrevivente
    expect(applyOperationsToPositions(r.positions, r.operations)).toBe(r.positions)
  })

  it('keeps position order by first appearance and caps notes at 200 chars', () => {
    const long = 'x'.repeat(150)
    const r = migratePositions([
      pos({ id: 'z', ticker: 'AAA3', quantity: 1, avgPrice: 1, notes: long }),
      pos({ id: 'y', ticker: 'BBB3' }),
      pos({ id: 'w', ticker: 'AAA3', quantity: 1, avgPrice: 1, notes: long + 'y' }),
    ], [])
    expect(r.positions.map(p => p.ticker)).toEqual(['AAA3', 'BBB3'])
    expect(r.positions[0].notes!.length).toBe(200)
  })

  it('is idempotent (second run changes nothing)', () => {
    const positions = [pos({ id: 'a' }), pos({ id: 'b', buyDate: '' }), pos({ id: 'c', ticker: 'VALE3' })]
    const first = migratePositions(positions, [])
    const second = migratePositions(first.positions, first.operations)
    expect(second.positions).toEqual(first.positions)
    expect(second.operations).toEqual(first.operations)
    expect(second.merged).toBe(0)
  })

  it('two devices migrating the same old rows produce identical output', () => {
    const rows = [pos({ id: 'a' }), pos({ id: 'b', buyDate: 'foo', quantity: 3 }), pos({ id: 'c', ticker: 'VALE3' })]
    const d1 = migratePositions(rows, [])
    const d2 = migratePositions(JSON.parse(JSON.stringify(rows)), [])
    expect(JSON.stringify(d2)).toBe(JSON.stringify(d1))
    // um dispositivo já migrado + outro com linhas antigas: união por id não duplica
    const union = unionOperations(d1.operations, d2.operations)
    expect(union).toHaveLength(d1.operations.length)
  })

  it('a row with ANY operation never gets a new opening; two rows with operations are never merged', () => {
    const rows = [pos({ id: 'a', buyDate: '2024-01-01' }), pos({ id: 'b', buyDate: '2024-06-01' })]
    const existing = [
      op({ id: 'open:a', positionId: 'a', type: 'opening', quantity: 10, price: 30, date: '2024-01-01' }),
      op({ id: 'buy-b', positionId: 'b', type: 'buy', quantity: 1, price: 1, date: '2024-07-01' }),
    ]
    const r = migratePositions(rows, existing)
    expect(r.merged).toBe(0)
    expect(r.positions.map(p => p.id)).toEqual(['a', 'b'])
    expect(r.operations.map(o => o.id)).toEqual(['open:a', 'buy-b'])
  })
})

describe('applyOperationsToPositions', () => {
  it('recomputes cache from ops, leaves positions without ops or with invalid replay untouched', () => {
    const a = pos({ id: 'a', quantity: 10, avgPrice: 10 })
    const b = pos({ id: 'b', ticker: 'B', quantity: 99, avgPrice: 9 })
    const c = pos({ id: 'c', ticker: 'C', quantity: 5, avgPrice: 5 })
    const ops = [
      op({ positionId: 'a', type: 'opening', quantity: 10, price: 10, date: '2025-01-01' }),
      op({ positionId: 'a', type: 'buy', quantity: 10, price: 20, date: '2025-02-01' }),
      op({ positionId: 'c', type: 'opening', quantity: 1, price: 1, date: '2025-01-01' }),
      op({ positionId: 'c', type: 'sell', quantity: 2, price: 1, date: '2025-02-01' }),
    ]
    const out = applyOperationsToPositions([a, b, c], ops)
    expect(out[0]).toMatchObject({ quantity: 20, avgPrice: 15 })
    expect(out[1]).toBe(b)
    expect(out[2]).toBe(c)
  })
})
