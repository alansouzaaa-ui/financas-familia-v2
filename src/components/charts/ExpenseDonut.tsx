import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { MonthPoint } from '@/types/finance'
import { fmt } from '@/lib/formatters'
import ChartTooltip from './ChartTooltip'
import { useChartColors } from '@/hooks/useChartColors'

interface Props { data: MonthPoint[] }

export default function ExpenseDonut({ data }: Props) {
  const c = useChartColors()

  const SLICES = [
    { key: 'fixedCosts', label: 'Custos Fixos', color: c.blue  },
    { key: 'loans',      label: 'Empréstimos',  color: c.amber },
    { key: 'cards',      label: 'Cartões',       color: c.red   },
  ]

  const totals = SLICES.map(s => ({
    ...s,
    value: Math.round(data.reduce((sum, m) => sum + (m[s.key as keyof MonthPoint] as number), 0)),
  })).filter(s => s.value > 0)

  const total = totals.reduce((s, t) => s + t.value, 0)

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={totals}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={82}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {totals.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5 mt-2">
        {totals.map(s => (
          <div key={s.key} className="flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
              <span className="text-[var(--color-text-muted)]">{s.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {total > 0 ? ((s.value / total) * 100).toFixed(0) + '%' : '-'}
              </span>
              <span className="font-mono font-medium text-[var(--color-text-primary)]">{fmt(s.value)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
