import { useState } from 'react'
import { useChecklistStore } from '@/stores/useChecklistStore'
import { isRated, scoreOf, tierOf, type ChecklistKind, type Tier } from '@/lib/checklist'
import { useAssetScores, TIER_COLORS, TIER_LABELS, fmtScore } from './useAssetScores'

const PYRAMID: { tier: Tier; width: string }[] = [
  { tier: 'arriscado', width: '45%' },
  { tier: 'bom', width: '72%' },
  { tier: 'robusto', width: '100%' },
]

function TierBadge({ tier }: { tier: Tier }) {
  const c = TIER_COLORS[tier]
  return (
    <span
      className="text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}
    >
      {TIER_LABELS[tier]}
    </span>
  )
}

function AnswerSwitch({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean | null) => void }) {
  const opts: { label: string; v: boolean | null; active: boolean; color: string }[] = [
    { label: 'Sim', v: true, active: value === true, color: 'var(--color-pos)' },
    { label: 'Não', v: false, active: value === false, color: 'var(--color-neg)' },
    { label: '—', v: null, active: value === undefined, color: 'var(--color-text-muted)' },
  ]
  return (
    <div className="inline-flex rounded-lg border border-[var(--color-border)] overflow-hidden flex-shrink-0" role="group">
      {opts.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onChange(o.v)}
          aria-pressed={o.active}
          className="px-3 py-1.5 text-[12px] font-medium transition-colors min-w-[40px]"
          style={
            o.active
              ? { background: `color-mix(in srgb, ${o.color} 18%, transparent)`, color: o.color }
              : { color: 'var(--color-text-muted)' }
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function QuestionEditor({ kind }: { kind: ChecklistKind }) {
  const questions = useChecklistStore((s) => s.questions[kind])
  const addQuestion = useChecklistStore((s) => s.addQuestion)
  const updateQuestion = useChecklistStore((s) => s.updateQuestion)
  const removeQuestion = useChecklistStore((s) => s.removeQuestion)
  const resetQuestions = useChecklistStore((s) => s.resetQuestions)
  const [draft, setDraft] = useState('')
  const add = () => {
    if (!draft.trim()) return
    addQuestion(kind, draft)
    setDraft('')
  }
  return (
    <div className="flex flex-col gap-2">
      {questions.map((q) => (
        <div key={`${q.id}:${q.text}`} className="flex items-center gap-2">
          <input
            defaultValue={q.text}
            maxLength={140}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (!v) e.target.value = q.text
              else if (v !== q.text) updateQuestion(kind, q.id, v)
            }}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-[13px] rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
          />
          <button
            type="button"
            aria-label="Remover pergunta"
            onClick={() => {
              if (window.confirm('Remover esta pergunta? As respostas dela serão apagadas.')) removeQuestion(kind, q.id)
            }}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-neg)] hover:bg-[var(--color-surface-2)] flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 mt-1">
        <input
          value={draft}
          maxLength={140}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Nova pergunta (sim/não)"
          className="flex-1 min-w-0 px-2.5 py-1.5 text-[13px] rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-1.5 text-[12px] font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-primary)] flex-shrink-0"
        >
          Adicionar pergunta
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          if (window.confirm('Restaurar as perguntas padrão? Suas edições nesta lista serão perdidas.')) resetQuestions(kind)
        }}
        className="self-start text-[12px] text-[var(--color-primary)] hover:underline mt-1"
      >
        Restaurar padrão
      </button>
    </div>
  )
}

export default function ChecklistCard({
  positions,
  open,
  onToggle,
}: {
  positions: { ticker: string; assetType: string }[]
  open: boolean
  onToggle: () => void
}) {
  const { items } = useAssetScores(positions)
  const questions = useChecklistStore((s) => s.questions)
  const answers = useChecklistStore((s) => s.answers)
  const setAnswer = useChecklistStore((s) => s.setAnswer)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editKind, setEditKind] = useState<ChecklistKind>('acao')

  const m = items.length
  const n = items.filter((i) => i.tier !== 'sem-nota').length
  const noScore = items.filter((i) => i.tier === 'sem-nota')
  const subtitle =
    m === 0
      ? 'Adicione ações ou FIIs para avaliá-los'
      : n === 0
        ? 'Avalie suas ações e FIIs com um checklist'
        : `${n} ${n === 1 ? 'avaliado' : 'avaliados'} de ${m} · pirâmide de risco`

  return (
    <div className="card">
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="section-head label">Estratégia</p>
          <h2 className="serif text-[clamp(18px,2.6vw,22px)] tracking-[-0.01em] mt-1">Nota dos ativos</h2>
          <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>
        </div>
        <svg
          width="18" height="18" viewBox="0 0 14 14" fill="none"
          className={`flex-shrink-0 text-[var(--color-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M3.5 5.5L7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          <div className="mt-4 flex flex-col items-center gap-1.5">
            {PYRAMID.map(({ tier, width }) => {
              const list = items.filter((i) => i.tier === tier)
              const c = TIER_COLORS[tier]
              return (
                <div
                  key={tier}
                  className="rounded-xl px-3 py-2.5 text-center"
                  style={{
                    width,
                    minWidth: 130,
                    maxWidth: '100%',
                    background: `color-mix(in srgb, ${c} 14%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`,
                  }}
                >
                  <div className="text-[12px] font-semibold" style={{ color: c }}>
                    {TIER_LABELS[tier]} <span className="font-mono font-normal">({list.length})</span>
                  </div>
                  {list.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                      {list.map((i) => (
                        <span
                          key={i.ticker}
                          className="font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--color-surface)] text-[var(--color-text-primary)]"
                        >
                          {i.ticker} <span style={{ color: c }}>{fmtScore(i.score)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {noScore.length > 0 && (
            <p className="text-[12px] text-[var(--color-text-muted)] mt-3 text-center">
              Sem nota / em avaliação: <span className="font-mono">{noScore.map((i) => i.ticker).join(', ')}</span>
            </p>
          )}
          <p className="text-[11px] text-[var(--color-text-muted)] mt-2">
            Base larga = ativos robustos. O aporte prioriza notas altas (ativos com nota ≤ 0 não recebem aporte).
          </p>

          {items.length > 0 && (
            <div className="mt-5 pt-4 border-t border-[var(--hairline)]">
              <div className="section-head label mb-2">Avaliar ativos</div>
              <div className="flex flex-col">
                {items.map((it) => {
                  const isOpen = expanded === it.ticker
                  const qs = questions[it.kind]
                  const ans = answers[it.ticker]
                  const live = scoreOf(qs, ans)
                  const liveTier = tierOf(live.score, live.answered, live.total)
                  return (
                    <div key={it.ticker} className="border-b border-[var(--hairline)] last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : it.ticker)}
                        aria-expanded={isOpen}
                        className="w-full flex items-center justify-between gap-3 py-2.5 text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-semibold text-[14px] text-[var(--color-text-primary)]">{it.ticker}</span>
                          <TierBadge tier={it.tier} />
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[11px] text-[var(--color-text-muted)] text-right">
                            {isRated(it.answered, it.total)
                              ? `nota ${fmtScore(it.score)} · `
                              : it.answered > 0 ? `em avaliação · ` : ''}
                            {it.answered}/{it.total} respondidas
                          </span>
                          <svg
                            width="14" height="14" viewBox="0 0 14 14" fill="none"
                            className={`text-[var(--color-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          >
                            <path d="M3.5 5.5L7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="pb-3">
                          <div className="flex items-center gap-2 mb-2 text-[12px]">
                            <span className="text-[var(--color-text-muted)]">Placar:</span>
                            <span className="font-mono font-semibold" style={{ color: TIER_COLORS[liveTier] }}>
                              {live.answered > 0 ? fmtScore(live.score) : '—'}
                            </span>
                            <TierBadge tier={liveTier} />
                            {!isRated(live.answered, live.total) && (
                              <span className="text-[11px] text-[var(--color-text-muted)]">
                                responda mais {Math.ceil(live.total / 2) - live.answered} para a nota valer
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col gap-2">
                            {qs.map((q) => (
                              <div key={q.id} className="flex items-center justify-between gap-3">
                                <span className="text-[13px] text-[var(--color-text-primary)] min-w-0">{q.text}</span>
                                <AnswerSwitch value={ans?.[q.id]} onChange={(v) => setAnswer(it.ticker, q.id, v)} />
                              </div>
                            ))}
                            {qs.length === 0 && (
                              <p className="text-[12px] text-[var(--color-text-muted)]">Nenhuma pergunta cadastrada.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <details className="mt-5 pt-4 border-t border-[var(--hairline)]">
            <summary className="cursor-pointer text-[13px] font-medium text-[var(--color-text-primary)]">
              Personalizar perguntas
            </summary>
            <div className="mt-3">
              <div className="flex gap-1.5 mb-3">
                {(['acao', 'fii'] as ChecklistKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setEditKind(k)}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
                      editKind === k
                        ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                        : 'border-[var(--color-border)] text-[var(--color-text-muted)]'
                    }`}
                  >
                    {k === 'acao' ? 'Ações' : 'FIIs'}
                  </button>
                ))}
              </div>
              <QuestionEditor key={editKind} kind={editKind} />
              <p className="text-[11px] text-[var(--color-text-muted)] mt-3">
                Perguntas sugeridas (fundamentalistas clássicas) — não são o checklist oficial da AUVP. Ajuste ao seu critério.
              </p>
            </div>
          </details>
        </>
      )}
    </div>
  )
}
