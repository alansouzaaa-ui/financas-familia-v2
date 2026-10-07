import { DEFAULT_MONTHLY_RATE, MODALITY_LABELS, type DebtItem } from '../types/debt'
import { MONTHS, type MonthPoint } from '../types/finance'

export type PayoffStrategy = 'avalanche' | 'snowball'
export type PayoffScope = 'vencidas' | 'todas'

export interface PayoffDebt { id: string; label: string; balance: number; monthlyRate: number; estimatedRate: boolean }
export interface PayoffLine { id: string; label: string; payoffMonth: number; interestPaid: number; monthlyRate: number; estimatedRate: boolean; balance: number }
export interface PayoffResult { feasible: boolean; months: number; totalInterest: number; totalPaid: number; lines: PayoffLine[]; firstMonthInterest: number }

const cents = (n: number) => Math.round(n * 100) / 100

export function effectiveRate(d: DebtItem): { rate: number; estimated: boolean } {
  if (typeof d.monthlyRate === 'number' && Number.isFinite(d.monthlyRate) && d.monthlyRate > 0) {
    return { rate: d.monthlyRate, estimated: false }
  }
  return { rate: DEFAULT_MONTHLY_RATE[d.modality], estimated: true }
}

export function debtsForPlan(items: DebtItem[], scope: PayoffScope): PayoffDebt[] {
  return items
    .filter(d => !d.paid && d.value > 0 && (scope === 'todas' || d.status === 'vencida'))
    .map(d => {
      const { rate, estimated } = effectiveRate(d)
      return {
        id: d.id,
        label: `${d.bank} · ${d.detail || MODALITY_LABELS[d.modality]}`,
        balance: d.value,
        monthlyRate: rate,
        estimatedRate: estimated,
      }
    })
}

export function simulatePayoff(
  debts: PayoffDebt[],
  monthlyBudget: number,
  strategy: PayoffStrategy,
  maxMonths = 600,
): PayoffResult {
  if (debts.length === 0) {
    return { feasible: true, months: 0, totalInterest: 0, totalPaid: 0, lines: [], firstMonthInterest: 0 }
  }
  const order = [...debts].sort((a, b) =>
    strategy === 'avalanche'
      ? b.monthlyRate - a.monthlyRate || a.balance - b.balance
      : a.balance - b.balance || b.monthlyRate - a.monthlyRate,
  )
  const bal = order.map(d => d.balance)
  const interest = order.map(() => 0)
  const payoff = order.map(() => -1)
  let totalInterest = 0
  let firstMonthInterest = 0
  let feasible = false
  let months = maxMonths

  const build = (): PayoffResult => {
    const initial = order.reduce((s, d) => s + d.balance, 0)
    return {
      feasible,
      months,
      totalInterest: cents(totalInterest),
      totalPaid: feasible ? cents(initial + totalInterest) : 0,
      firstMonthInterest: cents(firstMonthInterest),
      lines: order.map((d, i) => ({
        id: d.id,
        label: d.label,
        payoffMonth: payoff[i],
        interestPaid: cents(interest[i]),
        monthlyRate: d.monthlyRate,
        estimatedRate: d.estimatedRate,
        balance: cents(d.balance),
      })),
    }
  }

  if (!(monthlyBudget > 0)) {
    months = 0
    return build()
  }

  for (let m = 1; m <= maxMonths; m++) {
    let monthInterest = 0
    for (let i = 0; i < order.length; i++) {
      if (bal[i] <= 0.005) continue
      const j = bal[i] * order[i].monthlyRate / 100
      bal[i] += j
      interest[i] += j
      monthInterest += j
    }
    totalInterest += monthInterest
    if (m === 1) {
      firstMonthInterest = monthInterest
      if (monthlyBudget <= firstMonthInterest) { months = maxMonths; return build() }
    }
    let left = monthlyBudget
    for (let i = 0; i < order.length && left > 0; i++) {
      if (bal[i] <= 0.005) continue
      const pay = Math.min(bal[i], left)
      bal[i] -= pay
      left -= pay
      if (bal[i] <= 0.005) { bal[i] = 0; payoff[i] = m }
    }
    if (bal.every(b => b <= 0.005)) {
      feasible = true
      months = m
      return build()
    }
  }
  months = maxMonths
  return build()
}

export function avgMonthlySurplus(months: MonthPoint[], now: Date, n = 3): { avg: number; monthsUsed: number } {
  const cur = now.getFullYear() * 100 + now.getMonth() + 1
  const key = (m: MonthPoint) => m.year * 100 + MONTHS.indexOf(m.month) + 1
  const used = months
    .filter(m => key(m) < cur && (m.revenue > 0 || m.totalExpenses > 0))
    .sort((a, b) => key(b) - key(a))
    .slice(0, n)
  if (used.length === 0) return { avg: 0, monthsUsed: 0 }
  return { avg: used.reduce((s, m) => s + m.balance, 0) / used.length, monthsUsed: used.length }
}

export function monthsToReach(gap: number, monthlySaving: number): number | null {
  if (gap <= 0) return 0
  if (monthlySaving <= 0) return null
  return Math.ceil(gap / monthlySaving)
}

export function addMonthsLabel(now: Date, months: number): string {
  const total = now.getFullYear() * 12 + now.getMonth() + months
  return `${MONTHS[((total % 12) + 12) % 12]}/${Math.floor(total / 12)}`
}

export type JourneyStep = 'dividas' | 'reserva' | 'investir'
export interface JourneyState { current: JourneyStep; steps: { id: JourneyStep; label: string; done: boolean }[] }

export function computeJourney(input: { overdueDebt: number; reserveCurrent: number; reserveTarget: number }): JourneyState {
  const steps: JourneyState['steps'] = [
    { id: 'dividas', label: 'Quitar dívidas vencidas', done: input.overdueDebt <= 0 },
    { id: 'reserva', label: 'Reserva de emergência', done: input.reserveTarget > 0 && input.reserveCurrent >= input.reserveTarget },
    { id: 'investir', label: 'Investir com estratégia', done: false },
  ]
  return { current: (steps.find(s => !s.done) ?? steps[2]).id, steps }
}
