import type { SyncPayload } from '../../src/lib/syncService.ts'

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
