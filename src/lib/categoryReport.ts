import type { ExpenseTag, MonthItem, MonthPoint } from '@/types/finance'

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
// Igual ao monthKey do store (duplicado para manter esta lib pura/testável)
const monthKey = (year: number, month: string) => year * 100 + (MONTHS.indexOf(month) + 1)

// Relatórios só a partir daqui (dados antigos = faturas agregadas sem categoria)
export const REPORT_FROM = 202609 // Set/2026
export const SEM_CAT_KEY = '__sem_categoria__'

export interface ReportEntry {
  item: MonthItem
  year: number
  month: MonthPoint['month']
  monthKey: number     // YYYYMM
  monthLabel: string   // 'Set/26'
}

export interface ReportRow { id: string; value: number; count: number; tag: ExpenseTag }

export interface CategoryReport {
  rows: ReportRow[]
  total: number
  semCat: number
  semCatCount: number
  /** Lançamentos por id de tag (ordenados do mais recente ao mais antigo) e por SEM_CAT_KEY. */
  entries: Record<string, ReportEntry[]>
}

/** Timestamp do lançamento (0 quando não há data válida). */
export function entryTime(e: ReportEntry): number {
  const s = e.item.occurredAt
  if (!s) return 0
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : 0
}

export function compareEntries(a: ReportEntry, b: ReportEntry): number {
  if (a.monthKey !== b.monthKey) return b.monthKey - a.monthKey
  const d = entryTime(b) - entryTime(a)
  return d !== 0 ? d : b.item.value - a.item.value
}

/** Mesmas regras do relatório: ignora receita, anterior a `from` e fatura de cartão sem tag. */
export function buildCategoryReport(
  months: MonthPoint[],
  tagMap: Record<string, ExpenseTag>,
  from: number = REPORT_FROM,
): CategoryReport {
  const entries: Record<string, ReportEntry[]> = {}
  const sums = new Map<string, number>()
  let semCat = 0
  let total = 0
  for (const m of months) {
    const mk = monthKey(m.year, m.month)
    if (mk < from) continue
    for (const it of m.items ?? []) {
      if (it.category === 'revenue') continue
      if (it.category === 'cards' && !it.tag) continue
      total += it.value
      const key = it.tag && tagMap[it.tag] ? it.tag : SEM_CAT_KEY
      if (key === SEM_CAT_KEY) semCat += it.value
      else sums.set(key, (sums.get(key) ?? 0) + it.value)
      ;(entries[key] ??= []).push({ item: it, year: m.year, month: m.month, monthKey: mk, monthLabel: m.label })
    }
  }
  for (const k of Object.keys(entries)) entries[k].sort(compareEntries)
  const rows = [...sums.entries()]
    .map(([id, value]) => ({ id, value, count: entries[id].length, tag: tagMap[id] }))
    .sort((a, b) => b.value - a.value)
  return { rows, total, semCat, semCatCount: entries[SEM_CAT_KEY]?.length ?? 0, entries }
}

export function summarize(list: ReportEntry[]): { count: number; total: number; avg: number } {
  const total = list.reduce((s, e) => s + e.item.value, 0)
  return { count: list.length, total, avg: list.length ? total / list.length : 0 }
}

export interface MonthGroup { key: number; label: string; total: number; count: number; entries: ReportEntry[] }

/** Agrupa por mês, mês mais recente primeiro (a ordem interna é preservada). */
export function groupByMonth(list: ReportEntry[]): MonthGroup[] {
  const map = new Map<number, MonthGroup>()
  for (const e of list) {
    let g = map.get(e.monthKey)
    if (!g) { g = { key: e.monthKey, label: e.monthLabel, total: 0, count: 0, entries: [] }; map.set(e.monthKey, g) }
    g.total += e.item.value
    g.count += 1
    g.entries.push(e)
  }
  return [...map.values()].sort((a, b) => b.key - a.key)
}

/** Mostra só os primeiros `limit` lançamentos (somas/contagens do mês seguem completas). */
export function limitGroups(groups: MonthGroup[], limit: number): { groups: MonthGroup[]; hidden: number } {
  let left = limit
  let hidden = 0
  const out: MonthGroup[] = []
  for (const g of groups) {
    if (left <= 0) { hidden += g.entries.length; continue }
    const take = g.entries.slice(0, left)
    left -= take.length
    hidden += g.entries.length - take.length
    out.push({ ...g, entries: take })
  }
  return { groups: out, hidden }
}

/** 'dd/mm' a partir de occurredAt; sem data válida devolve null. */
export function dayLabel(iso?: string): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (m) return `${m[3]}/${m[2]}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
