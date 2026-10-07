import { useMemo } from 'react'
import { useDebtsStore } from '@/stores/useDebtsStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useInvestmentStore } from '@/stores/useInvestmentStore'
import { useJourneyStore } from '@/stores/useJourneyStore'
import { useReserveStore } from '@/stores/useReserveStore'
import { reserveBreakdown } from '@/lib/reserve'
import {
  avgMonthlySurplus,
  computeJourney,
  debtsForPlan,
  monthsToReach,
  simulatePayoff,
} from '@/lib/journey'

export function useJourneyPlan(opts?: { reserveCurrent?: number }) {
  const items = useDebtsStore(s => s.items)
  const allMonths = useFinanceStore(s => s.allMonths)
  const positions = useInvestmentStore(s => s.positions)
  const strategy = useJourneyStore(s => s.strategy)
  const scope = useJourneyStore(s => s.scope)
  const budgetOverride = useJourneyStore(s => s.budgetOverride)
  const monthlyCost = useReserveStore(s => s.monthlyCost)
  const reserveMonths = useReserveStore(s => s.months)
  const reserveCurrentOpt = opts?.reserveCurrent

  return useMemo(() => {
    const now = new Date()
    const surplus = avgMonthlySurplus(allMonths, now, 3)
    const budgetIsOverride = budgetOverride !== null
    const budget = budgetOverride ?? Math.max(0, surplus.avg)
    const overdueDebt = items
      .filter(d => !d.paid && d.status === 'vencida')
      .reduce((s, d) => s + d.value, 0)

    const debts = debtsForPlan(items, scope)
    const other = strategy === 'avalanche' ? 'snowball' : 'avalanche'
    const plan = simulatePayoff(debts, budget, strategy)
    const altPlan = simulatePayoff(debts, budget, other)
    const debtMonths = plan.feasible ? plan.months : null

    const reserveCurrent =
      reserveCurrentOpt ??
      reserveBreakdown(
        positions.map(p => ({ ...p, currentValue: p.manualValue ?? p.quantity * p.avgPrice })),
      ).total
    const reserveTarget = monthlyCost * reserveMonths
    const reserveGap = Math.max(0, reserveTarget - reserveCurrent)
    const reserveMonthsAfterDebts = monthsToReach(reserveGap, budget)
    const reserveDoneInMonths =
      debtMonths === null || reserveMonthsAfterDebts === null ? null : debtMonths + reserveMonthsAfterDebts
    const journey = computeJourney({ overdueDebt, reserveCurrent, reserveTarget })

    return {
      surplus, budget, budgetIsOverride, overdueDebt, plan, altPlan, debtMonths,
      reserveCurrent, reserveTarget, reserveGap, reserveMonthsAfterDebts, reserveDoneInMonths,
      journey, now, strategy, scope,
    }
  }, [items, allMonths, positions, strategy, scope, budgetOverride, monthlyCost, reserveMonths, reserveCurrentOpt])
}
