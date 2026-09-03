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
import InvestmentSummaryBlock from '@/components/metrics/InvestmentSummaryBlock'
import CardBreakdownBlock from '@/components/metrics/CardBreakdownBlock'
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

  // Delta do balanço do mês vs mês anterior (para o hero)
  const balDelta = (lastMonth && prevMonth && prevMonth.balance !== 0)
    ? ((lastMonth.balance - prevMonth.balance) / Math.abs(prevMonth.balance)) * 100
    : null
  const balImproved = lastMonth && prevMonth ? lastMonth.balance >= prevMonth.balance : true

  const catLabel = (c: string) =>
    c === 'balance' ? 'balanço' : c === 'cards' ? 'cartões'
    : c === 'loans' ? 'empréstimos' : c === 'fixedCosts' ? 'fixos' : 'receita'

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

      {/* Alertas — domados num chip expansível */}
      {alerts.length > 0 && (
        <details className="group mb-5">
          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full text-[13px] font-medium select-none transition-colors bg-[var(--color-neg)]/10 text-[var(--color-neg)] border border-[var(--color-neg)]/25 hover:bg-[var(--color-neg)]/[0.16]">
            <span aria-hidden="true">⚠︎</span>
            {alerts.length} {alerts.length === 1 ? 'ponto de atenção' : 'pontos de atenção'}
            <span aria-hidden="true" className="text-[10px] opacity-80 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-2.5 flex flex-col gap-px rounded-[12px] overflow-hidden bg-[var(--color-border)]">
            {alerts.map(alert => (
              <div key={alert.id} className="flex items-center gap-3 px-4 py-3 bg-[var(--color-surface)] text-[13px]">
                <span aria-hidden="true" className={`flex-shrink-0 ${alert.type === 'danger' ? 'text-[var(--color-neg)]' : 'text-[var(--color-chart-amber)]'}`}>△</span>
                <span className="flex-1">{alert.message}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] whitespace-nowrap">{catLabel(alert.category)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Hero — balanço do mês + score */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {lastMonth && (
          <div
            className="md:col-span-2 rounded-[18px] p-6 border border-[var(--color-border)] flex flex-col justify-between min-h-[168px]"
            style={{ backgroundImage: 'linear-gradient(160deg, var(--color-surface), var(--color-surface-2))', boxShadow: '0 8px 26px -18px rgba(0,0,0,.55)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="label">Balanço do mês · {lastMonth.label}</span>
              {balDelta !== null && (
                <span className={`inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-full ${balImproved ? 'text-[var(--color-pos)] bg-[var(--color-pos)]/[0.13]' : 'text-[var(--color-neg)] bg-[var(--color-neg)]/[0.13]'}`}>
                  {balImproved ? '▲' : '▼'} {Math.abs(balDelta).toFixed(1)}% vs mês anterior
                </span>
              )}
            </div>
            <div>
              <div className={`font-mono font-medium text-[40px] leading-none tracking-tight mt-4 mb-2 ${lastMonth.balance >= 0 ? 'pos' : 'neg'}`}>
                {fmtSigned(lastMonth.balance)}
              </div>
              <span className="label normal-case tracking-normal text-[12px]">
                Receita {fmt(lastMonth.revenue)} · Despesas {fmt(lastMonth.totalExpenses)}
              </span>
            </div>
          </div>
        )}
        <div className="md:col-span-1">
          <HealthScoreCard score={score} />
        </div>
      </div>

      {/* Filtro de período */}
      <div className="mb-6">
        <Card title="Filtrar período">
          <PeriodFilterBar filter={periodFilter} onChange={setPeriodFilter} />
        </Card>
      </div>

      {/* Net Worth + Forecast */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <NetWorthCard months={allMonths} />
        <MonthForecastCard currentMonth={currentMonthData} label={forecastLabel} />
      </div>

      {/* Investments */}
      <InvestmentSummaryBlock />

      {/* KPI Cards */}
      <div className="label mb-3 mt-1">Acumulado no período</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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
      <div className="label mb-3">Evolução</div>
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

      {/* Breakdown por cartão */}
      <div className="mt-4">
        <CardBreakdownBlock months={months} />
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
