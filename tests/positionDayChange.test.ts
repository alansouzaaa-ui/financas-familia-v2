import { describe, it, expect } from 'vitest'
import { enrichPositions, positionDayChange, splitQuoteTickers } from '../src/lib/portfolio'

const quote = (regularMarketChange: number) => ({
  symbol: 'X', shortName: 'X', longName: 'X', currency: 'BRL',
  regularMarketPrice: 10, regularMarketChange, regularMarketChangePercent: 0, regularMarketPreviousClose: 10,
})

describe('positionDayChange', () => {
  it('multiplica a variação por unidade pela quantidade', () => {
    expect(positionDayChange({ quantity: 84, quote: quote(0.5) })).toBe(42)
  })
  it('respeita quantidade fracionária e queda', () => {
    expect(positionDayChange({ quantity: 0.001, quote: quote(-17000) })).toBeCloseTo(-17, 10)
  })
  it('sem cotação é zero', () => {
    expect(positionDayChange({ quantity: 10, quote: null })).toBe(0)
  })
})

describe('ticker fracionário', () => {
  const pos = {
    id: 'a', ticker: 'EZTC3F', quantity: 84, avgPrice: 10, buyDate: '2026-10-27', assetType: 'acao' as const,
  }
  const q = (symbol: string, price: number, change: number, pct: number) => ({
    symbol, shortName: symbol, longName: symbol, currency: 'BRL',
    regularMarketPrice: price, regularMarketChange: change, regularMarketChangePercent: pct, regularMarketPreviousClose: price - change,
  })

  it('busca também o ticker base, sem repetir', () => {
    expect(splitQuoteTickers([pos, { ...pos, id: 'b', ticker: 'EZTC3' }]).b3.sort()).toEqual(['EZTC3', 'EZTC3F'])
  })

  it('usa a variação do base e mantém o preço do fracionário', () => {
    const [p] = enrichPositions([pos], { EZTC3F: q('EZTC3F', 9.41, 0, 0), EZTC3: q('EZTC3', 9.32, 0.32, 3.56) })
    expect(p.quote?.regularMarketPrice).toBe(9.41)
    expect(p.currentValue).toBeCloseTo(84 * 9.41, 10)
    expect(p.quote?.regularMarketChangePercent).toBe(3.56)
    expect(positionDayChange(p)).toBeCloseTo(84 * 0.32, 10)
  })

  it('sem cotação do base, mantém o que veio', () => {
    const [p] = enrichPositions([pos], { EZTC3F: q('EZTC3F', 9.41, 0, 0) })
    expect(positionDayChange(p)).toBe(0)
  })

  it('sem cotação do fracionário, não usa o base como preço', () => {
    const [p] = enrichPositions([pos], { EZTC3: q('EZTC3', 9.32, 0.32, 3.56) })
    expect(p.quote).toBeNull()
  })

  it('ticker comum não muda', () => {
    const itsa = { ...pos, ticker: 'ITSA4' }
    const [p] = enrichPositions([itsa], { ITSA4: q('ITSA4', 12, 0.3, 2.5) })
    expect(positionDayChange(p)).toBeCloseTo(84 * 0.3, 10)
  })
})
