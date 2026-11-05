import { describe, it, expect } from 'vitest'
import { filterByPeriod } from '../src/lib/calculations'
import type { MonthPoint } from '../src/types/finance'

const point = (year: number, month: string) => ({ year, month }) as MonthPoint
const months = [
  point(2025, 'Dez'),
  point(2026, 'Jan'),
  point(2026, 'Set'),
  point(2026, 'Out'),
  point(2026, 'Nov'),
]
const custom = (from: string, to: string) =>
  filterByPeriod(months, 'custom', { from, to }).map(m => `${m.month}/${m.year}`)

describe('filterByPeriod: período personalizado (valor de input type="month")', () => {
  it('um único mês', () => {
    expect(custom('2026-10', '2026-10')).toEqual(['Out/2026'])
  })

  it('vários meses, incluindo as duas pontas', () => {
    expect(custom('2026-09', '2026-11')).toEqual(['Set/2026', 'Out/2026', 'Nov/2026'])
  })

  it('intervalo que cruza o ano', () => {
    expect(custom('2025-12', '2026-01')).toEqual(['Dez/2025', 'Jan/2026'])
  })

  it('só o início preenchido', () => {
    expect(custom('2026-10', '')).toEqual(['Out/2026', 'Nov/2026'])
  })

  it('só o fim preenchido', () => {
    expect(custom('', '2026-01')).toEqual(['Dez/2025', 'Jan/2026'])
  })

  it('sem início nem fim', () => {
    expect(custom('', '')).toHaveLength(months.length)
  })
})
