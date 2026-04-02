import { fmt, fmtSigned, fmtPct } from '@/lib/formatters'

interface MetricCardProps {
  label: string
  value: number
  signed?: boolean
  previousValue?: number
  variant?: 'positive' | 'negative' | 'neutral' | 'auto'
}

export default function MetricCard({ label, value, signed = false, previousValue, variant = 'neutral' }: MetricCardProps) {
  const displayVariant = variant === 'auto'
    ? value >= 0 ? 'positive' : 'negative'
    : variant

  const colorClass = displayVariant === 'positive' ? 'text-[#0F6E56]'
    : displayVariant === 'negative' ? 'text-[#993C1D]'
    : 'text-[#1A1917]'

  const change = previousValue !== undefined && previousValue !== 0
    ? ((value - previousValue) / Math.abs(previousValue)) * 100
    : null

  return (
    <div className="card">
      <div className="label mb-2">{label}</div>
      <div className={`font-mono font-semibold text-[18px] leading-none ${colorClass}`}>
        {signed ? fmtSigned(value) : fmt(value)}
      </div>
      {change !== null && (
        <div className={`text-[11px] font-mono mt-1.5 ${change >= 0 ? 'text-[#0F6E56]' : 'text-[#993C1D]'}`}>
          {change >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(change), 1)} vs mês anterior
        </div>
      )}
    </div>
  )
}
