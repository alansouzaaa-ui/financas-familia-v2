import { useState } from 'react'
import type { PeriodFilter, PeriodPreset } from '@/types/finance'

interface Props {
  filter: PeriodFilter
  onChange: (filter: PeriodFilter) => void
}

const PRESETS: { preset: PeriodPreset; label: string; short: string }[] = [
  { preset: 'current_month', label: 'Este mês',  short: 'Mês' },
  { preset: '3m',            label: '3 meses',    short: '3M' },
  { preset: '6m',            label: '6 meses',    short: '6M' },
  { preset: '12m',           label: '12 meses',   short: '12M' },
  { preset: 'current_year',  label: 'Este ano',   short: 'Ano' },
  { preset: 'all',           label: 'Tudo',       short: 'Tudo' },
]

// Segmented control compacto para o header — período rápido sem ocupar um card.
export default function PeriodSegment({ filter, onChange }: Props) {
  const [showCustom, setShowCustom] = useState(filter.preset === 'custom')

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="inline-flex items-center p-0.5 rounded-[10px] bg-[var(--color-surface-2)] border border-[var(--color-border)]">
        {PRESETS.map(({ preset, label, short }) => {
          const active = filter.preset === preset
          return (
            <button
              key={preset}
              onClick={() => { setShowCustom(false); onChange({ preset }) }}
              className={`px-2.5 py-1 rounded-[8px] text-[12px] font-medium transition-colors ${
                active
                  ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-[var(--shadow-card)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
              title={label}
            >
              <span className="hidden lg:inline">{label}</span>
              <span className="lg:hidden">{short}</span>
            </button>
          )
        })}
        <button
          onClick={() => { setShowCustom(v => !v); onChange({ preset: 'custom', customRange: filter.customRange }) }}
          className={`px-2 py-1 rounded-[8px] text-[12px] font-medium transition-colors ${
            filter.preset === 'custom'
              ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-[var(--shadow-card)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
          }`}
          title="Período personalizado"
          aria-label="Período personalizado"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="inline-block align-middle">
            <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M1.5 5.5h11M4.5 1.5v2M9.5 1.5v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {(showCustom || filter.preset === 'custom') && (
        <div className="inline-flex items-center gap-1.5">
          <input
            type="month"
            className="px-2 py-1 text-[12px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none focus:border-[var(--color-text-primary)]"
            value={filter.customRange?.from ?? ''}
            onChange={e => onChange({ preset: 'custom', customRange: { from: e.target.value, to: filter.customRange?.to ?? '' } })}
          />
          <span className="text-[var(--color-text-muted)] text-[12px]">–</span>
          <input
            type="month"
            className="px-2 py-1 text-[12px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none focus:border-[var(--color-text-primary)]"
            value={filter.customRange?.to ?? ''}
            onChange={e => onChange({ preset: 'custom', customRange: { from: filter.customRange?.from ?? '', to: e.target.value } })}
          />
        </div>
      )}
    </div>
  )
}
