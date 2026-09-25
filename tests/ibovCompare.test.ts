import { describe, it, expect } from 'vitest'
import { ibovCloseOnOrBefore, compareToIbov, type PosForCompare } from '../src/lib/ibovCompare'

const HISTORY = [
  { date: '2026-01-05', close: 100 },
  { date: '2026-01-06', close: 102 },
  { date: '2026-02-02', close: 120 },
]

describe('ibovCloseOnOrBefore', () => {
  it('acha o fechamento exato da data', () => {
    expect(ibovCloseOnOrBefore(HISTORY, '2026-01-06')).toBe(102)
  })
  it('usa o pregão anterior mais próximo quando a data não tem fechamento', () => {
    expect(ibovCloseOnOrBefore(HISTORY, '2026-01-20')).toBe(102) // fim de semana/feriado → 06/01
  })
  it('comprou antes do 1º ponto → usa o mais antigo', () => {
    expect(ibovCloseOnOrBefore(HISTORY, '2025-12-01')).toBe(100)
  })
  it('histórico vazio → null', () => {
    expect(ibovCloseOnOrBefore([], '2026-01-05')).toBeNull()
  })
})

describe('compareToIbov', () => {
  it('compara money-weighted carteira × IBOV no mesmo período', () => {
    const positions: PosForCompare[] = [
      { totalInvested: 1000, currentValue: 1200, buyDate: '2026-01-05', valued: true },
    ]
    const r = compareToIbov(positions, HISTORY, 110)! // IBOV subiu de 100 → 110 (+10%)
    expect(r).not.toBeNull()
    expect(r.carteiraReturnPct).toBeCloseTo(20, 5)
    expect(r.ibovReturnPct).toBeCloseTo(10, 5)
    expect(r.deltaPp).toBeCloseTo(10, 5)
    expect(r.coverageCount).toBe(1)
    expect(r.investedBase).toBe(1000)
  })

  it('ignora posições sem valorização, sem data ou sem valor', () => {
    const positions: PosForCompare[] = [
      { totalInvested: 1000, currentValue: 1200, buyDate: '2026-01-05', valued: true },
      { totalInvested: 500, currentValue: 500, buyDate: '2026-01-05', valued: false }, // sem cotação
      { totalInvested: 800, currentValue: 900, buyDate: '', valued: true },             // sem data
      { totalInvested: 0, currentValue: 0, buyDate: '2026-01-06', valued: true },        // sem valor
    ]
    const r = compareToIbov(positions, HISTORY, 110)!
    expect(r.coverageCount).toBe(1)
    expect(r.investedBase).toBe(1000)
  })

  it('retorna null sem histórico ou sem IBOV', () => {
    const positions: PosForCompare[] = [
      { totalInvested: 1000, currentValue: 1200, buyDate: '2026-01-05', valued: true },
    ]
    expect(compareToIbov(positions, [], 110)).toBeNull()
    expect(compareToIbov(positions, HISTORY, 0)).toBeNull()
  })

  it('duas posições em datas diferentes ponderam pelo valor', () => {
    const positions: PosForCompare[] = [
      { totalInvested: 1000, currentValue: 1000, buyDate: '2026-01-05', valued: true }, // IBOV 100→120 = +20%
      { totalInvested: 1000, currentValue: 1000, buyDate: '2026-02-02', valued: true }, // IBOV 120→120 = 0%
    ]
    const r = compareToIbov(positions, HISTORY, 120)!
    // ibovEquiv = 1000*(120/100) + 1000*(120/120) = 1200 + 1000 = 2200; base 2000 → +10%
    expect(r.ibovReturnPct).toBeCloseTo(10, 5)
    expect(r.carteiraReturnPct).toBeCloseTo(0, 5)
    expect(r.coverageCount).toBe(2)
  })
})
