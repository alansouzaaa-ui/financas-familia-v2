import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const SYNC_KEY = 'dashboard_sync:familia'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // GET — pull dados do Redis
  if (req.method === 'GET') {
    try {
      const data = await redis.get(SYNC_KEY)
      if (!data) return new Response(JSON.stringify(null), { headers: CORS })
      return new Response(JSON.stringify(data), { headers: CORS })
    } catch (err) {
      console.error('[sync] pull error:', err)
      return new Response(JSON.stringify({ error: 'pull_failed' }), { status: 500, headers: CORS })
    }
  }

  // POST — push dados para o Redis
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      await redis.set(SYNC_KEY, { ...body, updated_at: new Date().toISOString() })
      return new Response(JSON.stringify({ ok: true }), { headers: CORS })
    } catch (err) {
      console.error('[sync] push error:', err)
      return new Response(JSON.stringify({ error: 'push_failed' }), { status: 500, headers: CORS })
    }
  }

  return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: CORS })
}
