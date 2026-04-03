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

export async function fetchIbov(): Promise<BrapiQuote | null> {
  try {
    const res = await fetchWithTimeout(
      `${BASE}/quote/%5EBVSP?fundamental=false&dividends=false`,
      TIMEOUT_MS
    )
    if (!res.ok) return null
    const json = await res.json()
    const q = json.results?.[0]
    return isValidQuote(q) ? q : null
  } catch {
    return null
  }
}
