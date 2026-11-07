import { describe, it, expect } from 'vitest'
import { groupTotals, groupPending, goalsBasis } from '../src/lib/goals'
import type { MonthItem, MonthPoint } from '../src/types/finance'

let seq = 0
const item = (category: MonthItem['category'], value: number, isPaid = true): MonthItem =>
  ({ id: `i${seq++}`, description: 'x', value, category, isPaid })
const mp = (month: string, year: number, o: Partial<MonthPoint> = {}): MonthPoint =>
  ({ month, year, revenue: 0, fixedCosts: 0, loans: 0, cards: 0, ...o } as unknown as MonthPoint)

describe('groupTotals', () => {
  it('itens têm prioridade sobre agregados', () => {
    const m = mp('Jan', 2026, {
      revenue: 999, fixedCosts: 999, loans: 999, cards: 999,
      items: [item('revenue', 100), item('revenue', 50), item('fixedCosts', 30), item('loans', 20), item('cards', 10), item('variableCosts', 77), item('cards', NaN)],
    })
    expect(groupTotals(m)).toEqual({ revenue: 150, fixedCosts: 30, loans: 20, cards: 10 })
  })
  it('sem itens usa agregados', () => {
    expect(groupTotals(mp('Jan', 2026, { revenue: 5, fixedCosts: 4, loans: 3, cards: 2 })))
      .toEqual({ revenue: 5, fixedCosts: 4, loans: 3, cards: 2 })
    expect(groupTotals(mp('Jan', 2026, { revenue: 5, items: [] })).revenue).toBe(5)
  })
})

describe('groupTotals paidOnly / groupPending', () => {
  const m = mp('Jan', 2026, {
    revenue: 999, fixedCosts: 999, loans: 999, cards: 999,
    items: [item('revenue', 100), item('revenue', 40, false), item('fixedCosts', 30), item('fixedCosts', 25, false), item('loans', 20, false), item('cards', 10), item('variableCosts', 7, false)],
  })
  it('paidOnly soma só pagos (receita recebida)', () => {
    expect(groupTotals(m, { paidOnly: true })).toEqual({ revenue: 100, fixedCosts: 30, loans: 0, cards: 10 })
    expect(groupTotals(m)).toEqual({ revenue: 140, fixedCosts: 55, loans: 20, cards: 10 })
  })
  it('paidOnly sem itens cai nos agregados', () => {
    expect(groupTotals(mp('Jan', 2026, { revenue: 5, fixedCosts: 4, loans: 3, cards: 2 }), { paidOnly: true }))
      .toEqual({ revenue: 5, fixedCosts: 4, loans: 3, cards: 2 })
  })
  it('groupPending soma não pagos por grupo; zeros sem itens', () => {
    expect(groupPending(m)).toEqual({ revenue: 40, fixedCosts: 25, loans: 20, cards: 0 })
    expect(groupPending(mp('Jan', 2026, { revenue: 5 }))).toEqual({ revenue: 0, fixedCosts: 0, loans: 0, cards: 0 })
  })
})

describe('goalsBasis', () => {
  const now = new Date(2026, 10, 15) // Nov/2026
  it('current é o mês atual ou null', () => {
    const months = [mp('Out', 2026), mp('Nov', 2026, { revenue: 1 }), mp('Dez', 2026)]
    expect(goalsBasis(months, now).current?.revenue).toBe(1)
    expect(goalsBasis([mp('Out', 2026), mp('Dez', 2026)], now).current).toBeNull()
  })
  it('last12 exclui futuros e cruza o ano', () => {
    const months = [mp('Nov', 2025), mp('Dez', 2025), mp('Jan', 2026), mp('Nov', 2026), mp('Dez', 2026), mp('Set', 2031)]
    const keys = goalsBasis(months, now).last12.map(m => `${m.month}${m.year}`)
    expect(keys).toEqual(['Dez2025', 'Jan2026', 'Nov2026'])
  })
  it('não puxa mês antigo quando falta um mês', () => {
    const months = [mp('Out', 2025), mp('Nov', 2025), mp('Dez', 2025), mp('Nov', 2026)]
    const keys = goalsBasis(months, now).last12.map(m => `${m.month}${m.year}`)
    expect(keys).toEqual(['Dez2025', 'Nov2026'])
  })
  it('no máximo 12 meses', () => {
    const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const months = [...names.map(n => mp(n, 2025)), ...names.map(n => mp(n, 2026))]
    const r = goalsBasis(months, now).last12
    expect(r).toHaveLength(12)
    expect(r[0].month).toBe('Dez'); expect(r[0].year).toBe(2025)
  })
})
