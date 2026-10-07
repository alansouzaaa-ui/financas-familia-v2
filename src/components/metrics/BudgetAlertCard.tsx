import { useMemo } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import { useBudgetStore } from '@/stores/useBudgetStore'
import { computeBudget } from '@/lib/budget'
import { fmtFull } from '@/lib/formatters'
import { MONTHS } from '@/types/finance'

export default function BudgetAlertCard() {
  const allMonths = useFinanceStore(s => s.allMonths)
  const tags = useCategoriesStore(s => s.tags)
  const limits = useBudgetStore(s => s.limits)

  const flagged = useMemo(() => {
    if (Object.keys(limits).length === 0) return []
    const now = new Date()
    const m = allMonths.find(x => x.year === now.getFullYear() && x.month === MONTHS[now.getMonth()])
    if (!m || (m.items?.length ?? 0) === 0) return []
    return computeBudget(m.items ?? [], limits, tags).lines
      .filter(l => l.status === 'estourado' || l.status === 'alerta')
  }, [allMonths, tags, limits])

  if (flagged.length === 0) return null
  const top = flagged.slice(0, 3) // já ordenadas: estouradas primeiro

  return (
    <div className="card mb-4">
      <p className="section-head label">Orçamento</p>
      <div className="mt-3 flex flex-col gap-3">
        {top.map(l => {
          const color = l.status === 'estourado' ? 'var(--color-neg)' : 'var(--color-accent)'
          return (
            <div key={l.key}>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate"><span aria-hidden="true">{l.emoji}</span> {l.label}</span>
                <span className="font-mono text-[12px] flex-shrink-0">
                  {fmtFull(l.spent)} <span className="text-[var(--color-text-muted)]">de {fmtFull(l.limit ?? 0)}</span>
                </span>
              </div>
              <div className="mt-1 h-1 rounded-full overflow-hidden bg-[var(--color-surface-2)]">
                <div className="h-full rounded-full" style={{ width: `${Math.min(l.pct ?? 0, 100)}%`, background: color }} />
              </div>
            </div>
          )
        })}
      </div>
      <a href="#/mensal" className="inline-block mt-3 text-[12px] underline underline-offset-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
        Ver orçamento →
      </a>
    </div>
  )
}
