import type { PeriodFilter, PeriodPreset } from '@/types/finance'

interface Props {
  filter: PeriodFilter
  onChange: (filter: PeriodFilter) => void
}

const PRESETS: { preset: PeriodPreset; label: string }[] = [
  { preset: 'current_month', label: 'Este mês' },
  { preset: '3m',            label: '3 meses' },
  { preset: '6m',            label: '6 meses' },
  { preset: '12m',           label: '12 meses' },
  { preset: 'current_year',  label: 'Este ano' },
  { preset: 'all',           label: 'Tudo' },
  { preset: 'custom',        label: 'Personalizado' },
]

export default function PeriodFilterBar({ filter, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(({ preset, label }) => (
          <button
            key={preset}
            className={`pill ${filter.preset === preset ? 'active' : ''}`}
            onClick={() => onChange({ preset })}
          >
            {label}
          </button>
        ))}
      </div>
      {filter.preset === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="label">De</span>
            <input
              type="month"
              className="px-2 py-1.5 text-[12px] font-mono bg-[#F7F6F3] border border-[#E8E6E0] rounded-[8px] outline-none focus:border-[#1A1917]"
              value={filter.customRange?.from ?? ''}
              onChange={e => onChange({ preset: 'custom', customRange: { from: e.target.value, to: filter.customRange?.to ?? '' } })}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="label">Até</span>
            <input
              type="month"
              className="px-2 py-1.5 text-[12px] font-mono bg-[#F7F6F3] border border-[#E8E6E0] rounded-[8px] outline-none focus:border-[#1A1917]"
              value={filter.customRange?.to ?? ''}
              onChange={e => onChange({ preset: 'custom', customRange: { from: filter.customRange?.from ?? '', to: e.target.value } })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
