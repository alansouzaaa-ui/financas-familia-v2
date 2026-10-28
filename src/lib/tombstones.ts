import type { MonthRecord } from '../types/finance'

// Tombstone = registro de que um MonthItem foi apagado pelo usuário. Serve para
// o servidor não "ressuscitar" itens (ex.: Telegram) que o cliente removeu de
// propósito quando faz o merge protetor no POST /api/sync.
export interface Tombstone { id: string; at: string }

export const TOMBSTONE_TTL_DAYS = 90
export const TOMBSTONE_MAX = 2000

/** Dedupe por id (mantém o `at` mais recente), descarta expirados/inválidos e limita aos mais novos. */
export function normalizeTombstones(list: Tombstone[], now: Date = new Date()): Tombstone[] {
  const cutoff = now.getTime() - TOMBSTONE_TTL_DAYS * 24 * 60 * 60 * 1000
  const byId = new Map<string, { id: string; at: string; ts: number }>()
  for (const t of list) {
    if (!t || typeof t.id !== 'string' || !t.id || typeof t.at !== 'string') continue
    const ts = Date.parse(t.at)
    if (!Number.isFinite(ts) || ts < cutoff) continue
    const prev = byId.get(t.id)
    if (!prev || ts > prev.ts) byId.set(t.id, { id: t.id, at: t.at, ts })
  }
  return [...byId.values()]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, TOMBSTONE_MAX)
    .map(({ id, at }) => ({ id, at }))
}

export function mergeTombstones(a: Tombstone[] | undefined, b: Tombstone[] | undefined, now: Date = new Date()): Tombstone[] {
  return normalizeTombstones([...(a ?? []), ...(b ?? [])], now)
}

function idsOf(months: MonthRecord[]): Set<string> {
  const s = new Set<string>()
  for (const m of months) for (const i of m.items ?? []) s.add(i.id)
  return s
}

/**
 * Ids que existiam em `before` e sumiram de `after`. Itens que só mudaram de
 * mês (mesmo id em outro mês) NÃO contam como removidos.
 */
export function removedItemIds(before: MonthRecord[], after: MonthRecord[]): string[] {
  const afterIds = idsOf(after)
  const removed: string[] = []
  for (const id of idsOf(before)) if (!afterIds.has(id)) removed.push(id)
  return removed
}

/** Ids presentes em `after` e ausentes em `before` (novos/restaurados). */
export function addedItemIds(before: MonthRecord[], after: MonthRecord[]): string[] {
  const beforeIds = idsOf(before)
  const added: string[] = []
  for (const id of idsOf(after)) if (!beforeIds.has(id)) added.push(id)
  return added
}
