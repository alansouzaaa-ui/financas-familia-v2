import type { SyncPayload } from '../../src/lib/syncService'

const GIST_FILE = 'financas-sync.json'

function getEnv() {
  const token = process.env.GITHUB_GIST_TOKEN
  const gistId = process.env.GITHUB_GIST_ID
  if (!token) throw new Error('Missing env var: GITHUB_GIST_TOKEN')
  if (!gistId) throw new Error('Missing env var: GITHUB_GIST_ID')
  return { token, gistId }
}

export async function getGistPayload(fetchImpl: typeof fetch = fetch): Promise<SyncPayload | null> {
  const { token, gistId } = getEnv()
  const res = await fetchImpl(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!res.ok) throw new Error(`Gist GET ${res.status}`)
  const json = await res.json() as { files: Record<string, { content: string }> }
  const file = json.files[GIST_FILE]
  if (!file) throw new Error(`File ${GIST_FILE} not found in Gist`)
  const content = file.content
  if (!content || content === 'null') return null
  return JSON.parse(content) as SyncPayload
}

export async function setGistPayload(payload: SyncPayload, fetchImpl: typeof fetch = fetch): Promise<void> {
  const { token, gistId } = getEnv()
  const res = await fetchImpl(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: { [GIST_FILE]: { content: JSON.stringify(payload) } },
    }),
  })
  if (!res.ok) throw new Error(`Gist PATCH ${res.status}`)
}

export interface GistRevision {
  version: string        // sha da revisão
  committed_at: string   // ISO
}

interface GistFileInfo { content?: string; truncated?: boolean; raw_url?: string }

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
}

// Lista revisões do Gist (mais novas primeiro), parando quando `committed_at < since`.
// `maxPages` × 100 revisões no máximo.
export async function listGistRevisions(
  opts: { since: string; maxPages?: number; perPage?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<GistRevision[]> {
  const { token, gistId } = getEnv()
  const perPage = opts.perPage ?? 100
  const maxPages = opts.maxPages ?? 3
  const sinceMs = Date.parse(opts.since)
  const out: GistRevision[] = []
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchImpl(`https://api.github.com/gists/${gistId}/commits?per_page=${perPage}&page=${page}`, {
      headers: authHeaders(token),
    })
    if (!res.ok) throw new Error(`Gist commits ${res.status}`)
    const rows = await res.json() as { version: string; committed_at: string }[]
    if (!Array.isArray(rows) || rows.length === 0) break
    for (const r of rows) {
      if (Number.isFinite(sinceMs) && Date.parse(r.committed_at) < sinceMs) return out
      out.push({ version: r.version, committed_at: r.committed_at })
    }
    if (rows.length < perPage) break
  }
  return out
}

// Lê o payload de uma revisão específica. Se o arquivo vier truncado (>1MB),
// busca o conteúdo completo em raw_url (sem enviar o token a outro host).
export async function getGistRevision(sha: string, fetchImpl: typeof fetch = fetch): Promise<SyncPayload | null> {
  const { token, gistId } = getEnv()
  const res = await fetchImpl(`https://api.github.com/gists/${gistId}/${encodeURIComponent(sha)}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error(`Gist revision ${res.status}`)
  const json = await res.json() as { files: Record<string, GistFileInfo> }
  const file = json.files?.[GIST_FILE]
  if (!file) return null
  let content = file.content
  if (file.truncated && file.raw_url) {
    const raw = await fetchImpl(file.raw_url)
    if (!raw.ok) throw new Error(`Gist raw ${raw.status}`)
    content = await raw.text()
  }
  if (!content || content === 'null') return null
  return JSON.parse(content) as SyncPayload
}
