import type { SyncPayload } from '../../src/lib/syncService'
import type { MonthAbbr, MonthItem } from '../../src/types/finance'
import { getGistRevision, listGistRevisions } from './gist'
import { isTelegramItem, type RestoreEntry } from './syncMerge'

export const DEFAULT_RECOVER_SINCE = '2026-09-01'
const MAX_REVISIONS = 300
const CONCURRENCY = 10

export interface LostItem extends RestoreEntry {
  firstSeenRevisionAt: string
}

export interface LostItemSummary {
  id: string
  month: MonthAbbr
  year: number
  description: string
  value: number
  category: MonthItem['category']
  occurredAt: string
  cardId?: string
  firstSeenRevisionAt: string
}

/**
 * Pura: dado o payload atual e as revisões (qualquer ordem), devolve os itens do
 * Telegram que existiram em alguma revisão, não existem mais e não têm tombstone.
 * Deduplicado por id; o item vem da revisão mais recente em que apareceu.
 */
export function findLostTelegramItems(
  current: SyncPayload | null,
  revisions: { committed_at: string; payload: SyncPayload | null }[],
): LostItem[] {
  const presentIds = new Set<string>()
  for (const m of current?.manual_months ?? []) for (const i of m.items ?? []) presentIds.add(i.id)
  const dead = new Set((current?.deleted_ids ?? []).map(t => t.id))

  const byId = new Map<string, LostItem & { newestAt: number }>()
  for (const rev of revisions) {
    const at = Date.parse(rev.committed_at)
    for (const m of rev.payload?.manual_months ?? []) {
      for (const item of m.items ?? []) {
        if (!isTelegramItem(item) || presentIds.has(item.id) || dead.has(item.id)) continue
        const prev = byId.get(item.id)
        if (!prev) {
          byId.set(item.id, { month: m.month, year: m.year, item, firstSeenRevisionAt: rev.committed_at, newestAt: at })
          continue
        }
        if (at < Date.parse(prev.firstSeenRevisionAt)) prev.firstSeenRevisionAt = rev.committed_at
        if (at > prev.newestAt) { prev.month = m.month; prev.year = m.year; prev.item = item; prev.newestAt = at }
      }
    }
  }
  return [...byId.values()]
    .map(({ newestAt: _n, ...rest }) => rest) // eslint-disable-line @typescript-eslint/no-unused-vars
    .sort((a, b) => (a.item.occurredAt ?? '').localeCompare(b.item.occurredAt ?? ''))
}

export function summarizeLostItem(l: LostItem): LostItemSummary {
  const i = l.item
  return {
    id: i.id,
    month: l.month,
    year: l.year,
    description: i.description,
    value: i.value,
    category: i.category,
    occurredAt: i.occurredAt ?? '',
    ...(i.cardId ? { cardId: i.cardId } : {}),
    firstSeenRevisionAt: l.firstSeenRevisionAt,
  }
}

// Varre o histórico do Gist (somente leitura) — pode fazer até ~300 requisições.
export async function scanLostTelegramItems(
  current: SyncPayload | null,
  since: string,
  fetchImpl: typeof fetch = fetch,
  offset = 0,
): Promise<LostItem[]> {
  // Janela de até MAX_REVISIONS revisões a partir de `offset` (mais recentes primeiro),
  // para varrer históricos longos em várias chamadas sem estourar o tempo do Edge.
  const off = Math.max(0, Math.floor(offset))
  const maxPages = Math.min(30, Math.ceil((off + MAX_REVISIONS) / 100))
  const revs = (await listGistRevisions({ since, maxPages }, fetchImpl)).slice(off, off + MAX_REVISIONS)
  const loaded: { committed_at: string; payload: SyncPayload | null }[] = []
  for (let i = 0; i < revs.length; i += CONCURRENCY) {
    const batch = revs.slice(i, i + CONCURRENCY)
    const got = await Promise.all(batch.map(async r => ({
      committed_at: r.committed_at,
      payload: await getGistRevision(r.version, fetchImpl),
    })))
    loaded.push(...got)
  }
  return findLostTelegramItems(current, loaded)
}
