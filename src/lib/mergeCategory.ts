import type { ExpenseTag, MonthAbbr, MonthItem } from '@/types/finance'

// Parte pura da fusão de categorias (ex.: Restaurante → Alimentação).
// Calcula o que precisa mudar; quem aplica é `migrations.ts`.

export interface MergePlan {
  itemUpdates: { year: number; month: MonthAbbr; item: MonthItem }[]
  tags: ExpenseTag[]
  tagsChanged: boolean
  limits: Record<string, number>
  limitsChanged: boolean
}

interface MonthLike { year: number; month: string; items?: MonthItem[] }

export function planCategoryMerge(
  months: MonthLike[],
  tags: ExpenseTag[],
  limits: Record<string, number>,
  from: string,
  to: string,
  defaults: ExpenseTag[],
): MergePlan {
  const itemUpdates: MergePlan['itemUpdates'] = []
  for (const m of months) {
    for (const it of m.items ?? []) {
      if (it.tag === from) itemUpdates.push({ year: m.year, month: m.month as MonthAbbr, item: { ...it, tag: to } })
    }
  }

  let nextTags = tags
  let tagsChanged = false
  if (tags.some(t => t.id === from)) {
    nextTags = tags.filter(t => t.id !== from)
    tagsChanged = true
  }
  if (!nextTags.some(t => t.id === to)) {
    const def = defaults.find(t => t.id === to)
    if (def) { nextTags = [...nextTags, def]; tagsChanged = true }
  }

  let nextLimits = limits
  let limitsChanged = false
  if (from in limits) {
    nextLimits = { ...limits }
    const extra = Number(nextLimits[from]) || 0
    delete nextLimits[from]
    if (extra > 0) nextLimits[to] = Math.round(((nextLimits[to] ?? 0) + extra) * 100) / 100
    limitsChanged = true
  }

  return { itemUpdates, tags: nextTags, tagsChanged, limits: nextLimits, limitsChanged }
}
