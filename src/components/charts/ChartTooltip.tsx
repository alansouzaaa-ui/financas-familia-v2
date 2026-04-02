import { fmt } from '@/lib/formatters'

interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}

export default function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-white border border-[#E8E6E0] rounded-[10px] p-3 shadow-[0_4px_16px_rgba(0,0,0,0.10)] text-[12px] min-w-[140px]">
      {label && <div className="font-semibold text-[#1A1917] mb-2">{label}</div>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: entry.color }} />
            <span className="text-[#6B6860]">{entry.name}</span>
          </div>
          <span className="font-mono font-medium text-[#1A1917]">{fmt(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}
