import { CATEGORY_COLORS, CATEGORY_LABELS, MONTHS, type ExpenseTag, type MonthItem, type MonthPoint } from '../types/finance'
import { guessTag } from './autoTag'

export type BudgetStatus = 'ok' | 'alerta' | 'estourado' | 'sem-limite'

export interface BudgetLine {
  key: string; label: string; emoji: string; color: string
  spent: number; limit: number | null; pct: number | null
  status: BudgetStatus; count: number; inferredCount: number
}

export interface BudgetSummary {
  lines: BudgetLine[]
  revenue: number; spent: number; budgeted: number
  plannedSurplus: number | null
  overCount: number; alertCount: number; inferredCount: number
}

const cents = (n: number) => Math.round(n * 100) / 100

const GROUP_EMOJI: Record<string, string> = {
  fixedCosts: '📌', loans: '🏦', cards: '💳', variableCosts: '🧾', renegociacoes: '🤝',
}

export function lineKeyOf(item: MonthItem, tagMap: Record<string, ExpenseTag>): { key: string; inferred: boolean } {
  if (item.tag && tagMap[item.tag]) return { key: item.tag, inferred: false }
  const guess = guessTag(item.description)
  if (guess && tagMap[guess]) return { key: guess, inferred: true }
  return { key: `grp:${item.category}`, inferred: false }
}

export function lineMeta(key: string, tagMap: Record<string, ExpenseTag>): { label: string; emoji: string; color: string } {
  const t = tagMap[key]
  if (t) return { label: t.label, emoji: t.emoji, color: t.color }
  const cat = key.startsWith('grp:') ? key.slice(4) : key
  return {
    label: CATEGORY_LABELS[cat] ?? cat,
    emoji: GROUP_EMOJI[cat] ?? '📦',
    color: CATEGORY_COLORS[cat] ?? '#94A3B8',
  }
}

export function statusFor(spent: number, limit: number | null): BudgetStatus {
  if (limit === null || !(limit > 0)) return 'sem-limite'
  const pct = spent / limit
  if (pct >= 1) return 'estourado'
  if (pct >= 0.8) return 'alerta'
  return 'ok'
}

const toMap = (tags: ExpenseTag[]) => Object.fromEntries(tags.map(t => [t.id, t])) as Record<string, ExpenseTag>
const validValue = (v: number) => typeof v === 'number' && Number.isFinite(v) && v > 0

export function computeBudget(items: MonthItem[], limits: Record<string, number>, tags: ExpenseTag[]): BudgetSummary {
  const tagMap = toMap(tags)
  let revenue = 0
  const acc = new Map<string, { spent: number; count: number; inferred: number }>()

  for (const it of items) {
    if (!validValue(it.value)) continue
    if (it.category === 'revenue') { revenue += it.value; continue }
    const { key, inferred } = lineKeyOf(it, tagMap)
    const a = acc.get(key) ?? { spent: 0, count: 0, inferred: 0 }
    a.spent += it.value
    a.count += 1
    if (inferred) a.inferred += 1
    acc.set(key, a)
  }
  for (const [k, v] of Object.entries(limits)) {
    if (validValue(v) && !acc.has(k)) acc.set(k, { spent: 0, count: 0, inferred: 0 })
  }

  const lines: BudgetLine[] = [...acc.entries()].map(([key, a]) => {
    const raw = limits[key]
    const limit = validValue(raw) ? cents(raw) : null
    const spent = cents(a.spent)
    return {
      key, ...lineMeta(key, tagMap), spent, limit,
      pct: limit ? (spent / limit) * 100 : null,
      status: statusFor(spent, limit),
      count: a.count, inferredCount: a.inferred,
    }
  })
  const rank = (s: BudgetStatus) => (s === 'estourado' ? 0 : s === 'alerta' ? 1 : 2)
  lines.sort((a, b) => rank(a.status) - rank(b.status) || b.spent - a.spent)

  const budgeted = cents(Object.values(limits).filter(validValue).reduce((s, v) => s + v, 0))
  revenue = cents(revenue)
  return {
    lines,
    revenue,
    spent: cents(lines.reduce((s, l) => s + l.spent, 0)),
    budgeted,
    plannedSurplus: budgeted > 0 ? cents(revenue - budgeted) : null,
    overCount: lines.filter(l => l.status === 'estourado').length,
    alertCount: lines.filter(l => l.status === 'alerta').length,
    inferredCount: lines.reduce((s, l) => s + l.inferredCount, 0),
  }
}

// Meses que embasam a sugestão: anteriores ao mês corrente e com ao menos uma
// despesa lançada por item (meses só com totais agregados não servem).
export function suggestionBasis(months: MonthPoint[], now: Date, n = 3): MonthPoint[] {
  const cur = now.getFullYear() * 100 + now.getMonth() + 1
  const key = (m: MonthPoint) => m.year * 100 + MONTHS.indexOf(m.month) + 1
  return months
    .filter(m => key(m) < cur && (m.items ?? []).some(i => i.category !== 'revenue' && validValue(i.value)))
    .sort((a, b) => key(b) - key(a))
    .slice(0, n)
}

export function suggestLimits(months: MonthPoint[], now: Date, tags: ExpenseTag[], n = 3): Record<string, number> {
  const tagMap = toMap(tags)
  const used = suggestionBasis(months, now, n)
  if (used.length === 0) return {}

  const totals: Record<string, number> = {}
  for (const m of used) {
    for (const it of m.items ?? []) {
      if (it.category === 'revenue' || !validValue(it.value)) continue
      const { key: k } = lineKeyOf(it, tagMap)
      totals[k] = (totals[k] ?? 0) + it.value
    }
  }
  const out: Record<string, number> = {}
  for (const [k, total] of Object.entries(totals)) {
    const avg = cents(total / used.length)
    if (avg > 0) out[k] = Math.ceil(avg / 10 - 1e-9) * 10
  }
  return out
}
