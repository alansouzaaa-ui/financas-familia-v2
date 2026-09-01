import { getGistPayload, setGistPayload } from './lib/gist.ts'
import type { SyncPayload } from '../src/lib/syncService.ts'

export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  if (req.method === 'GET') {
    try {
      const data = await getGistPayload()
      return new Response(JSON.stringify(data), { headers: CORS })
    } catch (err) {
      return new Response(JSON.stringify({ error: 'pull_failed', detail: String(err) }), { status: 500, headers: CORS })
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json() as SyncPayload
      await setGistPayload({ ...body, updated_at: new Date().toISOString() })
      return new Response(JSON.stringify({ ok: true }), { headers: CORS })
    } catch (err) {
      return new Response(JSON.stringify({ error: 'push_failed', detail: String(err) }), { status: 500, headers: CORS })
    }
  }

  return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: CORS })
}
