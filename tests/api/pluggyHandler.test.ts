import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SyncPayload } from '../../src/lib/syncService'

const h = vi.hoisted(() => ({ payload: null as unknown, getItem: null as null | (() => Promise<unknown>) }))

vi.mock('../../api/lib/gist', () => ({
  getGistPayload: vi.fn(async () => h.payload),
  setGistPayload: vi.fn(async () => {}),
}))
vi.mock('../../api/lib/pluggyClient', async () => {
  const actual = await vi.importActual<typeof import('../../api/lib/pluggyClient')>('../../api/lib/pluggyClient')
  return {
    ...actual,
    createPluggyClient: () => ({
      getItem: () => h.getItem!(),
      getCreditAccounts: async () => [],
      getBills: async () => [],
      getTransactions: async () => [],
    }),
  }
})

import handler from '../../api/pluggy'
import { createSession } from '../../api/lib/auth'
import { PluggyError } from '../../api/lib/pluggyClient'

const AUTH = 'fake-auth-secret'
const CRON = 'fake-cron-secret'
const UUID = '11111111-2222-3333-4444-555555555555'
const base = (): SyncPayload => ({ manual_months: [], goals: [], recurring_items: [], investment_positions: [] })

function setPluggyEnv() {
  vi.stubEnv('PLUGGY_CLIENT_ID', 'fake-id')
  vi.stubEnv('PLUGGY_CLIENT_SECRET', 'fake-secret')
}
async function post(body: unknown, opts: { cookie?: boolean; origin?: string; host?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', host: opts.host ?? 'app.test' }
  if (opts.origin) headers.origin = opts.origin
  if (opts.cookie !== false) headers.cookie = `ff_session=${await createSession(AUTH, Date.now())}`
  return handler(new Request('https://app.test/api/pluggy', { method: 'POST', headers, body: JSON.stringify(body) }))
}
const get = (auth?: string) =>
  handler(new Request('https://app.test/api/pluggy', { method: 'GET', headers: auth ? { authorization: auth } : {} }))

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('AUTH_SECRET', AUTH)
  vi.stubEnv('PLUGGY_CLIENT_ID', '')
  vi.stubEnv('PLUGGY_CLIENT_SECRET', '')
  vi.stubEnv('CRON_SECRET', '')
  h.payload = base()
  h.getItem = async () => ({ id: 'it', status: 'UPDATED' })
})

describe('GET (cron)', () => {
  it('500 sem CRON_SECRET', async () => {
    expect((await get('Bearer x')).status).toBe(500)
  })
  it('401 com bearer errado ou ausente', async () => {
    vi.stubEnv('CRON_SECRET', CRON)
    expect((await get('Bearer errado')).status).toBe(401)
    expect((await get()).status).toBe(401)
  })
  it('skipped not-configured sem env da Pluggy', async () => {
    vi.stubEnv('CRON_SECRET', CRON)
    const r = await get(`Bearer ${CRON}`)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, skipped: 'not-configured' })
  })
  it('skipped no-item quando o gist não tem pluggy', async () => {
    vi.stubEnv('CRON_SECRET', CRON)
    setPluggyEnv()
    const r = await get(`Bearer ${CRON}`)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, skipped: 'no-item' })
  })
})

describe('POST', () => {
  it('403 em origem cruzada', async () => {
    expect((await post({ action: 'status' }, { origin: 'https://evil.test' })).status).toBe(403)
  })
  it('401 sem cookie de sessão', async () => {
    expect((await post({ action: 'status' }, { cookie: false })).status).toBe(401)
  })
  it('status sem env devolve configured=false; sync devolve 503', async () => {
    const r = await post({ action: 'status' })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ok).toBe(true)
    expect(j.status.configured).toBe(false)
    expect((await post({ action: 'sync' })).status).toBe(503)
  })
})

describe('mapeamento de erros', () => {
  const reg = () => post({ action: 'register-item', itemId: UUID })
  beforeEach(() => setPluggyEnv())

  it.each([
    [401, 503],
    [404, 404],
    [500, 502],
  ])('PluggyError %i -> %i', async (from, to) => {
    h.getItem = async () => { throw new PluggyError('x', from) }
    expect((await reg()).status).toBe(to)
  })
  it('uuid inválido -> 400 com a mensagem', async () => {
    const r = await post({ action: 'register-item', itemId: 'nao-e-uuid' })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/ID da conexão/)
  })
})
