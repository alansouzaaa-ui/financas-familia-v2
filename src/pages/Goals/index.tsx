import { useState, useMemo } from 'react'
import { useGoalsStore } from '@/stores/useGoalsStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { fmt } from '@/lib/formatters'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/types/finance'
import type { FinancialGoal } from '@/types/finance'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import CategoryLimitsCard from '@/components/metrics/CategoryLimitsCard'

const CAT_OPTIONS = [
  { value: 'revenue',    label: 'Meta de Receita' },
  { value: 'fixedCosts', label: 'Meta de Custos Fixos' },
  { value: 'loans',      label: 'Meta de Empréstimos' },
  { value: 'cards',      label: 'Meta de Cartões' },
]

export default function GoalsPage() {
  const { goals, upsertGoal, deleteGoal } = useGoalsStore()
  const rawMonths = useFinanceStore(s => s.allMonths)
  const historyCutoff = useFinanceStore(s => s.historyCutoff)
  const visibleFn = useFinanceStore(s => s.visibleMonths)
  const allMonths = useMemo(() => visibleFn(), [rawMonths, historyCutoff, visibleFn])

  const [category, setCategory] = useState<string>('revenue')
  const [targetValue, setTargetValue] = useState('')

  const lastMonth = allMonths[allMonths.length - 1]
  const last12 = allMonths.slice(-12)

  const avgRevenue    = last12.reduce((s, m) => s + m.revenue, 0) / (last12.length || 1)
  const avgFixedCosts = last12.reduce((s, m) => s + m.fixedCosts, 0) / (last12.length || 1)
  const avgLoans      = last12.reduce((s, m) => s + m.loans, 0) / (last12.length || 1)
  const avgCards      = last12.reduce((s, m) => s + m.cards, 0) / (last12.length || 1)

  const avgs: Record<string, number> = { revenue: avgRevenue, fixedCosts: avgFixedCosts, loans: avgLoans, cards: avgCards }

  function handleSave() {
    if (!targetValue || isNaN(Number(targetValue))) return
    const goal: FinancialGoal = {
      id: category,
      category: category as FinancialGoal['category'],
      targetValue: Number(targetValue),
    }
    upsertGoal(goal)
    setTargetValue('')
  }

  return (
    <div>
      <PageHeader
        eyebrow="Orçamento"
        title="Metas financeiras"
        subtitle="Limites por categoria no mês e metas por grupo."
      />

      <CategoryLimitsCard />

      {/* Metas por grupo */}
      <Card title="Metas por grupo" className="mb-4">
        <div className="text-[11px] text-[var(--color-text-muted)] mb-3">
          <p>Médias dos últimos 12 meses</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 mt-1">
            {[
              ['Receita', avgRevenue], ['Fixos', avgFixedCosts], ['Empréstimos', avgLoans], ['Cartões', avgCards],
            ].map(([l, v]) => (
              <span key={l as string} className="min-w-0 truncate">{l as string} <span className="font-mono">{fmt(v as number)}</span></span>
            ))}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <Select
              label="Categoria"
              options={CAT_OPTIONS}
              value={category}
              onChange={e => setCategory(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Valor alvo (R$)"
              type="number"
              placeholder={`ex: ${Math.round(avgs[category] ?? 0)}`}
              value={targetValue}
              onChange={e => setTargetValue(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleSave} className="min-h-[40px]">Salvar meta</Button>
          </div>
        </div>
        <h3 className="label mb-2">Progresso das metas</h3>
        {goals.length === 0 ? (
          <EmptyState message="Nenhuma meta definida" hint="Defina uma meta acima para acompanhar o progresso" />
        ) : (
          <div className="flex flex-col divide-y divide-[var(--color-border)]">
            {goals.map(goal => {
              const current = lastMonth ? lastMonth[goal.category] as number : 0
              const pct = goal.targetValue > 0 ? (current / goal.targetValue) * 100 : 0
              const isExpense = goal.category !== 'revenue'
              const isOver = isExpense ? pct > 100 : pct < 100
              return (
                <div key={goal.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex-1 sm:flex-none sm:min-w-[130px] font-medium text-[13px]">{CATEGORY_LABELS[goal.category]}</div>
                  <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
                    <div className="h-1.5 bg-[var(--color-surface-2)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          background: isOver ? 'var(--color-neg)' : CATEGORY_COLORS[goal.category],
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 justify-end whitespace-nowrap">
                    <span className="text-[12px] font-mono text-[var(--color-text-muted)]">
                      {fmt(current)} / {fmt(goal.targetValue)}
                    </span>
                    <Badge variant={isOver ? 'red' : 'green'} size="sm">
                      {pct.toFixed(0)}%
                    </Badge>
                    <button
                      onClick={() => deleteGoal(goal.id)}
                      className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-neg)] transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
