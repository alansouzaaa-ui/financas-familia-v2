import type { HealthScore } from '@/types/finance'

interface Props { score: HealthScore }

export default function HealthScoreCard({ score }: Props) {
  const pct = score.score

  const segments = [
    { label: 'Crítico',    color: '#993C1D', from: 0,  to: 20 },
    { label: 'Atenção',    color: '#D85A30', from: 20, to: 40 },
    { label: 'Regular',    color: '#BA7517', from: 40, to: 60 },
    { label: 'Bom',        color: '#185FA5', from: 60, to: 80 },
    { label: 'Excelente',  color: '#0F6E56', from: 80, to: 100 },
  ]

  return (
    <div className="card">
      <div className="label mb-3">Score de Saúde Financeira</div>
      <div className="flex items-end gap-4">
        <div>
          <div className="font-mono font-semibold text-[40px] leading-none" style={{ color: score.color }}>
            {pct}
          </div>
          <div className="text-[13px] font-medium mt-1" style={{ color: score.color }}>{score.label}</div>
        </div>
        <div className="flex-1 pb-1">
          {/* Progress bar with segments */}
          <div className="relative h-2 rounded-full overflow-hidden bg-[var(--color-surface-2)] mb-2">
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: score.color }}
            />
          </div>
          <div className="flex gap-0.5">
            {segments.map(s => (
              <div
                key={s.label}
                className="flex-1 text-center text-[9px] font-medium"
                style={{ color: pct >= s.from && pct < s.to ? s.color : 'var(--color-border)' }}
              >
                {s.label}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="bg-[var(--color-surface-2)] rounded-[8px] px-3 py-2">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">Taxa de Poupança</div>
          <div className={`font-mono font-semibold text-[13px] mt-0.5 ${score.savingsRate >= 10 ? 'pos' : 'neg'}`}>
            {score.savingsRate.toFixed(1)}%
          </div>
        </div>
        <div className="bg-[var(--color-surface-2)] rounded-[8px] px-3 py-2">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">Cartões / Receita</div>
          <div className={`font-mono font-semibold text-[13px] mt-0.5 ${score.cardRatio <= 40 ? 'pos' : 'neg'}`}>
            {score.cardRatio.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  )
}
