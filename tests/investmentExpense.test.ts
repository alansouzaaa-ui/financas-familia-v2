import { describe, expect, it } from 'vitest'
import { entryFromOperation, expenseItemId } from '../src/lib/investmentExpense'
import type { InvestmentOperation, InvestmentPosition } from '../src/types/investment'

const stock: InvestmentPosition = { id: 'p1', ticker: 'PETR4', quantity: 10, avgPrice: 30, buyDate: '2025-01-10', assetType: 'acao' }
const savings: InvestmentPosition = { id: 'p2', ticker: 'Poupança', quantity: 1, avgPrice: 1000, manualValue: 1200, buyDate: '2025-01-10', assetType: 'poupanca' }
const op = (over: Partial<InvestmentOperation>): InvestmentOperation => ({
  id: 'o1', positionId: 'p1', type: 'buy', date: '2025-03-15', createdAt: '2025-03-15T00:00:00.000Z', ...over,
})

describe('expenseItemId', () => {
  it('prefixes with invest:', () => expect(expenseItemId('abc')).toBe('invest:abc'))
})

describe('entryFromOperation', () => {
  it('buy with fees: qty*price + fees', () => {
    const r = entryFromOperation(op({ quantity: 10, price: 50, fees: 10 }), stock)!
    expect(r.ym).toEqual({ year: 2025, month: 'Mar' })
    expect(r.item).toMatchObject({
      id: 'invest:o1', externalId: 'invest:o1', description: 'Compra PETR4', value: 510,
      category: 'variableCosts', tag: 'investimentos', isPaid: true, source: 'invest',
      occurredAt: '2025-03-15T12:00:00.000Z',
    })
  })
  it('deposit uses amount and "Aporte"', () => {
    const r = entryFromOperation(op({ type: 'deposit', positionId: 'p2', amount: 300 }), savings)!
    expect(r.item.value).toBe(300)
    expect(r.item.description).toBe('Aporte Poupança')
  })
  it('opening of quantity asset = qty*price, "Compra"', () => {
    const r = entryFromOperation(op({ id: 'open:p1', type: 'opening', quantity: 10, price: 30, date: '2025-01-10' }), stock)!
    expect(r.item.value).toBe(300)
    expect(r.item.description).toBe('Compra PETR4')
    expect(r.ym).toEqual({ year: 2025, month: 'Jan' })
  })
  it('opening of balance position = deposited value, "Aporte"', () => {
    const r = entryFromOperation(op({ id: 'open:p2', positionId: 'p2', type: 'opening', quantity: 1, price: 1000 }), savings)!
    expect(r.item.value).toBe(1000)
    expect(r.item.description).toBe('Aporte Poupança')
  })
  it('sell: net proceeds (qty*price - fees) as paid revenue', () => {
    const r = entryFromOperation(op({ id: 'o2', type: 'sell', quantity: 4, price: 50, fees: 5, date: '2025-04-02' }), stock)!
    expect(r.ym).toEqual({ year: 2025, month: 'Abr' })
    expect(r.item).toMatchObject({
      id: 'invest:o2', externalId: 'invest:o2', description: 'Venda PETR4', value: 195,
      category: 'revenue', tag: 'investimentos', isPaid: true, source: 'invest',
      occurredAt: '2025-04-02T12:00:00.000Z',
    })
  })
  it('sell without fees and rounding to cents', () => {
    expect(entryFromOperation(op({ type: 'sell', quantity: 0.333, price: 10 }), stock)!.item.value).toBe(3.33)
  })
  it('withdraw uses amount and "Resgate"', () => {
    const r = entryFromOperation(op({ type: 'withdraw', positionId: 'p2', amount: 250 }), savings)!
    expect(r.item).toMatchObject({ category: 'revenue', value: 250, description: 'Resgate Poupança', source: 'invest', isPaid: true })
  })
  it('sell/withdraw with value <= 0 or invalid date return null', () => {
    expect(entryFromOperation(op({ type: 'sell', quantity: 1, price: 10, fees: 10 }), stock)).toBeNull()
    expect(entryFromOperation(op({ type: 'sell', quantity: 1, price: 10, fees: 20 }), stock)).toBeNull()
    expect(entryFromOperation(op({ type: 'sell', quantity: 0, price: 10 }), stock)).toBeNull()
    expect(entryFromOperation(op({ type: 'withdraw', amount: 0 }), savings)).toBeNull()
    expect(entryFromOperation(op({ type: 'sell', quantity: 1, price: 10, date: '' }), stock)).toBeNull()
  })
  it('null for zero value or invalid date', () => {
    expect(entryFromOperation(op({ quantity: 0, price: 10 }), stock)).toBeNull()
    expect(entryFromOperation(op({ quantity: 1, price: 10, date: '2025-13-45' }), stock)).toBeNull()
    expect(entryFromOperation(op({ quantity: 1, price: 10, date: '' }), stock)).toBeNull()
  })
  it('rounds to cents', () => {
    expect(entryFromOperation(op({ quantity: 3, price: 10.333 }), stock)!.item.value).toBe(31)
    expect(entryFromOperation(op({ quantity: 0.333, price: 10 }), stock)!.item.value).toBe(3.33)
  })
})
