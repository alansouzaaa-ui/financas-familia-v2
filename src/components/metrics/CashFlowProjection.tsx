import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import type { MonthPoint } from '@/types/finance'
import { useRecurringStore } from '@/stores/useRecurringStore'
import { buildProjection } from '@/lib/projection'
import { fmt, fmtK } from '@/lib/formatters'
import { useChartColors } from '@/hooks/useChartColors'
import ChartTooltip from '@/components/charts/ChartTooltip'
import Money from '@/components/ui/Money'

interface Props {
  months: MonthPoint[]
}

export default function CashFlowProjection({ months }: Props) {
  const c = useChartColors()
  const recurring = useRecurringStore(s => s.items)
  const proj = useMemo(() => buildProjection(months, recurring), [months, recurring])

  const allZero = proj.rows.every(r => r.result === 0)
  const negMonths = proj.rows.filter(r => r.result < 0).length
  const firstNeg = proj.rows.find(r => r.cumulative < 0)

  const data = proj.rows.map(r => ({ name: r.label, Resultado: Math.round(r.result), Acumulado: Math.round(r.cumulative), neg: r.result < 0 }))

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-1 gap-3">
        <div>
          <div className="section-head label">Fluxo de caixa projetado</div>
          <p className="text-[12px] text-[var(--color-text-muted)] mt-1 ml-[calc(14px+0.6rem)]">Para onde o saldo caminha nos próximos {proj.rows.length} meses.</p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`font-semibold text-[18px] ${proj.endOfHorizon >= 0 ? 'pos' : 'neg'}`}><Money value={proj.endOfHorizon} signed /></div>
          <div className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase tracking-wide">acumulado projetado</div>
        </div>
      </div>

      {allZero ? (
        <div className="flex flex-col items-center justify-center text-center gap-1.5 py-10">
          <p className="text-[12.5px] text-[var(--color-text-muted)] max-w-[34ch]">Cadastre seus itens recorrentes (salário, contas fixas) para projetar o caixa dos próximos meses.</p>
          <Link to="/recorrentes" className="text-[12px] font-medium text-[var(--color-chart-blue)] hover:underline">Cadastrar recorrentes →</Link>
        </div>
      ) : (
        <>
          <div className="mt-3">
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: c.axis, fontFamily: 'DM Mono' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: c.axis, fontFamily: 'DM Mono' }} tickLine={false} axisLine={false} tickFormatter={fmtK} width={52} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: c.grid, opacity: 0.4 }} />
                <ReferenceLine y={0} stroke={c.axis} strokeWidth={1} />
                <Bar dataKey="Resultado" radius={[4, 4, 0, 0]} maxBarSize={30}>
                  {data.map((d, i) => <Cell key={i} fill={d.neg ? c.red : c.green} />)}
                </Bar>
                <Line type="monotone" dataKey="Acumulado" stroke={c.blue} strokeWidth={2.25} dot={{ r: 2.5, fill: c.blue, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[12px] text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.green }} />Resultado do mês</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.blue }} />Acumulado</span>
            <span className="ml-auto">Ritmo recorrente: <span className={`font-mono ${proj.baseline >= 0 ? 'pos' : 'neg'}`}>{proj.baseline >= 0 ? '+' : '−'}{fmt(proj.baseline)}/mês</span></span>
          </div>
          {firstNeg && (
            <p className="text-[12.5px] mt-3 px-3 py-2 rounded-[9px] bg-[var(--color-neg)]/[0.10] text-[var(--color-neg)]">
              ⚠︎ No ritmo atual, o acumulado fica negativo a partir de <b>{firstNeg.label}</b>. {negMonths > 0 && `${negMonths} ${negMonths === 1 ? 'mês fecha' : 'meses fecham'} no vermelho.`}
            </p>
          )}
        </>
      )}
    </div>
  )
}
