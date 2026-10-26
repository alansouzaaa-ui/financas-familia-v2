import { describe, it, expect } from 'vitest'
import { planCategoryMerge } from '../src/lib/mergeCategory'
import { EXPENSE_TAGS, type MonthItem } from '../src/types/finance'

const it_ = (id: string, tag?: string): MonthItem =>
  ({ id, description: id, value: 10, category: 'variableCosts', isPaid: true, tag })
const months = [
  { year: 2026, month: 'Set', items: [it_('a', 'restaurante'), it_('b', 'lazer')] },
  { year: 2026, month: 'Out', items: [it_('c', 'restaurante'), it_('d')] },
  { year: 2026, month: 'Nov' },
]
const tags = EXPENSE_TAGS.filter(t => t.id !== 'alimentacao').concat({ id: 'restaurante', label: 'Restaurante', emoji: '🍔', color: '#000' })

describe('planCategoryMerge', () => {
  const p = planCategoryMerge(months, tags, { restaurante: 100, alimentacao: 50.5 }, 'restaurante', 'alimentacao', EXPENSE_TAGS)
  it('move só os itens da categoria origem', () => {
    expect(p.itemUpdates.map(u => [u.month, u.item.id, u.item.tag])).toEqual([['Set', 'a', 'alimentacao'], ['Out', 'c', 'alimentacao']])
  })
  it('remove a tag antiga e garante a de destino', () => {
    expect(p.tagsChanged).toBe(true)
    expect(p.tags.some(t => t.id === 'restaurante')).toBe(false)
    expect(p.tags.some(t => t.id === 'alimentacao')).toBe(true)
  })
  it('soma limites e remove a chave antiga', () => {
    expect(p.limits).toEqual({ alimentacao: 150.5 })
    expect(p.limitsChanged).toBe(true)
  })
  it('limite só na origem vira o da destino', () => {
    expect(planCategoryMerge([], [], { restaurante: 80 }, 'restaurante', 'alimentacao', EXPENSE_TAGS).limits).toEqual({ alimentacao: 80 })
  })
  it('é idempotente: segunda rodada não muda nada', () => {
    const again = planCategoryMerge(
      months.map(m => ({ ...m, items: m.items?.map(i => i.tag === 'restaurante' ? { ...i, tag: 'alimentacao' } : i) })),
      p.tags, p.limits, 'restaurante', 'alimentacao', EXPENSE_TAGS)
    expect(again.itemUpdates).toHaveLength(0)
    expect(again.tagsChanged).toBe(false)
    expect(again.limitsChanged).toBe(false)
  })
})
