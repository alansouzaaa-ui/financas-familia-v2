import { getGistPayload, setGistPayload } from './lib/gist.ts'
import { verifySession } from './lib/auth.ts'
import type { SyncPayload } from '../src/lib/syncService.ts'

export const config = { runtime: 'edge' }

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k.trim() === name) return rest.join('=').trim()
  }
  return null
}

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')
  if (!origin || !host) return true // no origin header = same-origin (server-to-server or direct)
  try {
    const originHost = new URL(origin).host
    return originHost === host
  } catch {
    return false
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')
  let allowOrigin = 'null'
  if (origin && host) {
    try {
      if (new URL(origin).host === host) allowOrigin = origin
    } catch { /* ignore */ }
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  }
}

async function isAuthorized(req: Request): Promise<boolean> {
  const AUTH_SECRET = process.env.AUTH_SECRET ?? ''
  const token = getCookieValue(req.headers.get('cookie'), 'ff_session')
  if (!token) return false
  return verifySession(token, AUTH_SECRET, Date.now())
}

export default async function handler(req: Request): Promise<Response> {
  const headers = corsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers })
  }

  // CORS check: reject cross-origin requests
  if (!isSameOrigin(req)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers })
  }

  // Session guard
  if (!(await isAuthorized(req))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers })
  }

  if (req.method === 'GET') {
    try {
      const data = await getGistPayload()
      return new Response(JSON.stringify(data), { headers })
    } catch (err) {
      return new Response(JSON.stringify({ error: 'pull_failed', detail: String(err) }), { status: 500, headers })
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json() as SyncPayload
      await setGistPayload({ ...body, updated_at: new Date().toISOString() })
      return new Response(JSON.stringify({ ok: true }), { headers })
    } catch (err) {
      return new Response(JSON.stringify({ error: 'push_failed', detail: String(err) }), { status: 500, headers })
    }
  }

  return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers })
}
