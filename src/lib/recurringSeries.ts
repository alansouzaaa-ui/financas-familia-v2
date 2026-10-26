// Série de lançamentos: um RecurringItem (regra) é só a identidade/modelo da série;
// os lançamentos de cada mês apontam para ela via `recurringId`. O usuário escolhe
// explicitamente em quais meses a série existe — nada acontece em segundo plano.
import { MONTHS, type MonthAbbr, type MonthItem } from '../types/finance'

/** 'YYYY-MM' */
export type Ym = string

export function ym(year: number, month: MonthAbbr): Ym {
  return `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}`
}

export function parseYm(s: Ym): { year: number; month: MonthAbbr } {
  const [y, m] = s.split('-')
  return { year: parseInt(y, 10), month: MONTHS[parseInt(m, 10) - 1] }
}

export function addMonths(s: Ym, n: number): Ym {
  const { year, month } = parseYm(s)
  const idx = year * 12 + MONTHS.indexOf(month) + n
  const y = Math.floor(idx / 12)
  return ym(y, MONTHS[idx - y * 12])
}

/** 'Out/26' */
export function ymLabel(s: Ym): string {
  const { year, month } = parseYm(s)
  return `${month}/${String(year).slice(2)}`
}

/** Id determinístico do lançamento de uma série num mês — nunca duplica. */
export function seriesItemId(ruleId: string, s: Ym): string {
  return `rec:${ruleId}:${s}`
}

export interface SeriesEntry { itemId: string; isPaid: boolean; value: number }

export interface SeriesState extends Map<Ym, SeriesEntry> {
  /** meses em que a série tem mais de um lançamento (diagnóstico) */
  duplicates: number
}

interface MonthLike { year: number; month: MonthAbbr; items?: Pick<MonthItem, 'id' | 'isPaid' | 'value' | 'recurringId'>[] }

/** Em quais meses a série já está lançada (primeiro item, se houver mais de um). */
export function seriesState(allMonths: MonthLike[], ruleId: string): SeriesState {
  const state = new Map<Ym, SeriesEntry>() as SeriesState
  state.duplicates = 0
  for (const m of allMonths) {
    const hits = (m.items ?? []).filter(i => i.recurringId === ruleId)
    if (hits.length === 0) continue
    if (hits.length > 1) state.duplicates += 1
    const first = hits[0]
    state.set(ym(m.year, m.month), { itemId: first.id, isPaid: first.isPaid, value: first.value })
  }
  return state
}

/** Estado de todas as séries de uma vez (uma passada pelos meses). */
export function seriesIndex(allMonths: MonthLike[]): Map<string, SeriesState> {
  const out = new Map<string, SeriesState>()
  for (const m of allMonths) {
    const key = ym(m.year, m.month)
    const seen = new Set<string>()
    for (const i of m.items ?? []) {
      if (!i.recurringId) continue
      let st = out.get(i.recurringId)
      if (!st) { st = new Map() as SeriesState; st.duplicates = 0; out.set(i.recurringId, st) }
      if (seen.has(i.recurringId)) continue
      seen.add(i.recurringId)
      st.set(key, { itemId: i.id, isPaid: i.isPaid, value: i.value })
    }
    // duplicatas: mais de um item da mesma série no mês
    const counts = new Map<string, number>()
    for (const i of m.items ?? []) if (i.recurringId) counts.set(i.recurringId, (counts.get(i.recurringId) ?? 0) + 1)
    for (const [rid, n] of counts) if (n > 1) out.get(rid)!.duplicates += 1
  }
  return out
}

export function firstYm(state: Map<Ym, unknown>): Ym | undefined {
  return [...state.keys()].sort()[0]
}

export function lastYm(state: Map<Ym, unknown>): Ym | undefined {
  const keys = [...state.keys()].sort()
  return keys[keys.length - 1]
}

/** De `fromYm` (inclusive) até dezembro do mesmo ano. */
export function untilDecember(fromYm: Ym): Ym[] {
  const { year, month } = parseYm(fromYm)
  const out: Ym[] = []
  for (let i = MONTHS.indexOf(month); i < 12; i++) out.push(ym(year, MONTHS[i]))
  return out
}

/** `n` meses a partir de `fromYm` (inclusive). */
export function nextN(fromYm: Ym, n: number): Ym[] {
  return Array.from({ length: Math.max(0, n) }, (_, k) => addMonths(fromYm, k))
}

export interface SeriesTemplate {
  description: string
  value: number
  category: MonthItem['category']
  tag?: string
  cardId?: string
}

export interface SeriesPlan {
  add: { ym: Ym; item: MonthItem }[]
  remove: { ym: Ym; itemId: string }[]
  update: { ym: Ym; itemId: string; value: number }[]
}

export function buildSeriesItem(ruleId: string, s: Ym, template: SeriesTemplate, value: number): MonthItem {
  return {
    id: seriesItemId(ruleId, s),
    description: template.description,
    value,
    category: template.category,
    isPaid: false,
    source: 'manual',
    recurringId: ruleId,
    ...(template.tag ? { tag: template.tag } : {}),
    ...(template.category === 'cards' && template.cardId ? { cardId: template.cardId } : {}),
  }
}

export function planSeries(args: {
  ruleId: string
  state: Map<Ym, SeriesEntry>
  selected: Set<Ym>
  anchorYm?: Ym
  template: SeriesTemplate
  newValue: number
  updateExistingUnpaid: boolean
}): SeriesPlan {
  const { ruleId, state, selected, anchorYm, template, newValue, updateExistingUnpaid } = args
  const plan: SeriesPlan = { add: [], remove: [], update: [] }

  // O mês-âncora vive no formulário do Lançar: quem cuida dele é o formulário.
  for (const s of [...selected].sort()) {
    if (!state.has(s) && s !== anchorYm) plan.add.push({ ym: s, item: buildSeriesItem(ruleId, s, template, newValue) })
  }
  for (const [s, e] of [...state.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (s === anchorYm) continue
    if (!selected.has(s)) {
      if (!e.isPaid) plan.remove.push({ ym: s, itemId: e.itemId })
    } else if (updateExistingUnpaid && !e.isPaid && Math.abs(e.value - newValue) >= 0.005) {
      plan.update.push({ ym: s, itemId: e.itemId, value: newValue })
    }
  }
  return plan
}

export function planIsEmpty(p: SeriesPlan): boolean {
  return p.add.length === 0 && p.remove.length === 0 && p.update.length === 0
}

/** Aplica o plano numa loja (injetada — facilita testar). `getItem` lê o item atual p/ atualizar valor. */
export function applySeriesPlan(
  plan: SeriesPlan,
  api: {
    upsertItem: (year: number, month: MonthAbbr, item: MonthItem) => void
    removeItem: (year: number, month: MonthAbbr, itemId: string) => void
    getItem: (year: number, month: MonthAbbr, itemId: string) => MonthItem | undefined
  },
): void {
  for (const a of plan.add) {
    const { year, month } = parseYm(a.ym)
    api.upsertItem(year, month, a.item)
  }
  for (const u of plan.update) {
    const { year, month } = parseYm(u.ym)
    const cur = api.getItem(year, month, u.itemId)
    if (cur) api.upsertItem(year, month, { ...cur, value: u.value })
  }
  for (const r of plan.remove) {
    const { year, month } = parseYm(r.ym)
    api.removeItem(year, month, r.itemId)
  }
}
