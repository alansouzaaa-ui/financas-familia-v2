import { describe, it, expect } from 'vitest'
import { computeNetWorth, currentMonthCommitments } from '../src/lib/netWorth'
import type { MonthRecord } from '../src/types/finance'

const rec = (o: Partial<MonthRecord>): MonthRecord =>
  ({ month: 'Out', year: 2026, revenue: 0, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0, source: 'manual', ...o }) as MonthRecord

describe('computeNetWorth', () => {
  it('Investimentos + saldo - dívidas', () => {
    const r = computeNetWorth({ investmentsCurrent: 10000, cash: 2000, debts: [{ value: 5000 }] })
    expect(r.netWorth).toBe(7000)
    expect(r.cashMissing).toBe(false)
  })
  it('ignora dívidas quitadas', () => {
    const r = computeNetWorth({ investmentsCurrent: 0, cash: 0, debts: [{ value: 100 }, { value: 900, paid: true }] })
    expect(r.debts).toBe(100)
    expect(r.netWorth).toBe(-100)
  })
  it('saldo null vale 0 mas é sinalizado', () => {
    const r = computeNetWorth({ investmentsCurrent: 500, cash: null, debts: [] })
    expect(r.cash).toBe(0)
    expect(r.cashMissing).toBe(true)
    expect(r.netWorth).toBe(500)
  })
})

describe('currentMonthCommitments', () => {
  const now = new Date(2026, 9, 27) // Out/26
  it('usa o mês corrente mesmo com meses futuros', () => {
    const months = [rec({ loans: 100, cards: 200 }), rec({ month: 'Dez', year: 2031, loans: 999, cards: 999 })]
    const c = currentMonthCommitments(months, now)
    expect(c).toMatchObject({ loans: 100, cards: 200, renegociacoes: 0, found: true })
  })
  it('mês com itens usa totais dos itens', () => {
    const items = [
      { id: '1', description: 'a', value: 50, category: 'loans', isPaid: false },
      { id: '2', description: 'b', value: 70, category: 'loans', isPaid: false },
      { id: '3', description: 'c', value: 30, category: 'renegociacoes', isPaid: false },
    ] as MonthRecord['items']
    const c = currentMonthCommitments([rec({ loans: 1, cards: 5, items })], now)
    expect(c).toMatchObject({ loans: 120, cards: 0, renegociacoes: 30 })
  })
  it('mês ausente retorna zeros', () => {
    const c = currentMonthCommitments([rec({ month: 'Dez', year: 2031, loans: 9 })], now)
    expect(c).toMatchObject({ loans: 0, found: false })
  })
})
