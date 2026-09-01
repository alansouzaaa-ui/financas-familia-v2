import { describe, expect, it } from 'vitest'
import { createSession, verifySession, getSessionCookie, signPayload, verifyPayload } from '../../../api/lib/auth'

describe('session signatures', () => {
  it('accepts a session before its seven-day expiry', async () => {
    const now = 1_700_000_000_000
    const token = await createSession('secret', now)
    await expect(verifySession(token, 'secret', now + 6 * 86_400_000)).resolves.toBe(true)
  })

  it('rejects a tampered or expired session', async () => {
    const now = 1_700_000_000_000
    const token = await createSession('secret', now)
    await expect(verifySession(`${token}x`, 'secret', now)).resolves.toBe(false)
    await expect(verifySession(token, 'secret', now + 7 * 86_400_000)).resolves.toBe(false)
  })
})

describe('getSessionCookie', () => {
  it('includes all required cookie directives', async () => {
    const now = 1_700_000_000_000
    const token = await createSession('secret', now)
    const cookie = getSessionCookie(token, now)
    expect(cookie).toContain('ff_session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('Max-Age=604800')
  })
})

describe('signPayload / verifyPayload', () => {
  it('round-trips an arbitrary payload', async () => {
    const payload = { action: 'approve', id: 42 }
    const token = await signPayload(payload, 'secret')
    const result = await verifyPayload<typeof payload>(token, 'secret')
    expect(result).toEqual(payload)
  })

  it('returns null for a tampered payload', async () => {
    const token = await signPayload({ x: 1 }, 'secret')
    const result = await verifyPayload(`${token}bad`, 'secret')
    expect(result).toBeNull()
  })
})
