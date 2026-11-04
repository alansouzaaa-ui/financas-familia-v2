import { useId, useState } from 'react'
import { fmtFull, fmtSignedFull, fmtSignedPct } from '@/lib/formatters'
import type { PortfolioResults, PositionResult } from '@/lib/portfolioResults'

type Status = 'idle' | 'loading' | 'done' | 'failed'

function tone(value: number): string {
  return value > 0.005 ? 'pos' : value < -0.005 ? 'neg' : 'text-[var(--color-text-muted)]'
}

const COL = 'rounded-xl p-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] min-w-0'
const LINK_BTN = 'underline underline-offset-2 hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded'

function dividendPart(r: PositionResult, loading: boolean): string | null {
  switch (r.dividends.status) {
    case 'na': return null
    case 'no-date': return 'Dividendos sem data'
    case 'no-data': return loading ? 'Dividendos buscando…' : 'Dividendos sem dados'
    default: return r.dividends.total > 0 ? `Dividendos ≈ ${fmtFull(r.dividends.total)}` : null
  }
}

/** Resultado da carteira: em aberto + realizado + dividendos estimados. */
export default function ResultsCard({
  results,
  status,
  hasEvents,
  reload,
  onOpenHistory,
}: {
  results: PortfolioResults
  status: Status
  /** Já há dados de proventos (mesmo antigos) na tela. */
  hasEvents: boolean
  reload: () => void
  onOpenHistory: (positionId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  if (results.rows.length === 0) return null

  const loadingNoData = status === 'loading' && !hasEvents
  // Falha com dados anteriores na tela: os totais já os usam, então a coluna também mostra.
  const failed = status === 'failed' && !hasEvents
  const loading = status === 'loading'

  return (
    <div className="card">
      <p className="section-head label">Resultado da carteira</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        <div className={COL}>
          <p className="text-[11px] text-[var(--color-text-muted)]">Em aberto</p>
          {results.unrealized === null ? (
            <p className="font-mono text-[15px] font-semibold mt-1 text-[var(--color-text-muted)]">—</p>
          ) : (
            <p className={`font-mono text-[15px] font-semibold mt-1 ${tone(results.unrealized)}`}>{fmtSignedFull(results.unrealized)}</p>
          )}
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
            ainda não vendido{results.unrealizedPct != null ? ` · ${fmtSignedPct(results.unrealizedPct)}` : ''}
          </p>
        </div>

        <div className={COL}>
          <p className="text-[11px] text-[var(--color-text-muted)]">Realizado</p>
          <p className={`font-mono text-[15px] font-semibold mt-1 ${tone(results.realized)}`}>{fmtSignedFull(results.realized)}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">vendas e resgates</p>
        </div>

        <div className={COL}>
          <p className="text-[11px] text-[var(--color-text-muted)]">Dividendos</p>
          {loadingNoData ? (
            <>
              <p className="font-mono text-[15px] font-semibold mt-1 text-[var(--color-text-muted)]">Buscando…</p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">estimado, desde a compra</p>
            </>
          ) : failed ? (
            <>
              <p className="font-mono text-[15px] font-semibold mt-1 text-[var(--color-text-muted)]">—</p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                Não consegui buscar ·{' '}
                <button type="button" onClick={reload} className={LINK_BTN}>Tentar de novo</button>
              </p>
            </>
          ) : (
            <>
              <p className="font-mono text-[15px] font-semibold mt-1 text-[var(--color-text-primary)]">≈ {fmtFull(results.dividends)}</p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">estimado, desde a compra</p>
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="mt-3 w-full min-h-10 sm:min-h-8 flex items-center justify-between gap-3 text-left text-[13px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded-lg transition-colors"
      >
        <span>Ver por ativo</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul id={panelId} className="mt-1 border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]">
          {results.rows.map(r => {
            // Só o que existe na posição: encerrada não tem "em aberto", e zeros viram ruído.
            const parts = [
              r.closed ? null : `Em aberto ${r.unrealized === null ? '—' : fmtSignedFull(r.unrealized)}`,
              Math.abs(r.realized) > 0.005 ? `Realizado ${fmtSignedFull(r.realized)}` : null,
              dividendPart(r, loading),
            ].filter((x): x is string => x !== null)
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpenHistory(r.id)}
                  aria-label={`Ver histórico de ${r.ticker}`}
                  className="w-full min-h-14 py-2 px-1 flex flex-col gap-0.5 text-left hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)] transition-colors"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex items-center gap-2">
                      <span className="font-semibold text-[14px] font-mono text-[var(--color-text-primary)] truncate">{r.ticker}</span>
                      {r.closed && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] flex-shrink-0">
                          Encerrada
                        </span>
                      )}
                    </span>
                    <span className={`text-[13px] font-semibold font-mono flex-shrink-0 ${tone(r.total)}`}>{fmtSignedFull(r.total)}</span>
                  </span>
                  <span className="text-[11.5px] text-[var(--color-text-muted)] break-words">{parts.join(' · ')}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-col gap-1 text-[11.5px] text-[var(--color-text-muted)]">
        {results.missingQuotes.length > 0 && (
          <p>Sem cotação agora, fora do lucro em aberto: {results.missingQuotes.join(', ')}.</p>
        )}
        {results.noDividendData.length > 0 && !loading && !failed && (
          <p>Sem dados de proventos: {results.noDividendData.join(', ')}.</p>
        )}
        {results.noDividendDate.length > 0 && (
          <p>Sem data de compra, dividendos não estimados: {results.noDividendDate.join(', ')}.</p>
        )}
        {results.inconsistent.length > 0 && (
          <p>Histórico inconsistente, confira as operações de: {results.inconsistent.join(', ')}.</p>
        )}
      </div>

      <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
        Resultado total = em aberto + realizado + dividendos, antes de impostos. Dividendos são estimados pela quantidade que você tinha na véspera da data ex de cada provento, em valores brutos, nos últimos 5 anos. Cupons do Tesouro não entram.
      </p>
    </div>
  )
}
