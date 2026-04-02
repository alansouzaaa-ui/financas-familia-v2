import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import type { MonthPoint } from '@/types/finance'
import { fmtK } from '@/lib/formatters'
import ChartTooltip from './ChartTooltip'

interface Props { data: MonthPoint[] }

export default function BalanceChart({ data }: Props) {
  const chartData = data.map(m => ({
    name: m.label,
    Balanço: Math.round(m.balance),
  }))

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0EEE9" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: '#6B6860', fontFamily: 'DM Mono' }}
          tickLine={false}
          axisLine={false}
          interval={data.length > 12 ? 'preserveStartEnd' : 0}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#6B6860', fontFamily: 'DM Mono' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={fmtK}
          width={52}
        />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="Balanço" radius={[3, 3, 0, 0]} maxBarSize={28}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.Balanço >= 0 ? '#1D9E75' : '#D85A30'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
