// api/tesouro.ts — Vercel Edge Function
// Proxy dos preços atuais dos títulos do Tesouro Direto (o cliente não pode
// buscar direto por CORS). Degrada com elegância: em qualquer falha devolve
// lista vazia + error, e a UI mostra a posição pelo valor de custo.
export const config = { runtime: 'edge' }

const SRC = 'https://www.tesourodireto.com.br/json/br/com/b3/tesourodireto/service/api/treasurybondsinfo.json'

function json(body: unknown, status = 200, sMaxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(sMaxAge ? { 'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=86400` } : {}),
    },
  })
}

function num(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null
}

export default async function handler(): Promise<Response> {
  let data: unknown
  try {
    const res = await fetch(SRC, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        Referer: 'https://www.tesourodireto.com.br/titulos/precos-e-taxas.htm',
      },
    })
    if (!res.ok) return json({ titles: [], error: `upstream_${res.status}` }, 200)
    data = await res.json()
  } catch {
    return json({ titles: [], error: 'fetch_failed' }, 200)
  }

  const list = (data as { response?: { TrsrBdTradgList?: unknown[] } })?.response?.TrsrBdTradgList ?? []
  const titles: {
    name: string; pu: number; buyPu: number | null; sellRate: number | null; maturity: string | null
  }[] = []

  for (const entry of list) {
    const b = (entry as { TrsrBd?: Record<string, unknown> })?.TrsrBd
    if (!b) continue
    const name = typeof b.nm === 'string' ? b.nm : null
    const sellPu = num(b.untrRedVal)         // PU de resgate (quanto vale hoje)
    const buyPu = num(b.untrInvstmtVal)      // PU de investimento (compra)
    const pu = sellPu ?? buyPu
    if (!name || pu === null || pu <= 0) continue
    titles.push({
      name,
      pu,
      buyPu,
      sellRate: num(b.anulRedRate),
      maturity: typeof b.mtrtyDt === 'string' ? b.mtrtyDt : null,
    })
  }

  titles.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return json({ titles, updatedAt: new Date().toISOString() }, 200, 3600)
}
