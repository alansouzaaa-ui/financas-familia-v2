import { describe, it, expect } from 'vitest'
import { ibovCloseOnOrBefore, compareToIbov, expandForCompare, type PosForCompare } from '../src/lib/ibovCompare'
import { openLots } from '../src/lib/operations'
import type { InvestmentOperation } from '../src/types/investment'

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

describe('expandForCompare', () => {
  const base: PosForCompare = { totalInvested: 1000, currentValue: 1500, buyDate: '2026-02-02', valued: true }
  function o(over: Partial<InvestmentOperation> & Pick<InvestmentOperation, 'type'>): InvestmentOperation {
    return { id: Math.random().toString(36), positionId: 'p', date: '2026-01-05', createdAt: '2026-01-05T00:00:00.000Z', ...over }
  }

  it('sem lotes (posição sem operações) devolve a própria posição', () => {
    expect(expandForCompare(base, undefined)).toEqual([base])
    expect(expandForCompare(base, [])).toEqual([base])
  })

  it('divide custo e valor atual pelos lotes, cada um com a sua data', () => {
    const lots = openLots([
      o({ type: 'opening', quantity: 10, price: 30, date: '2026-01-05' }), // custo 300
      o({ type: 'buy', quantity: 10, price: 70, date: '2026-02-02' }),     // custo 700
    ])
    const out = expandForCompare(base, lots)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ buyDate: '2026-01-05', valued: true })
    expect(out[0].totalInvested).toBeCloseTo(300, 9)
    expect(out[0].currentValue).toBeCloseTo(450, 9)
    expect(out[1].totalInvested).toBeCloseTo(700, 9)
    expect(out[1].currentValue).toBeCloseTo(1050, 9)
    // as datas reais mudam o resultado frente a usar uma data só
    const multi = compareToIbov(out, HISTORY, 120)!
    const single = compareToIbov([base], HISTORY, 120)!
    expect(multi.ibovReturnPct).not.toBeCloseTo(single.ibovReturnPct, 3)
    expect(multi.coverageCount).toBe(2)
  })

  it('ignora lotes com data desconhecida (nos dois lados) mas mantém a proporção dos demais', () => {
    const lots = openLots([
      o({ type: 'opening', quantity: 10, price: 50, date: '2000-01-01', dateUnknown: true }), // custo 500
      o({ type: 'buy', quantity: 10, price: 50, date: '2026-01-06' }),                         // custo 500
    ])
    const out = expandForCompare(base, lots)
    expect(out).toHaveLength(1)
    expect(out[0].buyDate).toBe('2026-01-06')
    expect(out[0].totalInvested).toBeCloseTo(500, 9)
    expect(out[0].currentValue).toBeCloseTo(750, 9)
  })

  it('vendas reduzem todos os lotes proporcionalmente', () => {
    const lots = openLots([
      o({ type: 'opening', quantity: 10, price: 10, date: '2026-01-05' }),
      o({ type: 'buy', quantity: 10, price: 30, date: '2026-02-02' }),
      o({ type: 'sell', quantity: 10, price: 40, date: '2026-02-10' }),
    ])
    const out = expandForCompare({ totalInvested: 200, currentValue: 300, buyDate: '2026-01-05', valued: true }, lots)
    expect(out.map(x => x.totalInvested)).toEqual([expect.closeTo(50, 9), expect.closeTo(150, 9)])
  })
})
