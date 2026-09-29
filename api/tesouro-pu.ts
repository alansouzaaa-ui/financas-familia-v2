// api/tesouro-pu.ts — Vercel Edge Function
// PU (preço unitário) de um título do Tesouro Direto numa DATA de compra, a partir
// dos DADOS ABERTOS do Tesouro Transparente. O CSV vem do mais recente para o mais
// antigo, então transmitimos até cruzar a data pedida e pegamos o primeiro pregão
// <= data para o título (tipo + vencimento). Degrada com elegância: {pu:null}.
export const config = { runtime: 'edge' }

const CSV_URL =
  'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv'

function json(body: unknown, status = 200, sMaxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(sMaxAge ? { 'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=604800` } : {}),
    },
  })
}

function brNum(s: string | undefined): number | null {
  if (!s) return null
  const n = Number(s.trim().replace(/\./g, '').replace(',', '.'))
  return isFinite(n) ? n : null
}

// "01/03/2029" → "2029-03-01" ; inválido → null
function toIso(ddmmyyyy: string): string | null {
  const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const tipo = (url.searchParams.get('tipo') ?? '').trim()
  const venc = (url.searchParams.get('venc') ?? '').trim()
  const data = (url.searchParams.get('data') ?? '').trim() // YYYY-MM-DD

  if (!tipo || !venc || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return json({ pu: null, error: 'bad_params' }, 200)
  }

  try {
    const res = await fetch(CSV_URL, {
      headers: {
        Accept: 'text/csv, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      },
    })
    if (!res.ok || !res.body) return json({ pu: null, error: `upstream_${res.status}` }, 200)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let headerSeen = false
    let stop = false
    let guard = 0
    let sinceCross = 0   // linhas lidas após cruzar a data (limita busca de título inexistente)
    let crossed = false

    while (!stop) {
      const { value, done } = await reader.read()
      if (value) buf += decoder.decode(value, { stream: true })

      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (++guard > 1_200_000) { stop = true; break }
        if (!line) continue
        if (!headerSeen && /tipo\s*titulo/i.test(line)) { headerSeen = true; continue }

        const c = line.split(';')
        if (c.length < 7) continue
        const dbIso = toIso(c[2].trim())
        if (!dbIso) continue
        if (dbIso > data) continue      // ainda em datas mais novas que a compra → pula

        // A partir daqui dbIso <= data.
        crossed = true
        if (++sinceCross > 8000) { stop = true; break }  // título não existia nessa data

        if (c[0].trim() === tipo && c[1].trim() === venc) {
          const pu = brNum(c[6])         // PU Venda (mesma série usada no valor atual)
          if (pu !== null && pu > 0) {
            reader.cancel().catch(() => {})
            return json({ pu, date: dbIso, tipo, venc }, 200, 604800)
          }
        }
      }
      if (done) break
    }
    reader.cancel().catch(() => {})
    return json({ pu: null, error: crossed ? 'not_found' : 'date_out_of_range' }, 200)
  } catch {
    return json({ pu: null, error: 'fetch_failed' }, 200)
  }
}
