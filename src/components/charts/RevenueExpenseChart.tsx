import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { MonthPoint } from '@/types/finance'
import { fmtK } from '@/lib/formatters'
import ChartTooltip from './ChartTooltip'
import { useChartColors } from '@/hooks/useChartColors'

interface Props { data: MonthPoint[] }

export default function RevenueExpenseChart({ data }: Props) {
  const c = useChartColors()

  const chartData = data.map(m => ({
    name: m.label,
    Receitas: Math.round(m.revenue),
    Despesas: Math.round(m.totalExpenses),
    Balanço: Math.round(m.balance),
  }))

  const autoSkip = data.length > 18

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.green} stopOpacity={1} />
            <stop offset="100%" stopColor={c.green} stopOpacity={0.65} />
          </linearGradient>
          <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.red} stopOpacity={1} />
            <stop offset="100%" stopColor={c.red} stopOpacity={0.65} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: c.axis, fontFamily: 'DM Mono' }}
          tickLine={false}
          axisLine={false}
          interval={autoSkip ? 'preserveStartEnd' : 0}
          angle={data.length > 12 ? -45 : 0}
          textAnchor={data.length > 12 ? 'end' : 'middle'}
          height={data.length > 12 ? 40 : 24}
          dy={4}
        />
        <YAxis
          tick={{ fontSize: 10, fill: c.axis, fontFamily: 'DM Mono' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={fmtK}
          width={52}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: c.grid, opacity: 0.5 }} />
        <Bar dataKey="Receitas" fill="url(#gradGreen)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="Despesas" fill="url(#gradRed)"   radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line
          type="monotone"
          dataKey="Balanço"
          stroke={c.blue}
          strokeWidth={2.5}
          dot={{ r: 2.5, fill: c.blue, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: c.blue, strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
