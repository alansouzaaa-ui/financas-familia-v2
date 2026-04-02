import type { BrapiQuote } from '@/types/investment'

const BASE = 'https://brapi.dev/api'

export async function fetchQuotes(tickers: string[]): Promise<BrapiQuote[]> {
  if (!tickers.length) return []
  const unique = [...new Set(tickers.map(t => t.toUpperCase()))]
  const res = await fetch(`${BASE}/quote/${unique.join(',')}?fundamental=false&dividends=false`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return (json.results ?? []) as BrapiQuote[]
}

export async function fetchIbov(): Promise<BrapiQuote | null> {
  try {
    const res = await fetch(`${BASE}/quote/%5EBVSP?fundamental=false&dividends=false`)
    if (!res.ok) return null
    const json = await res.json()
    return (json.results?.[0] ?? null) as BrapiQuote | null
  } catch {
    return null
  }
}
