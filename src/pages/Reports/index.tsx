import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { TAG_MAP } from '@/types/finance'
import { fmt } from '@/lib/formatters'
import Card from '@/components/ui/Card'
import ChartTooltip from '@/components/charts/ChartTooltip'
import PeriodFilterBar from '@/components/filters/PeriodFilter'

export default function ReportsPage() {
  const { periodFilter, setPeriodFilter, filteredMonths } = useFinanceStore()
  const months = filteredMonths()

  const { rows, total, semCat } = useMemo(() => {
    const byTag = new Map<string, number>()
    let semCat = 0
    let total = 0
    for (const m of months) {
      for (const it of m.items ?? []) {
        if (it.category === 'revenue') continue // relatório de despesas
        total += it.value
        if (it.tag && TAG_MAP[it.tag]) byTag.set(it.tag, (byTag.get(it.tag) ?? 0) + it.value)
        else semCat += it.value
      }
    }
    const rows = [...byTag.entries()]
      .map(([id, value]) => ({ id, value, tag: TAG_MAP[id] }))
      .sort((a, b) => b.value - a.value)
    return { rows, total, semCat }
  }, [months])

  const pieData = rows.map(r => ({ name: r.tag.label, value: Math.round(r.value), color: r.tag.color }))
  if (semCat > 0) pieData.push({ name: 'Sem categoria', value: Math.round(semCat), color: '#4B5563' })

  return (
    <div>
      <h1 className="text-[20px] font-semibold mb-5">Relatórios</h1>

      <div className="mb-5">
        <Card title="Filtrar período">
          <PeriodFilterBar filter={periodFilter} onChange={setPeriodFilter} />
        </Card>
      </div>

      {total === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[14px] text-[var(--color-text-muted)]">Sem despesas no período selecionado.</p>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-1">Marque a categoria dos lançamentos na aba <strong>Lançar</strong> para ver os gráficos aqui.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Donut */}
          <Card title="Despesas por categoria">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={62} outerRadius={92} paddingAngle={2} dataKey="value" strokeWidth={0}>
                  {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="text-center -mt-1">
              <div className="label">Total de despesas</div>
              <div className="font-mono font-semibold text-[18px] neg">{fmt(total)}</div>
            </div>
          </Card>

          {/* Ranking */}
          <Card title="Ranking por categoria">
            <div className="flex flex-col gap-2.5">
              {rows.map(r => {
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
          </Card>
        </div>
      )}
    </div>
  )
}
