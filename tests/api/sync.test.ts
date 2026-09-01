import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the gist module to avoid real HTTP calls
vi.mock('../../api/lib/gist.ts', () => ({
  getGistPayload: vi.fn().mockResolvedValue({ manual_months: [], goals: [], recurring_items: [], investment_positions: [] }),
  setGistPayload: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  process.env.AUTH_SECRET = 'secret'
  process.env.APP_USER = 'alan'
  process.env.APP_PASS = 'senha'
})

describe('GET /api/sync without session', () => {
  it('returns 401 with { error: "unauthorized" }', async () => {
    const { default: sync } = await import('../../api/sync.ts')
    const res = await sync(new Request('https://app/api/sync', { method: 'GET' }))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('unauthorized')
  })
})

describe('GET /api/sync with valid session', () => {
  it('returns 200 with data', async () => {
    const { default: login } = await import('../../api/auth/login.ts')
    const { default: sync } = await import('../../api/sync.ts')

    const loginRes = await login(new Request('https://app/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ user: 'alan', pass: 'senha' }),
      headers: { 'Content-Type': 'application/json' },
    }))
    const cookie = loginRes.headers.get('set-cookie') ?? ''
    const tokenMatch = cookie.match(/ff_session=([^;]+)/)
    const token = tokenMatch ? tokenMatch[1] : ''

    const res = await sync(new Request('https://app/api/sync', {
      method: 'GET',
      headers: { 'Cookie': `ff_session=${token}` },
    }))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/sync without session', () => {
  it('returns 401 with { error: "unauthorized" }', async () => {
    const { default: sync } = await import('../../api/sync.ts')
    const res = await sync(new Request('https://app/api/sync', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('unauthorized')
  })
})

describe('CORS: cross-origin request', () => {
  it('returns 403 for a mismatched Origin header', async () => {
    const { default: sync } = await import('../../api/sync.ts')
    const res = await sync(new Request('https://app/api/sync', {
      method: 'GET',
      headers: {
        'Origin': 'https://evil.com',
        'Host': 'app',
      },
    }))
    expect(res.status).toBe(403)
  })
})
