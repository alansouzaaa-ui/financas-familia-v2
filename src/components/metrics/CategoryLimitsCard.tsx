import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import { useBudgetStore } from '@/stores/useBudgetStore'
import { computeBudget, splitBudgetLines, suggestLimits, suggestionBasis, type BudgetLine } from '@/lib/budget'
import { fmtFull } from '@/lib/formatters'
import { MONTHS } from '@/types/finance'
import LimitInput from './LimitInput'

const money = (n: number) => (n < 0 ? '−' : '') + fmtFull(n)
const barColor = (s: BudgetLine['status']) =>
  s === 'estourado' ? 'var(--color-neg)' : s === 'alerta' ? 'var(--color-accent)' : 'var(--color-pos)'
const linkBtn = 'text-[12px] underline underline-offset-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors'
const actionBtn = `${linkBtn} inline-flex items-center min-h-[40px] px-1`

export default function CategoryLimitsCard() {
  const allMonths = useFinanceStore(s => s.allMonths)
  const tags = useCategoriesStore(s => s.tags)
  const limits = useBudgetStore(s => s.limits)
  const setLimit = useBudgetStore(s => s.setLimit)
  const applySuggested = useBudgetStore(s => s.applySuggested)
  const clearAll = useBudgetStore(s => s.clearAll)

  const [editing, setEditing] = useState(false)
  const [showFixed, setShowFixed] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fixedId = useId()
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const now = new Date()
  const month = allMonths.find(m => m.year === now.getFullYear() && MONTHS.indexOf(m.month) === now.getMonth())
  const items = useMemo(() => month?.items ?? [], [month])
  const hasItems = items.length > 0

  const summary = useMemo(() => computeBudget(items, limits, tags), [items, limits, tags])
  const { variable, fixed } = useMemo(() => splitBudgetLines(summary.lines, items, tags), [summary, items, tags])
  const fixedOver = fixed.filter(l => l.status === 'estourado').length
  const fixedAlert = fixed.filter(l => l.status === 'alerta').length
  const fixedSpent = fixed.reduce((s, l) => s + l.spent, 0)

  const flash = (msg: string) => {
    setFeedback(msg)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setFeedback(null), 4000)
  }

  const onSuggest = () => {
    const sug = suggestLimits(allMonths, new Date(), tags, 3)
    if (Object.keys(sug).length === 0) { flash('Sem histórico suficiente para sugerir'); return }
    applySuggested(sug, false)
    const basis = suggestionBasis(allMonths, new Date(), 3)
    const labels = basis.map(m => m.label).reverse().join(', ')
    flash(
      basis.length >= 3
        ? `Limites sugeridos pela média de ${labels}`
        : `Sugestão baseada em só ${basis.length === 1 ? '1 mês' : basis.length + ' meses'} (${labels}) — ajuste os limites à mão`,
    )
  }

  const onClear = () => {
    if (window.confirm('Remover todos os limites de orçamento?')) clearAll()
  }

  const renderLine = (l: BudgetLine) => {
    const pct = l.pct ?? 0
    return (
      <div key={l.key}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-[13px] flex items-center gap-1.5">
            <span aria-hidden="true">{l.emoji}</span>
            <span className="truncate">{l.label}</span>
          </div>
          {editing ? (
            <LimitInput key={`${l.key}:${l.limit}`} value={l.limit} label={l.label} onCommit={v => setLimit(l.key, v)} />
          ) : (
            <div className="font-mono text-[12px] text-right flex-shrink-0">
              {fmtFull(l.spent)}
              {l.limit !== null && <span className="text-[var(--color-text-muted)]"> de {fmtFull(l.limit)}</span>}
            </div>
          )}
        </div>
        <div className="mt-1.5 h-1.5 rounded-full overflow-hidden bg-[var(--color-surface-2)]">
          {l.limit !== null && (
            <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: barColor(l.status) }} />
          )}
        </div>
        <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
          {l.limit === null ? (
            <>
              {!editing && <button type="button" className={`${linkBtn} min-h-[40px]`} onClick={() => setEditing(true)}>definir limite</button>}
              {l.pending > 0 && <span>{!editing && ' · '}+ {fmtFull(l.pending)} a pagar</span>}
            </>
          ) : l.status === 'estourado' ? (
            <span><span className="neg">estourou {fmtFull(l.spent - l.limit)} ({Math.round(pct)}%)</span>{l.pending > 0 && ` · + ${fmtFull(l.pending)} a pagar`}</span>
          ) : (
            <span>
              {Math.round(pct)}% · restam {fmtFull(l.limit - l.spent)}
              {l.pending > 0 && ` · + ${fmtFull(l.pending)} a pagar`}
              {l.projectedOver && <span style={{ color: 'var(--color-accent)' }}> · passa do limite se tudo for pago</span>}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="card mb-4 min-w-0">
      <p className="section-head label">Limites do mês</p>
      <h2 className="serif text-[18px] mt-1">{month ? `Limites de ${month.label}` : 'Limites do mês'}</h2>

      {!hasItems ? (
        <p className="text-[13px] text-[var(--color-text-muted)] mt-4">Nenhum lançamento neste mês.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-1 text-[12px]">
            {summary.plannedSurplus !== null && (
              <div>
                Sobra planejada:{' '}
                <strong className={`font-mono ${summary.plannedSurplus >= 0 ? 'pos' : 'neg'}`}>{money(summary.plannedSurplus)}</strong>{' '}
                <span className="text-[var(--color-text-muted)]">receita − orçado</span>
              </div>
            )}
            {summary.overCount > 0 && (
              <div className="neg font-medium">
                {summary.overCount} {summary.overCount === 1 ? 'categoria estourada' : 'categorias estouradas'}
              </div>
            )}
            {summary.alertCount > 0 && (
              <div style={{ color: 'var(--color-accent)' }}>{summary.alertCount} perto do limite</div>
            )}
          </div>

          {summary.pending > 0 && (
            <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
              Conta só o que já está pago. {fmtFull(summary.pending)} lançado ainda a pagar.
            </p>
          )}

          <div className="mt-2 flex items-center gap-x-3 flex-wrap">
            <button type="button" className={actionBtn} onClick={() => setEditing(e => !e)}>
              {editing ? 'Concluir edição' : 'Editar limites'}
            </button>
            <button type="button" className={actionBtn} onClick={onSuggest}>Sugerir pelo histórico</button>
            {editing && <button type="button" className={actionBtn} onClick={onClear}>Limpar todos</button>}
          </div>
          {feedback && <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5" role="status">{feedback}</p>}

          <div className="mt-4 flex flex-col gap-4" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
            {variable.map(renderLine)}
          </div>

          {fixed.length > 0 && (
            <div className="mt-4" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 8 }}>
              <button
                type="button"
                aria-expanded={showFixed}
                aria-controls={fixedId}
                onClick={() => setShowFixed(v => !v)}
                className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left text-[13px]"
              >
                <span className="flex items-center gap-x-1.5 gap-y-0.5 min-w-0 flex-wrap">
                  <span aria-hidden="true">{showFixed ? '▾' : '▸'}</span>
                  <span className="font-medium">Fixos</span>
                  <span className="text-[11px] text-[var(--color-text-muted)] whitespace-nowrap">· {fixed.length}</span>
                  {fixedOver > 0 && (
                    <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: 'var(--color-neg)' }}>
                      · {fixedOver} {fixedOver === 1 ? 'estourada' : 'estouradas'}
                    </span>
                  )}
                  {fixedAlert > 0 && (
                    <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: 'var(--color-accent)' }}>
                      · {fixedAlert} perto do limite
                    </span>
                  )}
                </span>
                <span className="font-mono text-[12px] flex-shrink-0">{fmtFull(fixedSpent)}</span>
              </button>
              <div id={fixedId} hidden={!showFixed} className="mt-3 flex flex-col gap-4">
                {showFixed && fixed.map(renderLine)}
              </div>
            </div>
          )}

          {summary.inferredCount > 0 && (
            <p className="mt-4 text-[11px] text-[var(--color-text-muted)]">
              {summary.inferredCount} {summary.inferredCount === 1 ? 'lançamento sem categoria foi classificado' : 'lançamentos sem categoria foram classificados'} pela descrição — categorize-os em Lançar para mais precisão.
            </p>
          )}
        </>
      )}
    </div>
  )
}
