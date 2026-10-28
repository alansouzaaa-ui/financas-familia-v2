import { describe, it, expect, beforeAll } from 'vitest'
import { listGistRevisions, getGistRevision } from '../../../api/lib/gist'

beforeAll(() => {
  process.env.GITHUB_GIST_TOKEN = 'token'
  process.env.GITHUB_GIST_ID = 'gist123'
})

describe('listGistRevisions', () => {
  it('stops once committed_at < since and sends auth', async () => {
    const urls: string[] = []
    const fetchImpl = async (url: string, init?: RequestInit) => {
      urls.push(url)
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer token' })
      return new Response(JSON.stringify([
        { version: 'c', committed_at: '2026-10-02T00:00:00Z' },
        { version: 'b', committed_at: '2026-09-02T00:00:00Z' },
        { version: 'a', committed_at: '2026-08-01T00:00:00Z' },
      ]), { status: 200 })
    }
    const out = await listGistRevisions({ since: '2026-09-01', perPage: 3 }, fetchImpl as typeof fetch)
    expect(out.map(r => r.version)).toEqual(['c', 'b'])
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('/gists/gist123/commits?per_page=3&page=1')
  })

  it('pages up to maxPages when every revision is recent', async () => {
    let calls = 0
    const fetchImpl = async () => {
      calls++
      return new Response(JSON.stringify([
        { version: `v${calls}a`, committed_at: '2026-10-02T00:00:00Z' },
        { version: `v${calls}b`, committed_at: '2026-10-01T00:00:00Z' },
      ]), { status: 200 })
    }
    const out = await listGistRevisions({ since: '2026-09-01', perPage: 2, maxPages: 3 }, fetchImpl as typeof fetch)
    expect(calls).toBe(3)
    expect(out).toHaveLength(6)
  })

  it('throws on a non-ok response', async () => {
    const fetchImpl = async () => new Response('', { status: 403 })
    await expect(listGistRevisions({ since: '2026-09-01' }, fetchImpl as typeof fetch)).rejects.toThrow('Gist commits 403')
  })
})

describe('getGistRevision', () => {
  it('follows raw_url when the file is truncated', async () => {
    const full = { manual_months: [], goals: [], recurring_items: [], investment_positions: [] }
    const urls: string[] = []
    const fetchImpl = async (url: string) => {
      urls.push(url)
      if (url.includes('api.github.com')) {
        return new Response(JSON.stringify({
          files: { 'financas-sync.json': { content: '{"trunc', truncated: true, raw_url: 'https://gist.githubusercontent.com/raw/x' } },
        }), { status: 200 })
      }
      return new Response(JSON.stringify(full), { status: 200 })
    }
    await expect(getGistRevision('sha1', fetchImpl as typeof fetch)).resolves.toEqual(full)
    expect(urls[0]).toContain('/gists/gist123/sha1')
    expect(urls[1]).toBe('https://gist.githubusercontent.com/raw/x')
  })

  it('returns null when the file is absent in that revision', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ files: {} }), { status: 200 })
    await expect(getGistRevision('sha1', fetchImpl as typeof fetch)).resolves.toBeNull()
  })
})
