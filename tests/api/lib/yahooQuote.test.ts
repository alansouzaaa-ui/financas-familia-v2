import { describe, it, expect } from 'vitest'
import {
  toYahooSymbol,
  parseYahooChart,
  fetchYahooQuote,
  fetchManyQuotes,
} from '../../../api/lib/yahooQuote'

// Baseado em resposta real (range=5d) de ITSA4.SA
const itsa4 = {
  chart: {
    result: [
      {
        meta: {
          currency: 'BRL',
          symbol: 'ITSA4.SA',
          shortName: 'ITAUSA      PN      N1',
          longName: 'Itaúsa S.A.',
          gmtoffset: -10800,
          regularMarketTime: 1791317133,
          regularMarketPrice: 16.54,
          chartPreviousClose: 14.16,
        },
        timestamp: [1790773200, 1790859600, 1790946000, 1791205200, 1791291600],
        indicators: { quote: [{ close: [14.6, 14.44, 14.67, 16.36, 16.54] }] },
      },
    ],
    error: null,
  },
}

// IVVB11: candle de hoje com close null → prevClose = último close válido
const ivvb11 = {
  chart: {
    result: [
      {
        meta: { currency: 'BRL', gmtoffset: -10800, regularMarketTime: 1791317760, regularMarketPrice: 439.28, chartPreviousClose: 451.53 },
        timestamp: [1790773200, 1790859600, 1790946000, 1791205200, 1791291600],
        indicators: { quote: [{ close: [447.37, 452.08, 454.7, 439.15, null] }] },
      },
    ],
  },
}

describe('toYahooSymbol', () => {
  it('adiciona .SA para B3 e -BRL para cripto', () => {
    expect(toYahooSymbol('itsa4', 'b3')).toBe('ITSA4.SA')
    expect(toYahooSymbol('ITSA4.SA', 'b3')).toBe('ITSA4.SA')
    expect(toYahooSymbol('BTC', 'crypto')).toBe('BTC-BRL')
    expect(toYahooSymbol('ETH-USD', 'crypto')).toBe('ETH-USD')
  })
})

describe('parseYahooChart', () => {
  it('usa o penúltimo close quando o último candle é de hoje', () => {
    const q = parseYahooChart(itsa4, 'itsa4')!
    expect(q.symbol).toBe('ITSA4')
    expect(q.regularMarketPrice).toBe(16.54)
    expect(q.regularMarketPreviousClose).toBe(16.36)
    expect(q.regularMarketChange).toBeCloseTo(0.18, 5)
    expect(q.regularMarketChangePercent).toBeCloseTo((0.18 / 16.36) * 100, 4)
    expect(q.longName).toBe('Itaúsa S.A.')
    expect(q.currency).toBe('BRL')
  })

  it('usa o último close válido quando o candle de hoje é null', () => {
    const q = parseYahooChart(ivvb11, 'IVVB11')!
    expect(q.regularMarketPreviousClose).toBe(439.15)
    expect(q.regularMarketChange).toBeCloseTo(0.13, 5)
  })

  it('colapsa espaços múltiplos nos nomes', () => {
    const q = parseYahooChart(itsa4, 'itsa4')!
    expect(q.shortName).toBe('ITAUSA PN N1')
  })

  it('remove sufixo de moeda do nome de cripto', () => {
    const json = {
      chart: { result: [{ meta: { symbol: 'BTC-USD', shortName: 'Bitcoin   USD', longName: 'Bitcoin USD', regularMarketPrice: 100 } }] },
    }
    const q = parseYahooChart(json, 'BTC')!
    expect(q.shortName).toBe('Bitcoin')
    expect(q.longName).toBe('Bitcoin')
  })

  it('retorna null para JSON inválido ou sem preço', () => {
    expect(parseYahooChart(null, 'X')).toBeNull()
    expect(parseYahooChart({}, 'X')).toBeNull()
    expect(parseYahooChart({ chart: { result: null } }, 'X')).toBeNull()
    expect(parseYahooChart({ chart: { result: [{ meta: { regularMarketPrice: 0 } }] } }, 'X')).toBeNull()
  })
})

describe('fetchYahooQuote / fetchManyQuotes', () => {
  it('faz fallback X-USD × BRL=X para cripto sem par BRL', async () => {
    const mk = (price: number, close: number[], cur: string) => ({
      chart: { result: [{ meta: { currency: cur, shortName: 'Bitcoin   USD', gmtoffset: 0, regularMarketTime: 1791377358, regularMarketPrice: price }, timestamp: [1791244800, 1791331200], indicators: { quote: [{ close }] } }] },
    })
    const fetchImpl = async (url: string) => {
      if (url.includes('BTC-BRL')) return new Response('{}', { status: 404 })
      if (url.includes('BTC-USD')) return new Response(JSON.stringify(mk(100, [90, 100], 'USD')))
      if (url.includes('BRL%3DX')) return new Response(JSON.stringify(mk(5, [5, 5], 'BRL')))
      return new Response('{}', { status: 404 })
    }
    const q = await fetchYahooQuote('BTC', 'crypto', fetchImpl as unknown as typeof fetch)
    expect(q?.regularMarketPrice).toBe(500)
    expect(q?.regularMarketPreviousClose).toBe(450)
    expect(q?.currency).toBe('BRL')
    expect(q?.shortName).toBe('Bitcoin')
  })

  it('deduplica e ignora falhas sem derrubar os outros', async () => {
    const calls: string[] = []
    const fetchImpl = async (url: string) => {
      calls.push(url)
      if (url.includes('BAD3')) throw new Error('boom')
      if (url.includes('NOPE3')) return new Response('{}', { status: 404 })
      return new Response(JSON.stringify(itsa4))
    }
    const out = await fetchManyQuotes(
      [
        { ticker: 'ITSA4', kind: 'b3' },
        { ticker: 'itsa4', kind: 'b3' },
        { ticker: 'BAD3', kind: 'b3' },
        { ticker: 'NOPE3', kind: 'b3' },
        { ticker: 'BBAS3', kind: 'b3' },
      ],
      fetchImpl as unknown as typeof fetch,
    )
    expect(out.map((q) => q.symbol).sort()).toEqual(['BBAS3', 'ITSA4'])
    expect(calls.filter((u) => u.includes('ITSA4.SA'))).toHaveLength(1)
  })
})
