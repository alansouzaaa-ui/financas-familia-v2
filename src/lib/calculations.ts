import type { MonthRecord, MonthPoint, AnnualSummary, HealthScore, Alert, FinancialGoal } from '@/types/finance'
import { monthLabel } from './formatters'

export function toMonthPoint(r: MonthRecord): MonthPoint {
  const totalExpenses = r.fixedCosts + r.loans + r.cards
  const balance = r.revenue - totalExpenses

  // Consolidated = only paid items
  let consolidatedRevenue = r.revenue
  let consolidatedExpenses = totalExpenses
  if (r.items && r.items.length > 0) {
    const paidRevenue = r.items.filter(i => i.category === 'revenue' && i.isPaid).reduce((s: number, i) => s + i.value, 0)
    const paidExpenses = r.items.filter(i => i.category !== 'revenue' && i.isPaid).reduce((s: number, i) => s + i.value, 0)
    consolidatedRevenue = paidRevenue
    consolidatedExpenses = paidExpenses
  }

  return {
    ...r,
    totalExpenses,
    balance,
    consolidatedRevenue,
    consolidatedExpenses,
    consolidatedBalance: consolidatedRevenue - consolidatedExpenses,
    label: monthLabel(r.month, r.year),
  }
}

export function buildAnnualSummary(months: MonthPoint[]): AnnualSummary[] {
  const byYear = new Map<number, MonthPoint[]>()
  for (const m of months) {
    if (!byYear.has(m.year)) byYear.set(m.year, [])
    byYear.get(m.year)!.push(m)
  }

  return Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, ms]) => {
      const revenue     = ms.reduce((s, m) => s + m.revenue, 0)
      const fixedCosts  = ms.reduce((s, m) => s + m.fixedCosts, 0)
      const loans       = ms.reduce((s, m) => s + m.loans, 0)
      const cards       = ms.reduce((s, m) => s + m.cards, 0)
      const totalExpenses = fixedCosts + loans + cards
      const balance = revenue - totalExpenses
      return {
        year,
        monthCount: ms.length,
        revenue, fixedCosts, loans, cards,
        totalExpenses,
        balance,
        avgBalance: balance / ms.length,
      }
    })
}

export function calcHealthScore(months: MonthPoint[]): HealthScore {
  if (months.length === 0) {
    return { score: 0, label: 'Crítico', color: '#993C1D', savingsRate: 0, debtRatio: 0, cardRatio: 0, trendPoints: 0 }
  }

  const last = months[months.length - 1]
  const last3 = months.slice(-3)

  const savingsRate = last.revenue > 0 ? (last.balance / last.revenue) * 100 : -100
  const debtRatio   = last.revenue > 0 ? (last.loans / last.revenue) * 100 : 100
  const cardRatio   = last.revenue > 0 ? (last.cards / last.revenue) * 100 : 100
  const trend       = last3.reduce((s, m) => s + m.balance, 0) / last3.length

  // Score: 0–100
  let score = 50
  score += Math.min(30, Math.max(-30, savingsRate * 1.5))  // savings weight 40
  score -= Math.min(15, Math.max(0, debtRatio * 0.5))       // debt weight 15
  score -= Math.min(15, Math.max(0, cardRatio * 0.4))       // cards weight 15
  score += trend > 0 ? Math.min(20, trend / 500) : Math.max(-20, trend / 500) // trend weight 20

  score = Math.round(Math.min(100, Math.max(0, score)))

  const label  = score >= 80 ? 'Excelente' : score >= 60 ? 'Bom' : score >= 40 ? 'Regular' : score >= 20 ? 'Atenção' : 'Crítico'
  const color  = score >= 80 ? '#0F6E56'   : score >= 60 ? '#185FA5' : score >= 40 ? '#BA7517' : score >= 20 ? '#D85A30' : '#993C1D'

  return { score, label, color, savingsRate, debtRatio, cardRatio, trendPoints: trend }
}

export function calcAlerts(months: MonthPoint[], goals: FinancialGoal[]): Alert[] {
  if (months.length < 2) return []

  const alerts: Alert[] = []
  const last = months[months.length - 1]
  const prev = months.slice(-13, -1)
  if (prev.length === 0) return []

  const avg = {
    revenue:    prev.reduce((s, m) => s + m.revenue, 0) / prev.length,
    fixedCosts: prev.reduce((s, m) => s + m.fixedCosts, 0) / prev.length,
    loans:      prev.reduce((s, m) => s + m.loans, 0) / prev.length,
    cards:      prev.reduce((s, m) => s + m.cards, 0) / prev.length,
  }

  const checks: Array<{ key: keyof typeof avg; label: string; higherIsBad: boolean }> = [
    { key: 'cards',      label: 'Cartões',       higherIsBad: true },
    { key: 'loans',      label: 'Empréstimos',   higherIsBad: true },
    { key: 'fixedCosts', label: 'Custos fixos',  higherIsBad: true },
    { key: 'revenue',    label: 'Receita',        higherIsBad: false },
  ]

  for (const { key, label, higherIsBad } of checks) {
    const cur = last[key] as number
    const avg_v = avg[key]
    if (avg_v === 0) continue
    const dev = ((cur - avg_v) / avg_v) * 100
    const bad = higherIsBad ? dev > 0 : dev < 0
    if (!bad) continue
    const absDev = Math.abs(dev)
    if (absDev >= 20) {
      alerts.push({
        id: key,
        type: absDev >= 35 ? 'danger' : 'warning',
        category: key as Alert['category'],
        message: `${label} em ${last.label} está ${absDev.toFixed(0)}% ${higherIsBad ? 'acima' : 'abaixo'} da média`,
        deviation: absDev,
      })
    }
  }

  // Goal alerts
  for (const goal of goals) {
    const cur = last[goal.category] as number
    const isExpense = goal.category !== 'revenue'
    if (isExpense && cur > goal.targetValue * 1.1) {
      const dev = ((cur - goal.targetValue) / goal.targetValue) * 100
      alerts.push({
        id: `goal-${goal.category}`,
        type: dev > 25 ? 'danger' : 'warning',
        category: goal.category as Alert['category'],
        message: `Meta de ${goal.category === 'fixedCosts' ? 'custos fixos' : goal.category === 'cards' ? 'cartões' : 'empréstimos'} ultrapassada em ${dev.toFixed(0)}%`,
        deviation: dev,
      })
    }
  }

  return alerts.sort((a, b) => b.deviation - a.deviation).slice(0, 4)
}

export function filterByPeriod(months: MonthPoint[], preset: string, customRange?: { from: string; to: string }): MonthPoint[] {
  if (preset === 'all') return months
  if (!months.length) return months

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonthIdx = now.getMonth() // 0-based

  if (preset === 'current_month') {
    const MONTHS_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const currentMonth = MONTHS_ABR[currentMonthIdx]
    return months.filter(m => m.year === currentYear && m.month === currentMonth)
  }

  if (preset === 'current_year') {
    return months.filter(m => m.year === currentYear)
  }

  if (preset === 'custom' && customRange) {
    const MONTHS_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const [fromY, fromM] = customRange.from.split('-')
    const [toY, toM] = customRange.to.split('-')
    const fromNum = parseInt(fromY) * 100 + MONTHS_ABR.indexOf(fromM)
    const toNum   = parseInt(toY)   * 100 + MONTHS_ABR.indexOf(toM)
    return months.filter(m => {
      const mNum = m.year * 100 + MONTHS_ABR.indexOf(m.month)
      return mNum >= fromNum && mNum <= toNum
    })
  }

  const count = preset === '3m' ? 3 : preset === '6m' ? 6 : 12
  return months.slice(-count)
}
