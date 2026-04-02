import { useState } from 'react'
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
import EmptyState from '@/components/ui/EmptyState'

const STREAMINGS = [
  { name: 'Netflix', value: 57.80 },
  { name: 'Amazon Prime', value: 13.90 },
  { name: 'Spotify Família', value: 34.90 },
  { name: 'Globo Play', value: 14.90 },
  { name: 'Crunchyroll', value: 14.99 },
]

const CAT_OPTIONS = [
  { value: 'revenue',    label: 'Meta de Receita' },
  { value: 'fixedCosts', label: 'Meta de Custos Fixos' },
  { value: 'loans',      label: 'Meta de Empréstimos' },
  { value: 'cards',      label: 'Meta de Cartões' },
]

export default function GoalsPage() {
  const { goals, upsertGoal, deleteGoal } = useGoalsStore()
  const { allMonths } = useFinanceStore()

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

  const totalStreamings = STREAMINGS.reduce((s, i) => s + i.value, 0)

  return (
    <div>
      <h1 className="text-[20px] font-semibold mb-5">Metas Financeiras</h1>

      {/* Averages summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Média Receita', value: avgRevenue, cls: 'pos' },
          { label: 'Média Fixos',   value: avgFixedCosts, cls: 'text-[#6B6860]' },
          { label: 'Média Emp.',    value: avgLoans, cls: 'text-[#6B6860]' },
          { label: 'Média Cartões', value: avgCards, cls: 'neg' },
        ].map(item => (
          <div key={item.label} className="card">
            <div className="label mb-1.5">{item.label}</div>
            <div className={`font-mono font-semibold text-[16px] ${item.cls}`}>{fmt(item.value)}</div>
            <div className="text-[11px] text-[#6B6860] mt-0.5">últimos 12 meses</div>
          </div>
        ))}
      </div>

      {/* Set goals */}
      <Card title="Definir meta" className="mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
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
            <Button onClick={handleSave}>Salvar meta</Button>
          </div>
        </div>
      </Card>

      {/* Goals progress */}
      <Card title="Progresso das metas" className="mb-4">
        {goals.length === 0 ? (
          <EmptyState message="Nenhuma meta definida" hint="Defina metas acima para acompanhar o progresso" />
        ) : (
          <div className="flex flex-col divide-y divide-[#E8E6E0]">
            {goals.map(goal => {
              const current = lastMonth ? lastMonth[goal.category] as number : 0
              const pct = goal.targetValue > 0 ? (current / goal.targetValue) * 100 : 0
              const isExpense = goal.category !== 'revenue'
              const isOver = isExpense ? pct > 100 : pct < 100
              return (
                <div key={goal.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-[130px] font-medium text-[13px]">{CATEGORY_LABELS[goal.category]}</div>
                  <div className="flex-1">
                    <div className="h-1.5 bg-[#F0EEE9] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          background: isOver ? '#993C1D' : CATEGORY_COLORS[goal.category],
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 min-w-[160px] justify-end">
                    <span className="text-[12px] font-mono text-[#6B6860]">
                      {fmt(current)} / {fmt(goal.targetValue)}
                    </span>
                    <Badge variant={isOver ? 'red' : 'green'} size="sm">
                      {pct.toFixed(0)}%
                    </Badge>
                    <button
                      onClick={() => deleteGoal(goal.id)}
                      className="text-[11px] text-[#6B6860] hover:text-[#993C1D] transition-colors"
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

      {/* Streamings */}
      <Card title="Streamings mensais">
        <div className="flex flex-col divide-y divide-[#E8E6E0]">
          {STREAMINGS.map(s => (
            <div key={s.name} className="flex justify-between py-2.5 first:pt-0 text-[13px]">
              <span>{s.name}</span>
              <span className="font-mono neg">{fmt(s.value)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2.5 font-semibold text-[13px]">
            <span>Total mensal</span>
            <span className="font-mono neg">{fmt(totalStreamings)}</span>
          </div>
          <div className="flex justify-between py-2.5 text-[13px] text-[#6B6860]">
            <span>Total anual</span>
            <span className="font-mono neg">{fmt(totalStreamings * 12)}</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
