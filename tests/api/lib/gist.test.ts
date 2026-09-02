import { describe, it, expect, beforeAll } from 'vitest'
import { getGistPayload, setGistPayload } from '../../../api/lib/gist'
import type { SyncPayload } from '../../../src/lib/syncService'

beforeAll(() => {
  process.env.GITHUB_GIST_TOKEN = 'token'
  process.env.GITHUB_GIST_ID = 'gist123'
})

describe('getGistPayload', () => {
  it('reads financas-sync.json and returns null when content is "null"', async () => {
    const calls: RequestInit[] = []
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      calls.push(init ?? {})
      return new Response(
        JSON.stringify({ files: { 'financas-sync.json': { content: 'null' } } }),
        { status: 200 }
      )
    }
    await expect(getGistPayload(fetchImpl as typeof fetch)).resolves.toBeNull()
    expect(calls[0]?.headers).toMatchObject({ Authorization: 'Bearer token' })
  })

  it('returns parsed payload when content is valid JSON', async () => {
    const payload: SyncPayload = {
      manual_months: [],
      goals: [],
      recurring_items: [],
      investment_positions: [],
      updated_at: '2026-09-01T00:00:00.000Z',
    }
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({ files: { 'financas-sync.json': { content: JSON.stringify(payload) } } }),
        { status: 200 }
      )
    await expect(getGistPayload(fetchImpl as typeof fetch)).resolves.toEqual(payload)
  })

  it('throws when GET is not ok', async () => {
    const fetchImpl = async () => new Response('', { status: 500 })
    await expect(getGistPayload(fetchImpl as typeof fetch)).rejects.toThrow('Gist GET 500')
  })

  it('throws when file is missing from Gist', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ files: {} }), { status: 200 })
    await expect(getGistPayload(fetchImpl as typeof fetch)).rejects.toThrow('not found in Gist')
  })
})

describe('setGistPayload', () => {
  it('calls PATCH with correct body and Authorization header', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} })
      return new Response('{}', { status: 200 })
    }
    const payload: SyncPayload = {
      manual_months: [],
      goals: [],
      recurring_items: [],
      investment_positions: [],
    }
    await setGistPayload(payload, fetchImpl as typeof fetch)
    expect(calls[0]?.init.method).toBe('PATCH')
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer token' })
    const body = JSON.parse(calls[0]?.init.body as string)
    expect(body.files['financas-sync.json'].content).toBe(JSON.stringify(payload))
  })

  it('throws when PATCH is not ok', async () => {
    const fetchImpl = async () => new Response('', { status: 422 })
    const payload: SyncPayload = { manual_months: [], goals: [], recurring_items: [], investment_positions: [] }
    await expect(setGistPayload(payload, fetchImpl as typeof fetch)).rejects.toThrow('Gist PATCH 422')
  })
})
