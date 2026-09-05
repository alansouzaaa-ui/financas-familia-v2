import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { MonthPoint, ExpenseTag } from '@/types/finance'
import { CATEGORY_COLORS } from '@/types/finance'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import Money from '@/components/ui/Money'

interface Props {
  months: MonthPoint[]
  topN?: number
}

const SEM_CAT_COLOR = '#6B7280'

const GROUP_META: { key: 'fixedCosts' | 'variableCosts' | 'cards' | 'loans'; label: string; emoji: string }[] = [
  { key: 'fixedCosts',    label: 'Custos fixos',   emoji: '🏠' },
  { key: 'variableCosts', label: 'Custos variáveis', emoji: '🛒' },
  { key: 'cards',         label: 'Cartões',        emoji: '💳' },
  { key: 'loans',         label: 'Empréstimos',    emoji: '🏦' },
]

// "Para onde vai o dinheiro" em barras horizontais. Usa as categorias de gasto
// (tags) quando elas cobrem a maior parte das despesas; senão cai para os 5
// grupos contábeis, que existem em qualquer mês. Barra > pizza para comparar.
export default function CategoryBars({ months, topN = 7 }: Props) {
  const tags = useCategoriesStore(s => s.tags)
  const tagMap = useMemo(() => Object.fromEntries(tags.map(t => [t.id, t])) as Record<string, ExpenseTag>, [tags])

  const { rows, total, semRow, mode } = useMemo(() => {
    // Breakdown por tag
    const byTag = new Map<string, number>()
    let tagged = 0
    let expenseItemsTotal = 0
    for (const m of months) {
      for (const it of m.items ?? []) {
        if (it.category === 'revenue') continue
        expenseItemsTotal += it.value
        if (it.tag && tagMap[it.tag]) { byTag.set(it.tag, (byTag.get(it.tag) ?? 0) + it.value); tagged += it.value }
      }
    }

    // Breakdown por grupo contábil (sempre disponível a partir dos agregados)
    const groupTotal = { fixedCosts: 0, variableCosts: 0, cards: 0, loans: 0 }
    let groupSum = 0
    for (const m of months) {
      groupTotal.fixedCosts += m.fixedCosts
      groupTotal.variableCosts += m.variableCosts
      groupTotal.cards += m.cards
      groupTotal.loans += m.loans
      groupSum += m.totalExpenses
    }

    // Escolhe o modo: tags só se cobrem ≥ 50% das despesas lançadas por item
    const useTags = expenseItemsTotal > 0 && tagged / expenseItemsTotal >= 0.5

    if (useTags) {
      const rows = [...byTag.entries()]
        .map(([id, value]) => ({ id, value, label: tagMap[id].label, emoji: tagMap[id].emoji, color: tagMap[id].color }))
        .sort((a, b) => b.value - a.value)
      const semCat = expenseItemsTotal - tagged
      return { rows, total: expenseItemsTotal, semRow: semCat > 0.005 ? { label: 'Sem categoria', value: semCat } : null, mode: 'tags' as const }
    }

    const rows = GROUP_META
      .map(g => ({ id: g.key, value: groupTotal[g.key], label: g.label, emoji: g.emoji, color: CATEGORY_COLORS[g.key] }))
      .filter(r => r.value > 0.005)
      .sort((a, b) => b.value - a.value)
    return { rows, total: groupSum, semRow: null, mode: 'groups' as const }
  }, [months, tagMap])

  if (total === 0) {
    return (
      <div className="card h-full flex flex-col">
        <div className="section-head label mb-4">Para onde vai o dinheiro</div>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 py-6">
          <p className="text-[12px] text-[var(--color-text-muted)] max-w-[28ch]">Sem despesas no período selecionado.</p>
          <Link to="/lancar" className="text-[12px] font-medium text-[var(--color-chart-blue)] hover:underline">Lançar despesa →</Link>
        </div>
      </div>
    )
  }

  const shown = rows.slice(0, topN)
  const restTotal = rows.slice(topN).reduce((s, r) => s + r.value, 0) + (semRow?.value ?? 0)
  const maxVal = shown.length ? shown[0].value : 1

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <div className="section-head label">Para onde vai o dinheiro</div>
        <span className="text-[11px] text-[var(--color-text-muted)]">total <span className="font-mono tnum text-[var(--color-text-primary)]">{money(total)}</span></span>
      </div>
      <p className="text-[12px] text-[var(--color-text-muted)] mb-4 ml-[calc(14px+0.6rem)]">
        {mode === 'tags' ? 'Por categoria de gasto neste período.' : 'Por grupo — categorize os lançamentos para detalhar mais.'}
      </p>

      <div className="flex flex-col gap-3">
        {shown.map(r => {
          const pctTotal = (r.value / total) * 100
          const barW = (r.value / maxVal) * 100
          return (
            <div key={r.id}>
              <div className="flex items-center justify-between text-[13px] mb-1.5">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="flex-shrink-0 text-[13px]">{r.emoji}</span>
                  <span className="truncate text-[var(--color-text-primary)]">{r.label}</span>
                </span>
                <span className="flex items-baseline gap-2 flex-shrink-0 ml-2">
                  <span className="text-[11px] text-[var(--color-text-muted)] font-mono tnum">{pctTotal.toFixed(0)}%</span>
                  <span className="font-medium text-[var(--color-text-primary)]"><Money value={r.value} /></span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barW}%`, background: r.color }} />
              </div>
            </div>
          )
        })}
        {restTotal > 0.005 && (
          <div className="flex items-center justify-between text-[12px] text-[var(--color-text-muted)] pt-1">
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full" style={{ background: SEM_CAT_COLOR }} />{mode === 'tags' ? 'Outras / sem categoria' : 'Outras'}</span>
            <span className="font-mono tnum">{money(restTotal)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function money(v: number) {
  return 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
