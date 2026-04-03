import { useMemo } from 'react'
import { useRecurringStore } from '@/stores/useRecurringStore'
import type { MonthPoint } from '@/types/finance'
import { fmt, fmtSigned } from '@/lib/formatters'

interface Props {
  currentMonth: MonthPoint | null
  label: string
}

export default function MonthForecastCard({ currentMonth, label }: Props) {
  const { items } = useRecurringStore()
  const activeItems = useMemo(() => items.filter(i => i.isActive), [items])

  const forecast = useMemo(() => {
    const revenue    = activeItems.filter(i => i.category === 'revenue').reduce((s, i) => s + i.value, 0)
    const fixedCosts = activeItems.filter(i => i.category === 'fixedCosts').reduce((s, i) => s + i.value, 0)
    const loans      = activeItems.filter(i => i.category === 'loans').reduce((s, i) => s + i.value, 0)
    const cards      = activeItems.filter(i => i.category === 'cards').reduce((s, i) => s + i.value, 0)
    const expenses   = fixedCosts + loans + cards
    return { revenue, expenses, balance: revenue - expenses }
  }, [activeItems])

  const hasRecurring = activeItems.length > 0
  const hasCurrent   = currentMonth !== null

  const revenueProgress  = hasCurrent && forecast.revenue  > 0 ? Math.min(100, (currentMonth.revenue       / forecast.revenue)  * 100) : null
  const expenseProgress  = hasCurrent && forecast.expenses > 0 ? Math.min(100, (currentMonth.totalExpenses / forecast.expenses) * 100) : null

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="label">Projeção — {label}</div>
        {hasRecurring && (
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {activeItems.length} recorrentes
          </span>
        )}
      </div>

      {!hasRecurring ? (
        <div className="flex-1 flex flex-col items-center justify-center py-4 gap-2 text-center">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-[var(--color-border)]">
            <circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 16h12M16 10v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <p className="text-[12px] text-[var(--color-text-muted)] font-medium">Sem itens recorrentes</p>
          <p className="text-[11px] text-[var(--color-text-muted)]">Cadastre na aba Recorrentes</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 flex-1">

          {/* Receita */}
          <div>
            <div className="flex justify-between text-[12px] mb-1.5">
              <span className="text-[var(--color-text-muted)]">Receita projetada</span>
              <span className="font-mono pos font-medium">{fmt(forecast.revenue)}</span>
            </div>
            {revenueProgress !== null && (
              <>
                <div className="h-1.5 bg-[var(--color-surface-2)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${revenueProgress}%`, background: 'var(--color-chart-green)' }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  <span>Lançado: {fmt(currentMonth!.revenue)}</span>
                  <span>{revenueProgress.toFixed(0)}%</span>
                </div>
              </>
            )}
          </div>

          {/* Despesas */}
          <div>
            <div className="flex justify-between text-[12px] mb-1.5">
              <span className="text-[var(--color-text-muted)]">Despesas projetadas</span>
              <span className="font-mono neg font-medium">{fmt(forecast.expenses)}</span>
            </div>
            {expenseProgress !== null && (
              <>
                <div className="h-1.5 bg-[var(--color-surface-2)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${expenseProgress}%`,
                      background: expenseProgress > 90
                        ? 'var(--color-chart-red)'
                        : 'var(--color-chart-amber)',
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  <span>Lançado: {fmt(currentMonth!.totalExpenses)}</span>
                  <span>{expenseProgress.toFixed(0)}%</span>
                </div>
              </>
            )}
          </div>

          {/* Balanço */}
          <div className="mt-auto pt-3 border-t border-[var(--color-border)]">
            <div className="flex justify-between text-[13px] font-semibold">
              <span>Balanço projetado</span>
              <span className={`font-mono ${forecast.balance >= 0 ? 'pos' : 'neg'}`}>
                {fmtSigned(forecast.balance)}
              </span>
            </div>
            {hasCurrent && (
              <div className="flex justify-between text-[11px] text-[var(--color-text-muted)] mt-1">
                <span>Balanço atual</span>
                <span className={`font-mono ${currentMonth!.balance >= 0 ? 'pos' : 'neg'}`}>
                  {fmtSigned(currentMonth!.balance)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
