export const config = { runtime: 'edge' }

const GIST_FILE = 'financas-sync.json'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
}

async function gistGet(token: string, gistId: string) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!res.ok) throw new Error(`Gist GET ${res.status}`)
  const json = await res.json() as { files: Record<string, { content: string }> }
  const content = json.files[GIST_FILE]?.content
  if (!content || content === 'null') return null
  return JSON.parse(content)
}

async function gistSet(token: string, gistId: string, value: unknown) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: { [GIST_FILE]: { content: JSON.stringify(value) } },
    }),
  })
  if (!res.ok) throw new Error(`Gist PATCH ${res.status}`)
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const token  = process.env.GITHUB_GIST_TOKEN
  const gistId = process.env.GITHUB_GIST_ID

  if (!token || !gistId) {
    return new Response(JSON.stringify({ error: 'env_missing' }), { status: 500, headers: CORS })
  }

  if (req.method === 'GET') {
    try {
      const data = await gistGet(token, gistId)
      return new Response(JSON.stringify(data), { headers: CORS })
    } catch (err) {
      return new Response(JSON.stringify({ error: 'pull_failed', detail: String(err) }), { status: 500, headers: CORS })
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json()
      await gistSet(token, gistId, { ...body, updated_at: new Date().toISOString() })
      return new Response(JSON.stringify({ ok: true }), { headers: CORS })
    } catch (err) {
      return new Response(JSON.stringify({ error: 'push_failed', detail: String(err) }), { status: 500, headers: CORS })
    }
  }

  return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: CORS })
}
