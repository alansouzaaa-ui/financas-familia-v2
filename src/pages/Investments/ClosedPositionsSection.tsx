import { useId, useMemo, useState } from 'react'
import { useOperationsStore } from '@/stores/useOperationsStore'
import { totalBought, UNKNOWN_DATE } from '@/lib/operations'
import { fmtDateBR, fmtSignedFull, fmtSignedPct } from '@/lib/formatters'

/** "Posições encerradas (N)": recolhida por padrão; nada daqui entra nos totais da carteira. */
export default function ClosedPositionsSection({ onOpenHistory }: { onOpenHistory: (positionId: string) => void }) {
  const closed = useOperationsStore(s => s.closedPositions)
  const operations = useOperationsStore(s => s.operations)
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const rows = useMemo(() => {
    const bought = new Map<string, number>()
    for (const c of closed) bought.set(c.position.id, totalBought(operations.filter(o => o.positionId === c.position.id)))
    return [...closed]
      .sort((a, b) => (a.closedAt < b.closedAt ? 1 : a.closedAt > b.closedAt ? -1 : 0))
      .map(c => {
        const base = bought.get(c.position.id) ?? 0
        return { ...c, pct: base > 0 ? (c.realizedGain / base) * 100 : null }
      })
  }, [closed, operations])

  if (rows.length === 0) return null

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full min-h-12 px-4 flex items-center justify-between gap-3 text-left hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)] transition-colors"
      >
        <span className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Posições encerradas ({rows.length})
        </span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className={`text-[var(--color-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul id={panelId} className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]">
          {rows.map(c => {
            const cls = c.realizedGain > 0.005 ? 'pos' : c.realizedGain < -0.005 ? 'neg' : 'text-[var(--color-text-muted)]'
            return (
              <li key={c.position.id}>
                <button
                  type="button"
                  onClick={() => onOpenHistory(c.position.id)}
                  aria-label={`Ver histórico de ${c.position.ticker}`}
                  className="w-full min-h-14 px-4 py-2 flex items-center justify-between gap-3 text-left hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)] transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-[14px] font-mono text-[var(--color-text-primary)] truncate">{c.position.ticker}</span>
                    <span className="block text-[11.5px] text-[var(--color-text-muted)]">
                      Encerrada em {c.closedAt === UNKNOWN_DATE ? 'data desconhecida' : fmtDateBR(c.closedAt)}
                    </span>
                  </span>
                  <span className={`text-right text-[13px] font-semibold font-mono flex-shrink-0 ${cls}`}>
                    {fmtSignedFull(c.realizedGain)}
                    {c.pct != null && <span className="block text-[11.5px] font-medium">{fmtSignedPct(c.pct)}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
