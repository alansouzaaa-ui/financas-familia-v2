import type { RecurringItem } from '@/types/finance'

export function normalizeDesc(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

interface SyncItem { description: string; category: string; recurringId?: string }

export function findMissingRecurring(
  rules: RecurringItem[],
  items: SyncItem[],
): { missing: RecurringItem[]; links: { itemIndex: number; recurringId: string }[] } {
  const missing: RecurringItem[] = []
  const links: { itemIndex: number; recurringId: string }[] = []
  const linked = new Set<number>()
  const active = rules.filter(r => r.isActive && r.category !== 'cards')

  // Pass 1: matches by id take priority over legacy matches
  const byId = new Set(items.map(i => i.recurringId).filter(Boolean) as string[])
  for (const rule of active) {
    if (byId.has(rule.id)) continue
    const key = normalizeDesc(rule.description)
    const idx = items.findIndex((it, n) =>
      !it.recurringId && !linked.has(n) && it.category === rule.category && normalizeDesc(it.description) === key)
    if (idx >= 0) {
      linked.add(idx)
      links.push({ itemIndex: idx, recurringId: rule.id })
    } else {
      missing.push(rule)
    }
  }
  return { missing, links }
}

interface CopyItem { description: string; category: string; value: number; recurringId?: string }

export function dedupeCopy<T extends CopyItem>(
  prevItems: T[],
  currentItems: { description: string; category: string; value: number; recurringId?: string }[],
): T[] {
  return prevItems.filter(p => {
    if (p.category === 'cards') return false
    const key = normalizeDesc(p.description)
    return !currentItems.some(c =>
      (p.recurringId && c.recurringId && p.recurringId === c.recurringId) ||
      (c.category === p.category && normalizeDesc(c.description) === key && Math.abs(c.value - p.value) < 0.01))
  })
}
