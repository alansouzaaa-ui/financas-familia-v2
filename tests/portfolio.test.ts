import { describe, it, expect } from 'vitest'
import { enrichPositions, splitQuoteTickers } from '../src/lib/portfolio'
import type { BrapiQuote, InvestmentPosition } from '../src/types/investment'

const pos = (o: Partial<InvestmentPosition>): InvestmentPosition =>
  ({ id: 'x', ticker: 'PETR4', assetType: 'acao', quantity: 10, avgPrice: 20, buyDate: '2024-01-01', ...o }) as InvestmentPosition

const quote = (symbol: string, price: number): BrapiQuote => ({
  symbol, shortName: symbol, longName: symbol, currency: 'BRL',
  regularMarketPrice: price, regularMarketChange: 0, regularMarketChangePercent: 0, regularMarketPreviousClose: price,
})

describe('enrichPositions', () => {
  it('acao com cotacao usa preco de mercado', () => {
    const [e] = enrichPositions([pos({})], { PETR4: quote('PETR4', 30) })
    expect(e.totalInvested).toBe(200)
    expect(e.currentValue).toBe(300)
    expect(e.pnl).toBe(100)
    expect(e.pnlPercent).toBeCloseTo(50)
  })
  it('acao sem cotacao = investido', () => {
    const [e] = enrichPositions([pos({})], {})
    expect(e.currentValue).toBe(200)
    expect(e.pnl).toBe(0)
  })
  it('poupanca com manualValue usa o saldo', () => {
    const [e] = enrichPositions([pos({ ticker: 'POUPANCA CAIXA', assetType: 'poupanca', quantity: 1, avgPrice: 1000, manualValue: 1100 })], {})
    expect(e.currentValue).toBe(1100)
    expect(e.pnl).toBe(100)
  })
  it('tesouro usa PU do mapa; sem PU cai no investido', () => {
    const t = pos({ ticker: 'Tesouro Selic 2029', assetType: 'tesouro', quantity: 2, avgPrice: 100 })
    const [a] = enrichPositions([t], {}, new Map([['Tesouro Selic 2029', 150]]))
    expect(a.currentValue).toBe(300)
    const [b] = enrichPositions([t], {}, new Map())
    expect(b.currentValue).toBe(200)
  })
})

describe('splitQuoteTickers', () => {
  it('separa B3 e cripto, unicos e maiusculos, ignorando o resto', () => {
    const r = splitQuoteTickers([
      pos({ ticker: 'petr4' }), pos({ ticker: 'PETR4' }),
      pos({ ticker: 'mxrf11', assetType: 'fii' }), pos({ ticker: 'BOVA11', assetType: 'etf' }),
      pos({ ticker: 'btc', assetType: 'cripto' }),
      pos({ ticker: 'POUPANCA', assetType: 'poupanca' }),
      pos({ ticker: 'Tesouro Selic', assetType: 'tesouro' }),
      pos({ ticker: 'CDB X', assetType: 'renda_fixa' }),
      pos({ ticker: 'Outro', assetType: 'outro' }),
    ])
    expect(r.b3).toEqual(['PETR4', 'MXRF11', 'BOVA11'])
    expect(r.crypto).toEqual(['BTC'])
  })
})
