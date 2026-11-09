import { describe, it, expect, vi, afterEach } from 'vitest'
import { pluggyCall } from '../src/lib/pluggyApi'

afterEach(() => vi.unstubAllGlobals())

describe('pluggyCall', () => {
  it('envia action e devolve status', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, status: { configured: true, connected: false } })))
    vi.stubGlobal('fetch', f)
    const s = await pluggyCall('status')
    expect(s.configured).toBe(true)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/pluggy')
    expect(JSON.parse(String(init.body))).toEqual({ action: 'status' })
    expect(init.credentials).toBe('same-origin')
  })
  it('lança a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'ID da conexão inválido' }), { status: 400 })))
    await expect(pluggyCall('register-item', { itemId: 'x' })).rejects.toThrow('ID da conexão inválido')
  })
})
