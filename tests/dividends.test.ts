import { describe, it, expect } from 'vitest'
import {
  monthlyPattern,
  trailing12m,
  projectNext12,
  dividendSymbol,
  receivedFromEvents,
  dividendYield,
  type DividendEvent,
} from '../src/lib/dividends'

const now = new Date(2026, 9, 7) // 07/10/2026

describe('monthlyPattern', () => {
  it('freq 3/3 e 1/3, somando pagamentos no mesmo mês', () => {
    const ev: DividendEvent[] = [
      { date: '2023-01-10', amount: 1 },
      { date: '2024-01-10', amount: 2 },
      { date: '2025-01-05', amount: 1 },
      { date: '2025-01-25', amount: 2 }, // soma 3 em jan/25
      { date: '2024-06-15', amount: 0.6 },
    ]
    const p = monthlyPattern(ev, now)
    expect(p).toHaveLength(12)
    expect(p[0].freq).toBe(1)
    expect(p[0].avgPerShare).toBeCloseTo((1 + 2 + 3) / 3, 10)
    expect(p[5].freq).toBeCloseTo(1 / 3, 10)
    expect(p[5].avgPerShare).toBeCloseTo(0.6, 10)
    expect(p[1]).toEqual({ month: 1, freq: 0, avgPerShare: 0 })
  })

  it('ignora anos fora da base e o ano corrente', () => {
    const ev: DividendEvent[] = [
      { date: '2022-03-10', amount: 9 },
      { date: '2026-03-10', amount: 9 },
      { date: '2025-03-10', amount: 1 },
    ]
    const p = monthlyPattern(ev, now)
    expect(p[2].freq).toBeCloseTo(1 / 3, 10)
    expect(p[2].avgPerShare).toBe(1)
  })
})

describe('trailing12m', () => {
  it('janela (now-12m, now]', () => {
    const ev: DividendEvent[] = [
      { date: '2025-10-07', amount: 100 }, // exatamente 12 meses atrás: fora
      { date: '2025-10-08', amount: 1 },
      { date: '2026-10-07', amount: 2 }, // hoje: dentro
      { date: '2026-10-08', amount: 50 }, // futuro: fora
    ]
    expect(trailing12m(ev, now)).toBe(3)
  })
})

describe('projectNext12', () => {
  const patterns = Array.from({ length: 12 }, (_, m) => ({ month: m, freq: 0, avgPerShare: 0 }))
  patterns[10] = { month: 10, freq: 1, avgPerShare: 0.1234 } // nov
  patterns[0] = { month: 0, freq: 2 / 3, avgPerShare: 0.5 } // jan
  patterns[2] = { month: 2, freq: 1 / 3, avgPerShare: 9 } // mar: abaixo de minFreq

  it('começa no mês seguinte, vira o ano e arredonda centavos', () => {
    const r = projectNext12(patterns, 100, now)
    expect(r).toHaveLength(12)
    expect(r[0]).toEqual({ year: 2026, month: 10, amount: 12.34 })
    expect(r[1]).toEqual({ year: 2026, month: 11, amount: 0 })
    expect(r[2]).toEqual({ year: 2027, month: 0, amount: 50 })
    expect(r[11]).toEqual({ year: 2027, month: 9, amount: 0 })
  })

  it('respeita minFreq', () => {
    expect(projectNext12(patterns, 10, now)[4].amount).toBe(0) // mar/27
    expect(projectNext12(patterns, 10, now, 0.3)[4].amount).toBe(90)
  })
})

describe('dividendSymbol', () => {
  it('fracionário usa o ticker base', () => {
    expect(dividendSymbol('EZTC3F')).toBe('EZTC3')
    expect(dividendSymbol('HGLG11F')).toBe('HGLG11')
    expect(dividendSymbol(' eztc3f ')).toBe('EZTC3')
  })
  it('demais ficam iguais', () => {
    expect(dividendSymbol('ITSA4')).toBe('ITSA4')
    expect(dividendSymbol('KNRI11')).toBe('KNRI11')
    expect(dividendSymbol('AUVP11')).toBe('AUVP11')
    expect(dividendSymbol('btc')).toBe('BTC')
  })
})

describe('receivedFromEvents', () => {
  const ev: DividendEvent[] = [
    { date: '2025-01-10', amount: 1 }, // fora dos 12m
    { date: '2025-10-07', amount: 1 }, // exatamente 12 meses atrás: fora da janela 12m
    { date: '2025-12-10', amount: 0.5 },
    { date: '2026-03-10', amount: 0.5 },
    { date: '2026-10-07', amount: 0.25 }, // hoje: dentro
    { date: '2026-10-08', amount: 100 }, // futuro: não conta
  ]
  it('soma total e últimos 12m usando a quantidade de cada data', () => {
    const r = receivedFromEvents(ev, () => 10, now)
    expect(r.total).toBe(10 + 10 + 5 + 5 + 2.5)
    expect(r.last12m).toBe(5 + 5 + 2.5)
  })
  it('quantidade varia por evento e eventos futuros não contam', () => {
    const calls: string[] = []
    const r = receivedFromEvents(ev, (d) => { calls.push(d); return d < '2026-01-01' ? 0 : 4 }, now)
    expect(r.total).toBe(0.5 * 4 + 0.25 * 4)
    expect(r.last12m).toBe(3)
    expect(calls).not.toContain('2026-10-08')
  })
  it('arredonda só no fim', () => {
    const r = receivedFromEvents([{ date: '2026-01-01', amount: 0.004 }, { date: '2026-02-01', amount: 0.004 }], () => 1, now)
    expect(r.total).toBe(0.01)
  })
  it('sem eventos', () => {
    expect(receivedFromEvents([], () => 5, now)).toEqual({ total: 0, last12m: 0 })
  })
})

describe('dividendYield', () => {
  it('calcula % e devolve null para preço inválido', () => {
    expect(dividendYield(1, 10)).toBe(10)
    expect(dividendYield(1, null)).toBeNull()
    expect(dividendYield(1, 0)).toBeNull()
    expect(dividendYield(1, NaN)).toBeNull()
  })
})
