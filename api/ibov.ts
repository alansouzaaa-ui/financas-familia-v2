export const config = { runtime: 'edge' }

// IBOV (Ibovespa) para comparação com a carteira. A brapi gratuita exige token
// para índices (^BVSP → 401 MISSING_TOKEN), então buscamos server-side no Yahoo
// Finance (sem token e sem CORS). Nunca lança: devolve {error:true} → app cai no "—".
//
// Query opcional ?from=YYYY-MM-DD: além da cotação atual, devolve `history`
// (fechamentos diários desde `from`) para comparar o rendimento no mesmo período
// que os aportes da carteira.

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS })
}

function fail(): Response {
  return new Response(JSON.stringify({ error: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const fromRaw = url.searchParams.get('from')
  const fromMs = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? Date.parse(fromRaw + 'T00:00:00Z') : NaN
  const wantHistory = isFinite(fromMs)

  // Janela: se pediram histórico, do `from` (com folga) até agora; senão só 1 dia.
  const nowSec = Math.floor(Date.now() / 1000)
  const p1 = wantHistory ? Math.floor(fromMs / 1000) - 7 * 86400 : nowSec - 5 * 86400
  const yahoo = `https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?period1=${p1}&period2=${nowSec}&interval=1d`

  try {
    const r = await fetch(yahoo, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinancasFamilia/1.0)' } })
    if (r.ok) {
      const j = await r.json()
      const result = j?.chart?.result?.[0]
      const meta = result?.meta
      const price = Number(meta?.regularMarketPrice)
      if (isFinite(price) && price > 0) {
        const pct = Number(meta?.regularMarketChangePercent ?? meta?.fulldayChangePercent ?? 0)
        const changeRaw = Number(meta?.fulldayChange)
        const change = isFinite(changeRaw) ? changeRaw : (price * pct) / 100

        const body: Record<string, unknown> = {
          symbol: '^BVSP',
          shortName: 'IBOV',
          longName: 'Ibovespa',
          currency: 'BRL',
          regularMarketPrice: price,
          regularMarketChange: change,
          regularMarketChangePercent: isFinite(pct) ? pct : 0,
          regularMarketPreviousClose: price - change,
        }

        if (wantHistory) {
          const ts: number[] = Array.isArray(result?.timestamp) ? result.timestamp : []
          const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? []
          const history: { date: string; close: number }[] = []
          for (let i = 0; i < ts.length; i++) {
            const c = Number(closes[i])
            if (!isFinite(c) || c <= 0) continue
            history.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c })
          }
          body.history = history
        }

        return ok(body)
      }
    }
  } catch { /* cai no fail */ }

  // Reserva opcional: brapi com token (só se BRAPI_TOKEN estiver setado na Vercel)
  const token = process.env.BRAPI_TOKEN
  if (!wantHistory && token) {
    try {
      const r = await fetch(`https://brapi.dev/api/quote/%5EBVSP?token=${encodeURIComponent(token)}`)
      if (r.ok) {
        const j = await r.json()
        const q = j?.results?.[0]
        if (q && isFinite(Number(q.regularMarketPrice)) && Number(q.regularMarketPrice) > 0) return ok(q)
      }
    } catch { /* cai no fail */ }
  }

  return fail()
}
