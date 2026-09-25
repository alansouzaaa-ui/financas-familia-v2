import type { BrapiQuote } from '@/types/investment'

const BASE = 'https://brapi.dev/api'
const TIMEOUT_MS = 15_000

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

function isValidQuote(q: unknown): q is BrapiQuote {
  if (!q || typeof q !== 'object') return false
  const r = q as Record<string, unknown>
  return (
    typeof r.symbol === 'string' &&
    typeof r.regularMarketPrice === 'number' &&
    isFinite(r.regularMarketPrice as number) &&
    (r.regularMarketPrice as number) > 0
  )
}

export async function fetchQuotes(tickers: string[]): Promise<BrapiQuote[]> {
  if (!tickers.length) return []
  const unique = [...new Set(tickers.map(t => t.toUpperCase()))]
  const res = await fetchWithTimeout(
    `${BASE}/quote/${unique.join(',')}?fundamental=false&dividends=false`,
    TIMEOUT_MS
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const results = Array.isArray(json.results) ? json.results : []
  return results.filter(isValidQuote) as BrapiQuote[]
}

export interface IbovHistoryPoint { date: string; close: number }
export interface IbovData { quote: BrapiQuote | null; history: IbovHistoryPoint[] }

// IBOV vem da nossa Edge Function /api/ibov (Yahoo server-side): a brapi gratuita
// bloqueia índices sem token. `from` (YYYY-MM-DD) traz também o histórico diário,
// para comparar o rendimento no mesmo período dos aportes. Em dev (sem /api) → vazio.
export async function fetchIbovData(from?: string): Promise<IbovData> {
  try {
    const qs = from ? `?from=${encodeURIComponent(from)}` : ''
    const res = await fetchWithTimeout(`/api/ibov${qs}`, TIMEOUT_MS)
    if (!res.ok) return { quote: null, history: [] }
    const j = await res.json()
    const quote = isValidQuote(j) ? j : null
    const history: IbovHistoryPoint[] = Array.isArray(j?.history)
      ? j.history.filter((h: unknown): h is IbovHistoryPoint => {
          const p = h as Record<string, unknown>
          return typeof p?.date === 'string' && typeof p?.close === 'number' && isFinite(p.close as number)
        })
      : []
    return { quote, history }
  } catch {
    return { quote: null, history: [] }
  }
}

export async function fetchIbov(): Promise<BrapiQuote | null> {
  return (await fetchIbovData()).quote
}
