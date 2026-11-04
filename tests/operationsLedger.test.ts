import { describe, it, expect } from 'vitest'
import {
  applyBalanceDelta, manualBalance, manualBalanceDelta, migratePositions, openLots, operationResults,
  previewOperation, realizedByOperation, removalBlockReason, replayOperations, totalBought,
} from '../src/lib/operations'
import type { InvestmentOperation, InvestmentPosition } from '../src/types/investment'

let seq = 0
function op(over: Partial<InvestmentOperation> & Pick<InvestmentOperation, 'type'>): InvestmentOperation {
  seq++
  return { id: `x${seq}`, positionId: 'p', date: '2025-01-10', createdAt: `2025-01-10T00:00:${String(seq % 60).padStart(2, '0')}.000Z`, ...over }
}
function pos(over: Partial<InvestmentPosition> & Pick<InvestmentPosition, 'id'>): InvestmentPosition {
  return { ticker: 'PETR4', quantity: 10, avgPrice: 30, buyDate: '2024-03-01', assetType: 'acao', ...over }
}

describe('migratePositions with existing operations', () => {
  it('a deleted open:<id> does not come back while the position still has other operations', () => {
    const rows = [pos({ id: 'a', quantity: 15, avgPrice: 20 })]
    const existing = [op({ id: 'buy-a', positionId: 'a', type: 'buy', quantity: 15, price: 20, date: '2025-01-01' })]
    const r = migratePositions(rows, existing)
    expect(r.operations.map(o => o.id)).toEqual(['buy-a'])
    expect(r.positions[0]).toMatchObject({ quantity: 15, avgPrice: 20 })
  })

  it('a row without operations becomes an opening of the same-key position that has them; cache comes from replay', () => {
    const rows = [
      pos({ id: 'a', quantity: 10, avgPrice: 10, buyDate: '2024-01-01' }),
      pos({ id: 'old', quantity: 5, avgPrice: 20, buyDate: '2024-03-01', notes: 'veio do app antigo' }),
    ]
    const existing = [
      op({ id: 'open:a', positionId: 'a', type: 'opening', quantity: 10, price: 10, date: '2024-01-01' }),
      op({ id: 'buy-a', positionId: 'a', type: 'buy', quantity: 10, price: 12, date: '2024-02-01' }),
    ]
    const r = migratePositions(rows, existing)
    expect(r.merged).toBe(1)
    expect(r.positions.map(p => p.id)).toEqual(['a'])
    expect(r.operations.find(o => o.id === 'open:old')).toMatchObject({ positionId: 'a', type: 'opening', quantity: 5, price: 20 })
    // 10@10 + 10@12 + 5@20 = custo 320 / 25
    expect(r.positions[0].quantity).toBe(25)
    expect(r.positions[0].avgPrice).toBeCloseTo(320 / 25, 9)
    expect(r.positions[0].notes).toBe('veio do app antigo')
    const again = migratePositions(r.positions, r.operations)
    expect(again.positions).toEqual(r.positions)
    expect(again.operations).toEqual(r.operations)
  })

  it('with three same-key rows, the extra row with operations stays separate and the bare row joins the oldest owner', () => {
    const rows = [
      pos({ id: 'a', buyDate: '2024-01-01' }),
      pos({ id: 'b', buyDate: '2024-02-01' }),
      pos({ id: 'c', quantity: 2, avgPrice: 40, buyDate: '2024-03-01' }),
    ]
    const existing = [
      op({ id: 'open:a', positionId: 'a', type: 'opening', quantity: 10, price: 30, date: '2024-01-01' }),
      op({ id: 'open:b', positionId: 'b', type: 'opening', quantity: 10, price: 30, date: '2024-02-01' }),
    ]
    const r = migratePositions(rows, existing)
    expect(r.positions.map(p => p.id)).toEqual(['a', 'b'])
    expect(r.operations.find(o => o.id === 'open:c')?.positionId).toBe('a')
    expect(r.positions[0].quantity).toBe(12)
  })

  it('does not absorb a bare row when the owner ledger would become invalid', () => {
    // venda de 5 em 03/2025 está coberta pela abertura; a linha antiga (compra em 01/2025, 5 unidades)
    // somaria antes e continuaria válido. Já uma venda de 10 em 03/2025 não: depende do que o replay tinha.
    const rows = [
      pos({ id: 'a', quantity: 0, avgPrice: 10 }),
      pos({ id: 'old', quantity: 5, avgPrice: 20, buyDate: '2025-06-01' }),
    ]
    const existing = [
      op({ id: 'open:a', positionId: 'a', type: 'opening', quantity: 10, price: 10, date: '2024-01-01' }),
      op({ id: 'sell-a', positionId: 'a', type: 'sell', quantity: 10, price: 15, date: '2025-02-01' }),
      op({ id: 'sell-a2', positionId: 'a', type: 'sell', quantity: 3, price: 15, date: '2025-07-01' }),
    ]
    // sell-a2 (3 em 07/2025) só é válida COM a linha antiga (5 em 06/2025): funde
    expect(migratePositions(rows, existing).merged).toBe(1)
    // mas, se a venda fosse de 20 em 07/2025, nem com a linha antiga seria válida: não funde
    const bad = migratePositions(rows, [existing[0], existing[1], { ...existing[2], quantity: 20 }])
    expect(bad.merged).toBe(0)
    expect(bad.operations.some(o => o.id === 'open:old')).toBe(true)
    expect(bad.positions.map(p => p.id)).toEqual(['a', 'old'])
  })
})

describe('per-operation results, previews and manual balance', () => {
  const ledger = [
    op({ id: 'o', type: 'opening', quantity: 100, price: 10, date: '2025-01-01' }),
    op({ id: 'b', type: 'buy', quantity: 100, price: 20, date: '2025-02-01' }), // médio 15
    op({ id: 's1', type: 'sell', quantity: 50, price: 18, fees: 5, date: '2025-03-01' }),
    op({ id: 's2', type: 'sell', quantity: 150, price: 12, date: '2025-04-01' }),
  ]

  it('operationResults gives realized per sale and sums to the replay total', () => {
    const res = operationResults(ledger)
    expect(res.get('s1')!.realized).toBeCloseTo((18 - 15) * 50 - 5, 9)
    expect(res.get('s1')!.soldCost).toBeCloseTo(750, 9)
    expect(res.get('s2')!.realized).toBeCloseTo((12 - 15) * 150, 9)
    expect(res.has('o')).toBe(false)
    const total = [...res.values()].reduce((s, r) => s + r.realized, 0)
    expect(total).toBeCloseTo(replayOperations(ledger).realizedGain, 9)
    expect(realizedByOperation(ledger).get('s2')).toBeCloseTo(-450, 9)
  })

  it('operationResults for manual withdraws uses the proportional cost', () => {
    const m = [
      op({ id: 'o', type: 'opening', quantity: 1, price: 1000, date: '2025-01-01' }),
      op({ id: 'w', type: 'withdraw', amount: 600, balanceBefore: 1200, date: '2025-02-01' }),
    ]
    const r = operationResults(m).get('w')!
    expect(r.realized).toBeCloseTo(100, 9)
    expect(r.soldCost).toBeCloseTo(500, 9)
  })

  it('previewOperation: a buy changes the average, selling everything closes', () => {
    const base = ledger.slice(0, 2)
    const buy = previewOperation(base, op({ id: 'n', type: 'buy', quantity: 200, price: 30, date: '2025-05-01' }))
    expect(buy.after.quantity).toBe(400)
    expect(buy.after.avgPrice).toBeCloseTo((3000 + 6000) / 400, 9)
    const all = previewOperation(base, op({ id: 'n2', type: 'sell', quantity: 200, price: 16, date: '2025-05-01' }))
    expect(all.after.closed).toBe(true)
    expect(all.realized).toBeCloseTo(200, 9)
    expect(all.soldCost).toBeCloseTo(3000, 9)
  })

  it('previewOperation replaces the edited operation instead of duplicating it', () => {
    const edited = { ...ledger[1], quantity: 50 }
    expect(previewOperation(ledger.slice(0, 2), edited).after.quantity).toBe(150)
  })

  it('manual balance helpers: deposits add, withdraws subtract, edits apply the difference', () => {
    const dep = op({ type: 'deposit', amount: 500 })
    const wd = op({ type: 'withdraw', amount: 200 })
    expect(manualBalanceDelta(undefined, dep)).toBe(500)
    expect(manualBalanceDelta(dep, undefined)).toBe(-500)
    expect(manualBalanceDelta(undefined, wd)).toBe(-200)
    expect(manualBalanceDelta(wd, undefined)).toBe(200)
    expect(manualBalanceDelta(wd, { ...wd, amount: 350 })).toBe(-150)
    expect(manualBalanceDelta(dep, { ...dep, amount: 300 })).toBe(-200)
    expect(manualBalanceDelta(op({ type: 'opening', quantity: 1, price: 5 }), undefined)).toBe(0)
    expect(applyBalanceDelta(1000, -500)).toBe(500)
    expect(applyBalanceDelta(300, -500)).toBeNull()
    expect(applyBalanceDelta(100, -100.004)).toBe(0)
    expect(manualBalance({ manualValue: 800, quantity: 1, avgPrice: 700 })).toBe(800)
    expect(manualBalance({ quantity: 2, avgPrice: 50 })).toBe(100)
  })

  it('totalBought sums openings, buys with fees and deposits', () => {
    expect(totalBought([
      op({ type: 'opening', quantity: 10, price: 10 }),
      op({ type: 'buy', quantity: 5, price: 20, fees: 2 }),
      op({ type: 'deposit', amount: 50 }),
      op({ type: 'sell', quantity: 1, price: 1 }),
    ])).toBe(100 + 102 + 50)
  })

  it('removalBlockReason explains which sale depends on a purchase', () => {
    const l = [
      op({ id: 'o', type: 'opening', quantity: 10, price: 10, date: '2025-01-01' }),
      op({ id: 'b', type: 'buy', quantity: 30, price: 10, date: '2025-02-01' }),
      op({ id: 's', type: 'sell', quantity: 35, price: 12, date: '2025-10-30' }),
    ]
    expect(removalBlockReason(l, 'b')).toBe('Esta compra sustenta a venda de 30/10. Apague a venda primeiro.')
    expect(removalBlockReason(l, 's')).toBeNull()
    expect(removalBlockReason(l, 'o')).toMatch(/abertura não pode ser apagada/)
    expect(removalBlockReason([l[0]], 'o')).toMatch(/única operação/)
    expect(removalBlockReason(l, 'nope')).toBe('Operação não encontrada.')
  })

  it('posição juntada: uma das aberturas pode ser apagada, salvo se uma venda depender dela', () => {
    const l = [
      op({ id: 'o1', type: 'opening', quantity: 45, price: 10, date: '2025-01-01' }),
      op({ id: 'o2', type: 'opening', quantity: 39, price: 12, date: '2025-02-01' }),
    ]
    expect(removalBlockReason(l, 'o2')).toBeNull()
    const comVenda = [...l, op({ id: 's', type: 'sell', quantity: 50, price: 12, date: '2025-03-01' })]
    expect(removalBlockReason(comVenda, 'o2')).toBe('Esta compra sustenta a venda de 01/03. Apague a venda primeiro.')
  })

  it('openLots handles manual deposits and withdraws', () => {
    const lots = openLots([
      op({ type: 'opening', quantity: 1, price: 1000, date: '2025-01-01' }),
      op({ type: 'deposit', amount: 500, date: '2025-02-01' }),
      op({ type: 'withdraw', amount: 750, balanceBefore: 1500, date: '2025-03-01' }), // tira metade
    ])
    expect(lots).toHaveLength(2)
    expect(lots[0].cost).toBeCloseTo(500, 9)
    expect(lots[1].cost).toBeCloseTo(250, 9)
    expect(lots[1].date).toBe('2025-02-01')
  })
})
