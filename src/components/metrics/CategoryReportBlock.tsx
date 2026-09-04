import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { MonthPoint, ExpenseTag } from '@/types/finance'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import { fmt } from '@/lib/formatters'
import Card from '@/components/ui/Card'
import ChartTooltip from '@/components/charts/ChartTooltip'

interface Props {
  months: MonthPoint[]
  compact?: boolean   // Visão Geral: mostra só o top N e um donut menor
  topN?: number
}

const SEM_CAT_COLOR = '#4B5563'

export default function CategoryReportBlock({ months, compact = false, topN = 6 }: Props) {
  const tags = useCategoriesStore(s => s.tags)
  const tagMap = useMemo(() => Object.fromEntries(tags.map(t => [t.id, t])) as Record<string, ExpenseTag>, [tags])

  const { rows, total, semCat } = useMemo(() => {
    const byTag = new Map<string, number>()
    let semCat = 0
    let total = 0
    for (const m of months) {
      for (const it of m.items ?? []) {
        if (it.category === 'revenue') continue
        total += it.value
        if (it.tag && tagMap[it.tag]) byTag.set(it.tag, (byTag.get(it.tag) ?? 0) + it.value)
        else semCat += it.value
      }
    }
    const rows = [...byTag.entries()]
      .map(([id, value]) => ({ id, value, tag: tagMap[id] }))
      .sort((a, b) => b.value - a.value)
    return { rows, total, semCat }
  }, [months, tagMap])

  if (total === 0) {
    return (
      <Card title="Despesas por categoria">
        <p className="text-[13px] text-[var(--color-text-muted)] py-4 text-center">
          Marque a categoria dos lançamentos na aba Lançar para ver o relatório.
        </p>
      </Card>
    )
  }

  const pieData = rows.map(r => ({ name: r.tag.label, value: Math.round(r.value), color: r.tag.color }))
  if (semCat > 0) pieData.push({ name: 'Sem categoria', value: Math.round(semCat), color: SEM_CAT_COLOR })

  const shown = compact ? rows.slice(0, topN) : rows
  const restTotal = compact ? rows.slice(topN).reduce((s, r) => s + r.value, 0) : 0

  return (
    <Card title="Despesas por categoria">
      <div className={compact ? 'grid grid-cols-1 sm:grid-cols-2 gap-4 items-center' : 'grid grid-cols-1 lg:grid-cols-2 gap-4'}>
        <div className="relative">
          <ResponsiveContainer width="100%" height={compact ? 180 : 220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={compact ? 52 : 62} outerRadius={compact ? 78 : 92} paddingAngle={2} dataKey="value" strokeWidth={0}>
                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="text-center -mt-1">
            <div className="label">Total de despesas</div>
            <div className="font-mono font-semibold text-[16px] neg">{fmt(total)}</div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {shown.map(r => {
            const pct = (r.value / total) * 100
            return (
              <div key={r.id}>
                <div className="flex items-center justify-between text-[13px] mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex-shrink-0">{r.tag.emoji}</span>
                    <span className="truncate">{r.tag.label}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] text-[var(--color-text-muted)]">{pct.toFixed(0)}%</span>
                    <span className="font-mono font-medium neg">{fmt(r.value)}</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.tag.color }} />
                </div>
              </div>
            )
          })}
          {compact && restTotal > 0 && (
            <div className="flex items-center justify-between text-[12px] text-[var(--color-text-muted)] pt-1">
              <span>Outras categorias</span>
              <span className="font-mono">{fmt(restTotal)}</span>
            </div>
          )}
          {semCat > 0 && (
            <div className="flex items-center justify-between text-[13px] pt-2 mt-1 border-t border-[var(--color-border)]">
              <span className="text-[var(--color-text-muted)] italic">Sem categoria</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--color-text-muted)]">{((semCat / total) * 100).toFixed(0)}%</span>
                <span className="font-mono font-medium neg">{fmt(semCat)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
