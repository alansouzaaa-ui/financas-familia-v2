import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { MonthPoint } from '@/types/finance'
import { fmt } from '@/lib/formatters'

interface Props { data: MonthPoint[] }

const SLICES = [
  { key: 'fixedCosts', label: 'Custos Fixos', color: '#378ADD' },
  { key: 'loans',      label: 'Empréstimos',  color: '#EF9F27' },
  { key: 'cards',      label: 'Cartões',       color: '#D85A30' },
]

export default function ExpenseDonut({ data }: Props) {
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
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {totals.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => [fmt(Number(v)), '']}
            contentStyle={{ fontFamily: 'DM Sans', fontSize: 12, border: '1px solid #E8E6E0', borderRadius: 10 }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5 mt-2">
        {totals.map(s => (
          <div key={s.key} className="flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
              <span className="text-[#6B6860]">{s.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#6B6860]">
                {total > 0 ? ((s.value / total) * 100).toFixed(0) + '%' : '-'}
              </span>
              <span className="font-mono font-medium text-[#1A1917]">{fmt(s.value)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
