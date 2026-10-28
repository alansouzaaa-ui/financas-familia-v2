import { getGistPayload, setGistPayload } from './lib/gist'
import { verifySession } from './lib/auth'
import { DEFAULT_RECOVER_SINCE, scanLostTelegramItems, summarizeLostItem } from './lib/recover'
import { restoreItems } from './lib/syncMerge'

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
    return new URL(origin).host === host
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

function resolveSince(raw: string | null): string {
  if (raw && Number.isFinite(Date.parse(raw))) return raw
  return DEFAULT_RECOVER_SINCE
}

export default async function handler(req: Request): Promise<Response> {
  const headers = corsHeaders(req)

  if (req.method === 'OPTIONS') return new Response(null, { headers })

  if (!isSameOrigin(req)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers })
  }
  if (!(await isAuthorized(req))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers })
  }

  const url = new URL(req.url)

  // GET: lista (somente leitura) os itens do Telegram que existiram no histórico e sumiram.
  if (req.method === 'GET') {
    try {
      const current = await getGistPayload()
      const offset = Number(url.searchParams.get('offset') ?? 0) || 0
      const lost = await scanLostTelegramItems(current, resolveSince(url.searchParams.get('since')), fetch, offset)
      return new Response(JSON.stringify({ items: lost.map(summarizeLostItem) }), { headers })
    } catch (err) {
      return new Response(JSON.stringify({ error: 'scan_failed', detail: String(err) }), { status: 500, headers })
    }
  }

  // POST { ids }: reinsere exatamente esses itens no Gist atual.
  if (req.method === 'POST') {
    try {
      const body = await req.json() as { ids?: unknown; since?: unknown }
      const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : []
      if (ids.length === 0) {
        return new Response(JSON.stringify({ error: 'no_ids' }), { status: 400, headers })
      }
      const current = await getGistPayload()
      if (!current) {
        return new Response(JSON.stringify({ error: 'no_data' }), { status: 409, headers })
      }
      const since = resolveSince(typeof body.since === 'string' ? body.since : null)
      const wanted = new Set(ids)
      const offset = typeof (body as { offset?: unknown }).offset === 'number' ? (body as { offset: number }).offset : 0
      const lost = (await scanLostTelegramItems(current, since, fetch, offset)).filter(l => wanted.has(l.item.id))
      const { payload, restored } = restoreItems(current, lost)
      if (restored > 0) await setGistPayload({ ...payload, updated_at: new Date().toISOString() })
      return new Response(JSON.stringify({ restored }), { headers })
    } catch (err) {
      return new Response(JSON.stringify({ error: 'restore_failed', detail: String(err) }), { status: 500, headers })
    }
  }

  return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers })
}
