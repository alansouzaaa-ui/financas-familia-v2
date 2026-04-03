import { useMemo } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useGoalsStore } from '@/stores/useGoalsStore'
import { calcHealthScore, calcAlerts } from '@/lib/calculations'
import { fmt, fmtSigned } from '@/lib/formatters'
import { exportToCSV } from '@/lib/csvExport'
import Card from '@/components/ui/Card'
import MetricCard from '@/components/metrics/MetricCard'
import HealthScoreCard from '@/components/metrics/HealthScoreCard'
import NetWorthCard from '@/components/metrics/NetWorthCard'
import MonthForecastCard from '@/components/metrics/MonthForecastCard'
import RevenueExpenseChart from '@/components/charts/RevenueExpenseChart'
import ExpenseDonut from '@/components/charts/ExpenseDonut'
import BalanceChart from '@/components/charts/BalanceChart'
import PeriodFilterBar from '@/components/filters/PeriodFilter'
import Button from '@/components/ui/Button'

const MONTHS_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'] as const

export default function OverviewPage() {
  const { allMonths, periodFilter, setPeriodFilter, filteredMonths } = useFinanceStore()
  const { goals } = useGoalsStore()

  const months = filteredMonths()
  const score = useMemo(() => calcHealthScore(allMonths.slice(-3)), [allMonths])
  const alerts = useMemo(() => calcAlerts(allMonths, goals), [allMonths, goals])

  const totals = useMemo(() => {
    const revenue = months.reduce((s, m) => s + m.revenue, 0)
    const expenses = months.reduce((s, m) => s + m.totalExpenses, 0)
    const balance = revenue - expenses
    const cards = months.reduce((s, m) => s + m.cards, 0)
    return { revenue, expenses, balance, cards }
  }, [months])

  const prevMonth = allMonths[allMonths.length - 2]
  const lastMonth = allMonths[allMonths.length - 1]

  // Current calendar month for Forecast card
  const now = new Date()
  const curMonthAbbr = MONTHS_ABR[now.getMonth()]
  const curYear = now.getFullYear()
  const currentMonthData = useMemo(
    () => allMonths.find(m => m.month === curMonthAbbr && m.year === curYear) ?? null,
    [allMonths, curMonthAbbr, curYear]
  )
  const forecastLabel = `${curMonthAbbr}/${String(curYear).slice(2)}`

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[20px] font-semibold">Visão Geral</h1>
        <Button variant="ghost" size="sm" onClick={() => exportToCSV(months)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Exportar CSV
        </Button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="flex flex-col gap-2 mb-5">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`flex items-start gap-3 px-4 py-3 rounded-[10px] text-[13px] ${
                alert.type === 'danger'
                  ? 'bg-[#FAECE7] text-[#993C1D] dark:bg-[#993C1D]/20 dark:text-[#F07050]'
                  : 'bg-[#FDF3E0] text-[#BA7517] dark:bg-[#BA7517]/20 dark:text-[#FBBF24]'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-0.5">
                <path d="M8 1L15 14H1L8 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                <path d="M8 6v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <span className="flex-1">{alert.message}</span>
              <span className="text-[10px] font-medium uppercase tracking-wide opacity-70 mt-0.5">
                {alert.category === 'balance' ? 'balanço'
                  : alert.category === 'cards' ? 'cartões'
                  : alert.category === 'loans' ? 'empréstimos'
                  : alert.category === 'fixedCosts' ? 'fixos'
                  : 'receita'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Health Score + Period Filter */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="md:col-span-1">
          <HealthScoreCard score={score} />
        </div>
        <div className="md:col-span-2">
          <Card title="Filtrar período">
            <PeriodFilterBar filter={periodFilter} onChange={setPeriodFilter} />
          </Card>
        </div>
      </div>

      {/* Net Worth + Forecast */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <NetWorthCard months={allMonths} />
        <MonthForecastCard currentMonth={currentMonthData} label={forecastLabel} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <MetricCard
          label="Receita total"
          value={totals.revenue}
          variant="positive"
          previousValue={periodFilter.preset === 'current_month' ? prevMonth?.revenue : undefined}
        />
        <MetricCard
          label="Total despesas"
          value={totals.expenses}
          variant="negative"
          previousValue={periodFilter.preset === 'current_month' ? prevMonth?.totalExpenses : undefined}
        />
        <MetricCard
          label="Balanço acumulado"
          value={totals.balance}
          signed
          variant="auto"
          previousValue={periodFilter.preset === 'current_month' ? prevMonth?.balance : undefined}
        />
        <MetricCard
          label="Cartões / dívidas"
          value={totals.cards}
          variant="negative"
          previousValue={periodFilter.preset === 'current_month' ? prevMonth?.cards : undefined}
        />
      </div>

      {/* Main Chart */}
      <Card title="Receitas vs Despesas" className="mb-4">
        {months.length > 0
          ? <RevenueExpenseChart data={months} />
          : <div className="py-12 text-center text-[13px] text-[var(--color-text-muted)]">Sem dados para o período selecionado</div>
        }
        <div className="flex flex-wrap gap-3 mt-3">
          {[
            { label: 'Receitas', color: 'var(--color-chart-green)' },
            { label: 'Despesas', color: 'var(--color-chart-red)' },
            { label: 'Balanço',  color: 'var(--color-chart-blue)' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)]">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
              {l.label}
            </div>
          ))}
        </div>
      </Card>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Composição das despesas">
          <ExpenseDonut data={months} />
        </Card>
        <Card title="Balanço mensal">
          <BalanceChart data={months} />
        </Card>
      </div>

      {/* Last month summary */}
      {lastMonth && (
        <div className="mt-4 card bg-[var(--color-surface-2)] border-0">
          <div className="label mb-2">Último mês lançado — {lastMonth.label}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
            {[
              { label: 'Receita',      value: lastMonth.revenue,     cls: 'pos' },
              { label: 'Custos fixos', value: lastMonth.fixedCosts,  cls: 'neg' },
              { label: 'Empréstimos',  value: lastMonth.loans,       cls: 'neg' },
              { label: 'Cartões',      value: lastMonth.cards,       cls: 'neg' },
            ].map(item => (
              <div key={item.label}>
                <div className="text-[11px] text-[var(--color-text-muted)]">{item.label}</div>
                <div className={`font-mono font-semibold text-[14px] mt-0.5 ${item.cls}`}>{fmt(item.value)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
            <span className="text-[13px] font-medium">Balanço</span>
            <span className={`font-mono font-semibold text-[15px] ${lastMonth.balance >= 0 ? 'pos' : 'neg'}`}>
              {fmtSigned(lastMonth.balance)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
