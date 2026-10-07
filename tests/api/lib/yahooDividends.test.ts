import { describe, it, expect } from 'vitest'
import { parseYahooDividends, fetchYahooDividends, fetchManyDividends } from '../../../api/lib/yahooDividends'

// Baseado em resposta real (range=5y&interval=1mo&events=div) de MXRF11.SA
const mxrf11 = {
  chart: {
    result: [
      {
        meta: { currency: 'BRL', symbol: 'MXRF11.SA', gmtoffset: -10800 },
        timestamp: [1651374000, 1654052400],
        events: {
          dividends: {
            '1654052400': { amount: 0.108219, date: 1654088400 },
            '1651374000': { amount: 0.108219, date: 1651496400 },
            '1656644400': { amount: 0.098381, date: 1656680400 },
          },
        },
      },
    ],
    error: null,
  },
}

describe('parseYahooDividends', () => {
  it('converte e ordena por data asc', () => {
    const ev = parseYahooDividends(mxrf11)
    expect(ev).toEqual([
      { date: '2022-05-02', amount: 0.108219 },
      { date: '2022-06-01', amount: 0.108219 },
      { date: '2022-07-01', amount: 0.098381 },
    ])
  })

  it('usa o fuso UTC-3: perto da meia-noite UTC cai no dia anterior', () => {
    // 1654041600 = 2022-06-01T00:00:00Z → 2022-05-31 21:00 em Brasília
    const ev = parseYahooDividends({
      chart: { result: [{ events: { dividends: { '1654041600': { amount: 1, date: 1654041600 } } } }] },
    })
    expect(ev).toEqual([{ date: '2022-05-31', amount: 1 }])
  })

  it('ignora amount inválido e usa a chave quando falta date', () => {
    const ev = parseYahooDividends({
      chart: {
        result: [
          {
            events: {
              dividends: {
                '1654088400': { amount: 0, date: 1654088400 },
                '1656680400': { amount: -1, date: 1656680400 },
                '1659358800': { amount: 'x', date: 1659358800 },
                '1662037200': { amount: 0.5 },
              },
            },
          },
        ],
      },
    })
    expect(ev).toEqual([{ date: '2022-09-01', amount: 0.5 }])
  })

  it('devolve [] para formatos sem eventos / lixo', () => {
    expect(parseYahooDividends(null)).toEqual([])
    expect(parseYahooDividends({})).toEqual([])
    expect(parseYahooDividends({ chart: { result: [{ meta: {} }] } })).toEqual([])
    expect(parseYahooDividends({ chart: { result: null } })).toEqual([])
  })
})

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

describe('fetchYahooDividends', () => {
  it('monta a URL com .SA e events=div', async () => {
    let called = ''
    const f = (async (url: string) => {
      called = url
      return okResponse(mxrf11)
    }) as unknown as typeof fetch
    const ev = await fetchYahooDividends('mxrf11', f)
    expect(called).toContain('/v8/finance/chart/MXRF11.SA')
    expect(called).toContain('events=div')
    expect(ev).toHaveLength(3)
  })

  it('[] quando existe mas não paga; null em HTTP != 200 ou erro', async () => {
    const noDiv = (async () => okResponse({ chart: { result: [{ meta: {} }] } })) as unknown as typeof fetch
    expect(await fetchYahooDividends('ABCD3', noDiv)).toEqual([])
    const notFound = (async () => ({ ok: false, status: 404 }) as Response) as unknown as typeof fetch
    expect(await fetchYahooDividends('ABCD3', notFound)).toBeNull()
    const boom = (async () => { throw new Error('rede') }) as unknown as typeof fetch
    expect(await fetchYahooDividends('ABCD3', boom)).toBeNull()
    const nullResult = (async () => okResponse({ chart: { result: null } })) as unknown as typeof fetch
    expect(await fetchYahooDividends('ABCD3', nullResult)).toBeNull()
  })
})

describe('fetchManyDividends', () => {
  it('deduplica e isola falhas', async () => {
    const calls: string[] = []
    const f = (async (url: string) => {
      calls.push(url)
      if (url.includes('FAIL3')) throw new Error('boom')
      if (url.includes('NOPE3')) return { ok: false, status: 404 } as Response
      return okResponse(mxrf11)
    }) as unknown as typeof fetch
    const out = await fetchManyDividends(['mxrf11', 'MXRF11', 'FAIL3', 'NOPE3', 'ITSA4'], f)
    expect(calls).toHaveLength(4)
    expect(out.map((o) => o.symbol).sort()).toEqual(['ITSA4', 'MXRF11'])
    expect(out[0].events.length).toBe(3)
  })
})
