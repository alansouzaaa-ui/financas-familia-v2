import { describe, it, expect } from 'vitest'
import { buildCategoryReport, groupByMonth, limitGroups, summarize, dayLabel, SEM_CAT_KEY } from '../src/lib/categoryReport'
import { EXPENSE_TAGS, type MonthItem, type MonthPoint } from '../src/types/finance'

const tagMap = Object.fromEntries(EXPENSE_TAGS.map(t => [t.id, t]))
let n = 0
const it_ = (o: Partial<MonthItem>): MonthItem =>
  ({ id: `i${n++}`, description: 'x', value: 100, category: 'variableCosts', isPaid: true, ...o })
const mp = (month: string, year: number, label: string, items: MonthItem[]) =>
  ({ month, year, label, items } as unknown as MonthPoint)

const months = [
  mp('Ago', 2026, 'Ago/26', [it_({ tag: 'lazer', value: 999 })]),               // antes de REPORT_FROM
  mp('Set', 2026, 'Set/26', [
    it_({ tag: 'lazer', value: 50, occurredAt: '2026-09-03T10:00:00' }),
    it_({ tag: 'lazer', value: 70, occurredAt: '2026-09-20T10:00:00' }),
    it_({ category: 'revenue', value: 5000, tag: 'lazer' }),
    it_({ category: 'cards', value: 800 }),                                       // fatura agregada sem tag
    it_({ category: 'cards', value: 30, tag: 'pets' }),
    it_({ value: 10 }),                                                            // sem categoria
    it_({ value: 5, tag: 'tag-apagada' }),                                         // tag inexistente
  ]),
  mp('Out', 2026, 'Out/26', [it_({ tag: 'lazer', value: 20, occurredAt: '2026-10-01' })]),
]

describe('buildCategoryReport', () => {
  const r = buildCategoryReport(months, tagMap)
  it('aplica as regras de exclusão e soma', () => {
    expect(r.total).toBe(50 + 70 + 30 + 10 + 5 + 20)
    expect(r.semCat).toBe(15)
    expect(r.semCatCount).toBe(2)
    expect(r.rows.map(x => [x.id, x.value, x.count])).toEqual([['lazer', 140, 3], ['pets', 30, 1]])
  })
  it('lista exatamente os itens contados, mais recentes primeiro', () => {
    expect(r.entries.lazer.map(e => e.item.value)).toEqual([20, 70, 50])
    expect(r.entries[SEM_CAT_KEY]).toHaveLength(2)
    expect(r.entries.lazer.reduce((s, e) => s + e.item.value, 0)).toBe(r.rows[0].value)
  })
})

describe('groupByMonth / summarize / limitGroups', () => {
  const list = buildCategoryReport(months, tagMap).entries.lazer
  it('agrupa com mês mais novo primeiro e subtotal', () => {
    const g = groupByMonth(list)
    expect(g.map(x => [x.label, x.total, x.count])).toEqual([['Out/26', 20, 1], ['Set/26', 120, 2]])
  })
  it('resumo com média', () => {
    expect(summarize(list)).toEqual({ count: 3, total: 140, avg: 140 / 3 })
    expect(summarize([])).toEqual({ count: 0, total: 0, avg: 0 })
  })
  it('limita itens mantendo subtotais completos', () => {
    const { groups, hidden } = limitGroups(groupByMonth(list), 2)
    expect(hidden).toBe(1)
    expect(groups.map(g => g.entries.length)).toEqual([1, 1])
    expect(groups[1].total).toBe(120)
    expect(limitGroups(groupByMonth(list), 1).groups).toHaveLength(1)
  })
})

describe('dayLabel', () => {
  it('formata dd/mm', () => {
    expect(dayLabel('2026-10-01')).toBe('01/10')
    expect(dayLabel('2026-09-03T10:00:00')).toBe('03/09')
    expect(dayLabel(undefined)).toBeNull()
    expect(dayLabel('lixo')).toBeNull()
  })
})
