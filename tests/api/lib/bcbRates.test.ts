import { describe, expect, it } from 'vitest'
import { fetchBcbRates, parseBcbValue } from '../../../api/lib/bcbRates'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function fake(map: Record<string, unknown>) {
  return async (url: string) => {
    for (const [k, v] of Object.entries(map)) {
      if (url.includes(`sgs.${k}/`)) {
        if (v === 'throw') throw new Error('net')
        if (v === 'fail') return json({ error: 'Bad request' }, 400)
        return json(v)
      }
    }
    return json([], 404)
  }
}

const all = {
  432: [{ data: '04/11/2026', valor: '13.75' }],
  13522: [{ data: '01/08/2026', valor: '4.22' }],
  226: [{ data: '05/10/2026', valor: '0,1630' }],
  195: [{ data: '06/10/2026', valor: '0.6617' }],
  4389: [{ data: '05/10/2026', valor: '13.65' }, { data: '06/10/2026', valor: '13.65' }],
}

describe('parseBcbValue', () => {
  it('ponto, vírgula e inválidos', () => {
    expect(parseBcbValue('13.75')).toBe(13.75)
    expect(parseBcbValue('0,1630')).toBe(0.163)
    expect(parseBcbValue('1.234,5')).toBe(1234.5)
    expect(parseBcbValue('abc')).toBeNull()
    expect(parseBcbValue(undefined)).toBeNull()
  })
})

describe('fetchBcbRates', () => {
  it('lê todas as séries e usa o último valor do CDI', async () => {
    const r = await fetchBcbRates(fake(all), new Date('2026-10-07T12:00:00Z'))
    expect(r).toMatchObject({ selic: 13.75, cdi: 13.65, ipca12m: 4.22, tr: 0.163, poupancaMonthly: 0.6617, refDate: '2026-10-06' })
    expect(r.cdiEstimated).toBeUndefined()
  })
  it('série falhando vira null', async () => {
    const r = await fetchBcbRates(fake({ ...all, 13522: 'fail', 226: 'throw' }))
    expect(r.ipca12m).toBeNull()
    expect(r.tr).toBeNull()
    expect(r.selic).toBe(13.75)
  })
  it('cdi ausente → selic - 0,10 estimado', async () => {
    const r = await fetchBcbRates(fake({ ...all, 4389: 'fail' }))
    expect(r.cdi).toBeCloseTo(13.65, 6)
    expect(r.cdiEstimated).toBe(true)
  })
  it('tudo falhando → tudo null, sem lançar', async () => {
    const r = await fetchBcbRates(async () => { throw new Error('x') })
    expect(r).toEqual({ selic: null, cdi: null, ipca12m: null, tr: null, poupancaMonthly: null, refDate: null })
  })
})
