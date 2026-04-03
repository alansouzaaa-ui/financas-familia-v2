import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { AnnualSummary } from '@/types/finance'
import { fmtK } from '@/lib/formatters'
import ChartTooltip from './ChartTooltip'
import { useChartColors } from '@/hooks/useChartColors'

interface Props { data: AnnualSummary[] }

export default function AnnualChart({ data }: Props) {
  const c = useChartColors()

  const chartData = data.map(d => ({
    name: String(d.year),
    Receitas: Math.round(d.revenue),
    Despesas: Math.round(d.totalExpenses),
    Balanço: Math.round(d.balance),
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="agradGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.green} stopOpacity={1} />
            <stop offset="100%" stopColor={c.green} stopOpacity={0.65} />
          </linearGradient>
          <linearGradient id="agradRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.red} stopOpacity={1} />
            <stop offset="100%" stopColor={c.red} stopOpacity={0.65} />
          </linearGradient>
          <linearGradient id="agradBlue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.blue} stopOpacity={1} />
            <stop offset="100%" stopColor={c.blue} stopOpacity={0.65} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: c.axis, fontFamily: 'DM Mono' }}
          tickLine={false}
          axisLine={false}
          dy={4}
        />
        <YAxis
          tick={{ fontSize: 10, fill: c.axis, fontFamily: 'DM Mono' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={fmtK}
          width={56}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: c.grid, opacity: 0.5 }} />
        <Legend
          iconSize={10}
          iconType="square"
          wrapperStyle={{ fontSize: 12, fontFamily: 'DM Sans', color: c.axis, paddingTop: 8 }}
        />
        <Bar dataKey="Receitas" fill="url(#agradGreen)" radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar dataKey="Despesas" fill="url(#agradRed)"   radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar dataKey="Balanço"  fill="url(#agradBlue)"  radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
}
