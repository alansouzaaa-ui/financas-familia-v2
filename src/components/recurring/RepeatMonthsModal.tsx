import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useRecurringStore } from '@/stores/useRecurringStore'
import { fmtFull } from '@/lib/formatters'
import { CATEGORY_LABELS, MONTHS, MONTH_NAMES, type MonthAbbr, type MonthItem, type RecurringItem } from '@/types/finance'
import {
  applySeriesPlan, nextN, planIsEmpty, planSeries, seriesState, untilDecember, ym,
  type SeriesState, type Ym,
} from '@/lib/recurringSeries'

export interface RepeatTemplate {
  description: string
  value: number
  category: MonthItem['category']
  tag?: string
  cardId?: string
}

interface Props {
  template: RepeatTemplate
  /** Série existente. Sem ela, a série é criada ao confirmar. */
  ruleId?: string
  /** Mês do lançamento original (vive no formulário do Lançar): fica marcado e travado. */
  anchor?: { year: number; month: MonthAbbr }
  onClose: () => void
  /** Resumo curto para um toast */
  onApplied: (summary: string) => void
  /** Chamado quando a série foi criada aqui — quem tem o item âncora deve vinculá-lo */
  onLinked?: (ruleId: string) => void
}

type CellState = 'anchor' | 'paid' | 'launched' | 'adding' | 'removing' | 'off'

const EMPTY_STATE = (() => { const s = new Map() as SeriesState; s.duplicates = 0; return s })()

function parseMoney(s: string): number {
  const t = s.trim()
  if (!t) return 0
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = parseFloat(norm)
  return isFinite(n) ? Math.round(n * 100) / 100 : 0
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const CELL_STYLE: Record<CellState, string> = {
  anchor:   'bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] ring-2 ring-offset-2 ring-[var(--color-primary)] ring-offset-[var(--color-surface)] cursor-default',
  paid:     'bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] opacity-80 cursor-default',
  launched: 'bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] hover:opacity-90',
  adding:   'bg-[var(--color-primary-tint)] text-[var(--color-primary)] border-[var(--color-primary)] border-dashed hover:bg-[var(--color-primary-tint)] hover:opacity-90',
  removing: 'bg-transparent text-[var(--color-neg)] border-[var(--color-neg)] hover:bg-[var(--color-neg)]/10',
  off:      'bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
}

const CELL_HINT: Record<CellState, string> = {
  anchor: 'Mês do lançamento original',
  paid: 'Pago — não pode ser removido',
  launched: 'Já lançado — toque para remover',
  adding: 'Será lançado — toque para desfazer',
  removing: 'Será removido — toque para manter',
  off: 'Toque para lançar neste mês',
}

export default function RepeatMonthsModal({ template, ruleId, anchor, onClose, onApplied, onLinked }: Props) {
  const allMonths = useFinanceStore(s => s.allMonths)
  const rules = useRecurringStore(s => s.items)

  // Id da série: o existente, ou um novo (só vira regra ao confirmar)
  const [id] = useState(() => ruleId ?? crypto.randomUUID())
  const existingRule = rules.find(r => r.id === id)

  const now = new Date()
  const nowYm = ym(now.getFullYear(), MONTHS[now.getMonth()])
  const anchorYm = anchor ? ym(anchor.year, anchor.month) : undefined

  const state = useMemo<SeriesState>(() => (ruleId ? seriesState(allMonths, ruleId) : EMPTY_STATE), [allMonths, ruleId])

  const [selected, setSelected] = useState<Set<Ym>>(() => {
    const s = new Set<Ym>(state.keys())
    if (anchorYm) s.add(anchorYm)
    return s
  })
  const [valueStr, setValueStr] = useState(() => String(template.value).replace('.', ','))
  const [updateExisting, setUpdateExisting] = useState(true)

  const minYear = Math.min(now.getFullYear() - 1, anchor?.year ?? 9999, ...[...state.keys()].map(k => parseInt(k.slice(0, 4), 10)))
  const maxYear = Math.max(now.getFullYear() + 2, anchor?.year ?? 0, ...[...state.keys()].map(k => parseInt(k.slice(0, 4), 10)))
  const [viewYear, setViewYear] = useState(() => {
    const y = anchor?.year ?? now.getFullYear()
    return Math.min(Math.max(y, minYear), maxYear)
  })

  const valueNum = parseMoney(valueStr)
  const valueOk = valueNum > 0
  const valueChanged = valueOk && Math.abs(valueNum - template.value) >= 0.005

  const unpaidExisting = useMemo(
    () => [...state.entries()].filter(([k, e]) => !e.isPaid && k !== anchorYm).length,
    [state, anchorYm],
  )
  const showUpdateBox = valueChanged && unpaidExisting > 0

  const plan = useMemo(() => planSeries({
    ruleId: id, state, selected, anchorYm,
    template, newValue: valueOk ? valueNum : template.value,
    updateExistingUnpaid: showUpdateBox && updateExisting,
  }), [id, state, selected, anchorYm, template, valueNum, valueOk, showUpdateBox, updateExisting])

  const noChanges = planIsEmpty(plan)
  const canConfirm = valueOk && !noChanges

  function cellState(k: Ym): CellState {
    if (k === anchorYm) return 'anchor'
    const e = state.get(k)
    const sel = selected.has(k)
    if (e) return e.isPaid ? 'paid' : sel ? 'launched' : 'removing'
    return sel ? 'adding' : 'off'
  }

  function toggle(k: Ym) {
    const st = cellState(k)
    if (st === 'anchor' || st === 'paid') return
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k); else n.add(k)
      return n
    })
  }

  const base = anchorYm ?? nowYm
  function addMany(list: Ym[]) {
    setSelected(prev => new Set([...prev, ...list]))
    setViewYear(Math.min(Math.max(parseInt(base.slice(0, 4), 10), minYear), maxYear))
  }
  const removableSelected = [...selected].filter(k => k !== anchorYm && !state.get(k)?.isPaid)
  function clearRemovable() {
    setSelected(prev => new Set([...prev].filter(k => k === anchorYm || !!state.get(k)?.isPaid)))
  }

  const selectedInView = [...selected].filter(k => k.startsWith(`${viewYear}-`)).length

  // ── Resumo ao vivo ──────────────────────────────────────────────────────
  const parts: string[] = []
  if (plan.add.length) parts.push(`lançar em ${plural(plan.add.length, 'mês', 'meses')}`)
  if (plan.remove.length) parts.push(`tirar de ${plural(plan.remove.length, 'mês', 'meses')}`)
  if (plan.update.length) parts.push(`atualizar o valor em ${plural(plan.update.length, 'mês', 'meses')}`)
  const summary = parts.length
    ? `Vai ${parts.join(' · ')}`
    : ruleId ? 'Nenhuma mudança' : 'Toque nos meses em que este lançamento deve aparecer.'

  const confirmLabel =
    !parts.length
      ? (ruleId ? 'Sem alterações' : 'Escolha os meses')
      : plan.add.length > 0 && !plan.remove.length && !plan.update.length
        ? `Lançar em ${plural(plan.add.length, 'mês', 'meses')}`
        : 'Salvar alterações'

  function confirm() {
    if (!canConfirm) return
    const rulesApi = useRecurringStore.getState()
    const current = rulesApi.items.find(r => r.id === id)
    const rule: RecurringItem = current
      ? { ...current, value: valueNum, isActive: current.isActive || plan.add.length > 0 }
      : {
          id, description: template.description, value: valueNum, category: template.category, isActive: true,
          ...(template.tag ? { tag: template.tag } : {}),
          ...(template.category === 'cards' && template.cardId ? { cardId: template.cardId } : {}),
        }
    rulesApi.upsertRule(rule)

    const fin = useFinanceStore.getState()
    applySeriesPlan(plan, {
      upsertItem: fin.upsertItem,
      removeItem: fin.removeItem,
      getItem: (y, m, itemId) => useFinanceStore.getState().allMonths.find(r => r.year === y && r.month === m)?.items?.find(i => i.id === itemId),
    })
    if (!ruleId) onLinked?.(id)

    const done: string[] = []
    if (plan.add.length) done.push(`+${plural(plan.add.length, 'mês lançado', 'meses lançados')}`)
    if (plan.remove.length) done.push(`${plural(plan.remove.length, 'mês removido', 'meses removidos')}`)
    if (plan.update.length) done.push(`valor atualizado em ${plural(plan.update.length, 'mês', 'meses')}`)
    onApplied(`${template.description}: ${done.join(' · ')}`)
    onClose()
  }

  // ── Diálogo: foco, Esc, trap de Tab, scroll do body ─────────────────────
  const panelRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // No celular, focar o campo abriria o teclado por cima da grade de meses
    const coarse = window.matchMedia?.('(pointer: coarse)').matches
    if (coarse) panelRef.current?.focus()
    else { valueRef.current?.focus(); valueRef.current?.select() }
    return () => {
      document.body.style.overflow = prevOverflow
      prevFocus?.focus?.()
    }
  }, [])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (e.key !== 'Tab' || !panelRef.current) return
    const els = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    if (els.length === 0) return
    const first = els[0], last = els[els.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const titleId = 'repeat-months-title'

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onKeyDown={onKeyDown}>
      <div className="fixed inset-0 bg-black/50 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full sm:max-w-[440px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92dvh] flex flex-col animate-slide-up outline-none"
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[17px] font-semibold">Repetir lançamento</h2>
            <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5 truncate">
              <span className="text-[var(--color-text-primary)] font-medium">{template.description}</span>
              {' · '}{CATEGORY_LABELS[template.category]}{' · '}
              <span className="font-mono">{fmtFull(template.value)}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-10 h-10 sm:w-8 sm:h-8 -mr-1.5 -mt-1 flex items-center justify-center rounded-[8px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors flex-shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Corpo */}
        <div className="px-5 pb-4 flex flex-col gap-4 overflow-y-auto">
          <p className="text-[12.5px] text-[var(--color-text-muted)] -mt-1">
            Escolha em quais meses este lançamento deve aparecer. Meses já pagos ficam como estão.
          </p>

          {/* Valor */}
          <div>
            <label htmlFor="repeat-value" className="label block mb-1.5">Valor por mês</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-mono text-[var(--color-text-muted)]">R$</span>
              <input
                id="repeat-value"
                ref={valueRef}
                type="text" inputMode="decimal" placeholder="0,00"
                value={valueStr}
                onChange={e => setValueStr(e.target.value)}
                aria-invalid={!valueOk}
                className={`w-full pl-11 pr-3 py-2.5 text-[18px] font-mono font-semibold bg-[var(--color-surface-2)] border rounded-[12px] outline-none focus:border-[var(--color-text-primary)] text-[var(--color-text-primary)] ${valueOk ? 'border-[var(--color-border)]' : 'border-[var(--color-neg)]'}`}
              />
            </div>
            {!valueOk && <p className="text-[11.5px] neg mt-1">Informe um valor maior que zero.</p>}
            {valueOk && anchor && valueChanged && (
              <p className="text-[11.5px] text-[var(--color-text-muted)] mt-1">O lançamento original continua com o valor atual.</p>
            )}
          </div>

          {/* Navegador de ano */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="label" id="repeat-months-label">Meses</span>
              <div className="flex items-center gap-1" role="group" aria-label="Ano">
                <button
                  onClick={() => setViewYear(y => y - 1)}
                  disabled={viewYear <= minYear}
                  aria-label="Ano anterior"
                  className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-[8px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M9 2.5L4.5 7 9 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <span className="min-w-[78px] text-center text-[15px] font-semibold font-mono flex items-center justify-center gap-1.5" aria-live="polite">
                  {viewYear}
                  {selectedInView > 0 && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--color-primary-tint)] text-[var(--color-primary)] font-sans"
                      title={`${plural(selectedInView, 'mês selecionado', 'meses selecionados')} em ${viewYear}`}
                    >
                      {selectedInView}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => setViewYear(y => y + 1)}
                  disabled={viewYear >= maxYear}
                  aria-label="Próximo ano"
                  className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-[8px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M5 2.5L9.5 7 5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </div>

            {/* Grade de meses */}
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2" role="group" aria-labelledby="repeat-months-label">
              {MONTHS.map(m => {
                const k = ym(viewYear, m)
                const st = cellState(k)
                const locked = st === 'anchor' || st === 'paid'
                const isNow = k === nowYm
                const pressed = st === 'anchor' || st === 'paid' || st === 'launched' || st === 'adding'
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggle(k)}
                    aria-pressed={pressed}
                    aria-disabled={locked || undefined}
                    aria-label={`${MONTH_NAMES[m]} de ${viewYear}${isNow ? ' (mês atual)' : ''}: ${CELL_HINT[st]}`}
                    title={CELL_HINT[st]}
                    className={`relative min-h-[48px] rounded-[10px] border text-[13px] font-semibold flex flex-col items-center justify-center leading-tight transition-colors ${CELL_STYLE[st]}`}
                  >
                    <span className={st === 'removing' ? 'line-through' : ''}>{m}</span>
                    <span className="text-[10px] font-medium h-[12px] flex items-center gap-0.5 opacity-90" aria-hidden="true">
                      {st === 'anchor' && 'este'}
                      {st === 'paid' && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      )}
                      {st === 'adding' && '+ novo'}
                      {st === 'removing' && '− tirar'}
                    </span>
                    {isNow && (
                      <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Ações rápidas */}
            <div className="flex flex-wrap gap-2 mt-3">
              <QuickChip onClick={() => addMany(untilDecember(base))}>Até dezembro</QuickChip>
              <QuickChip onClick={() => addMany(nextN(base, 12))}>Próximos 12 meses</QuickChip>
              <QuickChip onClick={clearRemovable} disabled={removableSelected.length === 0}>Limpar</QuickChip>
            </div>
          </div>

          {showUpdateBox && (
            <label className="flex items-start gap-2.5 text-[13px] cursor-pointer select-none rounded-[10px] bg-[var(--color-surface-2)] px-3 py-2.5">
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={e => setUpdateExisting(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-[var(--color-primary)] flex-shrink-0"
              />
              <span>Atualizar o valor nos meses já lançados que não estão pagos</span>
            </label>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex-shrink-0 border-t border-[var(--color-border)] px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p
            className={`text-[12.5px] mb-3 min-h-[18px] ${noChanges ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)] font-medium'}`}
            aria-live="polite"
          >
            {summary}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-[10px] text-[14px] font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={confirm}
              disabled={!canConfirm}
              className="flex-[1.4] py-2.5 rounded-[10px] text-[14px] font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {confirmLabel}
            </button>
          </div>
          {existingRule && !existingRule.isActive && plan.add.length > 0 && (
            <p className="text-[11.5px] text-[var(--color-text-muted)] mt-2">Esta série estava encerrada; ao lançar novos meses ela volta a ficar ativa.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function QuickChip({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-10 sm:h-8 px-3 rounded-full text-[12px] font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
    >
      {children}
    </button>
  )
}
