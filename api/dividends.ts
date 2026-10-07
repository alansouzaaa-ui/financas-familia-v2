import { fetchManyDividends, type DividendEvent } from './lib/yahooDividends'

export const config = { runtime: 'edge' }

// GET /api/dividends?t=ITSA4,MXRF11  → { results: [{symbol, events}], missing: [] }
// Histórico de proventos (5 anos) via Yahoo Finance. Sempre 200; nunca lança.
// Dado público: libera CORS para testar o front em dev contra a produção.

const MAX_TICKERS = 30
const VALID = /^[A-Z0-9]{4,12}$/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  let results: { symbol: string; events: DividendEvent[] }[] = []
  const missing: string[] = []
  let requested = 0
  try {
    const url = new URL(req.url)
    const tickers = [
      ...new Set(
        (url.searchParams.get('t') ?? '')
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter((s) => VALID.test(s)),
      ),
    ].slice(0, MAX_TICKERS)
    requested = tickers.length
    if (tickers.length > 0) {
      results = await fetchManyDividends(tickers)
      const got = new Set(results.map((r) => r.symbol))
      for (const t of tickers) if (!got.has(t)) missing.push(t)
    }
  } catch {
    // devolve o que houver
  }
  const cache = results.length === 0 && requested > 0 ? 'no-store' : 'public, max-age=3600, s-maxage=43200'
  return new Response(JSON.stringify({ results, missing }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cache, ...CORS },
  })
}
