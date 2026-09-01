import { describe, it, expect, beforeEach } from 'vitest'

// Set env vars before importing handlers
beforeEach(() => {
  process.env.APP_USER = 'alan'
  process.env.APP_PASS = 'senha'
  process.env.AUTH_SECRET = 'secret'
})

describe('POST /api/auth/login', () => {
  it('sets a session cookie for the configured user', async () => {
    const { default: login } = await import('../../api/auth/login.ts')
    const res = await login(new Request('https://app/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ user: 'alan', pass: 'senha' }),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('ff_session=')
  })

  it('returns 401 for wrong credentials', async () => {
    const { default: login } = await import('../../api/auth/login.ts')
    const res = await login(new Request('https://app/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ user: 'alan', pass: 'wrong' }),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body', async () => {
    const { default: login } = await import('../../api/auth/login.ts')
    const res = await login(new Request('https://app/api/auth/login', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'text/plain' },
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing fields', async () => {
    const { default: login } = await import('../../api/auth/login.ts')
    const res = await login(new Request('https://app/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ user: 'alan' }),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/auth/session', () => {
  it('returns authenticated: false when no cookie', async () => {
    const { default: session } = await import('../../api/auth/session.ts')
    const res = await session(new Request('https://app/api/auth/session'))
    expect(res.status).toBe(200)
    const body = await res.json() as { authenticated: boolean }
    expect(body.authenticated).toBe(false)
  })

  it('returns authenticated: true with valid session cookie', async () => {
    const { default: login } = await import('../../api/auth/login.ts')
    const { default: session } = await import('../../api/auth/session.ts')

    const loginRes = await login(new Request('https://app/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ user: 'alan', pass: 'senha' }),
      headers: { 'Content-Type': 'application/json' },
    }))
    const cookie = loginRes.headers.get('set-cookie') ?? ''
    const tokenMatch = cookie.match(/ff_session=([^;]+)/)
    const token = tokenMatch ? tokenMatch[1] : ''

    const sessionRes = await session(new Request('https://app/api/auth/session', {
      headers: { 'Cookie': `ff_session=${token}` },
    }))
    expect(sessionRes.status).toBe(200)
    const body = await sessionRes.json() as { authenticated: boolean }
    expect(body.authenticated).toBe(true)
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const { default: logout } = await import('../../api/auth/logout.ts')
    const res = await logout(new Request('https://app/api/auth/logout', { method: 'POST' }))
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('ff_session=')
    expect(cookie).toContain('Max-Age=0')
  })
})
