import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useFinanceStore, monthKey } from '@/stores/useFinanceStore'
import { totalsFromItems } from '@/lib/monthTotals'
import { useRecurringStore } from '@/stores/useRecurringStore'
import { useCardsStore } from '@/stores/useCardsStore'
import { fmt, fmtSigned } from '@/lib/formatters'
import { dedupeCopy } from '@/lib/recurringSync'
import { addMonths, applySeriesPlan, lastYm, nextN, parseYm, planSeries, seriesIndex, ym as toYm, ymLabel, type SeriesState } from '@/lib/recurringSeries'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/types/finance'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import type { MonthAbbr, MonthItem } from '@/types/finance'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import PageHeader from '@/components/ui/PageHeader'
import ActionMenu from '@/components/ui/ActionMenu'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/hooks/useToast'
import RepeatMonthsModal from '@/components/recurring/RepeatMonthsModal'
import NovaDespesaModal from './NovaDespesaModal'

const MONTHS_LIST: { value: string; label: string }[] = [
  { value: 'Jan', label: 'Janeiro' }, { value: 'Fev', label: 'Fevereiro' },
  { value: 'Mar', label: 'Março' },   { value: 'Abr', label: 'Abril' },
  { value: 'Mai', label: 'Maio' },    { value: 'Jun', label: 'Junho' },
  { value: 'Jul', label: 'Julho' },   { value: 'Ago', label: 'Agosto' },
  { value: 'Set', label: 'Setembro' },{ value: 'Out', label: 'Outubro' },
  { value: 'Nov', label: 'Novembro' },{ value: 'Dez', label: 'Dezembro' },
]

const YEAR_OPTIONS = [2023, 2024, 2025, 2026, 2027].map(y => ({ value: String(y), label: String(y) }))

const CATEGORIES = ['revenue', 'fixedCosts', 'variableCosts', 'loans', 'renegociacoes', 'cards'] as const
type Category = typeof CATEGORIES[number]
// Categorias editáveis no formulário. Cartões saíram daqui — são geridos na
// aba Cartões; aqui aparecem só como um resumo (total da fatura).
const EDIT_CATEGORIES = ['revenue', 'fixedCosts', 'variableCosts', 'loans', 'renegociacoes'] as const

const CATEGORY_ACCENT: Record<Category, string> = {
  revenue:       '#1D9E75',
  fixedCosts:    '#378ADD',
  variableCosts: '#8B5CF6',
  loans:         '#EF9F27',
  renegociacoes: '#0E7C86',
  cards:         '#D85A30',
}

function PagoBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--color-pos)] bg-[var(--color-pos)]/[0.13] px-1.5 py-0.5 rounded-full not-italic">
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      Pago
    </span>
  )
}

interface FormItem {
  id: string
  description: string
  value: string
  category: string
  isPaid: boolean
  cardId?: string
  recurringId?: string
  tag?: string
  occurredAt?: string
}

function makeItem(category: string, isPaid = false): FormItem {
  return { id: crypto.randomUUID(), description: '', value: '', category, isPaid }
}

function toFormItem(i: MonthItem): FormItem {
  return {
    id: i.id, description: i.description, value: String(i.value),
    category: i.category, isPaid: i.isPaid, recurringId: i.recurringId, tag: i.tag,
    occurredAt: i.occurredAt, cardId: i.cardId,
  }
}

function isValidForm(i: FormItem): boolean {
  const v = parseFloat(i.value)
  const d = i.description.trim().length
  return d >= 1 && d <= 120 && isFinite(v) && v > 0
}

function toMonthItem(i: FormItem): MonthItem {
  return {
    id: i.id,
    description: i.description.trim().slice(0, 120),
    value: Math.round(parseFloat(i.value) * 100) / 100,
    category: i.category as MonthItem['category'],
    isPaid: i.isPaid,
    ...(i.recurringId ? { recurringId: i.recurringId } : {}),
    ...(i.tag ? { tag: i.tag } : {}),
    ...(i.occurredAt ? { occurredAt: i.occurredAt } : {}),
  }
}

// Assinatura comparável de uma lista de itens (independe de ordem e de decimais extras)
function itemsSig(items: MonthItem[]): string {
  return items
    .map(i => [i.id, i.description.trim(), Math.round(i.value * 100), i.category, i.isPaid ? 1 : 0, i.recurringId ?? '', i.tag ?? '', i.occurredAt ?? ''].join('|'))
    .sort()
    .join('\n')
}

function isValidMonthItem(i: MonthItem): boolean {
  const d = i.description.trim().length
  return d >= 1 && d <= 120 && isFinite(i.value) && i.value > 0
}

const ENDING_DISMISSED_KEY = 'launch-series-ending-dismissed'
function readDismissed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(ENDING_DISMISSED_KEY) ?? '[]') as string[]) } catch { return new Set() }
}
function writeDismissed(s: Set<string>) {
  try { localStorage.setItem(ENDING_DISMISSED_KEY, JSON.stringify([...s].slice(-50))) } catch { /* ignore */ }
}

const ICON_REPEAT = <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 7V6a2 2 0 012-2h7M10 2l2 2-2 2M13 9v1a2 2 0 01-2 2H4M6 14l-2-2 2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
const ICON_SPLIT = <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5.5 13.5h7a1 1 0 001-1v-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
const ICON_TRASH = <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V3h4v1M6 6v5M8 6v5M3 4l.5 8h7l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>

export default function LaunchPage() {
  const allMonths = useFinanceStore(s => s.allMonths)
  const addMonth = useFinanceStore(s => s.addMonth)
  const upsertStoreItem = useFinanceStore(s => s.upsertItem)
  const removeStoreItem = useFinanceStore(s => s.removeItem)
  const recurring = useRecurringStore(s => s.items)
  const upsertRule = useRecurringStore(s => s.upsertRule)
  const cardAccounts = useCardsStore(s => s.accounts)
  const tags = useCategoriesStore(s => s.tags)
  const tagMap = useMemo(() => Object.fromEntries(tags.map(t => [t.id, t])), [tags])

  const now = new Date()
  const nowMonth = MONTHS_LIST[now.getMonth()].value
  const [selectedMonth, setSelectedMonth] = useState<string>(nowMonth)
  const [selectedYear, setSelectedYear] = useState<string>(String(now.getFullYear()))
  // Ids de placeholders iniciais (linhas em branco) — descartados quando o mês carrega do store
  const placeholderIdsRef = useRef(new Set<string>())
  const [formItems, setFormItems] = useState<FormItem[]>(() => {
    const rec = useFinanceStore.getState().allMonths.find(m => m.month === nowMonth && m.year === now.getFullYear())
    const nonCard = (rec?.items ?? []).filter(i => i.category !== 'cards')
    if (nonCard.length > 0) return nonCard.map(toFormItem)
    const ph = [makeItem('revenue', true), makeItem('fixedCosts', false)]
    ph.forEach(p => placeholderIdsRef.current.add(p.id))
    return ph
  })
  const [saved, setSaved] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [repeatForId, setRepeatForId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(null)
  const [dismissedEnding, setDismissedEnding] = useState<Set<string>>(readDismissed)
  const { toast, show: showToast, clear: clearToast } = useToast()
  // Auto-save: only commit when the user actually edited (not on load/mount)
  const dirtyRef = useRef(false)
  // Itens que o usuário apagou desde o último commit — o merge com o store não deve ressuscitá-los
  const deletedIdsRef = useRef(new Set<string>())

  const selYear = parseInt(selectedYear)
  const selYm = toYm(selYear, selectedMonth as MonthAbbr)
  const nowYm = toYm(now.getFullYear(), nowMonth as MonthAbbr)

  function loadMonthIntoForm(month: string, year: string) {
    deletedIdsRef.current = new Set()
    placeholderIdsRef.current = new Set()
    dirtyRef.current = false
    setRowError(null)
    const st = useFinanceStore.getState()
    const y = parseInt(year)
    const existing = st.allMonths.find(m => m.month === month && m.year === y)
    // Cartões não entram no formulário — são geridos na aba Cartões
    if (existing) {
      setFormItems((existing.items ?? []).filter(i => i.category !== 'cards').map(toFormItem))
      return
    }

    // Mês novo: linhas em branco (itens de séries criadas na grade já vivem no store e carregam normalmente)
    const ph = [makeItem('revenue', true), makeItem('fixedCosts', false)]
    ph.forEach(p => placeholderIdsRef.current.add(p.id))
    setFormItems(ph)
  }

  const updateItem = useCallback((id: string, field: keyof FormItem, val: string | boolean) => {
    dirtyRef.current = true
    setRowError(prev => (prev?.id === id ? null : prev))
    setFormItems(prev => prev.map(i => (i.id === id ? { ...i, [field]: val } : i)))
  }, [])

  const removeItem = useCallback((id: string) => {
    dirtyRef.current = true
    deletedIdsRef.current.add(id)
    setFormItems(prev => prev.filter(i => i.id !== id))
  }, [])

  const addItem = useCallback((category: string) => {
    dirtyRef.current = true
    setFormItems(prev => [...prev, makeItem(category, category === 'revenue')])
  }, [])

  // Modal "Nova despesa" adiciona itens não-cartão ao formulário (o auto-save grava)
  const addFromModal = useCallback((it: { id?: string; description: string; value: number; category: string; isPaid: boolean; tag?: string; recurringId?: string; occurredAt?: string }) => {
    dirtyRef.current = true
    setFormItems(prev => [...prev, {
      id: it.id ?? crypto.randomUUID(),
      description: it.description,
      value: String(it.value),
      category: it.category,
      isPaid: it.isPaid,
      tag: it.tag,
      recurringId: it.recurringId,
      occurredAt: it.occurredAt,
    }])
  }, [])

  // Vincula um item do formulário a uma série recém-criada (o auto-save grava)
  const linkFormItem = useCallback((itemId: string, ruleId: string) => {
    dirtyRef.current = true
    setFormItems(prev => prev.map(i => (i.id === itemId ? { ...i, recurringId: ruleId } : i)))
  }, [])

  // Parcelamento: cria N parcelas (ex: compra em 3x) — a parcela do mês atual
  // fica no formulário rotulada (1/N); as demais vão direto para os meses seguintes.
  const repeatItem = useCallback((item: FormItem) => {
    const value = Math.round((parseFloat(item.value) || 0) * 100) / 100
    const desc = item.description.trim()
    if (!(value > 0) || desc.length < 1) {
      setRowError({ id: item.id, msg: 'Preencha a descrição e o valor antes de parcelar.' })
      return
    }
    const nStr = window.prompt('Parcelar em quantos meses? (ex: 3 para uma compra em 3x)')
    const n = parseInt(nStr ?? '', 10)
    if (!isFinite(n) || n < 2 || n > 60) return

    const base = desc.slice(0, 110)
    const startIdx = MONTHS_LIST.findIndex(m => m.value === selectedMonth)
    const startYear = parseInt(selectedYear)

    // Parcela 1/N fica no formulário (mês atual)
    dirtyRef.current = true
    setFormItems(prev => prev.map(i => i.id === item.id ? { ...i, description: `${base} (1/${n})` } : i))

    // Parcelas 2..N vão direto para os meses seguintes
    for (let k = 1; k < n; k++) {
      let idx = startIdx + k, y = startYear
      while (idx > 11) { idx -= 12; y += 1 }
      upsertStoreItem(y, MONTHS_LIST[idx].value as MonthAbbr, {
        id: crypto.randomUUID(),
        description: `${base} (${k + 1}/${n})`,
        value,
        category: item.category as MonthItem['category'],
        isPaid: false,
      })
    }
  }, [selectedMonth, selectedYear, upsertStoreItem])

  // ── Séries (repetir em outros meses) ─────────────────────────────────────
  const index = useMemo(() => seriesIndex(allMonths), [allMonths])

  // Estado da série incluindo o item do formulário (que pode ainda não ter sido gravado)
  const seriesFor = useCallback((ruleId: string): { count: number; first: string; last: string } => {
    const st = index.get(ruleId)
    const keys = new Set([...(st?.keys() ?? []), selYm])
    const sorted = [...keys].sort()
    return { count: sorted.length, first: sorted[0], last: sorted[sorted.length - 1] }
  }, [index, selYm])

  function openRepeat(item: FormItem) {
    const value = Math.round((parseFloat(item.value) || 0) * 100) / 100
    if (!(value > 0) || item.description.trim().length < 1) {
      setRowError({ id: item.id, msg: 'Preencha a descrição e o valor para repetir em outros meses.' })
      return
    }
    setRowError(null)
    setRepeatForId(item.id)
  }

  // Lembrete: séries ativas cujo último mês lançado é o mês atual ou o próximo
  const endingSeries = useMemo(() => {
    const out: { rule: (typeof recurring)[number]; last: string; value: number; key: string }[] = []
    const next = addMonths(nowYm, 1)
    for (const rule of recurring) {
      if (!rule.isActive) continue
      const st = index.get(rule.id)
      if (!st || st.size === 0) continue
      const last = lastYm(st)!
      if (last !== nowYm && last !== next) continue
      const key = `${rule.id}:${last}`
      if (dismissedEnding.has(key)) continue
      out.push({ rule, last, value: st.get(last)!.value, key })
    }
    return out
  }, [recurring, index, nowYm, dismissedEnding])

  function dismissEnding() {
    const n = new Set(dismissedEnding)
    endingSeries.forEach(e => n.add(e.key))
    setDismissedEnding(n)
    writeDismissed(n)
  }

  function extendSeries(e: (typeof endingSeries)[number]) {
    const st: SeriesState | undefined = index.get(e.rule.id)
    if (!st) return
    const from = addMonths(e.last, 1)
    const target = nextN(from, 12)
    const plan = planSeries({
      ruleId: e.rule.id, state: st, selected: new Set([...st.keys(), ...target]),
      template: { description: e.rule.description, value: e.value, category: e.rule.category, tag: e.rule.tag, cardId: e.rule.cardId },
      newValue: e.value, updateExistingUnpaid: false,
    })
    applySeriesPlan(plan, {
      upsertItem: upsertStoreItem, removeItem: removeStoreItem,
      getItem: () => undefined,
    })
    showToast(`${e.rule.description}: +${plan.add.length} meses lançados`)
  }

  function endSeries(e: (typeof endingSeries)[number]) {
    upsertRule({ ...e.rule, isActive: false })
    showToast(`${e.rule.description}: não repete mais`)
  }

  const [copyMsg, setCopyMsg] = useState('')

  function copyPreviousMonth() {
    const mIdx = MONTHS_LIST.findIndex(m => m.value === selectedMonth)
    const year = parseInt(selectedYear)
    const prevMonth = mIdx === 0 ? 'Dez' : MONTHS_LIST[mIdx - 1].value
    const prevYear  = mIdx === 0 ? year - 1 : year
    const prev = allMonths.find(m => m.month === prevMonth && m.year === prevYear)
    if (!prev?.items) return
    // Não copia cartões (são geridos na aba Cartões) e ignora o que já existe no mês
    const current = formItems
      .filter(i => i.description.trim() !== '' || i.value.trim() !== '')
      .map(i => ({ description: i.description, category: i.category, value: parseFloat(i.value) || 0, recurringId: i.recurringId }))
    const toCopy = dedupeCopy(prev.items, current)
    if (toCopy.length === 0) {
      setCopyMsg('Nada novo para copiar')
      setTimeout(() => setCopyMsg(''), 3000)
      return
    }
    dirtyRef.current = true
    const copied: FormItem[] = toCopy.map(i => ({
      id: crypto.randomUUID(),
      description: i.description,
      value: String(i.value),
      category: i.category,
      isPaid: i.category === 'revenue',
      recurringId: i.recurringId,
    }))
    // Acrescenta ao que já existe (ex: lançamentos do Telegram) — NÃO substitui,
    // mas ignora placeholders vazios do formulário inicial.
    setFormItems(cur => {
      const kept = cur.filter(i => i.description.trim() !== '' || i.value.trim() !== '')
      return [...kept, ...copied]
    })
  }

  // Commits the current form into the store. Returns false when nothing valid
  // to save on a month that doesn't exist yet (avoids creating empty months).
  // Escritor único do mês: itens adicionados em segundo plano (séries, Telegram)
  // são preservados — só some o que o usuário apagou aqui (deletedIdsRef).
  const commitCurrent = useCallback((): boolean => {
    const validItems: MonthItem[] = formItems.filter(isValidForm).map(toMonthItem)

    const year = parseInt(selectedYear)
    if (!isFinite(year) || year < 2000 || year > 2100) return false

    const rec = useFinanceStore.getState().allMonths.find(m => m.month === selectedMonth && m.year === year)
    const recItems = rec?.items ?? []
    const formIds = new Set(formItems.map(i => i.id))
    // Itens não-cartão que entraram no store por fora do formulário
    const bgItems = recItems.filter(i =>
      i.category !== 'cards' && !formIds.has(i.id) && !deletedIdsRef.current.has(i.id))
    // Preserva os itens de cartão do mês (geridos na aba Cartões / Telegram):
    // o formulário só cuida das outras categorias e NUNCA deve apagar cartões.
    const cardItems = recItems.filter(i => i.category === 'cards')
    const finalItems = [...validItems, ...bgItems, ...cardItems]

    // Não cria mês vazio; mas permite esvaziar as categorias do formulário
    // mantendo os cartões, se o mês já existir.
    if (finalItems.length === 0 && !rec) return false

    addMonth({
      month: selectedMonth as MonthAbbr,
      year,
      source: 'manual',
      items: finalItems,
      ...totalsFromItems(finalItems),
    })
    return true
  }, [formItems, selectedMonth, selectedYear, addMonth])

  // Debounced auto-save: commit ~1s after the user stops editing.
  // dirtyRef is cleared after a commit so the store update this triggers
  // does not loop into another save.
  useEffect(() => {
    if (!dirtyRef.current) return
    const t = setTimeout(() => {
      const ok = commitCurrent()
      dirtyRef.current = false
      deletedIdsRef.current = new Set()
      if (ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      }
    }, 1000)
    return () => clearTimeout(t)
  }, [formItems, selectedMonth, selectedYear, commitCurrent])

  function handleSave() {
    commitCurrent()
    dirtyRef.current = false
    deletedIdsRef.current = new Set()
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  // Troca de mês: grava antes o que estiver pendente (o debounce seria cancelado)
  function switchMonth(month: string, year: string) {
    if (dirtyRef.current) {
      commitCurrent()
      dirtyRef.current = false
    }
    setSelectedMonth(month)
    setSelectedYear(year)
    loadMonthIntoForm(month, year)
  }

  // Registro do mês no store — muda quando uma série / Telegram / sync adiciona itens
  const storeRec = allMonths.find(m => m.month === selectedMonth && m.year === selYear)

  // Se o formulário não está sujo, acompanha o store (itens criados em segundo plano aparecem).
  useEffect(() => {
    if (dirtyRef.current || !storeRec) return
    const storeNonCard = (storeRec.items ?? []).filter(i => i.category !== 'cards')
    const storeSig = itemsSig(storeNonCard.filter(isValidMonthItem))
    setFormItems(prev => {
      if (itemsSig(prev.filter(isValidForm).map(toMonthItem)) === storeSig) return prev
      const storeIds = new Set(storeNonCard.map(i => i.id))
      // mantém linhas em branco que o usuário abriu (não os placeholders iniciais)
      const blanks = prev.filter(i => !isValidForm(i) && !storeIds.has(i.id) && !placeholderIdsRef.current.has(i.id))
      return [...storeNonCard.map(toFormItem), ...blanks]
    })
  }, [storeRec])

  // Itens de cartão do mês (geridos na aba Cartões) — para o resumo
  const storeCardItems = (storeRec?.items ?? []).filter(i => i.category === 'cards')

  const cardTotalStore = storeCardItems.reduce((s, i) => s + i.value, 0)
  const cardPaidStore = storeCardItems.reduce((s, i) => s + (i.isPaid ? i.value : 0), 0)
  const allCardsPaid = storeCardItems.length > 0 && storeCardItems.every(i => i.isPaid)
  const perCard = cardAccounts
    .map(a => {
      const its = storeCardItems.filter(i => i.cardId === a.id)
      return { name: a.name, total: its.reduce((s, i) => s + i.value, 0), paid: its.length > 0 && its.every(i => i.isPaid) }
    })
    .filter(c => c.total > 0)
  const semCartaoItems = storeCardItems.filter(i => !i.cardId)
  const semCartaoTotal = semCartaoItems.reduce((s, i) => s + i.value, 0)
  const semCartaoPaid = semCartaoItems.length > 0 && semCartaoItems.every(i => i.isPaid)

  // Live totals per category (cartões vêm do store, não do formulário)
  const catTotals: Record<string, number> = {}
  for (const cat of CATEGORIES) catTotals[cat] = 0
  for (const i of formItems) {
    const v = parseFloat(i.value) || 0
    if (i.category in catTotals) catTotals[i.category] += v
  }
  catTotals.cards = cardTotalStore
  const totalExpenses = catTotals.fixedCosts + catTotals.variableCosts + catTotals.loans + catTotals.renegociacoes + catTotals.cards
  const balance = catTotals.revenue - totalExpenses
  const consolidatedRev = formItems.filter(i => i.category === 'revenue' && i.isPaid).reduce((s, i) => s + (parseFloat(i.value) || 0), 0)
  const consolidatedExp =
    formItems.filter(i => i.category !== 'revenue' && i.isPaid).reduce((s, i) => s + (parseFloat(i.value) || 0), 0) +
    storeCardItems.filter(i => i.isPaid).reduce((s, i) => s + i.value, 0)
  const consolidatedBalance = consolidatedRev - consolidatedExp

  // "Meses lançados" — janela ao redor do mês atual (1 anterior + atual + próximos),
  // em ordem cronológica. Evita mostrar só os meses mais distantes de um
  // parcelamento longo (ex: renegociação 60x que chega a 2031).
  const manualMonths = useMemo(() => {
    const MA = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const nd = new Date()
    const nowKey = monthKey(nd.getFullYear(), MA[nd.getMonth()])
    const asc = useFinanceStore.getState().visibleMonths().filter(m => m.source === 'manual')
    const firstFut = asc.findIndex(m => monthKey(m.year, m.month) >= nowKey)
    const start = firstFut < 0 ? Math.max(0, asc.length - 10) : Math.max(0, firstFut - 1)
    return asc.slice(start, start + 12)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcula quando os meses mudam (lê via getState)
  }, [allMonths])

  const repeatItemObj = repeatForId ? formItems.find(i => i.id === repeatForId) : undefined

  return (
    <div>
      <PageHeader eyebrow="Entrada" title="Lançar mês" subtitle="Registre receitas e despesas do mês; salva sozinho ao editar.">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[13px] font-semibold bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          Nova despesa
        </button>
      </PageHeader>

      {showModal && (
        <NovaDespesaModal
          month={selectedMonth as MonthAbbr}
          year={parseInt(selectedYear)}
          monthLabel={`${selectedMonth}/${selectedYear}`}
          onClose={() => setShowModal(false)}
          onAddFormItem={addFromModal}
          onLinkFormItem={linkFormItem}
          onNotify={showToast}
        />
      )}

      {repeatItemObj && (
        <RepeatMonthsModal
          template={{
            description: repeatItemObj.description.trim(),
            value: Math.round((parseFloat(repeatItemObj.value) || 0) * 100) / 100,
            category: repeatItemObj.category as MonthItem['category'],
            tag: repeatItemObj.tag,
          }}
          ruleId={repeatItemObj.recurringId}
          anchor={{ year: selYear, month: selectedMonth as MonthAbbr }}
          onClose={() => setRepeatForId(null)}
          onApplied={showToast}
          onLinked={rid => linkFormItem(repeatItemObj.id, rid)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Form */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Lembrete: séries chegando ao fim */}
          {endingSeries.length > 0 && (
            <div className="rounded-2xl border border-[var(--color-accent)]/40 bg-[var(--color-accent-tint)] px-4 py-3" role="status">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] font-medium text-[var(--color-text-primary)]">
                  {endingSeries.length === 1 ? 'Uma repetição está acabando' : `${endingSeries.length} repetições estão acabando`}
                </p>
                <button
                  onClick={dismissEnding}
                  aria-label="Dispensar aviso"
                  title="Dispensar"
                  className="w-6 h-6 -mr-1 -mt-0.5 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-black/5 transition-colors flex-shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                </button>
              </div>
              <ul className="mt-1 flex flex-col divide-y divide-[var(--color-accent)]/20">
                {endingSeries.slice(0, 3).map(e => {
                  const last = parseYm(e.last)
                  return (
                    <li key={e.key} className="py-2 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                      <span className="flex-1 min-w-0 text-[12.5px] text-[var(--color-text-primary)]">
                        <span className="font-semibold">{e.rule.description}:</span> o último mês lançado é {last.month}/{last.year}.
                      </span>
                      <span className="flex gap-2 flex-shrink-0">
                        <button onClick={() => extendSeries(e)} className="h-8 px-3 rounded-full text-[12px] font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90 transition-opacity">
                          Estender 12 meses
                        </button>
                        <button onClick={() => endSeries(e)} className="h-8 px-3 rounded-full text-[12px] font-medium border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)] transition-colors">
                          Não repetir mais
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
              {endingSeries.length > 3 && (
                <p className="text-[11.5px] text-[var(--color-text-muted)] mt-1">e mais {endingSeries.length - 3} — resolva as acima para ver as outras.</p>
              )}
            </div>
          )}

          {/* Month/Year selector */}
          <Card>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <Select label="Mês" options={MONTHS_LIST} value={selectedMonth}
                  onChange={e => switchMonth(e.target.value, selectedYear)} />
              </div>
              <div className="w-24">
                <Select label="Ano" options={YEAR_OPTIONS} value={selectedYear}
                  onChange={e => switchMonth(selectedMonth, e.target.value)} />
              </div>
              <div className="flex items-end gap-2">
                <Button variant="ghost" size="sm" onClick={copyPreviousMonth}>⏮ Copiar anterior</Button>
              </div>
            </div>
          </Card>

          {copyMsg && <div className="text-[12px] text-[var(--color-text-muted)] px-1">{copyMsg}</div>}
          {/* Category blocks (cartões saíram — geridos na aba Cartões) */}
          {EDIT_CATEGORIES.map(cat => {
            const items = formItems.filter(i => i.category === cat)
            const blockTotal = catTotals[cat]
            const accent = CATEGORY_ACCENT[cat]
            const isRevenue = cat === 'revenue'
            const paidTotal = items.filter(i => i.isPaid).reduce((s, i) => s + (parseFloat(i.value) || 0), 0)
            const pendingTotal = blockTotal - paidTotal

            return (
              <div key={cat} className="card rounded-2xl overflow-hidden">
                {/* Block header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: accent }}
                    />
                    <span className="label">{CATEGORY_LABELS[cat]}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => addItem(cat)}>+ Adicionar</Button>
                </div>

                {/* Items */}
                <div className="px-4">
                  {items.length === 0 ? (
                    <div className="text-[12px] text-[var(--color-text-muted)] py-2 pb-3">
                      Nenhum item. Clique em + Adicionar.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 pb-3">
                      {items.map(item => {
                        const tag = item.tag ? tagMap[item.tag] : null
                        return (
                        <div key={item.id} className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                          {/* Pago / pendente */}
                          <button
                            onClick={() => updateItem(item.id, 'isPaid', !item.isPaid)}
                            className={`w-[22px] h-[22px] rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                              item.isPaid ? 'border-transparent' : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                            }`}
                            style={item.isPaid ? { backgroundColor: accent } : {}}
                            title={item.isPaid ? `${isRevenue ? 'Recebido' : 'Pago'} — clique para pendente` : `Pendente — clique para ${isRevenue ? 'recebido' : 'pago'}`}
                          >
                            {item.isPaid && (
                              <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
                                <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </button>
                          {/* Descrição */}
                          <input
                            type="text"
                            placeholder="Descrição"
                            value={item.description}
                            onChange={e => updateItem(item.id, 'description', e.target.value)}
                            className="flex-1 basis-[calc(100%-30px)] sm:basis-0 min-w-0 px-2.5 py-2 text-[13px] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none focus:border-[var(--color-text-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
                          />
                          {/* Valor (destaque) — no celular desce para a 2ª linha junto com categoria e menu */}
                          <div className="relative flex-shrink-0">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--color-text-muted)] pointer-events-none">R$</span>
                            <input
                              type="number" inputMode="decimal" placeholder="0,00"
                              value={item.value}
                              onChange={e => updateItem(item.id, 'value', e.target.value)}
                              className="w-[92px] sm:w-[104px] pl-7 pr-2 py-2 text-[14px] font-mono font-semibold bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none focus:border-[var(--color-text-primary)] text-right text-[var(--color-text-primary)]"
                            />
                          </div>
                          {/* Categoria (chip) */}
                          <div className="relative flex-shrink-0">
                            <select
                              value={item.tag ?? ''}
                              onChange={e => updateItem(item.id, 'tag', e.target.value)}
                              title={tag ? `Categoria: ${tag.label}` : 'Escolher categoria'}
                              className={`appearance-none w-[100px] sm:w-auto sm:max-w-[170px] truncate h-[38px] pl-2 pr-5 text-[13px] rounded-[8px] outline-none cursor-pointer border ${tag ? 'border-transparent' : 'border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
                              style={tag ? { backgroundColor: tag.color + '26', color: tag.color } : { backgroundColor: 'var(--color-surface-2)' }}
                            >
                              <option value="">🏷️</option>
                              {tags.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
                            </select>
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-[9px] opacity-60" style={tag ? { color: tag.color } : {}}>▾</span>
                          </div>
                          {/* Menu ⋯ (em portal: nunca é cortado pelo card) */}
                          <ActionMenu
                            label="Mais opções do lançamento"
                            items={[
                              { key: 'repeat', label: item.recurringId ? 'Editar repetição…' : 'Repetir em outros meses…', icon: ICON_REPEAT, onSelect: () => openRepeat(item) },
                              { key: 'split', label: 'Parcelar (compra em Nx)', icon: ICON_SPLIT, onSelect: () => repeatItem(item) },
                              { key: 'del', label: 'Excluir', icon: ICON_TRASH, danger: true, separatorBefore: true, onSelect: () => removeItem(item.id) },
                            ]}
                          />
                        </div>
                        {((item.recurringId && seriesFor(item.recurringId).count >= 2) || rowError?.id === item.id) && (
                          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap pl-[30px]">
                            {item.recurringId && (() => {
                              const sr = seriesFor(item.recurringId)
                              // Série de um mês só (ou encerrada logo no início) não é "repetição": sem selo
                              if (sr.count < 2) return null
                              return (
                                <button
                                  onClick={() => openRepeat(item)}
                                  title={`${ymLabel(sr.first)} → ${ymLabel(sr.last)} — clique para editar os meses`}
                                  className="inline-flex items-center gap-1.5 h-6 px-2 -ml-0.5 rounded-full text-[11px] font-medium bg-[var(--color-primary-tint)] text-[var(--color-primary)] hover:opacity-80 transition-opacity"
                                >
                                  <span aria-hidden="true">🔁</span>
                                  {sr.count} {sr.count === 1 ? 'mês' : 'meses'}
                                  <span className="text-[var(--color-text-muted)] font-normal">{ymLabel(sr.first)} → {ymLabel(sr.last)}</span>
                                </button>
                              )
                            })()}
                            {rowError?.id === item.id && (
                              <span className="text-[11.5px] text-[var(--color-neg)]" role="alert">{rowError.msg}</span>
                            )}
                          </div>
                        )}
                        </div>
                      )})}
                    </div>
                  )}
                </div>

                {/* Block total footer + pago/falta */}
                {blockTotal > 0 && (
                  <div className="px-4 py-2.5 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[var(--color-text-muted)]">Total</span>
                      <span className="text-[13px] font-mono font-semibold" style={{ color: accent }}>
                        {isRevenue ? '+' : '-'}{fmt(blockTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[11.5px]">
                      <span className="text-[var(--color-pos)]">
                        ✓ {isRevenue ? 'Recebido' : 'Pago'} {fmt(paidTotal)}
                      </span>
                      <span className={pendingTotal > 0.005 ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-muted)] opacity-60'}>
                        {isRevenue ? 'A receber' : 'Falta'} <span className="font-mono">{fmt(pendingTotal)}</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Resumo de Cartões — geridos na aba Cartões, sem cascata aqui */}
          <div className="card rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_ACCENT.cards }} />
                <span className="label">Cartões</span>
              </div>
              <Link to="/cartoes" className="text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">Gerenciar →</Link>
            </div>
            <div className="px-4 pb-3">
              {cardTotalStore === 0 ? (
                <p className="text-[12px] text-[var(--color-text-muted)] py-1">
                  Nenhum lançamento de cartão neste mês. Adicione na aba <Link to="/cartoes" className="underline">Cartões</Link>.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {perCard.map(c => (
                    <div key={c.name} className="flex justify-between items-center text-[13px]">
                      <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                        {c.name}
                        {c.paid && <PagoBadge />}
                      </span>
                      <span className={`font-mono ${c.paid ? 'text-[var(--color-text-muted)] line-through' : 'neg'}`}>{fmt(c.total)}</span>
                    </div>
                  ))}
                  {semCartaoTotal > 0 && (
                    <div className="flex justify-between items-center text-[13px]">
                      <span className="flex items-center gap-1.5 text-[var(--color-text-muted)] italic">
                        Sem cartão
                        {semCartaoPaid && <PagoBadge />}
                      </span>
                      <span className={`font-mono ${semCartaoPaid ? 'text-[var(--color-text-muted)] line-through' : 'neg'}`}>{fmt(semCartaoTotal)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            {cardTotalStore > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <span className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)]">
                  Total fatura
                  {allCardsPaid && <PagoBadge />}
                </span>
                {allCardsPaid ? (
                  <span className="text-[13px] font-mono font-semibold text-[var(--color-pos)]">✓ {fmt(cardTotalStore)}</span>
                ) : (
                  <span className="flex flex-col items-end leading-tight">
                    <span className="text-[13px] font-mono font-semibold" style={{ color: CATEGORY_ACCENT.cards }}>-{fmt(cardTotalStore)}</span>
                    {cardPaidStore > 0.005 && (
                      <span className="text-[10px] text-[var(--color-text-muted)]">✓ Pago <span className="font-mono">{fmt(cardPaidStore)}</span></span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          <Button size="lg" onClick={handleSave} className="w-full justify-center">
            {saved ? '✓ Salvo automaticamente' : `Salvar ${selectedMonth}/${selectedYear} agora`}
          </Button>
          <p className="text-[12px] text-[var(--color-text-muted)] text-center -mt-2">
            As alterações são salvas automaticamente ao editar.
          </p>
        </div>

        {/* Summary sidebar */}
        <div className="flex flex-col gap-3">
          <Card title="Resumo ao vivo">
            <div className="flex flex-col gap-2 text-[13px]">
              {CATEGORIES.map(cat => {
                const isRev = cat === 'revenue'
                return (
                  <div key={cat} className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                      <span className="text-[var(--color-text-muted)]">{CATEGORY_LABELS[cat]}</span>
                    </div>
                    <span className={`font-mono font-medium whitespace-nowrap ${isRev ? 'pos' : 'neg'}`}>
                      {fmt(catTotals[cat])}
                    </span>
                  </div>
                )
              })}
              <div className="border-t border-[var(--color-border)] pt-2 mt-1 flex flex-col gap-1">
                <div className="flex justify-between font-semibold">
                  <span>Balanço projetado</span>
                  <span className={`font-mono whitespace-nowrap ${balance >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(balance)}</span>
                </div>
                <div className="flex justify-between text-[12px] text-[var(--color-text-muted)]">
                  <span>Consolidado (pagos)</span>
                  <span className={`font-mono whitespace-nowrap ${consolidatedBalance >= 0 ? 'pos' : 'neg'}`}>
                    {fmtSigned(consolidatedBalance)}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Launched months list */}
          <Card title="Meses lançados">
            {manualMonths.length === 0 ? (
              <div className="text-[12px] text-[var(--color-text-muted)]">Nenhum mês lançado ainda.</div>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--color-border)]">
                {manualMonths.map(m => {
                  const isEditing = m.month === selectedMonth && m.year === parseInt(selectedYear)
                  return (
                    <div key={`${m.year}-${m.month}`} className={`py-2.5 first:pt-0 last:pb-0 ${isEditing ? 'opacity-60' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium text-[13px] whitespace-nowrap">{m.month}/{m.year}</span>
                          {isEditing && (
                            <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded">editando</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-[12px] font-semibold whitespace-nowrap ${m.balance >= 0 ? 'pos' : 'neg'}`}>
                            {fmtSigned(m.balance)}
                          </span>
                          {!isEditing && (
                            <button
                              onClick={() => switchMonth(m.month, String(m.year))}
                              className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] hover:border-[var(--color-text-primary)] rounded-[6px] px-2 py-0.5 transition-colors"
                            >
                              Editar
                            </button>
                          )}
                        </div>
                      </div>
                      {m.items && (
                        <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                          {m.items.filter(i => i.isPaid).length}/{m.items.length} itens pagos
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
