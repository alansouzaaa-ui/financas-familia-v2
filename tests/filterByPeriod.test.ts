import { describe, it, expect, vi, afterEach } from 'vitest'
import { filterByPeriod } from '../src/lib/calculations'
import type { MonthPoint } from '../src/types/finance'

const point = (year: number, month: string) => ({ year, month }) as MonthPoint
const months = [
  point(2025, 'Dez'),
  point(2026, 'Jan'),
  point(2026, 'Set'),
  point(2026, 'Out'),
  point(2026, 'Nov'),
]
const custom = (from: string, to: string) =>
  filterByPeriod(months, 'custom', { from, to }).map(m => `${m.month}/${m.year}`)

describe('filterByPeriod: período personalizado (valor de input type="month")', () => {
  it('um único mês', () => {
    expect(custom('2026-10', '2026-10')).toEqual(['Out/2026'])
  })

  it('vários meses, incluindo as duas pontas', () => {
    expect(custom('2026-09', '2026-11')).toEqual(['Set/2026', 'Out/2026', 'Nov/2026'])
  })

  it('intervalo que cruza o ano', () => {
    expect(custom('2025-12', '2026-01')).toEqual(['Dez/2025', 'Jan/2026'])
  })

  it('só o início preenchido', () => {
    expect(custom('2026-10', '')).toEqual(['Out/2026', 'Nov/2026'])
  })

  it('só o fim preenchido', () => {
    expect(custom('', '2026-01')).toEqual(['Dez/2025', 'Jan/2026'])
  })

  it('sem início nem fim', () => {
    expect(custom('', '')).toHaveLength(months.length)
  })
})

describe('filterByPeriod: atalhos 3m/6m/12m (janela de calendário até o mês atual)', () => {
  afterEach(() => { vi.useRealTimers() })
  const labels = (list: MonthPoint[]) => list.map(m => `${m.month}/${m.year}`)
  const run = (now: Date, preset: string, list: MonthPoint[]) => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    return labels(filterByPeriod(list, preset))
  }

  it('exclui meses futuros', () => {
    const list = [point(2026, 'Out'), point(2026, 'Nov'), point(2026, 'Dez'), point(2027, 'Jan')]
    expect(run(new Date(2026, 10, 5), '3m', list)).toEqual(['Out/2026', 'Nov/2026'])
  })

  it("'3m' retorna os 3 meses até o atual", () => {
    expect(run(new Date(2026, 10, 5), '3m', months)).toEqual(['Set/2026', 'Out/2026', 'Nov/2026'])
  })

  it('janela que cruza o ano', () => {
    const list = [point(2026, 'Nov'), point(2026, 'Dez'), point(2027, 'Jan'), point(2027, 'Fev'), point(2027, 'Mar')]
    expect(run(new Date(2027, 1, 10), '3m', list)).toEqual(['Dez/2026', 'Jan/2027', 'Fev/2027'])
  })

  it('mês faltando não puxa mês mais antigo', () => {
    const list = [point(2026, 'Jun'), point(2026, 'Set'), point(2026, 'Nov')]
    expect(run(new Date(2026, 10, 5), '3m', list)).toEqual(['Set/2026', 'Nov/2026'])
  })

  it("'12m' tem no máximo 12 meses e termina no atual", () => {
    const all = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const list = [2025, 2026, 2027].flatMap(y => all.map(m => point(y, m)))
    const r = run(new Date(2026, 10, 5), '12m', list)
    expect(r).toHaveLength(12)
    expect(r[0]).toBe('Dez/2025')
    expect(r[r.length - 1]).toBe('Nov/2026')
  })
})
