import { fetchManyQuotes, type QuoteOut } from './lib/yahooQuote'

export const config = { runtime: 'edge' }

// GET /api/quotes?t=ITSA4,BBAS3&c=BTC,ETH  (t = B3: ações/FIIs/ETFs; c = cripto)
// Proxy server-side no Yahoo Finance (a brapi sem token só atende 4 tickers de
// teste). Reserva opcional: brapi com BRAPI_TOKEN para B3 que o Yahoo não achar.
// Sempre 200; nunca lança.

const MAX_TOTAL = 40
const VALID = /^[A-Z0-9.-]{1,15}$/

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=60, s-maxage=300',
}

function parseList(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => VALID.test(s))
}

async function brapiFallback(ticker: string, token: string): Promise<QuoteOut | null> {
  try {
    const r = await fetch(
      `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(6000) },
    )
    if (!r.ok) return null
    const q = (await r.json())?.results?.[0]
    const price = Number(q?.regularMarketPrice)
    if (!isFinite(price) || price <= 0) return null
    const n = (v: unknown, d: number) => (v != null && isFinite(Number(v)) ? Number(v) : d)
    const short = String(q.shortName || q.longName || ticker)
    return {
      symbol: ticker,
      shortName: short,
      longName: String(q.longName || short),
      currency: String(q.currency || 'BRL'),
      regularMarketPrice: price,
      regularMarketChange: n(q.regularMarketChange, 0),
      regularMarketChangePercent: n(q.regularMarketChangePercent, 0),
      regularMarketPreviousClose: n(q.regularMarketPreviousClose, price),
    }
  } catch {
    return null
  }
}

export default async function handler(req: Request): Promise<Response> {
  let results: QuoteOut[] = []
  const missing: string[] = []
  try {
    const url = new URL(req.url)
    const b3 = [...new Set(parseList(url.searchParams.get('t')))]
    const crypto = [...new Set(parseList(url.searchParams.get('c')))]
    const items = [
      ...b3.map((ticker) => ({ ticker, kind: 'b3' as const })),
      ...crypto.map((ticker) => ({ ticker, kind: 'crypto' as const })),
    ].slice(0, MAX_TOTAL)

    if (items.length > 0) {
      results = await fetchManyQuotes(items)
      const got = new Set(results.map((q) => q.symbol))
      const token = process.env.BRAPI_TOKEN
      for (const it of items) {
        if (got.has(it.ticker)) continue
        if (token && it.kind === 'b3') {
          const q = await brapiFallback(it.ticker, token)
          if (q) { results.push(q); got.add(it.ticker); continue }
        }
        missing.push(it.ticker)
      }
    }
  } catch {
    // devolve o que houver
  }
  return new Response(JSON.stringify({ results, missing }), { status: 200, headers: HEADERS })
}
