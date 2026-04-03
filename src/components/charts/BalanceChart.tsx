import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import type { MonthPoint } from '@/types/finance'
import { fmtK } from '@/lib/formatters'
import ChartTooltip from './ChartTooltip'
import { useChartColors } from '@/hooks/useChartColors'

interface Props { data: MonthPoint[] }

export default function BalanceChart({ data }: Props) {
  const c = useChartColors()

  const chartData = data.map(m => ({
    name: m.label,
    Balanço: Math.round(m.balance),
  }))

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="gradBalPos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.green} stopOpacity={1} />
            <stop offset="100%" stopColor={c.green} stopOpacity={0.6} />
          </linearGradient>
          <linearGradient id="gradBalNeg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.red} stopOpacity={1} />
            <stop offset="100%" stopColor={c.red} stopOpacity={0.6} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: c.axis, fontFamily: 'DM Mono' }}
          tickLine={false}
          axisLine={false}
          interval={data.length > 12 ? 'preserveStartEnd' : 0}
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
        <Bar dataKey="Balanço" radius={[4, 4, 0, 0]} maxBarSize={28}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.Balanço >= 0 ? 'url(#gradBalPos)' : 'url(#gradBalNeg)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
