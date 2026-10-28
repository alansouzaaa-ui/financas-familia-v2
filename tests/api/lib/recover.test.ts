import { describe, it, expect, beforeAll } from 'vitest'
import { findLostTelegramItems, scanLostTelegramItems, summarizeLostItem } from '../../../api/lib/recover'
import type { SyncPayload } from '../../../src/lib/syncService'
import type { MonthItem, MonthRecord } from '../../../src/types/finance'

beforeAll(() => {
  process.env.GITHUB_GIST_TOKEN = 'token'
  process.env.GITHUB_GIST_ID = 'gist123'
})

function tg(n: number, over: Partial<MonthItem> = {}): MonthItem {
  const id = `telegram:1:${n}`
  return { id, externalId: id, source: 'telegram', description: `d${n}`, value: n, category: 'variableCosts', isPaid: true, occurredAt: `2026-10-0${n}T10:00:00.000Z`, ...over }
}
function pl(items: MonthItem[], deleted: string[] = []): SyncPayload {
  const rec: MonthRecord = { month: 'Out', year: 2026, revenue: 0, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0, source: 'manual', items }
  return { manual_months: [rec], goals: [], recurring_items: [], investment_positions: [], deleted_ids: deleted.map(id => ({ id, at: '2026-10-20T00:00:00Z' })) }
}

describe('findLostTelegramItems', () => {
  it('finds items missing from current, dedupes, sorts by occurredAt and tracks first seen', () => {
    const current = pl([tg(1)])
    const lost = findLostTelegramItems(current, [
      { committed_at: '2026-10-05T00:00:00Z', payload: pl([tg(1), tg(3), tg(2)]) },
      { committed_at: '2026-10-03T00:00:00Z', payload: pl([tg(2)]) },
    ])
    expect(lost.map(l => l.item.id)).toEqual(['telegram:1:2', 'telegram:1:3'])
    expect(lost[0].firstSeenRevisionAt).toBe('2026-10-03T00:00:00Z')
    expect(lost[1].firstSeenRevisionAt).toBe('2026-10-05T00:00:00Z')
  })

  it('ignores tombstoned ids and non-telegram items', () => {
    const current = pl([], ['telegram:1:2'])
    const manual: MonthItem = { id: 'm', description: 'm', value: 1, category: 'fixedCosts', isPaid: true }
    const lost = findLostTelegramItems(current, [{ committed_at: '2026-10-05T00:00:00Z', payload: pl([tg(2), manual]) }])
    expect(lost).toEqual([])
  })

  it('summarizes with cardId only when present', () => {
    const lost = findLostTelegramItems(null, [{ committed_at: '2026-10-05T00:00:00Z', payload: pl([tg(1, { category: 'cards', cardId: 'c1' }), tg(2)]) }])
    const [a, b] = lost.map(summarizeLostItem)
    expect(a.cardId).toBe('c1')
    expect('cardId' in b).toBe(false)
    expect(a.month).toBe('Out')
  })
})

describe('scanLostTelegramItems', () => {
  it('lists revisions, loads each and returns lost items (mocked fetch)', async () => {
    const revPayloads: Record<string, SyncPayload> = { r2: pl([tg(1), tg(2)]), r1: pl([tg(1)]) }
    const fetchImpl = async (url: string) => {
      if (url.includes('/commits')) {
        return new Response(JSON.stringify([
          { version: 'r2', committed_at: '2026-10-05T00:00:00Z' },
          { version: 'r1', committed_at: '2026-10-04T00:00:00Z' },
          { version: 'r0', committed_at: '2026-08-01T00:00:00Z' },
        ]), { status: 200 })
      }
      const sha = url.split('/').pop() as string
      return new Response(JSON.stringify({ files: { 'financas-sync.json': { content: JSON.stringify(revPayloads[sha]) } } }), { status: 200 })
    }
    const lost = await scanLostTelegramItems(pl([]), '2026-09-01', fetchImpl as typeof fetch)
    expect(lost.map(l => l.item.id)).toEqual(['telegram:1:1', 'telegram:1:2'])
  })
})
