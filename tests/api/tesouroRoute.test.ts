import { describe, it, expect, vi, afterEach } from 'vitest'
import handler from '../../api/tesouro.ts'

const CSV_HOST = 'https://www.tesourotransparente.gov.br/'
const HEADER = 'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha'
const CSV = [
  HEADER,
  'Tesouro Selic;01/03/2029;02/11/2026;0,01;0,02;14.900,00;15.000,00;15.000,00',
  'Tesouro Selic;01/03/2029;30/10/2026;0,01;0,02;14.800,00;14.950,00;14.950,00',
].join('\n')

function mockCsv() {
  const f = vi.fn(async () => new Response(CSV, { status: 200 }))
  vi.stubGlobal('fetch', f)
  return f
}

afterEach(() => vi.unstubAllGlobals())

describe('/api/tesouro routing', () => {
  it('com ?data= delega ao caminho de PU histórico', async () => {
    const f = mockCsv()
    const res = await handler(new Request('https://app/api/tesouro?tipo=Tesouro%20Selic&venc=01/03/2029&data=2026-11-01'))
    expect(String(f.mock.calls[0][0])).toContain(CSV_HOST)
    const j = await res.json() as { pu: number | null; date?: string }
    expect(j).toHaveProperty('pu')
    expect(j.pu).toBe(14950)
    expect(j.date).toBe('2026-10-30')
  })

  it('PU com parâmetros inválidos degrada para pu:null', async () => {
    const f = mockCsv()
    const res = await handler(new Request('https://app/api/tesouro?data=xx'))
    expect(await res.json()).toEqual({ pu: null, error: 'bad_params' })
    expect(f).not.toHaveBeenCalled()
  })

  it('sem parâmetros mantém o caminho existente (lista de títulos)', async () => {
    const f = mockCsv()
    const res = await handler(new Request('https://app/api/tesouro'))
    expect(String(f.mock.calls[0][0])).toContain(CSV_HOST)
    const j = await res.json() as { titles: { name: string; pu: number }[]; baseDate: string }
    expect(j.baseDate).toBe('02/11/2026')
    expect(j.titles).toHaveLength(1)
    expect(j.titles[0]).toMatchObject({ name: 'Tesouro Selic 2029', pu: 15000 })
  })
})
