export const config = { runtime: 'edge' }

const SYNC_KEY = 'dashboard_sync:familia'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
}

async function redisGet(url: string, token: string, key: string) {
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Redis GET ${res.status}`)
  const json = await res.json() as { result: string | null }
  if (!json.result) return null
  return JSON.parse(json.result)
}

async function redisSet(url: string, token: string, key: string, value: unknown) {
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value)), // Upstash REST espera a string do valor
  })
  if (!res.ok) throw new Error(`Redis SET ${res.status}`)
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    console.error('[sync] env vars ausentes: UPSTASH_REDIS_REST_URL ou UPSTASH_REDIS_REST_TOKEN')
    return new Response(JSON.stringify({ error: 'env_missing' }), { status: 500, headers: CORS })
  }

  if (req.method === 'GET') {
    try {
      const data = await redisGet(url, token, SYNC_KEY)
      return new Response(JSON.stringify(data), { headers: CORS })
    } catch (err) {
      console.error('[sync] pull error:', err)
      return new Response(JSON.stringify({ error: 'pull_failed', detail: String(err) }), { status: 500, headers: CORS })
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json()
      await redisSet(url, token, SYNC_KEY, { ...body, updated_at: new Date().toISOString() })
      return new Response(JSON.stringify({ ok: true }), { headers: CORS })
    } catch (err) {
      console.error('[sync] push error:', err)
      return new Response(JSON.stringify({ error: 'push_failed', detail: String(err) }), { status: 500, headers: CORS })
    }
  }

  return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: CORS })
}
