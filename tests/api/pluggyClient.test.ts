import { describe, it, expect, vi } from 'vitest'
import { createPluggyClient, PluggyError } from '../../api/lib/pluggyClient'

function mockFetch(routes: Record<string, unknown>, calls: string[] = []) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    calls.push(`${init?.method ?? 'GET'} ${u.replace('https://api.pluggy.ai', '')}`)
    const key = Object.keys(routes).find(k => u.replace('https://api.pluggy.ai', '').startsWith(k))
    if (!key) return new Response('{}', { status: 404 })
    const body = routes[key]
    if (body instanceof Response) return body
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
}
const creds = { clientId: 'id', clientSecret: 'sec' }

describe('pluggyClient', () => {
  it('autentica uma vez e envia X-API-KEY', async () => {
    const f = mockFetch({ '/auth': { apiKey: 'K' }, '/items/it': { id: 'it', status: 'UPDATED' } })
    const c = createPluggyClient(creds, f)
    await c.getItem('it'); await c.getItem('it')
    const calls = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
    expect(calls.filter(([u]) => u.endsWith('/auth'))).toHaveLength(1)
    expect((calls[1][1].headers as Record<string, string>)['X-API-KEY']).toBe('K')
  })
  it('filtra só contas CREDIT', async () => {
    const f = mockFetch({ '/auth': { apiKey: 'K' }, '/accounts': { results: [{ id: 'a', type: 'BANK', name: 'cc' }, { id: 'b', type: 'CREDIT', name: 'cartão', number: '1234' }] } })
    expect((await createPluggyClient(creds, f).getCreditAccounts('it')).map(a => a.id)).toEqual(['b'])
  })
  it('pagina /v2/transactions pelo next', async () => {
    const calls: string[] = []
    let n = 0
    const f = vi.fn(async (url: string) => {
      const u = String(url).replace('https://api.pluggy.ai', '')
      calls.push(u)
      if (u === '/auth') return new Response(JSON.stringify({ apiKey: 'K' }))
      n++
      return new Response(JSON.stringify(n === 1
        ? { results: [{ id: 't1' }], next: '?accountId=a&after=CUR' }
        : { results: [{ id: 't2' }], next: null }))
    }) as unknown as typeof fetch
    const txs = await createPluggyClient(creds, f).getTransactions('a', '2026-10-04', '2026-11-10')
    expect(txs.map(t => t.id)).toEqual(['t1', 't2'])
    expect(calls[1]).toBe('/v2/transactions?accountId=a&dateFrom=2026-10-04&dateTo=2026-11-10')
    expect(calls[2]).toBe('/v2/transactions?accountId=a&after=CUR')
  })
  it('pagina /bills por page/totalPages', async () => {
    const f = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.endsWith('/auth')) return new Response(JSON.stringify({ apiKey: 'K' }))
      const page = Number(new URL(u).searchParams.get('page'))
      return new Response(JSON.stringify({ page, totalPages: 2, results: [{ id: `b${page}`, dueDate: '2026-11-10' }] }))
    }) as unknown as typeof fetch
    expect((await createPluggyClient(creds, f).getBills('a')).map(b => b.id)).toEqual(['b1', 'b2'])
  })
  it('erro de auth vira PluggyError 401 sem vazar segredo', async () => {
    const f = mockFetch({ '/auth': new Response(JSON.stringify({ message: 'bad' }), { status: 401 }) })
    await expect(createPluggyClient(creds, f).getItem('it')).rejects.toMatchObject({ name: 'PluggyError', status: 401 })
    await expect(createPluggyClient(creds, f).getItem('it')).rejects.not.toThrow(/sec/)
  })
})
