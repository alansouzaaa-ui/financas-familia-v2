import { verifySession } from '../lib/auth.ts'

export const config = { runtime: 'edge' }

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k.trim() === name) return rest.join('=').trim()
  }
  return null
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 })
  }

  const AUTH_SECRET = process.env.AUTH_SECRET ?? ''
  const token = getCookieValue(req.headers.get('cookie'), 'ff_session')

  if (!token) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const valid = await verifySession(token, AUTH_SECRET, Date.now())

  return new Response(JSON.stringify({ authenticated: valid }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
