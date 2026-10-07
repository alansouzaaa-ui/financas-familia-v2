import { describe, it, expect } from 'vitest'
import {
  effectiveRate, debtsForPlan, simulatePayoff, avgMonthlySurplus, monthsToReach,
  addMonthsLabel, computeJourney, type PayoffDebt,
} from '../src/lib/journey'
import type { DebtItem } from '../src/types/debt'
import type { MonthPoint } from '../src/types/finance'

const debt = (o: Partial<DebtItem>): DebtItem => ({
  id: 'x', bank: 'Banco', modality: 'cartao', detail: '', status: 'vencida', value: 100, ...o,
})
const pd = (id: string, balance: number, monthlyRate: number): PayoffDebt =>
  ({ id, label: id, balance, monthlyRate, estimatedRate: false })
const mp = (month: string, year: number, revenue: number, totalExpenses: number): MonthPoint =>
  ({ month, year, revenue, totalExpenses, balance: revenue - totalExpenses } as unknown as MonthPoint)

describe('effectiveRate', () => {
  it('usa taxa informada', () => {
    expect(effectiveRate(debt({ monthlyRate: 5 }))).toEqual({ rate: 5, estimated: false })
  })
  it('estima quando ausente ou inválida', () => {
    expect(effectiveRate(debt({ modality: 'cartao' }))).toEqual({ rate: 14, estimated: true })
    expect(effectiveRate(debt({ modality: 'financiamento', monthlyRate: 0 }))).toEqual({ rate: 1.8, estimated: true })
    expect(effectiveRate(debt({ modality: 'emprestimo', monthlyRate: NaN }))).toEqual({ rate: 4, estimated: true })
  })
})

describe('debtsForPlan', () => {
  const items = [
    debt({ id: 'a', status: 'vencida', detail: 'Rotativo' }),
    debt({ id: 'b', status: 'em_dia' }),
    debt({ id: 'c', status: 'vencida', paid: true }),
    debt({ id: 'd', status: 'vencida', value: 0 }),
  ]
  it('vencidas exclui pagas, zeradas e em dia', () => {
    const r = debtsForPlan(items, 'vencidas')
    expect(r.map(x => x.id)).toEqual(['a'])
    expect(r[0].label).toBe('Banco · Rotativo')
  })
  it('todas inclui em dia e usa label da modalidade', () => {
    const r = debtsForPlan(items, 'todas')
    expect(r.map(x => x.id)).toEqual(['a', 'b'])
    expect(r[1].label).toBe('Banco · Cartão de crédito')
  })
})

describe('simulatePayoff', () => {
  it('uma dívida a 0%', () => {
    const r = simulatePayoff([pd('a', 1000, 0)], 250, 'avalanche')
    expect(r.feasible).toBe(true)
    expect(r.months).toBe(4)
    expect(r.totalInterest).toBe(0)
    expect(r.totalPaid).toBe(1000)
  })
  it('avalanche paga maior taxa primeiro e custa menos juros', () => {
    const debts = [pd('A', 1000, 10), pd('B', 300, 2)]
    const av = simulatePayoff(debts, 300, 'avalanche')
    const sn = simulatePayoff(debts, 300, 'snowball')
    expect(av.lines[0].id).toBe('A')
    expect(sn.lines[0].id).toBe('B')
    expect(av.feasible && sn.feasible).toBe(true)
    expect(av.totalInterest).toBeLessThanOrEqual(sn.totalInterest)
  })
  it('inviável quando orçamento <= juros do 1º mês', () => {
    const r = simulatePayoff([pd('a', 10000, 14)], 1000, 'avalanche')
    expect(r.feasible).toBe(false)
    expect(r.firstMonthInterest).toBe(1400)
    expect(r.lines[0].payoffMonth).toBe(-1)
  })
  it('orçamento zero é inviável', () => {
    const r = simulatePayoff([pd('a', 100, 1)], 0, 'snowball')
    expect(r.feasible).toBe(false)
    expect(r.months).toBe(0)
  })
  it('lista vazia', () => {
    const r = simulatePayoff([], 500, 'avalanche')
    expect(r).toMatchObject({ feasible: true, months: 0, totalInterest: 0, totalPaid: 0, lines: [] })
  })
})

describe('avgMonthlySurplus', () => {
  const now = new Date(2026, 9, 15) // out/2026
  it('ignora mês corrente e vazios, usa os 3 mais recentes', () => {
    const months = [
      mp('Mai', 2026, 1000, 800),   // +200 (fora dos 3 recentes)
      mp('Jun', 2026, 1000, 700),   // +300
      mp('Jul', 2026, 0, 0),        // vazio
      mp('Ago', 2026, 1000, 400),   // +600
      mp('Set', 2026, 1000, 1000),  // 0
      mp('Out', 2026, 5000, 100),   // corrente: ignora
      mp('Nov', 2026, 5000, 100),   // futuro: ignora
    ]
    expect(avgMonthlySurplus(months, now)).toEqual({ avg: 300, monthsUsed: 3 })
  })
  it('sem dados', () => {
    expect(avgMonthlySurplus([], now)).toEqual({ avg: 0, monthsUsed: 0 })
  })
  it('pode ser negativa', () => {
    expect(avgMonthlySurplus([mp('Set', 2026, 100, 400)], now).avg).toBe(-300)
  })
})

describe('monthsToReach', () => {
  it('casos', () => {
    expect(monthsToReach(0, 100)).toBe(0)
    expect(monthsToReach(-5, 0)).toBe(0)
    expect(monthsToReach(100, 0)).toBeNull()
    expect(monthsToReach(100, -10)).toBeNull()
    expect(monthsToReach(1000, 300)).toBe(4)
  })
})

describe('addMonthsLabel', () => {
  it('formata', () => {
    expect(addMonthsLabel(new Date(2026, 9, 15), 5)).toBe('Mar/2027')
    expect(addMonthsLabel(new Date(2026, 9, 15), 0)).toBe('Out/2026')
    expect(addMonthsLabel(new Date(2026, 11, 1), 1)).toBe('Jan/2027')
  })
})

describe('computeJourney', () => {
  it('dívidas pendentes', () => {
    const j = computeJourney({ overdueDebt: 500, reserveCurrent: 0, reserveTarget: 0 })
    expect(j.current).toBe('dividas')
    expect(j.steps.map(s => s.done)).toEqual([false, false, false])
  })
  it('reserva pendente', () => {
    const j = computeJourney({ overdueDebt: 0, reserveCurrent: 100, reserveTarget: 1000 })
    expect(j.current).toBe('reserva')
    expect(j.steps[0].done).toBe(true)
  })
  it('investir', () => {
    const j = computeJourney({ overdueDebt: 0, reserveCurrent: 1000, reserveTarget: 1000 })
    expect(j.current).toBe('investir')
    expect(j.steps[1].done).toBe(true)
  })
})
