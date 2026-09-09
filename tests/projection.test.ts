import { describe, it, expect } from 'vitest'
import { buildProjection } from '../src/lib/projection'
import type { MonthPoint, RecurringItem } from '../src/types/finance'

const NOW = new Date('2026-09-15T12:00:00.000Z') // Set/2026

function mp(month: MonthPoint['month'], year: number, revenue: number, totalExpenses: number): MonthPoint {
  return {
    month, year, revenue, fixedCosts: totalExpenses, loans: 0, cards: 0, variableCosts: 0,
    source: 'manual', totalExpenses, balance: revenue - totalExpenses,
    consolidatedRevenue: revenue, consolidatedExpenses: totalExpenses, consolidatedBalance: revenue - totalExpenses,
    label: `${month}/${String(year).slice(2)}`,
  }
}

const recurring: RecurringItem[] = [
  { id: 'r1', description: 'Salário', value: 5000, category: 'revenue', isActive: true },
  { id: 'r2', description: 'Aluguel', value: 3000, category: 'fixedCosts', isActive: true },
  { id: 'r3', description: 'Inativo', value: 999, category: 'fixedCosts', isActive: false },
]

describe('buildProjection', () => {
  it('usa o run-rate recorrente para meses não lançados', () => {
    const proj = buildProjection([], recurring, NOW, 6)
    expect(proj.baseline).toBe(2000) // 5000 − 3000 (inativo ignorado)
    expect(proj.rows).toHaveLength(6)
    expect(proj.rows[0].label).toBe('Set/26')
    expect(proj.rows.every(r => r.result === 2000)).toBe(true)
    expect(proj.endOfHorizon).toBe(12000) // 2000 × 6
    expect(proj.rows[2].cumulative).toBe(6000)
  })

  it('usa o balanço real de um mês lançado com receita', () => {
    const months = [mp('Set', 2026, 5000, 4500)] // balanço +500
    const proj = buildProjection(months, recurring, NOW, 3)
    expect(proj.rows[0].result).toBe(500)   // lançado
    expect(proj.rows[0].launched).toBe(true)
    expect(proj.rows[1].result).toBe(2000)  // projetado
    expect(proj.rows[1].launched).toBe(false)
  })

  it('ignora mês lançado sem receita (usa o recorrente)', () => {
    const months = [mp('Set', 2026, 0, 1200)] // só despesas (fatura parcial)
    const proj = buildProjection(months, recurring, NOW, 2)
    expect(proj.rows[0].result).toBe(2000)   // não confia no parcial
    expect(proj.rows[0].launched).toBe(false)
  })
})
