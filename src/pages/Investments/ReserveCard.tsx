import { useState } from 'react'
import { useReserveStore } from '@/stores/useReserveStore'
import { fmtFull } from '@/lib/formatters'
import Input from '@/components/ui/Input'
import { useJourneyPlan } from '@/hooks/useJourneyPlan'
import { addMonthsLabel } from '@/lib/journey'
import type { ReservePillar } from '@/types/investment'
import type { ReserveAsset } from '@/lib/reserve'

// ─── Modelo de carteira da reserva de emergência ────────────────────────────
// Baseado no conceito do vídeo da AUVP (Raul Sena): "Onde deixar sua reserva de
// emergência?". A reserva é um SEGURO — prioriza segurança, liquidez e acesso
// rápido, NÃO rentabilidade. O tamanho sai do custo fixo mensal (não do salário).
// A alocação prioriza liquidez: uma fatia de acesso imediato (inclusive fim de
// semana, quando o Tesouro resgata só em D+1) + núcleo em Tesouro Selic + um
// complemento em renda fixa de liquidez diária isenta de IOF (ETF tipo AUPO11/
// LFTS11 ou CDB de liquidez diária com FGC).

interface Slice {
  id: ReservePillar
  label: string
  pct: number
  vehicle: string
  note: string
  color: string
}

const ALLOCATION: Slice[] = [
  {
    id: 'imediato',
    label: 'Acesso imediato',
    pct: 0.1,
    vehicle: 'Conta / dinheiro de liquidez instantânea',
    note: 'Resgate na hora, inclusive no fim de semana — quando o Tesouro só cai em D+1.',
    color: 'var(--color-accent)',
  },
  {
    id: 'selic',
    label: 'Tesouro Selic',
    pct: 0.6,
    vehicle: 'Tesouro Selic (LFT)',
    note: 'Núcleo: título do governo, risco baixíssimo, acompanha a Selic, liquidez D+1.',
    color: '#0EA5E9',
  },
  {
    id: 'rendafixa',
    label: 'Renda fixa líquida',
    pct: 0.3,
    vehicle: 'ETF de renda fixa (AUPO11/LFTS11) ou CDB liquidez diária (FGC)',
    note: 'ETF é isento de IOF — rende melhor que a poupança/caixinha sem travar o dinheiro.',
    color: 'var(--color-primary)',
  },
]

const PRINCIPLES = [
  'É um seguro, não um investimento: o objetivo é proteção, não a maior rentabilidade.',
  'Dimensione pelo custo fixo mensal (aluguel, saúde, contas, comida) — não pelo salário.',
  'Três funções inegociáveis: segurança, liquidez e acesso rápido (até no fim de semana).',
  'Monte a reserva antes de ir para ações, FIIs ou investimentos de risco.',
]

// KPI compacto da reserva para a faixa de destaque no topo da página.
export function ReserveSummaryCard({
  current,
  onClick,
}: {
  current: number
  onClick: () => void
}) {
  const { monthlyCost, months } = useReserveStore()
  const target = monthlyCost * months
  const has = target > 0
  const progress = has ? Math.min((current / target) * 100, 100) : 0
  return (
    <button
      onClick={onClick}
      className="text-left bg-[var(--color-surface)] rounded-2xl p-4 border border-[var(--color-border)] hover:border-[color-mix(in_srgb,var(--color-primary)_45%,transparent)] transition-colors"
    >
      <div className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
        Reserva
      </div>
      {has ? (
        <>
          <div className="text-[18px] xl:text-[20px] font-semibold text-[var(--color-text-primary)] leading-tight whitespace-nowrap tabular-nums">
            {fmtFull(current)}
          </div>
          <div className="text-[12px] text-[var(--color-text-muted)] mt-0.5 font-medium">
            de {fmtFull(target)} · {progress.toFixed(0)}%
          </div>
          <div className="h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden mt-2">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: progress >= 100 ? 'var(--color-pos)' : 'var(--color-primary)',
              }}
            />
          </div>
        </>
      ) : (
        <>
          <div className="text-[20px] font-semibold text-[var(--color-text-primary)] leading-tight">—</div>
          <div className="text-[12px] text-[var(--color-primary)] mt-0.5 font-medium">Definir meta →</div>
        </>
      )}
    </button>
  )
}

export default function ReserveCard({
  current,
  byPillar,
  assets,
  open,
  onToggle,
}: {
  current: number
  byPillar: Record<ReservePillar, number>
  assets: Record<ReservePillar, ReserveAsset[]>
  open: boolean
  onToggle: () => void
}) {
  const { monthlyCost, months, incomeType, setMonthlyCost, setMonths, setIncomeType } = useReserveStore()
  const jp = useJourneyPlan({ reserveCurrent: current })
  const [expandedPillar, setExpandedPillar] = useState<ReservePillar | null>(null)

  const target = monthlyCost * months
  const hasTarget = target > 0
  const progress = hasTarget ? Math.min((current / target) * 100, 100) : 0
  const gap = target - current // >0 falta, <0 excedente

  return (
    <div className="card">
      {/* Header — clicável para expandir/recolher */}
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="section-head label">Proteção</p>
          <h2 className="serif text-[clamp(18px,2.6vw,22px)] tracking-[-0.01em] mt-1">
            Reserva de emergência
          </h2>
          <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
            {hasTarget
              ? `Meta ${fmtFull(target)} · ${progress.toFixed(0)}% concluído — carteira e pilares`
              : 'Defina sua meta e veja a carteira sugerida (AUVP)'}
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
      {/* Tipo de renda */}
      <div className="mt-4 max-w-[380px]">
        <div className="label mb-1.5">Tipo de renda</div>
        <div className="flex rounded-xl border border-[var(--color-border)] overflow-hidden">
          {([
            { value: 'estavel', label: 'Estável · 6 meses' },
            { value: 'variavel', label: 'Variável · 12 meses' },
          ] as const).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setIncomeType(o.value)}
              className={`flex-1 px-3 py-2 text-[12px] font-medium transition-colors ${incomeType === o.value ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5">
          Autônomos e renda variável: 12 meses (AUVP).
        </p>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3 mt-4 max-w-[380px]">
        <Input
          label="Custo fixo mensal (R$)"
          type="number"
          min="0"
          step="50"
          placeholder="4000"
          value={monthlyCost ? String(monthlyCost) : ''}
          onChange={(e) => setMonthlyCost(Number(e.target.value.replace(',', '.')) || 0)}
        />
        <Input
          label="Meses de cobertura"
          type="number"
          min="1"
          max="24"
          step="1"
          value={String(months)}
          onChange={(e) => setMonths(Number(e.target.value) || 6)}
        />
      </div>

      {!hasTarget ? (
        <p className="text-[13px] text-[var(--color-text-muted)] mt-4 pt-4 border-t border-[var(--hairline)]">
          Informe seu <strong className="text-[var(--color-text-primary)]">custo fixo mensal</strong> para
          calcular o tamanho ideal da reserva e a carteira recomendada. Some aluguel, plano de saúde,
          energia, água, internet e alimentação básica — fora lazer e supérfluos.
        </p>
      ) : (
        <>
          {/* Meta + progresso geral */}
          <div className="mt-5 pt-4 border-t border-[var(--hairline)] grid sm:grid-cols-2 gap-5">
            <div>
              <div className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Meta da reserva
              </div>
              <div className="display text-[clamp(24px,4vw,30px)] tracking-[-0.015em] text-[var(--color-text-primary)]">
                {fmtFull(target)}
              </div>
              <div className="text-[12px] text-[var(--color-text-muted)] mt-1 font-mono">
                {months} {months === 1 ? 'mês' : 'meses'} × {fmtFull(monthlyCost)}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[12px] mb-1.5">
                <span className="text-[var(--color-text-muted)] min-w-0">Você já tem (marcado como Reserva)</span>
                <span className="font-mono font-medium text-[var(--color-text-primary)] whitespace-nowrap flex-shrink-0">{fmtFull(current)}</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progress}%`,
                    background: progress >= 100 ? 'var(--color-pos)' : 'var(--color-primary)',
                  }}
                />
              </div>
              <div className="text-[12px] mt-1.5 font-medium">
                {gap > 0 ? (
                  <span className="text-[var(--color-text-muted)]">
                    Faltam <span className="text-[var(--color-text-primary)] font-mono">{fmtFull(gap)}</span>{' '}
                    ({progress.toFixed(0)}% concluído)
                  </span>
                ) : (
                  <span className="pos">✓ Reserva completa — excedente de {fmtFull(-gap)}</span>
                )}
              </div>
              {gap > 0 && (
                <div className="text-[12px] text-[var(--color-text-muted)] mt-1.5">
                  {jp.overdueDebt > 0 && jp.debtMonths !== null && jp.reserveDoneInMonths !== null && jp.reserveMonthsAfterDebts !== null
                    ? `Depois de quitar as dívidas (~${jp.debtMonths} meses), você fecha a reserva em ~${jp.reserveMonthsAfterDebts} meses — ${addMonthsLabel(jp.now, jp.reserveDoneInMonths)}`
                    : jp.overdueDebt <= 0 && jp.reserveMonthsAfterDebts !== null
                      ? `No ritmo da sua sobra (${fmtFull(jp.budget)}/mês), você fecha a reserva em ~${jp.reserveMonthsAfterDebts} meses — ${addMonthsLabel(jp.now, jp.reserveMonthsAfterDebts)}`
                      : 'Sem previsão com a sobra atual — ajuste o orçamento.'}
                </div>
              )}
            </div>
          </div>

          {/* Carteira recomendada — progresso por pilar */}
          <div className="mt-5">
            <div className="section-head label mb-3">Progresso por pilar</div>
            <div className="flex flex-col gap-3">
              {ALLOCATION.map((s) => {
                const pillarTarget = target * s.pct
                const pillarCurrent = byPillar[s.id] ?? 0
                const pillarPct = pillarTarget > 0 ? Math.min((pillarCurrent / pillarTarget) * 100, 100) : 0
                const pillarGap = pillarTarget - pillarCurrent
                const done = pillarGap <= 0
                const list = assets[s.id] ?? []
                const isOpen = expandedPillar === s.id
                return (
                  <div
                    key={s.id}
                    className="rounded-xl border border-[var(--color-border)] p-3.5 bg-[var(--color-surface-2)]/40"
                  >
                    {/* Cabeçalho do pilar — clique abre a lista de ativos */}
                    <button
                      onClick={() => setExpandedPillar(isOpen ? null : s.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                            style={{ background: s.color }}
                          />
                          <span className="font-semibold text-[14px] text-[var(--color-text-primary)]">
                            {s.label}
                          </span>
                          <span className="text-[11px] font-mono text-[var(--color-text-muted)]">
                            {(s.pct * 100).toFixed(0)}%
                          </span>
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            · {list.length} {list.length === 1 ? 'ativo' : 'ativos'}
                          </span>
                          <svg
                            width="12" height="12" viewBox="0 0 14 14" fill="none"
                            className={`flex-shrink-0 text-[var(--color-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          >
                            <path d="M3.5 5.5L7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <span className="font-mono font-semibold text-[14px] text-[var(--color-text-primary)] flex-shrink-0">
                          {fmtFull(pillarTarget)}
                        </span>
                      </div>
                      <div className="text-[12px] text-[var(--color-text-primary)] pl-[18px]">{s.vehicle}</div>
                      <div className="text-[11px] text-[var(--color-text-muted)] pl-[18px] mt-0.5 mb-2.5">{s.note}</div>
                    </button>

                    {/* Barra do pilar */}
                    <div className="pl-[18px]">
                      <div className="h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pillarPct}%`,
                            background: done ? 'var(--color-pos)' : s.color,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] mt-1">
                        <span className="font-mono text-[var(--color-text-muted)]">
                          {fmtFull(pillarCurrent)} de {fmtFull(pillarTarget)}
                        </span>
                        <span className={`font-medium ${done ? 'pos' : 'text-[var(--color-text-muted)]'}`}>
                          {done
                            ? (pillarGap < 0 ? `✓ +${fmtFull(-pillarGap)}` : '✓ completo')
                            : `${pillarPct.toFixed(0)}% · faltam ${fmtFull(pillarGap)}`}
                        </span>
                      </div>
                    </div>

                    {/* Lista de ativos do pilar (expandida) */}
                    {isOpen && (
                      <div className="pl-[18px] mt-3 pt-3 border-t border-[var(--hairline)] flex flex-col gap-1.5">
                        {list.length === 0 ? (
                          <div className="text-[12px] text-[var(--color-text-muted)]">
                            Nenhum ativo neste pilar ainda. Marque uma posição como Reserva e escolha este pilar.
                          </div>
                        ) : (
                          <>
                            {list.map((a, i) => (
                              <div key={i} className="flex items-center justify-between gap-3 text-[12px]">
                                <span className="text-[var(--color-text-primary)] truncate min-w-0">
                                  <span className="font-mono">{a.ticker}</span>
                                  {a.broker && (
                                    <span className="text-[var(--color-text-muted)]"> · {a.broker}</span>
                                  )}
                                </span>
                                <span className="font-mono font-medium text-[var(--color-text-primary)] flex-shrink-0">
                                  {fmtFull(a.value)}
                                </span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between gap-3 text-[12px] pt-1.5 mt-0.5 border-t border-[var(--hairline)]">
                              <span className="text-[var(--color-text-muted)]">Total no pilar</span>
                              <span className="font-mono font-semibold text-[var(--color-text-primary)]">
                                {fmtFull(pillarCurrent)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-3">
              Toque num pilar para ver os ativos que o compõem. Cada posição marcada como{' '}
              <strong className="text-[var(--color-text-primary)]">Reserva de emergência</strong> entra no pilar
              escolhido no cadastro — ou, se em branco, no detectado pelo tipo do ativo (Tesouro → Selic;
              ETF/Renda fixa → renda fixa líquida; Poupança/Outro → acesso imediato).
            </p>
          </div>

          {/* Princípios */}
          <div className="mt-5 pt-4 border-t border-[var(--hairline)]">
            <div className="section-head label mb-2.5">Princípios do vídeo</div>
            <ul className="flex flex-col gap-1.5">
              {PRINCIPLES.map((p, i) => (
                <li key={i} className="flex gap-2 text-[12px] text-[var(--color-text-muted)]">
                  <span className="text-[var(--color-accent)] flex-shrink-0 mt-[1px]">▪</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      </>
      )}
    </div>
  )
}
