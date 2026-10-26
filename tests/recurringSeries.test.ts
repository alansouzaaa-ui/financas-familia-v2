import { describe, it, expect } from 'vitest'
import {
  ym, parseYm, addMonths, seriesState, planSeries, planIsEmpty, applySeriesPlan,
  untilDecember, nextN, lastYm, firstYm, seriesItemId,
  type SeriesTemplate,
} from '../src/lib/recurringSeries'
import type { MonthAbbr, MonthItem } from '../src/types/finance'

const tpl: SeriesTemplate = { description: 'Internet', value: 100, category: 'fixedCosts', tag: 'servicos' }

// Mini "loja" em memória com a mesma semântica de upsertItem/removeItem
function makeStore(initial: { year: number; month: MonthAbbr; items: MonthItem[] }[] = []) {
  const months = initial.map(m => ({ ...m, items: [...m.items] }))
  const find = (y: number, m: MonthAbbr) => months.find(x => x.year === y && x.month === m)
  const api = {
    upsertItem(y: number, m: MonthAbbr, it: MonthItem) {
      let rec = find(y, m)
      if (!rec) { rec = { year: y, month: m, items: [] }; months.push(rec) }
      const idx = rec.items.findIndex(i => i.id === it.id)
      if (idx >= 0) rec.items[idx] = it; else rec.items.push(it)
    },
    removeItem(y: number, m: MonthAbbr, id: string) {
      const rec = find(y, m)
      if (rec) rec.items = rec.items.filter(i => i.id !== id)
    },
    getItem: (y: number, m: MonthAbbr, id: string) => find(y, m)?.items.find(i => i.id === id),
  }
  return { months, api }
}

const item = (o: Partial<MonthItem>): MonthItem => ({
  id: 'x', description: 'Internet', value: 100, category: 'fixedCosts', isPaid: false, recurringId: 'r1', ...o,
})

describe('ym helpers', () => {
  it('ym / parseYm round-trip', () => {
    expect(ym(2026, 'Out')).toBe('2026-10')
    expect(parseYm('2026-01')).toEqual({ year: 2026, month: 'Jan' })
  })
  it('addMonths crosses year boundaries both ways', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-05', 0)).toBe('2026-05')
    expect(addMonths('2026-12', 24)).toBe('2028-12')
  })
})

describe('presets', () => {
  it('untilDecember is inclusive of the start month', () => {
    expect(untilDecember('2026-10')).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(untilDecember('2026-12')).toEqual(['2026-12'])
  })
  it('nextN crosses the year boundary (Nov -> Oct next year for 12)', () => {
    const r = nextN('2026-11', 12)
    expect(r).toHaveLength(12)
    expect(r[0]).toBe('2026-11')
    expect(r[11]).toBe('2027-10')
  })
})

describe('seriesState', () => {
  const months = [
    { year: 2026, month: 'Out' as MonthAbbr, items: [item({ id: 'a', isPaid: true, value: 90 }), item({ id: 'z', recurringId: 'other' })] },
    { year: 2026, month: 'Nov' as MonthAbbr, items: [item({ id: 'b' }), item({ id: 'b2' })] },
    { year: 2026, month: 'Dez' as MonthAbbr, items: [] },
  ]
  it('maps months of the series only, reporting the first item and duplicates', () => {
    const st = seriesState(months, 'r1')
    expect([...st.keys()]).toEqual(['2026-10', '2026-11'])
    expect(st.get('2026-10')).toEqual({ itemId: 'a', isPaid: true, value: 90 })
    expect(st.get('2026-11')!.itemId).toBe('b')
    expect(st.duplicates).toBe(1)
  })
  it('first/last', () => {
    const st = seriesState(months, 'r1')
    expect(firstYm(st)).toBe('2026-10')
    expect(lastYm(st)).toBe('2026-11')
    expect(lastYm(new Map())).toBeUndefined()
  })
})

describe('planSeries', () => {
  it('adds selected months that are missing, with deterministic ids', () => {
    const plan = planSeries({
      ruleId: 'r1', state: new Map(), selected: new Set(['2026-11', '2026-12']),
      template: tpl, newValue: 120, updateExistingUnpaid: true,
    })
    expect(plan.add.map(a => a.item.id)).toEqual([seriesItemId('r1', '2026-11'), seriesItemId('r1', '2026-12')])
    expect(plan.add[0].item).toMatchObject({ value: 120, recurringId: 'r1', isPaid: false, tag: 'servicos', category: 'fixedCosts' })
    expect(plan.remove).toEqual([])
  })

  it('never adds the anchor month (the form owns it)', () => {
    const plan = planSeries({
      ruleId: 'r1', state: new Map(), selected: new Set(['2026-10', '2026-11']), anchorYm: '2026-10',
      template: tpl, newValue: 100, updateExistingUnpaid: false,
    })
    expect(plan.add.map(a => a.ym)).toEqual(['2026-11'])
  })

  it('never removes paid or anchor months, removes unpaid deselected', () => {
    const state = new Map([
      ['2026-10', { itemId: 'a', isPaid: false, value: 100 }], // âncora
      ['2026-11', { itemId: 'b', isPaid: true, value: 100 }],  // pago
      ['2026-12', { itemId: 'c', isPaid: false, value: 100 }],
      ['2027-01', { itemId: 'd', isPaid: false, value: 100 }],
    ])
    const plan = planSeries({
      ruleId: 'r1', state, selected: new Set(['2027-01']), anchorYm: '2026-10',
      template: tpl, newValue: 100, updateExistingUnpaid: true,
    })
    expect(plan.remove).toEqual([{ ym: '2026-12', itemId: 'c' }])
  })

  it('updates the value only on unpaid, selected, non-anchor months when the box is on', () => {
    const state = new Map([
      ['2026-10', { itemId: 'a', isPaid: false, value: 100 }], // âncora
      ['2026-11', { itemId: 'b', isPaid: true, value: 100 }],  // pago
      ['2026-12', { itemId: 'c', isPaid: false, value: 100 }],
      ['2027-01', { itemId: 'd', isPaid: false, value: 150 }], // já no valor novo
    ])
    const selected = new Set(['2026-10', '2026-11', '2026-12', '2027-01'])
    const on = planSeries({ ruleId: 'r1', state, selected, anchorYm: '2026-10', template: tpl, newValue: 150, updateExistingUnpaid: true })
    expect(on.update).toEqual([{ ym: '2026-12', itemId: 'c', value: 150 }])
    const off = planSeries({ ruleId: 'r1', state, selected, anchorYm: '2026-10', template: tpl, newValue: 150, updateExistingUnpaid: false })
    expect(off.update).toEqual([])
  })

  it('is idempotent: planning again right after applying yields nothing', () => {
    const store = makeStore()
    const selected = new Set(nextN('2026-11', 5))
    const args = { ruleId: 'r1', selected, template: tpl, newValue: 100, updateExistingUnpaid: true }
    const p1 = planSeries({ ...args, state: seriesState(store.months, 'r1') })
    expect(p1.add).toHaveLength(5)
    applySeriesPlan(p1, store.api)
    const p2 = planSeries({ ...args, state: seriesState(store.months, 'r1') })
    expect(planIsEmpty(p2)).toBe(true)
    // aplicar o mesmo plano duas vezes não duplica (ids determinísticos)
    applySeriesPlan(p1, store.api)
    expect(seriesState(store.months, 'r1').duplicates).toBe(0)
    expect(store.months.reduce((n, m) => n + m.items.length, 0)).toBe(5)
  })

  it('applies add + update + remove together and keeps paid months', () => {
    const store = makeStore([
      { year: 2026, month: 'Nov', items: [item({ id: 'b', isPaid: true })] },
      { year: 2026, month: 'Dez', items: [item({ id: 'c' })] },
      { year: 2027, month: 'Jan', items: [item({ id: 'd' })] },
    ])
    const plan = planSeries({
      ruleId: 'r1', state: seriesState(store.months, 'r1'),
      selected: new Set(['2026-12', '2027-02']), template: tpl, newValue: 130, updateExistingUnpaid: true,
    })
    applySeriesPlan(plan, store.api)
    const st = seriesState(store.months, 'r1')
    expect([...st.keys()].sort()).toEqual(['2026-11', '2026-12', '2027-02'])
    expect(st.get('2026-11')!.value).toBe(100) // pago: intacto
    expect(st.get('2026-12')!.value).toBe(130)
    expect(st.get('2027-02')!.value).toBe(130)
  })
})
