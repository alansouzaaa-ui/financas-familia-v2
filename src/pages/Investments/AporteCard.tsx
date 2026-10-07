import { useMemo } from 'react'
import { useAllocationStore } from '@/stores/useAllocationStore'
import {
  computeAporte,
  ALLOC_CLASSES,
  ALLOC_CLASS_LABELS,
  ALLOC_CLASS_COLORS,
} from '@/lib/aporte'
import { fmtFull } from '@/lib/formatters'
import Input from '@/components/ui/Input'
import type { InvestmentPosition } from '@/types/investment'

type AportePos = InvestmentPosition & {
  currentValue: number
  quote: { regularMarketPrice: number } | null
}

// Mesma normalização de purposeIsReserve (index.tsx): a reserva fica fora desta conta.
function isReserve(purpose?: string): boolean {
  if (!purpose) return false
  const n = purpose.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return n.includes('reserva') || n.includes('emergenc')
}

export default function AporteCard({
  positions,
  open,
  onToggle,
}: {
  positions: AportePos[]
  open: boolean
  onToggle: () => void
}) {
  const { targets, aporte, setTarget, setAporte, resetTargets } = useAllocationStore()

  const result = useMemo(
    () =>
      computeAporte(
        positions
          .filter((p) => !isReserve(p.purpose))
          .map((p) => ({
            id: p.id,
            ticker: p.ticker,
            assetType: p.assetType,
            value: p.currentValue,
            price: p.quote?.regularMarketPrice ?? null,
          })),
        targets,
        aporte
      ),
    [positions, targets, aporte]
  )

  const sumTargets = ALLOC_CLASSES.reduce((s, c) => s + (targets[c] || 0), 0)
  const funded = result.classes.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount)
  const above = result.classes.filter((c) => c.amount <= 0 && c.gap <= 0 && c.targetPct > 0)

  return (
    <div className="card">
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="section-head label">Estratégia</p>
          <h2 className="serif text-[clamp(18px,2.6vw,22px)] tracking-[-0.01em] mt-1">
            Onde aportar este mês
          </h2>
          <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
            {aporte > 0
              ? `Aporte de ${fmtFull(aporte)} distribuído em ${funded.length} ${funded.length === 1 ? 'classe' : 'classes'}`
              : 'Defina suas metas por classe e o valor do aporte'}
          </p>
        </div>
        <svg
          width="18" height="18" viewBox="0 0 14 14" fill="none"
          className={`flex-shrink-0 text-[var(--color-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M3.5 5.5L7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {!open ? null : (
        <>
          <div className="mt-4 max-w-[380px]">
            <Input
              label="Valor do aporte (R$)"
              type="number"
              min="0"
              step="50"
              placeholder="1000"
              value={aporte ? String(aporte) : ''}
              onChange={(e) => setAporte(Number(e.target.value.replace(',', '.')) || 0)}
            />
          </div>

          {/* Metas por classe */}
          <div className="mt-5 pt-4 border-t border-[var(--hairline)]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="section-head label">Metas por classe</div>
              <button
                onClick={resetTargets}
                className="text-[12px] text-[var(--color-primary)] hover:underline"
              >
                Restaurar sugestão
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {result.classes.map((c) => {
                const color = ALLOC_CLASS_COLORS[c.cls]
                return (
                  <div key={c.cls}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-[13px] font-medium text-[var(--color-text-primary)] truncate w-[84px] flex-shrink-0">
                          {ALLOC_CLASS_LABELS[c.cls]}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={String(targets[c.cls] ?? 0)}
                          onChange={(e) => setTarget(c.cls, Number(e.target.value) || 0)}
                          aria-label={`Meta de ${ALLOC_CLASS_LABELS[c.cls]} (%)`}
                          className="w-16 px-2 py-1 text-[13px] font-mono rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                        />
                        <span className="text-[12px] text-[var(--color-text-muted)]">%</span>
                      </div>
                      <span className="text-[11px] font-mono text-[var(--color-text-muted)] text-right flex-shrink-0">
                        atual {c.currentPct.toFixed(0)}% · {fmtFull(c.current)}
                      </span>
                    </div>
                    <div className="relative h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(c.currentPct, 100)}%`, background: color }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-[2px] bg-[var(--color-text-primary)]"
                        style={{ left: `${Math.min(c.targetPct, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <p className={`text-[12px] mt-3 ${sumTargets !== 100 ? 'neg' : 'text-[var(--color-text-muted)]'}`}>
              {sumTargets !== 100
                ? `Soma das metas: ${sumTargets}% (será normalizada para 100%)`
                : 'Soma das metas: 100%'}
            </p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
              Sugestão inicial editável — não é recomendação da AUVP. A reserva de emergência fica fora desta conta.
            </p>
          </div>

          {/* Distribuição sugerida */}
          {aporte > 0 && (
            <div className="mt-5 pt-4 border-t border-[var(--hairline)]">
              <div className="section-head label mb-3">Distribuição sugerida</div>
              <div className="flex flex-col gap-3">
                {funded.map((c) => (
                  <div
                    key={c.cls}
                    className="rounded-xl border border-[var(--color-border)] p-3.5 bg-[var(--color-surface-2)]/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ALLOC_CLASS_COLORS[c.cls] }} />
                        <span className="font-semibold text-[14px] text-[var(--color-text-primary)]">
                          {ALLOC_CLASS_LABELS[c.cls]}
                        </span>
                      </div>
                      <span className="font-mono font-semibold text-[15px] text-[var(--color-text-primary)] flex-shrink-0">
                        {fmtFull(c.amount)}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)] pl-[18px] mt-0.5">
                      estava {c.currentPct.toFixed(0)}% → alvo {c.targetPct.toFixed(0)}%
                    </div>
                    <div className="pl-[18px] mt-2.5 pt-2.5 border-t border-[var(--hairline)] flex flex-col gap-1.5">
                      {c.assets.length === 0 ? (
                        <div className="text-[12px] text-[var(--color-text-muted)]">
                          Nenhum ativo nesta classe ainda — escolha um novo ativo para começar.
                        </div>
                      ) : (
                        c.assets.map((a) => (
                          <div key={a.id} className="flex items-center justify-between gap-3 text-[12px]">
                            <span className="font-mono text-[var(--color-text-primary)] truncate min-w-0">{a.ticker}</span>
                            <span className="text-right flex-shrink-0">
                              <span className="font-mono font-medium text-[var(--color-text-primary)]">{fmtFull(a.amount)}</span>
                              {a.shares != null && (
                                <span className="text-[var(--color-text-muted)]">
                                  {' · '}
                                  {a.shares === 0 ? 'valor < 1 cota' : `≈ ${a.shares} cotas`}
                                </span>
                              )}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {above.length > 0 && (
                <p className="text-[12px] text-[var(--color-text-muted)] mt-3">
                  Acima da meta (sem aporte): {above.map((c) => ALLOC_CLASS_LABELS[c.cls]).join(', ')}
                </p>
              )}
              {result.leftover > 0.01 && (
                <p className="text-[12px] text-[var(--color-text-muted)] mt-2">
                  {fmtFull(result.leftover)} sem destino — ajuste as metas.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
