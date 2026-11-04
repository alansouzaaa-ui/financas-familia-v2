import { beforeEach, describe, expect, it } from 'vitest'
import { useInvestmentStore } from '../src/stores/useInvestmentStore'
import { useOperationsStore } from '../src/stores/useOperationsStore'
import { useTombstoneStore } from '../src/stores/useTombstoneStore'
import {
  createPosition, deletePosition, reconcileClosed, registerOperation, removeOperation, updateOperation,
} from '../src/lib/investmentActions'
import type { InvestmentPosition } from '../src/types/investment'

const inv = () => useInvestmentStore.getState()
const led = () => useOperationsStore.getState()
const tomb = () => useTombstoneStore.getState().items.map(t => t.id)

function newStock(over: Partial<Omit<InvestmentPosition, 'id'>> = {}): string {
  return createPosition({ ticker: 'PETR4', quantity: 10, avgPrice: 30, buyDate: '2025-01-10', assetType: 'acao', ...over })
}
function newSavings(over: Partial<Omit<InvestmentPosition, 'id'>> = {}): string {
  return createPosition({ ticker: 'Poupança', quantity: 1, avgPrice: 1000, manualValue: 1200, buyDate: '2025-01-10', assetType: 'poupanca', ...over })
}

beforeEach(() => {
  useInvestmentStore.setState({ positions: [] })
  useOperationsStore.setState({ operations: [], closedPositions: [] })
  useTombstoneStore.setState({ items: [] })
})

describe('createPosition', () => {
  it('creates the position and its opening open:<id>', () => {
    const id = newStock()
    expect(inv().positions).toHaveLength(1)
    const ops = led().operations
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ id: `open:${id}`, positionId: id, type: 'opening', date: '2025-01-10', quantity: 10, price: 30 })
    expect(ops[0].dateUnknown).toBeUndefined()
  })
  it('flags an invalid buy date as unknown', () => {
    newStock({ buyDate: '' })
    expect(led().operations[0]).toMatchObject({ date: '2000-01-01', dateUnknown: true })
  })
})

describe('registerOperation (unit based)', () => {
  it('a buy recomputes quantity and average price', () => {
    const id = newStock()
    const r = registerOperation(id, { type: 'buy', date: '2025-02-01', quantity: 10, price: 50, fees: 10 })
    expect(r.ok).toBe(true)
    expect(inv().positions[0].quantity).toBe(20)
    expect(inv().positions[0].avgPrice).toBeCloseTo((300 + 500 + 10) / 20, 9)
  })

  it('selling everything moves the position to closed with closedAt and realized gain, without tombstoning anything', () => {
    const id = newStock()
    const r = registerOperation(id, { type: 'sell', date: '2025-03-01', quantity: 10, price: 40 })
    expect(r.ok).toBe(true)
    expect(inv().positions).toHaveLength(0)
    expect(led().closedPositions).toHaveLength(1)
    expect(led().closedPositions[0]).toMatchObject({ closedAt: '2025-03-01' })
    expect(led().closedPositions[0].realizedGain).toBeCloseTo(100, 9)
    expect(led().closedPositions[0].position.id).toBe(id)
    expect(led().operations).toHaveLength(2)   // histórico preservado
    expect(tomb()).toEqual([])                  // nada de tombstone ao encerrar
  })

  it('removing the closing sale (undo) brings the position back and tombstones only that op', () => {
    const id = newStock()
    const r = registerOperation(id, { type: 'sell', date: '2025-03-01', quantity: 10, price: 40 })
    if (!r.ok) throw new Error('setup')
    const rm = removeOperation(r.value.id)
    expect(rm.ok).toBe(true)
    expect(led().closedPositions).toHaveLength(0)
    expect(inv().positions).toHaveLength(1)
    expect(inv().positions[0]).toMatchObject({ id, quantity: 10, avgPrice: 30 })
    expect(tomb()).toEqual([r.value.id])
  })

  it('editing a closing sale to a partial one reopens the position', () => {
    const id = newStock()
    const r = registerOperation(id, { type: 'sell', date: '2025-03-01', quantity: 10, price: 40 })
    if (!r.ok) throw new Error('setup')
    const up = updateOperation(r.value.id, { date: '2025-03-01', quantity: 4, price: 40 })
    expect(up.ok).toBe(true)
    expect(led().closedPositions).toHaveLength(0)
    expect(inv().positions[0].quantity).toBe(6)
  })

  it('refuses to sell more than held, with a pt-BR message, and changes nothing', () => {
    const id = newStock()
    const r = registerOperation(id, { type: 'sell', date: '2025-03-01', quantity: 11, price: 40 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/maior que a quantidade em carteira/)
    expect(led().operations).toHaveLength(1)
    expect(inv().positions[0].quantity).toBe(10)
  })

  it('refuses a deposit on a unit position and a buy on a manual one', () => {
    const a = newStock()
    const b = newSavings()
    expect(registerOperation(a, { type: 'deposit', date: '2025-02-01', amount: 10 }).ok).toBe(false)
    expect(registerOperation(b, { type: 'buy', date: '2025-02-01', quantity: 1, price: 1 }).ok).toBe(false)
  })

  it('creates the opening from the cache when the position has no ledger yet (old client)', () => {
    useInvestmentStore.setState({ positions: [{ id: 'old', ticker: 'VALE3', quantity: 5, avgPrice: 60, buyDate: '2024-05-05', assetType: 'acao' }] })
    const r = registerOperation('old', { type: 'buy', date: '2025-02-01', quantity: 5, price: 80 })
    expect(r.ok).toBe(true)
    expect(led().operations.map(o => o.id)).toContain('open:old')
    expect(inv().positions[0]).toMatchObject({ quantity: 10, avgPrice: 70 })
  })
})

describe('opening operations', () => {
  it('can be edited but not deleted while there are other operations', () => {
    const id = newStock()
    registerOperation(id, { type: 'buy', date: '2025-02-01', quantity: 5, price: 30 })
    const open = led().operations.find(o => o.type === 'opening')!
    const del = removeOperation(open.id)
    expect(del.ok).toBe(false)
    const up = updateOperation(open.id, { date: '2025-01-10', quantity: 20, price: 30 })
    expect(up.ok).toBe(true)
    expect(inv().positions[0].quantity).toBe(25)
  })

  it('a lone opening cannot be removed either: the user deletes the position', () => {
    newStock()
    expect(removeOperation(led().operations[0].id).ok).toBe(false)
  })
})

describe('manual positions (deposit / withdraw)', () => {
  it('deposit adds to the balance; withdraw records balanceBefore and subtracts', () => {
    const id = newSavings()
    expect(registerOperation(id, { type: 'deposit', date: '2025-02-01', amount: 300 }).ok).toBe(true)
    expect(inv().positions[0].manualValue).toBe(1500)
    const w = registerOperation(id, { type: 'withdraw', date: '2025-03-01', amount: 500 })
    if (!w.ok) throw new Error('setup')
    expect(w.value.balanceBefore).toBe(1500)
    expect(inv().positions[0].manualValue).toBe(1000)
    expect(inv().positions[0].quantity).toBe(1)
  })

  it('refuses a withdraw above the balance', () => {
    const id = newSavings()
    const r = registerOperation(id, { type: 'withdraw', date: '2025-03-01', amount: 1300 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/saldo atual/)
  })

  it('withdrawing everything closes the position; removing that withdraw restores balance and position', () => {
    const id = newSavings()
    const w = registerOperation(id, { type: 'withdraw', date: '2025-03-01', amount: 1200 })
    if (!w.ok) throw new Error('setup')
    expect(inv().positions).toHaveLength(0)
    expect(led().closedPositions[0].realizedGain).toBeCloseTo(200, 9)
    expect(removeOperation(w.value.id).ok).toBe(true)
    expect(inv().positions).toHaveLength(1)
    expect(inv().positions[0].manualValue).toBe(1200)
  })

  it('editing a deposit/withdraw applies the amount difference to the balance', () => {
    const id = newSavings()
    const d = registerOperation(id, { type: 'deposit', date: '2025-02-01', amount: 300 })
    const w = registerOperation(id, { type: 'withdraw', date: '2025-03-01', amount: 200 })
    if (!d.ok || !w.ok) throw new Error('setup')
    expect(inv().positions[0].manualValue).toBe(1300)
    expect(updateOperation(d.value.id, { date: '2025-02-01', amount: 400 }).ok).toBe(true)
    expect(inv().positions[0].manualValue).toBe(1400)
    expect(updateOperation(w.value.id, { date: '2025-03-01', amount: 100 }).ok).toBe(true)
    expect(inv().positions[0].manualValue).toBe(1500)
  })

  it('removing a deposit lowers the balance; removing a withdraw raises it; negative balance is refused', () => {
    const id = newSavings()
    const d = registerOperation(id, { type: 'deposit', date: '2025-02-01', amount: 300 })
    const w = registerOperation(id, { type: 'withdraw', date: '2025-03-01', amount: 100 })
    if (!d.ok || !w.ok) throw new Error('setup')
    expect(removeOperation(w.value.id).ok).toBe(true)
    expect(inv().positions[0].manualValue).toBe(1500)
    expect(removeOperation(d.value.id).ok).toBe(true)
    expect(inv().positions[0].manualValue).toBe(1200)
    // saldo menor que o aporte: apagar deixaria negativo
    const big = registerOperation(id, { type: 'deposit', date: '2025-04-01', amount: 500 })
    if (!big.ok) throw new Error('setup')
    useInvestmentStore.getState().updatePosition(id, { manualValue: 100 })
    expect(removeOperation(big.value.id).ok).toBe(false)
  })
})

describe('deletePosition', () => {
  it('removes an open position and all its operations, with tombstones', () => {
    const id = newStock()
    registerOperation(id, { type: 'buy', date: '2025-02-01', quantity: 1, price: 1 })
    const opIds = led().operations.map(o => o.id)
    deletePosition(id)
    expect(inv().positions).toHaveLength(0)
    expect(led().operations).toHaveLength(0)
    for (const x of [...opIds, id]) expect(tomb()).toContain(x)
  })

  it('removes a closed position too', () => {
    const id = newStock()
    registerOperation(id, { type: 'sell', date: '2025-03-01', quantity: 10, price: 40 })
    deletePosition(id)
    expect(led().closedPositions).toHaveLength(0)
    expect(led().operations).toHaveLength(0)
    expect(tomb()).toContain(id)
  })
})

describe('reconcileClosed', () => {
  it('moves positions whose operations replay as closed, and brings back closed ones that replay as open', () => {
    const id = newStock()
    // simula um pull: a venda total chegou de outro dispositivo, a posição ainda está em `positions`
    led().addOperation({ id: 'sell-remote', positionId: id, type: 'sell', date: '2025-03-01', quantity: 10, price: 40, createdAt: '2025-03-01T00:00:00.000Z' })
    reconcileClosed()
    expect(inv().positions).toHaveLength(0)
    expect(led().closedPositions).toHaveLength(1)
    // a venda foi apagada em outro dispositivo (tombstone) e some das operações
    useOperationsStore.setState({ operations: led().operations.filter(o => o.id !== 'sell-remote') })
    reconcileClosed()
    expect(led().closedPositions).toHaveLength(0)
    expect(inv().positions).toHaveLength(1)
    expect(inv().positions[0]).toMatchObject({ id, quantity: 10, avgPrice: 30 })
  })

  it('drops a stale closed entry when the same position is open and replays open; does nothing when consistent', () => {
    const id = newStock()
    const pos = inv().positions[0]
    useOperationsStore.setState({ closedPositions: [{ position: pos, closedAt: '2025-03-01', realizedGain: 1 }] })
    reconcileClosed()
    expect(led().closedPositions).toHaveLength(0)
    expect(inv().positions).toHaveLength(1)
    const before = inv().positions
    reconcileClosed()
    expect(inv().positions).toBe(before)
    expect(id).toBe(before[0].id)
  })

  it('leaves legacy closed entries without operations alone', () => {
    newStock()
    const legacy = { position: { id: 'legacy', ticker: 'X', quantity: 0, avgPrice: 1, buyDate: '', assetType: 'acao' as const }, closedAt: '2024-01-01', realizedGain: 0 }
    useOperationsStore.setState({ closedPositions: [legacy] })
    reconcileClosed()
    expect(led().closedPositions).toEqual([legacy])
  })
})
