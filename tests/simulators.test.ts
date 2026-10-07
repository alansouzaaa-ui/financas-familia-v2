import { describe, expect, it } from 'vitest'
import {
  monthlyRateFromAnnual, simulateGrowth, monthsToTarget, requiredMonthly,
  irRateForDays, cdiPctToAnnual, compareFixedIncome, retirementPlan,
} from '../src/lib/simulators'

describe('monthlyRateFromAnnual', () => {
  it('12.68% a.a. ≈ 1% a.m.', () => expect(monthlyRateFromAnnual(12.68)).toBeCloseTo(0.01, 4))
})

describe('simulateGrowth', () => {
  it('sem juros soma simples', () => {
    const r = simulateGrowth({ initial: 1000, monthly: 100, annualRatePct: 0, months: 12 })
    expect(r.final).toBeCloseTo(2200, 6)
    expect(r.invested).toBe(2200)
    expect(r.interest).toBeCloseTo(0, 6)
    expect(r.points).toHaveLength(13)
    expect(r.points[0]).toEqual({ month: 0, invested: 1000, total: 1000 })
  })
  it('com juros bate com FV fechado', () => {
    const i = monthlyRateFromAnnual(10)
    const fv = 1000 * Math.pow(1 + i, 24) + 200 * ((Math.pow(1 + i, 24) - 1) / i)
    expect(simulateGrowth({ initial: 1000, monthly: 200, annualRatePct: 10, months: 24 }).final).toBeCloseTo(fv, 6)
  })
  it('months<=0 só ponto 0; months grande amostra e mantém o último', () => {
    expect(simulateGrowth({ initial: 5, monthly: 1, annualRatePct: 5, months: 0 }).points).toHaveLength(1)
    const r = simulateGrowth({ initial: 0, monthly: 10, annualRatePct: 0, months: 1200 })
    expect(r.points.length).toBeLessThanOrEqual(601)
    expect(r.points[r.points.length - 1].month).toBe(1200)
    expect(r.final).toBeCloseTo(12000, 6)
  })
})

describe('monthsToTarget', () => {
  it('0 se já atingiu', () => expect(monthsToTarget({ initial: 10, monthly: 0, annualRatePct: 0, target: 10 })).toBe(0))
  it('null se não atinge', () => expect(monthsToTarget({ initial: 0, monthly: 0, annualRatePct: 5, target: 100 })).toBeNull())
  it('caso normal', () => expect(monthsToTarget({ initial: 0, monthly: 1000, annualRatePct: 0, target: 12000 })).toBe(12))
})

describe('requiredMonthly', () => {
  it('é o inverso de simulateGrowth', () => {
    const m = requiredMonthly({ initial: 5000, annualRatePct: 9, months: 60, target: 100000 })
    const r = simulateGrowth({ initial: 5000, monthly: m, annualRatePct: 9, months: 60 })
    expect(r.final).toBeCloseTo(100000, 4)
  })
  it('taxa zero, need<=0 e months<=0', () => {
    expect(requiredMonthly({ initial: 0, annualRatePct: 0, months: 10, target: 1000 })).toBeCloseTo(100, 8)
    expect(requiredMonthly({ initial: 2000, annualRatePct: 0, months: 10, target: 1000 })).toBe(0)
    expect(requiredMonthly({ initial: 0, annualRatePct: 5, months: 0, target: 1000 })).toBe(Infinity)
  })
})

describe('irRateForDays', () => {
  it('faixas e bordas', () => {
    expect(irRateForDays(180)).toBe(0.225)
    expect(irRateForDays(181)).toBe(0.2)
    expect(irRateForDays(360)).toBe(0.2)
    expect(irRateForDays(361)).toBe(0.175)
    expect(irRateForDays(720)).toBe(0.175)
    expect(irRateForDays(721)).toBe(0.15)
  })
})

describe('cdiPctToAnnual', () => {
  it('100% ≈ CDI', () => expect(cdiPctToAnnual(13.65, 100)).toBeCloseTo(13.65, 6))
  it('110% > CDI', () => expect(cdiPctToAnnual(13.65, 110)).toBeGreaterThan(14.9))
})

const base = { amount: 20000, months: 6, cdiAnnualPct: 13.65, selicAnnualPct: 13.75, poupancaMonthlyPct: 0.66, cdbPctCdi: 100, lciPctCdi: 90 }

describe('compareFixedIncome', () => {
  it('amount<=0 → []', () => expect(compareFixedIncome({ ...base, amount: 0 })).toEqual([]))
  it('LCI e poupança isentas, CDB com IR 20% em 6 meses (≈183 dias)', () => {
    const rows = compareFixedIncome(base)
    const cdb = rows.find(r => r.id === 'cdb')!
    expect(cdb.ir).toBeCloseTo((cdb.gross - 20000) * 0.2, 6)
    expect(rows.find(r => r.id === 'lci')!.ir).toBe(0)
    expect(rows.find(r => r.id === 'lci')!.taxFree).toBe(true)
    expect(rows.find(r => r.id === 'poupanca')!.ir).toBe(0)
    expect(cdb.label).toBe('CDB 100% do CDI')
  })
  it('CDB com IR 15% em 3 anos', () => {
    const cdb = compareFixedIncome({ ...base, months: 36 }).find(r => r.id === 'cdb')!
    expect(cdb.ir).toBeCloseTo((cdb.gross - 20000) * 0.15, 6)
  })
  it('poupança usa taxa mensal composta', () => {
    const p = compareFixedIncome(base).find(r => r.id === 'poupanca')!
    expect(p.gross).toBeCloseTo(20000 * Math.pow(1.0066, 6), 6)
    expect(p.netGain).toBeCloseTo(p.net - 20000, 8)
  })
  it('custódia só acima de 10k', () => {
    const small = compareFixedIncome({ ...base, amount: 5000, months: 12 }).find(r => r.id === 'tesouro')!
    expect(small.fees).toBe(0)
    const big = compareFixedIncome({ ...base, months: 12 }).find(r => r.id === 'tesouro')!
    expect(big.fees).toBeCloseTo(Math.max(0, big.gross - 10000) * 0.002, 6)
    expect(big.fees).toBeGreaterThan(0)
    expect(big.net).toBeCloseTo(big.gross - big.ir - big.fees, 8)
  })
  it('ordenado por net desc', () => {
    const rows = compareFixedIncome({ ...base, months: 24 })
    for (let k = 1; k < rows.length; k++) expect(rows[k - 1].net).toBeGreaterThanOrEqual(rows[k].net)
    expect(rows).toHaveLength(4)
  })
})

describe('retirementPlan', () => {
  it('perpetuidade e aporte necessário', () => {
    const p = { currentAge: 30, retireAge: 60, monthlyIncome: 5000, currentWealth: 50000, realAnnualPct: 5 }
    const r = retirementPlan(p)
    const i = monthlyRateFromAnnual(5)
    expect(r.months).toBe(360)
    expect(r.requiredWealth).toBeCloseTo(5000 / i, 4)
    expect(r.projectedWealth).toBeCloseTo(50000 * Math.pow(1 + i, 360), 4)
    const g = simulateGrowth({ initial: 50000, monthly: r.requiredMonthly, annualRatePct: 5, months: 360 })
    expect(g.final).toBeCloseTo(r.requiredWealth, 2)
  })
  it('taxa real <= 0 → Infinity; já passou da idade → months 0', () => {
    expect(retirementPlan({ currentAge: 30, retireAge: 60, monthlyIncome: 1, currentWealth: 0, realAnnualPct: 0 }).requiredWealth).toBe(Infinity)
    expect(retirementPlan({ currentAge: 70, retireAge: 60, monthlyIncome: 1, currentWealth: 0, realAnnualPct: 5 }).months).toBe(0)
  })
})

describe('faixa de IR por prazo em meses', () => {
  it('3 meses → 22,5%; 12 meses → 17,5% (365 dias, não 360)', () => {
    const b = { amount: 10000, cdiAnnualPct: 13.65, selicAnnualPct: 13.75, poupancaMonthlyPct: 0.66, cdbPctCdi: 100, lciPctCdi: 90 }
    const c3 = compareFixedIncome({ ...b, months: 3 }).find(r => r.id === 'cdb')!
    expect(c3.ir).toBeCloseTo((c3.gross - 10000) * 0.225, 6)
    const c12 = compareFixedIncome({ ...b, months: 12 }).find(r => r.id === 'cdb')!
    expect(c12.ir).toBeCloseTo((c12.gross - 10000) * 0.175, 6)
  })
})
