import Money from '@/components/ui/Money'
import { fmtPct } from '@/lib/formatters'

interface MetricCardProps {
  label: string
  value: number
  signed?: boolean
  previousValue?: number
  variant?: 'positive' | 'negative' | 'neutral' | 'auto'
}

const ACCENT: Record<string, string> = {
  positive: 'var(--color-pos)',
  negative: 'var(--color-neg)',
  neutral: 'var(--color-text-muted)',
}

export default function MetricCard({ label, value, signed = false, previousValue, variant = 'neutral' }: MetricCardProps) {
  const displayVariant = variant === 'auto'
    ? value >= 0 ? 'positive' : 'negative'
    : variant

  // Só receita/balanço ganham cor. Despesas ficam neutras — dinheiro gasto não é alarme.
  const colorClass = displayVariant === 'positive' ? 'pos'
    : signed && displayVariant === 'negative' ? 'neg'
    : 'text-[var(--color-text-primary)]'

  const change = previousValue !== undefined && previousValue !== 0
    ? ((value - previousValue) / Math.abs(previousValue)) * 100
    : null

  return (
    <div className="card relative overflow-hidden">
      <span className="absolute left-0 top-4 bottom-4 w-[2.5px] rounded-full" style={{ background: ACCENT[displayVariant], opacity: 0.55 }} />
      <div className="label mb-2.5">{label}</div>
      <div className={`font-semibold text-[19px] leading-none ${colorClass}`}>
        <Money value={value} signed={signed} />
      </div>
      {change !== null && (
        <div className={`inline-flex items-center gap-1 text-[11px] font-medium mt-2 ${change >= 0 ? 'pos' : 'neg'}`}>
          <span className="text-[8px]">{change >= 0 ? '▲' : '▼'}</span>
          <span className="font-mono tnum">{fmtPct(Math.abs(change), 1)}</span>
          <span className="text-[var(--color-text-muted)] font-normal">vs. anterior</span>
        </div>
      )}
    </div>
  )
}
