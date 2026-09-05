import type { HealthScore } from '@/types/finance'

interface Props { score: HealthScore }

const SEGMENTS = [
  { label: 'Crítico',   color: '#993C1D', from: 0,  to: 20 },
  { label: 'Atenção',   color: '#D85A30', from: 20, to: 40 },
  { label: 'Regular',   color: '#BA7517', from: 40, to: 60 },
  { label: 'Bom',       color: '#185FA5', from: 60, to: 80 },
  { label: 'Excelente', color: '#0F6E56', from: 80, to: 100 },
]

export default function HealthScoreCard({ score }: Props) {
  const pct = score.score
  const activeIdx = SEGMENTS.findIndex(s => pct >= s.from && pct < s.to)

  return (
    <div className="card h-full flex flex-col">
      <div className="section-head label mb-4">Saúde financeira</div>

      <div className="flex items-baseline gap-2">
        <span className="font-mono tnum font-medium text-[46px] leading-none tracking-[-0.02em]" style={{ color: score.color }}>
          {pct}
        </span>
        <span className="text-[13px] text-[var(--color-text-muted)]">/ 100</span>
        <span className="ml-auto text-[13px] font-semibold" style={{ color: score.color }}>{score.label}</span>
      </div>

      {/* Trilho segmentado — a faixa ativa acende, as demais ficam em brasa fraca */}
      <div className="flex gap-1 mt-4">
        {SEGMENTS.map((s, i) => (
          <div
            key={s.label}
            className="flex-1 h-1.5 rounded-full transition-colors duration-500"
            style={{ background: i <= activeIdx ? s.color : 'var(--color-surface-3)', opacity: i <= activeIdx ? 1 : 1 }}
            title={s.label}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-auto pt-4">
        {[
          { k: 'Poupança', v: score.savingsRate, good: score.savingsRate >= 10 },
          { k: 'Cartões / receita', v: score.cardRatio, good: score.cardRatio <= 40 },
        ].map(t => (
          <div key={t.k} className="bg-[var(--color-surface-2)] rounded-[10px] px-3 py-2.5">
            <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.06em] leading-tight">{t.k}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.good ? 'var(--color-pos)' : 'var(--color-neg)' }} />
              <span className={`font-mono tnum font-semibold text-[14px] ${t.good ? 'pos' : 'neg'}`}>{t.v.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
