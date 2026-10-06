import { useReserveStore } from '@/stores/useReserveStore'
import { fmtFull } from '@/lib/formatters'
import Input from '@/components/ui/Input'

// ─── Modelo de carteira da reserva de emergência ────────────────────────────
// Baseado no conceito do vídeo da AUVP (Raul Sena): "Onde deixar sua reserva de
// emergência?". A reserva é um SEGURO — prioriza segurança, liquidez e acesso
// rápido, NÃO rentabilidade. O tamanho sai do custo fixo mensal (não do salário).
// A alocação prioriza liquidez: uma fatia de acesso imediato (inclusive fim de
// semana, quando o Tesouro resgata só em D+1) + núcleo em Tesouro Selic + um
// complemento em renda fixa de liquidez diária isenta de IOF (ETF tipo AUPO11/
// LFTS11 ou CDB de liquidez diária com FGC).

interface Slice {
  id: string
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

// normaliza para casar "Reserva de emergência", "reserva", "emergencia" etc.
function isReserve(purpose?: string): boolean {
  if (!purpose) return false
  const n = purpose.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return n.includes('reserva') || n.includes('emergenc')
}

export function reserveCurrentValue(
  positions: { purpose?: string; currentValue: number }[]
): number {
  return positions.reduce((s, p) => (isReserve(p.purpose) ? s + p.currentValue : s), 0)
}

export default function ReserveCard({ current }: { current: number }) {
  const { monthlyCost, months, setMonthlyCost, setMonths } = useReserveStore()

  const target = monthlyCost * months
  const hasTarget = target > 0
  const progress = hasTarget ? Math.min((current / target) * 100, 100) : 0
  const gap = target - current // >0 falta, <0 excedente

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="section-head label">Proteção</p>
          <h2 className="serif text-[clamp(18px,2.6vw,22px)] tracking-[-0.01em] mt-1">
            Reserva de emergência
          </h2>
          <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
            Carteira sugerida com base nos conceitos da AUVP
          </p>
        </div>
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
          {/* Meta + progresso */}
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
                <span className="text-[var(--color-text-muted)]">Você já tem (marcado como Reserva)</span>
                <span className="font-mono font-medium text-[var(--color-text-primary)]">{fmtFull(current)}</span>
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
            </div>
          </div>

          {/* Carteira recomendada */}
          <div className="mt-5">
            <div className="section-head label mb-3">Como dividir essa reserva</div>
            <div className="flex flex-col gap-3">
              {ALLOCATION.map((s) => {
                const value = target * s.pct
                return (
                  <div
                    key={s.id}
                    className="rounded-xl border border-[var(--color-border)] p-3.5 bg-[var(--color-surface-2)]/40"
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
                      </div>
                      <span className="font-mono font-semibold text-[14px] text-[var(--color-text-primary)] flex-shrink-0">
                        {fmtFull(value)}
                      </span>
                    </div>
                    <div className="text-[12px] text-[var(--color-text-primary)] pl-[18px]">{s.vehicle}</div>
                    <div className="text-[11px] text-[var(--color-text-muted)] pl-[18px] mt-0.5">{s.note}</div>
                  </div>
                )
              })}
            </div>
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
    </div>
  )
}
