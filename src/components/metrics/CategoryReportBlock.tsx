import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { MonthPoint, ExpenseTag, MonthItem } from '@/types/finance'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import { useCardsStore } from '@/stores/useCardsStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { fmt } from '@/lib/formatters'
import {
  buildCategoryReport, groupByMonth, limitGroups, summarize, dayLabel,
  SEM_CAT_KEY, type ReportEntry,
} from '@/lib/categoryReport'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import ChartTooltip from '@/components/charts/ChartTooltip'

interface Props {
  months: MonthPoint[]
  compact?: boolean   // Visão Geral: mostra só o top N e um donut menor (sem drill-down)
  topN?: number
}

const SEM_CAT_COLOR = '#4B5563'
const PAGE_SIZE = 30
const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Acordeão com transição de altura/opacidade; o conteúdo só existe enquanto aberto (ou fechando). */
function AnimatedPanel({ open, id, children }: { open: boolean; id: string; children: () => ReactNode }) {
  const [prevOpen, setPrevOpen] = useState(open)
  const [lingering, setLingering] = useState(false)   // fechando: mantém o conteúdo até o fim da transição
  const [entered, setEntered] = useState(false)       // já montou aberto (permite animar 0fr -> 1fr)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setLingering(false)
    else { setLingering(true); setEntered(false) }
  }

  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
      return () => cancelAnimationFrame(raf)
    }
    if (lingering) {
      const t = setTimeout(() => setLingering(false), 260)
      return () => clearTimeout(t)
    }
  }, [open, lingering])

  if (!open && !lingering) return null
  const shown = open && entered
  return (
    <div
      id={id}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${shown ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
    >
      <div className="overflow-hidden min-h-0">{children()}</div>
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={`flex-shrink-0 text-[var(--color-text-muted)] transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

interface MovedInfo { entry: ReportEntry; fromTag?: string; toLabel: string }

export default function CategoryReportBlock({ months, compact = false, topN = 6 }: Props) {
  const tags = useCategoriesStore(s => s.tags)
  const cards = useCardsStore(s => s.accounts)
  const tagMap = useMemo(() => Object.fromEntries(tags.map(t => [t.id, t])) as Record<string, ExpenseTag>, [tags])
  const cardName = useMemo(() => Object.fromEntries(cards.map(c => [c.id, c.name])) as Record<string, string>, [cards])
  const uid = useId()
  const listRef = useRef<HTMLDivElement>(null)

  const { rows, total, semCat, semCatCount, entries } = useMemo(
    () => buildCategoryReport(months, tagMap), [months, tagMap])

  const [selected, setSelected] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [moved, setMoved] = useState<MovedInfo | null>(null)

  // Se a categoria aberta esvaziou (ex.: moveu o último item), fecha.
  const activeKey = !compact && selected && (entries[selected]?.length ?? 0) > 0 ? selected : null

  useEffect(() => {
    if (!moved) return
    const t = setTimeout(() => setMoved(null), 7000)
    return () => clearTimeout(t)
  }, [moved])

  const select = useCallback((key: string, fromChart = false) => {
    setLimit(PAGE_SIZE)
    // Clique na fatia sempre seleciona (não alterna); clique na linha alterna.
    setSelected(prev => (prev === key && !fromChart ? null : key))
    if (fromChart && listRef.current && window.matchMedia('(max-width: 1023px)').matches) {
      const el = listRef.current.querySelector(`[data-cat="${CSS.escape(key)}"]`)
      el?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' })
    }
  }, [])

  const moveItem = (entry: ReportEntry, toId: string) => {
    const to = tagMap[toId]
    if (!to) return
    useFinanceStore.getState().upsertItem(entry.year, entry.month, { ...entry.item, tag: toId })
    setMoved({ entry, fromTag: entry.item.tag, toLabel: to.label })
  }
  const undoMove = () => {
    if (!moved) return
    const { entry, fromTag } = moved
    const restored: MonthItem = { ...entry.item }
    if (fromTag) restored.tag = fromTag
    else delete restored.tag
    useFinanceStore.getState().upsertItem(entry.year, entry.month, restored)
    setMoved(null)
  }

  if (total === 0) {
    return (
      <Card title="Despesas por categoria">
        <EmptyState
          message="Nada para relatar ainda"
          hint="Marque a categoria de cada gasto ao lançar para ver para onde o dinheiro está indo."
          icon={<span className="text-[22px]">🏷️</span>}
          action={{ label: 'Categorizar lançamentos', to: '/lancar' }}
        />
      </Card>
    )
  }

  const pieData = rows.map(r => ({ key: r.id, name: r.tag.label, value: Math.round(r.value), color: r.tag.color }))
  if (semCat > 0) pieData.push({ key: SEM_CAT_KEY, name: 'Sem categoria', value: Math.round(semCat), color: SEM_CAT_COLOR })

  const shown = compact ? rows.slice(0, topN) : rows
  const restTotal = compact ? rows.slice(topN).reduce((s, r) => s + r.value, 0) : 0

  const originChips = (e: ReportEntry): string[] => {
    const chips: string[] = []
    if (e.item.category === 'cards') chips.push((e.item.cardId && cardName[e.item.cardId]) || 'Cartão')
    if (e.item.source === 'telegram') chips.push('Telegram')
    else if (e.item.source === 'import') chips.push('Fatura')
    return chips
  }

  const renderItem = (e: ReportEntry, currentKey: string) => {
    const day = dayLabel(e.item.occurredAt)
    const chips = originChips(e)
    return (
      <li key={e.item.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-[12.5px]">
        <span className="w-11 flex-shrink-0 text-[11px] text-[var(--color-text-muted)] font-mono">{day ?? e.monthLabel}</span>
        <span className="flex-1 min-w-[96px] truncate" title={e.item.description}>{e.item.description}</span>
        {chips.map(c => (
          <span key={c} className="flex-shrink-0 px-1.5 py-px rounded-full text-[10.5px] bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-muted)]">{c}</span>
        ))}
        <span className="font-mono font-medium neg flex-shrink-0 ml-auto">{fmt(e.item.value)}</span>
        <select
          aria-label={`Mudar categoria de ${e.item.description}`}
          value=""
          onChange={ev => { if (ev.target.value) moveItem(e, ev.target.value) }}
          className="basis-full sm:basis-auto sm:w-[132px] max-w-full flex-shrink-0 px-2 py-1 text-[11.5px] rounded-[8px] bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)] focus-visible:border-[var(--color-primary)] outline-none cursor-pointer transition-colors"
        >
          <option value="">Mudar categoria…</option>
          {tags.filter(t => t.id !== currentKey).map(t => (
            <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
          ))}
        </select>
      </li>
    )
  }

  const renderPanel = (key: string, color: string, label: string) => {
    const list = entries[key] ?? []
    const sum = summarize(list)
    const groups = groupByMonth(list)
    const multi = groups.length > 1
    const { groups: visible, hidden } = limitGroups(groups, limit)
    return (
      <div
        role="region" aria-label={`Lançamentos de ${label}`}
        className="mt-1.5 mb-2 ml-2 pl-3 border-l-2 rounded-[2px]" style={{ borderColor: color }}
      >
        <p className="text-[11.5px] text-[var(--color-text-muted)] py-1">
          <b className="text-[var(--color-text-primary)] font-medium">{sum.count} {sum.count === 1 ? 'lançamento' : 'lançamentos'}</b>
          {' · '}<span className="font-mono neg">{fmt(sum.total)}</span>
          {' · média '}<span className="font-mono">{fmt(sum.avg)}</span>
        </p>
        {visible.map(g => (
          <div key={g.key}>
            {multi && (
              <div className="flex items-center justify-between pt-2 pb-0.5 text-[11px] uppercase tracking-wide text-[var(--color-text-muted)] border-b border-[var(--hairline)]">
                <span>{g.label}</span>
                <span className="font-mono normal-case">{fmt(g.total)}</span>
              </div>
            )}
            <ul className="divide-y divide-[var(--hairline)]">{g.entries.map(e => renderItem(e, key === SEM_CAT_KEY ? '' : key))}</ul>
          </div>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setLimit(l => l + PAGE_SIZE)}
            className="mt-1.5 mb-1 px-2.5 py-1 text-[12px] rounded-[8px] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
          >
            Mostrar mais ({hidden})
          </button>
        )}
      </div>
    )
  }

  const rowButtonClass = (open: boolean) =>
    `w-full text-left -mx-2 px-2 py-1.5 rounded-[10px] cursor-pointer transition-colors hover:bg-[var(--color-surface-2)] ${open ? 'bg-[var(--color-surface-2)]' : ''}`

  return (
    <Card title="Despesas por categoria">
      <div className={compact ? 'grid grid-cols-1 sm:grid-cols-2 gap-4 items-center' : 'grid grid-cols-1 lg:grid-cols-2 gap-4'}>
        <div className="relative">
          <ResponsiveContainer width="100%" height={compact ? 180 : 220}>
            <PieChart>
              <Pie
                data={pieData} cx="50%" cy="50%"
                innerRadius={compact ? 52 : 62} outerRadius={compact ? 78 : 92}
                paddingAngle={2} dataKey="value" strokeWidth={0}
                onClick={compact ? undefined : (d: { payload?: { key?: string } }) => { const k = d?.payload?.key; if (k) select(k, true) }}
              >
                {pieData.map(e => (
                  <Cell
                    key={e.key} fill={e.color}
                    style={compact ? undefined : { cursor: 'pointer', outline: 'none', opacity: activeKey && activeKey !== e.key ? 0.55 : 1, transition: 'opacity .2s' }}
                  />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="text-center -mt-1">
            <div className="label">Total de despesas</div>
            <div className="font-mono font-semibold text-[16px] neg">{fmt(total)}</div>
          </div>
        </div>

        <div ref={listRef} className="flex flex-col gap-1">
          {shown.map(r => {
            const pct = (r.value / total) * 100
            const open = activeKey === r.id
            const body = (
              <>
                <div className="flex items-center justify-between text-[13px] mb-1 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex-shrink-0">{r.tag.emoji}</span>
                    <span className="truncate">{r.tag.label}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] text-[var(--color-text-muted)]">{pct.toFixed(0)}%</span>
                    <span className="font-mono font-medium neg">{fmt(r.value)}</span>
                    {!compact && <Chevron open={open} />}
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.tag.color }} />
                </div>
              </>
            )
            if (compact) return <div key={r.id} className="mb-1.5">{body}</div>
            const panelId = `${uid}-${r.id}`
            return (
              <div key={r.id} data-cat={r.id}>
                <button
                  type="button" className={rowButtonClass(open)}
                  aria-expanded={open} aria-controls={open ? panelId : undefined}
                  title={`${r.count} ${r.count === 1 ? 'lançamento' : 'lançamentos'}`}
                  onClick={() => select(r.id)}
                >
                  {body}
                </button>
                <AnimatedPanel open={open} id={panelId}>{() => renderPanel(r.id, r.tag.color, r.tag.label)}</AnimatedPanel>
              </div>
            )
          })}
          {compact && restTotal > 0 && (
            <div className="flex items-center justify-between text-[12px] text-[var(--color-text-muted)] pt-1">
              <span>Outras categorias</span>
              <span className="font-mono">{fmt(restTotal)}</span>
            </div>
          )}
          {semCat > 0 && (() => {
            const open = activeKey === SEM_CAT_KEY
            const panelId = `${uid}-sem`
            const body = (
              <div className="flex items-center justify-between text-[13px] gap-2">
                <span className="text-[var(--color-text-muted)] italic">Sem categoria</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--color-text-muted)]">{((semCat / total) * 100).toFixed(0)}%</span>
                  <span className="font-mono font-medium neg">{fmt(semCat)}</span>
                  {!compact && <Chevron open={open} />}
                </div>
              </div>
            )
            return (
              <div className="pt-2 mt-1 border-t border-[var(--color-border)]" data-cat={SEM_CAT_KEY}>
                {compact ? body : (
                  <>
                    <button
                      type="button" className={rowButtonClass(open)}
                      aria-expanded={open} aria-controls={open ? panelId : undefined}
                      title={`${semCatCount} ${semCatCount === 1 ? 'lançamento' : 'lançamentos'}`}
                      onClick={() => select(SEM_CAT_KEY)}
                    >
                      {body}
                    </button>
                    <AnimatedPanel open={open} id={panelId}>{() => renderPanel(SEM_CAT_KEY, SEM_CAT_COLOR, 'Sem categoria')}</AnimatedPanel>
                  </>
                )}
              </div>
            )
          })()}

          {!compact && (
            <div role="status" aria-live="polite">
              {moved && (
                <div className="mt-2 flex items-center justify-between gap-2 px-3 py-2 rounded-[10px] text-[12px] bg-[var(--color-surface-2)] border border-[var(--color-border)]">
                  <span className="min-w-0 truncate">
                    Movido para <b className="font-medium">{moved.toLabel}</b>
                    <span className="text-[var(--color-text-muted)]"> · {moved.entry.item.description}</span>
                  </span>
                  <button
                    type="button" onClick={undoMove}
                    className="flex-shrink-0 px-2 py-0.5 rounded-[6px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-surface)] transition-colors"
                  >
                    Desfazer
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {!compact && (
        <p className="text-[11px] text-[var(--color-text-muted)] mt-4 pt-3 border-t border-[var(--hairline)]">
          Considera lançamentos de <b>Set/2026 em diante</b> e ignora faturas de cartão sem categoria (linhas agregadas antigas). Toque numa categoria para ver e corrigir os lançamentos.
        </p>
      )}
    </Card>
  )
}
