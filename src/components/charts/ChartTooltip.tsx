import { fmt } from '@/lib/formatters'

interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}

export default function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] p-3 shadow-[0_4px_20px_rgba(0,0,0,0.15)] text-[12px] min-w-[150px]">
      {label && (
        <div className="font-semibold text-[var(--color-text-primary)] mb-2 pb-2 border-b border-[var(--color-border)]">
          {label}
        </div>
      )}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: entry.color }} />
            <span className="text-[var(--color-text-muted)]">{entry.name}</span>
          </div>
          <span className="font-mono font-medium text-[var(--color-text-primary)]">
            {fmt(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}
