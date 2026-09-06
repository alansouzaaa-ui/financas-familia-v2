import { useMemo } from 'react'
import { useFinanceStore, monthKey } from '@/stores/useFinanceStore'
import { useGoalsStore } from '@/stores/useGoalsStore'
import { useUiStore } from '@/stores/useUiStore'
import Skeleton from '@/components/ui/Skeleton'
import { calcHealthScore, calcAlerts } from '@/lib/calculations'
import { fmt } from '@/lib/formatters'
import { exportToCSV } from '@/lib/csvExport'
import Kpi from '@/components/metrics/Kpi'
import HealthScoreCard from '@/components/metrics/HealthScoreCard'
import NetWorthCard from '@/components/metrics/NetWorthCard'
import MonthForecastCard from '@/components/metrics/MonthForecastCard'
import InvestmentSummaryBlock from '@/components/metrics/InvestmentSummaryBlock'
import CardBreakdownBlock from '@/components/metrics/CardBreakdownBlock'
import CategoryBars from '@/components/metrics/CategoryBars'
import PayablesPanel from '@/components/metrics/PayablesPanel'
import RevenueExpenseChart from '@/components/charts/RevenueExpenseChart'
import PeriodSegment from '@/components/filters/PeriodSegment'

const MONTHS_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'] as const

const PERIOD_LABEL: Record<string, string> = {
  current_month: 'Este mês', '3m': 'Últimos 3 meses', '6m': 'Últimos 6 meses',
  '12m': 'Últimos 12 meses', current_year: 'Este ano', all: 'Todo o histórico', custom: 'Período personalizado',
}

export default function OverviewPage() {
  const { periodFilter, setPeriodFilter, filteredMonths, visibleMonths, historyCutoff, setHistoryCutoff } = useFinanceStore()
  const rawMonths = useFinanceStore(s => s.allMonths)
  const { goals } = useGoalsStore()

  const allMonths = useMemo(() => visibleMonths(), [rawMonths, historyCutoff, visibleMonths])
  const months = filteredMonths()

  // Skeleton de 1ª carga: só quando o sync ainda não resolveu E não há dados
  // manuais para mostrar (evita piscar por cima de dados já persistidos).
  const firstSyncSettled = useUiStore(s => s.firstSyncSettled)
  const hasManualData = useMemo(() => rawMonths.some(m => m.source === 'manual'), [rawMonths])
  const loadingFirst = !firstSyncSettled && !hasManualData

  const cutoffOptions = useMemo(
    () => rawMonths.map(m => ({ key: String(monthKey(m.year, m.month)), label: `${m.month}/${String(m.year).slice(2)}` })),
    [rawMonths]
  )
  const score = useMemo(() => calcHealthScore(allMonths.slice(-3)), [allMonths])
  const alerts = useMemo(() => calcAlerts(allMonths, goals), [allMonths, goals])

  const totals = useMemo(() => {
    const revenue = months.reduce((s, m) => s + m.revenue, 0)
    const expenses = months.reduce((s, m) => s + m.totalExpenses, 0)
    return { revenue, expenses, balance: revenue - expenses }
  }, [months])

  const prevMonth = allMonths[allMonths.length - 2]
  const isCurrentMonthView = periodFilter.preset === 'current_month'

  // Tendências (últimos meses visíveis) para as sparklines dos KPIs
  const trend = useMemo(() => {
    const tail = allMonths.slice(-8)
    return {
      revenue: tail.map(m => m.revenue),
      expenses: tail.map(m => m.totalExpenses),
      balance: tail.map(m => m.balance),
    }
  }, [allMonths])

  // Mês-calendário atual — base para "a pagar/receber" e projeção
  const now = new Date()
  const curMonthAbbr = MONTHS_ABR[now.getMonth()]
  const curYear = now.getFullYear()
  const currentMonthData = useMemo(
    () => allMonths.find(m => m.month === curMonthAbbr && m.year === curYear) ?? allMonths[allMonths.length - 1] ?? null,
    [allMonths, curMonthAbbr, curYear]
  )
  const currentLabel = currentMonthData?.label ?? `${curMonthAbbr}/${String(curYear).slice(2)}`
  const toPay = currentMonthData ? Math.max(0, currentMonthData.totalExpenses - currentMonthData.consolidatedExpenses) : 0

  // Interpretação — uma frase de leitura do momento
  const verdict = currentMonthData
    ? currentMonthData.balance >= 0
      ? `Em ${currentMonthData.label}, as receitas cobrem as despesas — sobra ${fmt(currentMonthData.balance)}.`
      : `Em ${currentMonthData.label}, as despesas superam as receitas em ${fmt(Math.abs(currentMonthData.balance))}.`
    : 'Sem lançamentos no período.'

  const catLabel = (c: string) =>
    c === 'balance' ? 'balanço' : c === 'cards' ? 'cartões'
    : c === 'loans' ? 'empréstimos' : c === 'fixedCosts' ? 'fixos' : c === 'variableCosts' ? 'variáveis' : 'receita'

  if (loadingFirst) {
    return (
      <div>
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex flex-col gap-2">
            <Skeleton w={150} h={22} />
            <Skeleton w={260} h={13} />
          </div>
          <Skeleton w={220} h={34} rounded="rounded-[10px]" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="card flex flex-col gap-3 min-h-[128px]">
              <Skeleton w="45%" h={11} />
              <div className="mt-auto"><Skeleton w="70%" h={24} rounded="rounded-[6px]" /></div>
              <Skeleton w="55%" h={11} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          <div className="lg:col-span-2 card"><Skeleton w="40%" h={12} /><Skeleton className="mt-4" w="100%" h={220} rounded="rounded-[12px]" /></div>
          <div className="card flex flex-col gap-3">
            <Skeleton w="55%" h={12} />
            {[0, 1, 2, 3].map(i => <Skeleton key={i} w="100%" h={14} />)}
            <Skeleton w="100%" h={6} rounded="rounded-full" />
          </div>
        </div>
        <p className="text-center text-[12px] text-[var(--color-text-muted)] mt-6">Carregando seus dados…</p>
      </div>
    )
  }

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[21px] font-semibold tracking-[-0.01em]">Visão Geral</h1>
          <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">{verdict}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <PeriodSegment filter={periodFilter} onChange={setPeriodFilter} />
          <button
            onClick={() => exportToCSV(months)}
            title="Exportar CSV"
            className="p-2 rounded-[10px] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── Alertas (discretos) ────────────────────────────── */}
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

      {/* ── Nível 1 · KPIs executivos ──────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi
          label="Receitas" value={totals.revenue} tone="pos" goodWhenUp trend={trend.revenue}
          previousValue={isCurrentMonthView ? prevMonth?.revenue : undefined}
        />
        <Kpi
          label="Despesas" value={totals.expenses} tone="neutral" goodWhenUp={false} trend={trend.expenses}
          previousValue={isCurrentMonthView ? prevMonth?.totalExpenses : undefined}
        />
        <Kpi
          label="Resultado" value={totals.balance} signed tone={totals.balance >= 0 ? 'pos' : 'neg'} goodWhenUp trend={trend.balance}
          previousValue={isCurrentMonthView ? prevMonth?.balance : undefined}
        />
        <Kpi
          label={`A pagar · ${currentLabel}`} value={toPay} tone={toPay > 0.005 ? 'neg' : 'pos'}
          comparisonLabel="" footer={toPay > 0.005 ? 'ainda não quitado neste mês' : 'tudo quitado 🎉'}
        />
      </div>

      {/* ── Nível 2 · Fluxo + A pagar/receber ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="lg:col-span-2 card">
          <div className="flex items-start justify-between mb-1">
            <div>
              <div className="section-head label">Fluxo · receitas × despesas</div>
              <p className="text-[12px] text-[var(--color-text-muted)] mt-1 ml-[calc(14px+0.6rem)]">Você está gastando mais ou menos do que recebe?</p>
            </div>
            <div className="hidden sm:flex flex-wrap gap-3 pt-1">
              {[
                { label: 'Receitas', color: 'var(--color-chart-green)' },
                { label: 'Despesas', color: 'var(--color-chart-red)' },
                { label: 'Resultado', color: 'var(--color-chart-blue)' },
              ].map(l => (
                <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                  <span className="w-2 h-2 rounded-sm" style={{ background: l.color }} />{l.label}
                </span>
              ))}
            </div>
          </div>
          {months.length > 0
            ? <div className="mt-3"><RevenueExpenseChart data={months} /></div>
            : <div className="py-16 text-center text-[13px] text-[var(--color-text-muted)]">Sem dados para o período selecionado</div>
          }
        </div>
        <div className="lg:col-span-1">
          <PayablesPanel month={currentMonthData} label={currentLabel} />
        </div>
      </div>

      {/* ── Nível 3 · Para onde vai o dinheiro ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <CategoryBars months={months} />
        <CardBreakdownBlock months={months} />
      </div>

      {/* ── Detalhe · saúde, patrimônio, projeção ──────────── */}
      <div className="section-head label mb-3">Situação geral</div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-5">
        <HealthScoreCard score={score} />
        <NetWorthCard months={allMonths} />
        <MonthForecastCard currentMonth={currentMonthData} label={currentLabel} />
      </div>

      {/* ── Investimentos ──────────────────────────────────── */}
      <InvestmentSummaryBlock />

      {/* ── Rodapé · início do histórico (discreto) ────────── */}
      <div className="mt-6 flex items-center gap-2 flex-wrap text-[12px] text-[var(--color-text-muted)]">
        <span>Período mostrado: <span className="text-[var(--color-text-primary)]">{PERIOD_LABEL[periodFilter.preset]}</span> ·</span>
        <span>Início do histórico:</span>
        <select
          value={historyCutoff ?? ''}
          onChange={e => setHistoryCutoff(e.target.value || null)}
          className="text-[12px] px-2 py-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none focus:border-[var(--color-text-primary)]"
        >
          <option value="">Mostrar tudo</option>
          {cutoffOptions.map(o => <option key={o.key} value={o.key}>a partir de {o.label}</option>)}
        </select>
        {historyCutoff && <span className="text-[11px]">meses anteriores ficam ocultos (não são apagados)</span>}
      </div>
    </div>
  )
}
