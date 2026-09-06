import { describe, it, expect } from 'vitest'
import { parseTransaction, appendTelegramTransaction } from '../../../api/lib/telegram'
import type { SyncPayload } from '../../../src/lib/syncService'

const emptyPayload: SyncPayload = {
  manual_months: [],
  goals: [],
  recurring_items: [],
  investment_positions: [],
}

describe('parseTransaction', () => {
  it('parses a Brazilian decimal expense as variable cost', () => {
    const result = parseTransaction('mercado 185,40', '123', 1)
    expect(result).toMatchObject({
      description: 'mercado',
      value: 185.4,
      category: 'variableCosts',
      chatId: '123',
      updateId: 1,
      externalId: 'telegram:123:1',
    })
  })

  it('classifies salario as revenue', () => {
    const result = parseTransaction('salario 5000', '123', 2)
    expect(result).toMatchObject({ category: 'revenue', value: 5000 })
  })

  it('returns null when no number found', () => {
    expect(parseTransaction('sem numero', '123', 3)).toBeNull()
  })

  it('returns null for zero value', () => {
    expect(parseTransaction('zero 0', '123', 4)).toBeNull()
  })

  it('returns null for value above 1_000_000', () => {
    expect(parseTransaction('fraude 2000000', '123', 5)).toBeNull()
  })

  it('classifies cartao correctly', () => {
    const result = parseTransaction('cartao 300', '123', 6)
    expect(result).toMatchObject({ category: 'cards' })
  })

  it('classifies emprestimo correctly', () => {
    const result = parseTransaction('empréstimo 1200', '123', 7)
    expect(result).toMatchObject({ category: 'loans' })
  })

  it('classifies fixo correctly', () => {
    const result = parseTransaction('aluguel fixo 800', '123', 8)
    expect(result).toMatchObject({ category: 'fixedCosts' })
  })

  it('resolves the card by name mention (cartão pai)', () => {
    const accounts = [
      { id: 'card-alan', name: 'Cartão Alan' },
      { id: 'card-pai', name: 'Cartão Pai' },
    ]
    const result = parseTransaction('cartão pai 200', '123', 20, accounts)
    expect(result).toMatchObject({ category: 'cards', cardId: 'card-pai' })
  })

  it('leaves cardId undefined for a card expense with no known card', () => {
    const result = parseTransaction('cartao 300', '123', 21, [{ id: 'card-alan', name: 'Cartão Alan' }])
    expect(result?.category).toBe('cards')
    expect(result?.cardId).toBeUndefined()
  })
})

describe('appendTelegramTransaction', () => {
  it('inserts a transaction into an empty payload and returns inserted: true', () => {
    const tx = parseTransaction('mercado 185,40', '123', 1)!
    const { payload, inserted } = appendTelegramTransaction(emptyPayload, tx)
    expect(inserted).toBe(true)
    expect(payload.manual_months).toHaveLength(1)
    expect(payload.manual_months[0].variableCosts).toBeCloseTo(185.4)
    expect(payload.manual_months[0].items).toHaveLength(1)
  })

  it('does not insert a duplicate externalId (idempotency)', () => {
    const tx = parseTransaction('mercado 185,40', '123', 1)!
    const once = appendTelegramTransaction(emptyPayload, tx)
    const twice = appendTelegramTransaction(once.payload, tx)
    expect(once.inserted).toBe(true)
    expect(twice.inserted).toBe(false)
    expect(twice.payload.manual_months[0].items).toHaveLength(1)
  })

  it('accumulates totals when multiple items are added to the same month', () => {
    const tx1 = parseTransaction('mercado 100', '123', 10)!
    const tx2 = parseTransaction('farmacia 50', '123', 11)!
    // Force same occurredAt month
    tx2.occurredAt = tx1.occurredAt
    const r1 = appendTelegramTransaction(emptyPayload, tx1)
    const r2 = appendTelegramTransaction(r1.payload, tx2)
    expect(r2.payload.manual_months[0].variableCosts).toBeCloseTo(150)
  })

  it('creates month record with correct month/year derived from occurredAt', () => {
    const tx = parseTransaction('salario 3000', '42', 99)!
    tx.occurredAt = '2026-09-01T12:00:00.000Z'
    const { payload } = appendTelegramTransaction(emptyPayload, tx)
    const record = payload.manual_months[0]
    expect(record.month).toBe('Set')
    expect(record.year).toBe(2026)
  })

  it('files a card purchase into next month (fatura shift) with cardId', () => {
    const tx = parseTransaction('cartão pai 200', '42', 100, [{ id: 'card-pai', name: 'Cartão Pai' }])!
    tx.occurredAt = '2026-09-15T12:00:00.000Z' // compra em setembro
    const { payload } = appendTelegramTransaction(emptyPayload, tx)
    const record = payload.manual_months[0]
    expect(record.month).toBe('Out') // fatura de outubro
    expect(record.year).toBe(2026)
    expect(record.cards).toBeCloseTo(200)
    expect(record.items?.[0].cardId).toBe('card-pai')
    // Cartão é fatura futura → entra em aberto (não pago)
    expect(record.items?.[0].isPaid).toBe(false)
  })

  it('marks card expenses as unpaid but keeps other expenses paid', () => {
    const card = parseTransaction('cartão alan 300', '42', 200, [{ id: 'card-alan', name: 'Cartão Alan' }])!
    const cardRes = appendTelegramTransaction(emptyPayload, card)
    const cardItem = cardRes.payload.manual_months[0].items?.[0]
    expect(cardItem?.category).toBe('cards')
    expect(cardItem?.isPaid).toBe(false)

    const grocery = parseTransaction('mercado 120', '42', 201)!
    const groceryRes = appendTelegramTransaction(emptyPayload, grocery)
    const groceryItem = groceryRes.payload.manual_months[0].items?.[0]
    expect(groceryItem?.category).toBe('variableCosts')
    expect(groceryItem?.isPaid).toBe(true)
  })

  it('rolls a December card purchase into January of next year', () => {
    const tx = parseTransaction('cartão alan 90', '42', 101, [{ id: 'card-alan', name: 'Cartão Alan' }])!
    tx.occurredAt = '2026-12-20T12:00:00.000Z'
    const { payload } = appendTelegramTransaction(emptyPayload, tx)
    const record = payload.manual_months[0]
    expect(record.month).toBe('Jan')
    expect(record.year).toBe(2027)
  })
})
