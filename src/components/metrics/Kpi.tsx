import type { ReactNode } from 'react'
import Money from '@/components/ui/Money'
import Sparkline from '@/components/ui/Sparkline'

interface KpiProps {
  label: string
  value: number
  /** '+' para positivos (usar em resultado/saldo); despesas ficam sem sinal */
  signed?: boolean
  /** Valor do período anterior para a variação % */
  previousValue?: number
  /** true = subir é bom (receita/resultado); false = subir é ruim (despesa) */
  goodWhenUp?: boolean
  /** Série curta para a sparkline de tendência */
  trend?: number[]
  /** Cor do número e da sparkline; default = neutro (texto primário) */
  tone?: 'neutral' | 'pos' | 'neg'
  /** Rótulo do comparativo (ex: 'vs. mês anterior') */
  comparisonLabel?: string
  footer?: ReactNode
}

const TONE_COLOR: Record<string, string> = {
  pos: 'var(--color-pos)',
  neg: 'var(--color-neg)',
  neutral: 'var(--color-text-primary)',
}

export default function Kpi({
  label, value, signed = false, previousValue, goodWhenUp = true,
  trend, tone = 'neutral', comparisonLabel = 'vs. mês anterior', footer,
}: KpiProps) {
  const change = previousValue !== undefined && previousValue !== 0
    ? ((value - previousValue) / Math.abs(previousValue)) * 100
    : null
  const up = (change ?? 0) >= 0
  const changeIsGood = change === null ? null : (goodWhenUp ? up : !up)

  const numberColor = tone === 'neutral' ? 'text-[var(--color-text-primary)]' : tone
  const sparkStroke = TONE_COLOR[tone]

  return (
    <div className="card flex flex-col gap-3 min-h-[128px]">
      <div className="flex items-start justify-between gap-2">
        <span className="label">{label}</span>
        {change !== null && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold ${changeIsGood ? 'pos' : 'neg'}`}
            title={`${up ? '+' : '−'}${Math.abs(change).toFixed(1)}% ${comparisonLabel}`}
          >
            <span className="text-[8px]">{up ? '▲' : '▼'}</span>
            <span className="font-mono tnum">{Math.abs(change).toFixed(1)}%</span>
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2 mt-auto">
        <div className={`font-semibold text-[24px] leading-none tracking-[-0.01em] ${numberColor}`}>
          <Money value={value} signed={signed} />
        </div>
        {trend && trend.length >= 2 && (
          <Sparkline data={trend} width={76} height={30} stroke={sparkStroke} zeroLine={false} />
        )}
      </div>

      {(comparisonLabel && change !== null) ? (
        <div className="text-[11px] text-[var(--color-text-muted)] -mt-1">{comparisonLabel}</div>
      ) : footer ? (
        <div className="text-[11px] text-[var(--color-text-muted)] -mt-1">{footer}</div>
      ) : null}
    </div>
  )
}
