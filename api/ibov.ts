export const config = { runtime: 'edge' }

// IBOV (Ibovespa) para comparação com a carteira. A brapi gratuita exige token
// para índices (^BVSP retorna 401 MISSING_TOKEN), então buscamos server-side no
// Yahoo Finance (sem token e sem CORS). Se BRAPI_TOKEN estiver configurado, usa a
// brapi como reserva. Nunca lança: devolve {error:true} para o app cair no "—".

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' }

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS })
}

export default async function handler(): Promise<Response> {
  // 1) Yahoo Finance — fonte principal, sem token/CORS
  try {
    const r = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?interval=1d&range=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinancasFamilia/1.0)' } }
    )
    if (r.ok) {
      const j = await r.json()
      const meta = j?.chart?.result?.[0]?.meta
      const price = Number(meta?.regularMarketPrice)
      if (isFinite(price) && price > 0) {
        const pct = Number(meta?.regularMarketChangePercent ?? meta?.fulldayChangePercent ?? 0)
        const changeRaw = Number(meta?.fulldayChange)
        const change = isFinite(changeRaw) ? changeRaw : (price * pct) / 100
        return ok({
          symbol: '^BVSP',
          shortName: 'IBOV',
          longName: 'Ibovespa',
          currency: 'BRL',
          regularMarketPrice: price,
          regularMarketChange: change,
          regularMarketChangePercent: isFinite(pct) ? pct : 0,
          regularMarketPreviousClose: price - change,
        })
      }
    }
  } catch { /* tenta a reserva */ }

  // 2) brapi com token (opcional — só se BRAPI_TOKEN estiver setado na Vercel)
  const token = process.env.BRAPI_TOKEN
  if (token) {
    try {
      const r = await fetch(`https://brapi.dev/api/quote/%5EBVSP?token=${encodeURIComponent(token)}`)
      if (r.ok) {
        const j = await r.json()
        const q = j?.results?.[0]
        if (q && isFinite(Number(q.regularMarketPrice)) && Number(q.regularMarketPrice) > 0) {
          return ok(q)
        }
      }
    } catch { /* cai no erro abaixo */ }
  }

  return new Response(JSON.stringify({ error: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
