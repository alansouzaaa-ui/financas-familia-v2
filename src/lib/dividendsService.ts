import type { DividendEvent } from '../../api/lib/yahooDividends'

// Em dev (vite) não existe /api (são funções Vercel Edge); por isso apontamos para
// a produção, cujo endpoint libera CORS (dado público).
const BASE = import.meta.env.DEV ? 'https://financas-familia-v2.vercel.app' : ''
const TIMEOUT_MS = 12000
const TTL_MS = 30 * 60 * 1000

const cache = new Map<string, { at: number; events: DividendEvent[] }>()

/** ticker → proventos. Nunca lança; em falha devolve o que houver (ou {}). */
export async function fetchDividends(tickers: string[]): Promise<Record<string, DividendEvent[]>> {
  const wanted = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))]
  const out: Record<string, DividendEvent[]> = {}
  const now = Date.now()
  const toFetch: string[] = []
  for (const t of wanted) {
    const hit = cache.get(t)
    if (hit && now - hit.at < TTL_MS) out[t] = hit.events
    else toFetch.push(t)
  }
  if (toFetch.length === 0) return out
  try {
    const res = await fetch(`${BASE}/api/dividends?t=${encodeURIComponent(toFetch.join(','))}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return out
    const json = (await res.json()) as { results?: { symbol: string; events: DividendEvent[] }[] }
    for (const r of json.results ?? []) {
      if (!r?.symbol || !Array.isArray(r.events)) continue
      out[r.symbol] = r.events
      cache.set(r.symbol, { at: now, events: r.events })
    }
  } catch {
    // silencioso
  }
  return out
}
