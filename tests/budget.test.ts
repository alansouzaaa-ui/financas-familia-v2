import { describe, it, expect } from 'vitest'
import { lineKeyOf, lineMeta, statusFor, computeBudget, suggestLimits } from '../src/lib/budget'
import { EXPENSE_TAGS, type MonthItem, type MonthPoint } from '../src/types/finance'

const tagMap = Object.fromEntries(EXPENSE_TAGS.map(t => [t.id, t]))
let seq = 0
const item = (o: Partial<MonthItem>): MonthItem => ({
  id: `i${seq++}`, description: 'x', value: 100, category: 'variableCosts', isPaid: true, ...o,
})
const mp = (month: string, year: number, items: MonthItem[]): MonthPoint =>
  ({ month, year, items, revenue: 0, totalExpenses: 0 } as unknown as MonthPoint)

describe('lineKeyOf', () => {
  it('usa tag explícita', () => {
    expect(lineKeyOf(item({ tag: 'lazer', description: 'IFOOD' }), tagMap)).toEqual({ key: 'lazer', inferred: false })
  })
  it('infere pela descrição', () => {
    expect(lineKeyOf(item({ description: 'IFOOD pedido' }), tagMap)).toEqual({ key: 'restaurante', inferred: true })
  })
  it('cai no grupo da categoria', () => {
    expect(lineKeyOf(item({ description: 'zzz qqq', category: 'loans' }), tagMap)).toEqual({ key: 'grp:loans', inferred: false })
  })
})

describe('lineMeta', () => {
  it('tag e grupo', () => {
    expect(lineMeta('lazer', tagMap).label).toBe(tagMap.lazer.label)
    expect(lineMeta('grp:cards', tagMap)).toMatchObject({ label: 'Cartões', emoji: '💳' })
    expect(lineMeta('grp:revenue', tagMap).emoji).toBe('📦')
  })
})

describe('statusFor', () => {
  it('faixas', () => {
    expect(statusFor(79.9, 100)).toBe('ok')
    expect(statusFor(80, 100)).toBe('alerta')
    expect(statusFor(100, 100)).toBe('estourado')
    expect(statusFor(50, null)).toBe('sem-limite')
    expect(statusFor(50, 0)).toBe('sem-limite')
  })
})

describe('computeBudget', () => {
  const items = [
    item({ category: 'revenue', value: 5000, description: 'Salario' }),
    item({ tag: 'lazer', value: 120 }),
    item({ tag: 'moradia', value: 900 }),
    item({ description: 'IFOOD pedido', value: 90 }),
    item({ description: 'zzz', category: 'loans', value: 300 }),
    item({ tag: 'lazer', value: -5 }),
    item({ tag: 'lazer', value: NaN }),
  ]
  const limits = { lazer: 100, moradia: 1000, restaurante: 100, pets: 50 }
  const s = computeBudget(items, limits, EXPENSE_TAGS)

  it('separa receita e ignora inválidos', () => {
    expect(s.revenue).toBe(5000)
    expect(s.spent).toBe(1410)
    expect(s.lines.find(l => l.key === 'lazer')!.count).toBe(1)
  })
  it('ordena estourado, alerta, resto', () => {
    expect(s.lines.map(l => l.status)).toEqual(['estourado', 'alerta', 'alerta', 'sem-limite', 'ok'])
    expect(s.lines[0].key).toBe('lazer')
    expect(s.overCount).toBe(1)
    expect(s.alertCount).toBe(2)
  })
  it('linha com limite e sem gasto aparece', () => {
    const pets = s.lines.find(l => l.key === 'pets')!
    expect(pets).toMatchObject({ spent: 0, limit: 50, status: 'ok', count: 0 })
  })
  it('budgeted, plannedSurplus e inferidos', () => {
    expect(s.budgeted).toBe(1250)
    expect(s.plannedSurplus).toBe(3750)
    expect(s.inferredCount).toBe(1)
    expect(s.lines.find(l => l.key === 'restaurante')!.inferredCount).toBe(1)
    expect(s.lines.find(l => l.key === 'lazer')!.pct).toBe(120)
  })
  it('sem limites: plannedSurplus null', () => {
    expect(computeBudget(items, {}, EXPENSE_TAGS).plannedSurplus).toBeNull()
  })
})

describe('suggestLimits', () => {
  const now = new Date(2026, 9, 15) // outubro/2026
  const months = [
    mp('Out', 2026, [item({ tag: 'lazer', value: 9999 })]),
    mp('Set', 2026, [item({ tag: 'lazer', value: 100 }), item({ tag: 'pets', value: 31 })]),
    mp('Ago', 2026, [item({ tag: 'lazer', value: 200 })]),
    mp('Jul', 2026, [item({ tag: 'lazer', value: 4000 })]),
    mp('Jun', 2026, [item({ category: 'revenue', value: 5000 })]),
  ]
  it('ignora mês corrente, usa só n meses, zero em mês sem gasto e arredonda p/ cima', () => {
    const r = suggestLimits(months, now, EXPENSE_TAGS, 3)
    // meses usados: Set, Ago, Jul (Jun só tem receita e é pulado)
    expect(r.lazer).toBe(1440) // 4300/3 = 1433.33 -> 1440
    expect(r.pets).toBe(20) // 31/3 = 10.33 -> 20
  })
  it('n=2 usa Set e Ago', () => {
    const r = suggestLimits(months, now, EXPENSE_TAGS, 2)
    expect(r.lazer).toBe(150)
    expect(r.pets).toBe(20) // 31/2 = 15.5 -> 20
  })
  it('sem histórico retorna vazio', () => {
    expect(suggestLimits([], now, EXPENSE_TAGS)).toEqual({})
  })
})

describe('suggestionBasis', () => {
  it('usa só meses anteriores ao corrente com despesas por item, mais recentes primeiro', async () => {
    const { suggestionBasis } = await import('../src/lib/budget')
    const mk = (month: string, year: number, withItems: boolean) => ({
      month, year, label: `${month}/${String(year).slice(2)}`, revenue: 1, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0,
      source: 'manual', totalExpenses: 0, balance: 0, consolidatedRevenue: 0, consolidatedExpenses: 0, consolidatedBalance: 0,
      items: withItems ? [{ id: 'x', description: 'a', value: 10, category: 'fixedCosts', isPaid: true }] : [],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const months = [mk('Jul', 2026, true), mk('Ago', 2026, false), mk('Set', 2026, true), mk('Out', 2026, true)] as any
    const basis = suggestionBasis(months, new Date(2026, 9, 15), 3)
    expect(basis.map((m: { month: string }) => m.month)).toEqual(['Set', 'Jul'])
  })
})
