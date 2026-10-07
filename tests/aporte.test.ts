import { describe, it, expect } from 'vitest'
import { classOf, waterFill, computeAporte, sanitizeTargets, DEFAULT_TARGETS, type AllocClass } from '../src/lib/aporte'

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)

describe('classOf', () => {
  it('mapeia tipos para classes', () => {
    expect(classOf('tesouro')).toBe('rendafixa')
    expect(classOf('renda_fixa')).toBe('rendafixa')
    expect(classOf('poupanca')).toBe('rendafixa')
    expect(classOf('acao')).toBe('acoes')
    expect(classOf('fii')).toBe('fiis')
    expect(classOf('etf')).toBe('etfs')
    expect(classOf('cripto')).toBe('cripto')
    expect(classOf('outro')).toBe('outros')
  })
})

describe('waterFill', () => {
  it('enche os menores primeiro', () => {
    const r = waterFill([100, 0, 50], 75)
    expect(r[0]).toBeCloseTo(0)
    expect(r[1]).toBeCloseTo(62.5)
    expect(r[2]).toBeCloseTo(12.5)
  })
  it('amount 0 ou negativo → zeros', () => {
    expect(waterFill([10, 20], 0)).toEqual([0, 0])
    expect(waterFill([10, 20], -5)).toEqual([0, 0])
  })
  it('lista vazia → []', () => {
    expect(waterFill([], 100)).toEqual([])
  })
  it('soma = amount', () => {
    expect(sum(waterFill([10, 300, 40, 40], 1234.56))).toBeCloseTo(1234.56, 6)
  })
})

describe('computeAporte', () => {
  const assets = [
    { id: '1', ticker: 'PETR4', assetType: 'acao' as const, value: 1000, price: 40 },
    { id: '2', ticker: 'HGLG11', assetType: 'fii' as const, value: 9000, price: 160 },
  ]
  const t = (o: Partial<Record<AllocClass, number>>) =>
    ({ rendafixa: 0, acoes: 0, fiis: 0, etfs: 0, cripto: 0, outros: 0, ...o }) as Record<AllocClass, number>

  it('classe acima do alvo recebe 0 e soma dos amounts = aporte', () => {
    const r = computeAporte(assets, t({ acoes: 50, fiis: 50 }), 1000)
    expect(r.classes.find((c) => c.cls === 'fiis')!.amount).toBe(0)
    expect(r.classes.find((c) => c.cls === 'acoes')!.amount).toBe(1000)
    expect(sum(r.classes.map((c) => c.amount))).toBeCloseTo(1000, 6)
    expect(r.leftover).toBeCloseTo(0)
  })
  it('soma dos amounts = aporte com targets padrão', () => {
    const r = computeAporte(assets, DEFAULT_TARGETS, 777.77)
    expect(sum(r.classes.map((c) => c.amount))).toBeCloseTo(777.77, 6)
  })
  it('carteira vazia 50/50 com 1000 → 500/500', () => {
    const r = computeAporte([], t({ rendafixa: 50, acoes: 50 }), 1000)
    expect(r.classes.find((c) => c.cls === 'rendafixa')!.amount).toBe(500)
    expect(r.classes.find((c) => c.cls === 'acoes')!.amount).toBe(500)
    for (const c of r.classes) expect(c.assets).toEqual([])
  })
  it('normaliza targets que não somam 100', () => {
    const r = computeAporte([], t({ rendafixa: 20, acoes: 20 }), 1000)
    expect(r.classes.find((c) => c.cls === 'rendafixa')!.targetPct).toBeCloseTo(50)
    expect(r.classes.find((c) => c.cls === 'acoes')!.amount).toBe(500)
  })
  it('targets todos 0 → leftover = aporte', () => {
    const r = computeAporte(assets, t({}), 1000)
    expect(r.allocated).toBe(0)
    expect(r.leftover).toBe(1000)
  })
  it('shares = floor(amount/price)', () => {
    const r = computeAporte(assets, t({ acoes: 100 }), 500)
    const s = r.classes.find((c) => c.cls === 'acoes')!.assets[0]
    expect(s.ticker).toBe('PETR4')
    expect(s.amount).toBe(500)
    expect(s.shares).toBe(12)
  })
  it('sem price → shares null', () => {
    const r = computeAporte(
      [{ id: 'x', ticker: 'CDB', assetType: 'renda_fixa', value: 100, price: null }],
      t({ rendafixa: 100 }),
      300
    )
    expect(r.classes[0].assets[0].shares).toBeNull()
  })
})

describe('sanitizeTargets', () => {
  it('null/não-objeto → defaults', () => {
    expect(sanitizeTargets(null)).toEqual(DEFAULT_TARGETS)
    expect(sanitizeTargets('x')).toEqual(DEFAULT_TARGETS)
    expect(sanitizeTargets(undefined)).toEqual(DEFAULT_TARGETS)
    expect(sanitizeTargets(null)).not.toBe(DEFAULT_TARGETS)
  })
  it('clampa e arredonda', () => {
    const r = sanitizeTargets({ rendafixa: 150, acoes: -5, fiis: 33.6 })
    expect(r.rendafixa).toBe(100)
    expect(r.acoes).toBe(0)
    expect(r.fiis).toBe(34)
  })
  it('chave faltando → default', () => {
    const r = sanitizeTargets({ rendafixa: 10 })
    expect(r.rendafixa).toBe(10)
    expect(r.etfs).toBe(DEFAULT_TARGETS.etfs)
  })
  it('ignora chave desconhecida', () => {
    const r = sanitizeTargets({ foo: 50 })
    expect(r).toEqual(DEFAULT_TARGETS)
    expect('foo' in r).toBe(false)
  })
  it('string/NaN → default', () => {
    const r = sanitizeTargets({ rendafixa: '50', acoes: NaN, fiis: Infinity })
    expect(r.rendafixa).toBe(DEFAULT_TARGETS.rendafixa)
    expect(r.acoes).toBe(DEFAULT_TARGETS.acoes)
    expect(r.fiis).toBe(DEFAULT_TARGETS.fiis)
  })
})
