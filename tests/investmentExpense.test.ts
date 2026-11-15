import { describe, expect, it } from 'vitest'
import { expenseFromOperation, expenseItemId } from '../src/lib/investmentExpense'
import type { InvestmentOperation, InvestmentPosition } from '../src/types/investment'

const stock: InvestmentPosition = { id: 'p1', ticker: 'PETR4', quantity: 10, avgPrice: 30, buyDate: '2025-01-10', assetType: 'acao' }
const savings: InvestmentPosition = { id: 'p2', ticker: 'Poupança', quantity: 1, avgPrice: 1000, manualValue: 1200, buyDate: '2025-01-10', assetType: 'poupanca' }
const op = (over: Partial<InvestmentOperation>): InvestmentOperation => ({
  id: 'o1', positionId: 'p1', type: 'buy', date: '2025-03-15', createdAt: '2025-03-15T00:00:00.000Z', ...over,
})

describe('expenseItemId', () => {
  it('prefixes with invest:', () => expect(expenseItemId('abc')).toBe('invest:abc'))
})

describe('expenseFromOperation', () => {
  it('buy with fees: qty*price + fees', () => {
    const r = expenseFromOperation(op({ quantity: 10, price: 50, fees: 10 }), stock)!
    expect(r.ym).toEqual({ year: 2025, month: 'Mar' })
    expect(r.item).toMatchObject({
      id: 'invest:o1', externalId: 'invest:o1', description: 'Compra PETR4', value: 510,
      category: 'variableCosts', tag: 'investimentos', isPaid: true, source: 'invest',
      occurredAt: '2025-03-15T12:00:00.000Z',
    })
  })
  it('deposit uses amount and "Aporte"', () => {
    const r = expenseFromOperation(op({ type: 'deposit', positionId: 'p2', amount: 300 }), savings)!
    expect(r.item.value).toBe(300)
    expect(r.item.description).toBe('Aporte Poupança')
  })
  it('opening of quantity asset = qty*price, "Compra"', () => {
    const r = expenseFromOperation(op({ id: 'open:p1', type: 'opening', quantity: 10, price: 30, date: '2025-01-10' }), stock)!
    expect(r.item.value).toBe(300)
    expect(r.item.description).toBe('Compra PETR4')
    expect(r.ym).toEqual({ year: 2025, month: 'Jan' })
  })
  it('opening of balance position = deposited value, "Aporte"', () => {
    const r = expenseFromOperation(op({ id: 'open:p2', positionId: 'p2', type: 'opening', quantity: 1, price: 1000 }), savings)!
    expect(r.item.value).toBe(1000)
    expect(r.item.description).toBe('Aporte Poupança')
  })
  it('sell and withdraw return null', () => {
    expect(expenseFromOperation(op({ type: 'sell', quantity: 1, price: 10 }), stock)).toBeNull()
    expect(expenseFromOperation(op({ type: 'withdraw', amount: 10 }), savings)).toBeNull()
  })
  it('null for zero value or invalid date', () => {
    expect(expenseFromOperation(op({ quantity: 0, price: 10 }), stock)).toBeNull()
    expect(expenseFromOperation(op({ quantity: 1, price: 10, date: '2025-13-45' }), stock)).toBeNull()
    expect(expenseFromOperation(op({ quantity: 1, price: 10, date: '' }), stock)).toBeNull()
  })
  it('rounds to cents', () => {
    expect(expenseFromOperation(op({ quantity: 3, price: 10.333 }), stock)!.item.value).toBe(31)
    expect(expenseFromOperation(op({ quantity: 0.333, price: 10 }), stock)!.item.value).toBe(3.33)
  })
})
