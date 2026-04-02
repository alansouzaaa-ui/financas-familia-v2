import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { AnnualSummary } from '@/types/finance'
import { fmtK } from '@/lib/formatters'
import ChartTooltip from './ChartTooltip'

interface Props { data: AnnualSummary[] }

export default function AnnualChart({ data }: Props) {
  const chartData = data.map(d => ({
    name: String(d.year),
    Receitas: Math.round(d.revenue),
    Despesas: Math.round(d.totalExpenses),
    Balanço: Math.round(d.balance),
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0EEE9" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: '#6B6860', fontFamily: 'DM Mono' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#6B6860', fontFamily: 'DM Mono' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={fmtK}
          width={56}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend
          iconSize={10}
          iconType="square"
          wrapperStyle={{ fontSize: 12, fontFamily: 'DM Sans', color: '#6B6860', paddingTop: 8 }}
        />
        <Bar dataKey="Receitas" fill="#1D9E75" radius={[3, 3, 0, 0]} maxBarSize={40} />
        <Bar dataKey="Despesas" fill="#D85A30" radius={[3, 3, 0, 0]} maxBarSize={40} />
        <Bar dataKey="Balanço"  fill="#378ADD" radius={[3, 3, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
}
