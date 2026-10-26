export function normalizeDesc(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
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
