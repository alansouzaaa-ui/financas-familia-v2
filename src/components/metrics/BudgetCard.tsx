import { useEffect, useMemo, useRef, useState } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import { useBudgetStore } from '@/stores/useBudgetStore'
import { computeBudget, suggestLimits, suggestionBasis, type BudgetLine } from '@/lib/budget'
import { fmtFull } from '@/lib/formatters'
import { MONTHS } from '@/types/finance'

const money = (n: number) => (n < 0 ? '−' : '') + fmtFull(n)
const barColor = (s: BudgetLine['status']) =>
  s === 'estourado' ? 'var(--color-neg)' : s === 'alerta' ? 'var(--color-accent)' : 'var(--color-pos)'
const linkBtn = 'text-[12px] underline underline-offset-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors'

function LimitInput({ value, onCommit, label }: { value: number | null; onCommit: (v: number | null) => void; label: string }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  const commit = () => {
    const n = parseFloat(draft.replace(',', '.'))
    onCommit(Number.isFinite(n) && n > 0 ? n : null)
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`Limite de ${label}`}
      placeholder="sem limite"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur() } }}
      className="w-28 px-2 py-1 text-[12px] font-mono text-right bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-text-primary)]"
    />
  )
}

export default function BudgetCard() {
  const allMonths = useFinanceStore(s => s.allMonths)
  const tags = useCategoriesStore(s => s.tags)
  const limits = useBudgetStore(s => s.limits)
  const setLimit = useBudgetStore(s => s.setLimit)
  const applySuggested = useBudgetStore(s => s.applySuggested)
  const clearAll = useBudgetStore(s => s.clearAll)

  const options = useMemo(
    () => allMonths
      .filter(m => (m.items?.length ?? 0) > 0)
      .map(m => ({ id: `${m.year}-${MONTHS.indexOf(m.month)}`, year: m.year, idx: MONTHS.indexOf(m.month), label: m.label, month: m }))
      .sort((a, b) => b.year * 12 + b.idx - (a.year * 12 + a.idx)),
    [allMonths]
  )

  const [picked, setPicked] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const now = new Date()
  const curId = `${now.getFullYear()}-${now.getMonth()}`
  const defaultId = options.find(o => o.id === curId)?.id ?? options[0]?.id ?? null
  const selectedId = picked && options.some(o => o.id === picked) ? picked : defaultId
  const selected = options.find(o => o.id === selectedId) ?? null

  const summary = useMemo(
    () => computeBudget(selected?.month.items ?? [], limits, tags),
    [selected, limits, tags]
  )

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

  const stat = (label: string, value: string) => (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div>
      <div className="font-mono text-[13px] sm:text-[15px] font-semibold mt-0.5 truncate">{value}</div>
    </div>
  )

  return (
    <div className="card mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="section-head label">Orçamento</p>
          <h2 className="serif text-[18px] mt-1">Orçamento do mês</h2>
        </div>
        {options.length > 0 && (
          <select
            aria-label="Mês do orçamento"
            value={selectedId ?? ''}
            onChange={e => setPicked(e.target.value)}
            className="text-[12px] px-2 py-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none focus:border-[var(--color-text-primary)]"
          >
            {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        )}
      </div>

      {!selected ? (
        <p className="text-[13px] text-[var(--color-text-muted)] mt-4">Nenhum lançamento neste mês.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mt-4">
            {stat('Receita', fmtFull(summary.revenue))}
            {stat('Orçado', summary.budgeted > 0 ? fmtFull(summary.budgeted) : '—')}
            {stat('Lançado', fmtFull(summary.spent))}
          </div>

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

          <div className="mt-3 flex items-center gap-x-4 gap-y-1 flex-wrap">
            <button type="button" className={linkBtn} onClick={() => setEditing(e => !e)}>
              {editing ? 'Concluir edição' : 'Editar limites'}
            </button>
            <button type="button" className={linkBtn} onClick={onSuggest}>Sugerir pelo histórico</button>
            {editing && <button type="button" className={linkBtn} onClick={onClear}>Limpar todos</button>}
          </div>
          {feedback && <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5" role="status">{feedback}</p>}

          <div className="mt-4 flex flex-col gap-4" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
            {summary.lines.map(l => {
              const pct = l.pct ?? 0
              return (
                <div key={l.key}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-[13px] flex items-center gap-1.5">
                      <span aria-hidden="true">{l.emoji}</span>
                      <span className="truncate">{l.label}</span>
                      {l.inferredCount > 0 && (
                        <span className="text-[11px] text-[var(--color-text-muted)] whitespace-nowrap">· {l.inferredCount} pela descrição</span>
                      )}
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
                      !editing && <button type="button" className={linkBtn} onClick={() => setEditing(true)}>definir limite</button>
                    ) : l.status === 'estourado' ? (
                      <span className="neg">estourou {fmtFull(l.spent - l.limit)} ({Math.round(pct)}%)</span>
                    ) : (
                      <span>{Math.round(pct)}% · restam {fmtFull(l.limit - l.spent)}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 text-[11px] text-[var(--color-text-muted)] flex flex-col gap-1">
            {summary.inferredCount > 0 && (
              <p>
                {summary.inferredCount} {summary.inferredCount === 1 ? 'lançamento sem categoria foi classificado' : 'lançamentos sem categoria foram classificados'} pela descrição — categorize-os em Lançar para mais precisão.
              </p>
            )}
            <p>Itens sem categoria entram no grupo contábil (ex.: Empréstimos).</p>
          </div>
        </>
      )}
    </div>
  )
}
