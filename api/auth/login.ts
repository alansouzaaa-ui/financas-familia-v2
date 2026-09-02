import { createSession, getSessionCookie } from '../lib/auth.ts'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 })
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).user !== 'string' ||
    typeof (body as Record<string, unknown>).pass !== 'string'
  ) {
    return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400 })
  }

  const { user, pass } = body as { user: string; pass: string }
  const APP_USER = process.env.APP_USER ?? ''
  const APP_PASS = process.env.APP_PASS ?? ''
  const AUTH_SECRET = process.env.AUTH_SECRET ?? ''

  if (!APP_USER || !APP_PASS || !AUTH_SECRET) {
    return new Response(JSON.stringify({ error: 'env_missing' }), { status: 500 })
  }

  if (user !== APP_USER || pass !== APP_PASS) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const token = await createSession(AUTH_SECRET, Date.now())
  const cookie = getSessionCookie(token, Date.now())

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
  })
}
