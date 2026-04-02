import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { MonthPoint } from '@/types/finance'
import { fmtK } from '@/lib/formatters'
import ChartTooltip from './ChartTooltip'

interface Props { data: MonthPoint[] }

export default function RevenueExpenseChart({ data }: Props) {
  const chartData = data.map(m => ({
    name: m.label,
    Receitas: Math.round(m.revenue),
    Despesas: Math.round(m.totalExpenses),
    Balanço: Math.round(m.balance),
  }))

  const autoSkip = data.length > 18

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0EEE9" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: '#6B6860', fontFamily: 'DM Mono' }}
          tickLine={false}
          axisLine={false}
          interval={autoSkip ? 'preserveStartEnd' : 0}
          angle={data.length > 12 ? -45 : 0}
          textAnchor={data.length > 12 ? 'end' : 'middle'}
          height={data.length > 12 ? 40 : 20}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#6B6860', fontFamily: 'DM Mono' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={fmtK}
          width={52}
        />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="Receitas" fill="#1D9E75" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Bar dataKey="Despesas" fill="#D85A30" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Line
          type="monotone"
          dataKey="Balanço"
          stroke="#378ADD"
          strokeWidth={2}
          dot={{ r: 2, fill: '#378ADD' }}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
