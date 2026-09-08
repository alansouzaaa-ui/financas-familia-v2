// api/tesouro.ts — Vercel Edge Function
// Preços atuais dos títulos do Tesouro Direto a partir dos DADOS ABERTOS do
// Tesouro Transparente (CSV). O arquivo vem ordenado do mais recente para o
// mais antigo, então lemos só o bloco da data mais recente via streaming
// (poucos KB) em vez de baixar todo o histórico. Degrada com elegância:
// qualquer falha devolve lista vazia e a UI mostra a posição pelo custo.
export const config = { runtime: 'edge' }

const CSV_URL =
  'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv'

function json(body: unknown, status = 200, sMaxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(sMaxAge ? { 'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=86400` } : {}),
    },
  })
}

// "19.810,47" | "19810,47" → 19810.47 ; inválido → null
function brNum(s: string | undefined): number | null {
  if (!s) return null
  const n = Number(s.trim().replace(/\./g, '').replace(',', '.'))
  return isFinite(n) ? n : null
}

interface Title { name: string; pu: number; buyPu: number | null; sellRate: number | null; maturity: string | null }

export default async function handler(): Promise<Response> {
  try {
    const res = await fetch(CSV_URL, {
      headers: {
        Accept: 'text/csv, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      },
    })
    if (!res.ok || !res.body) return json({ titles: [], error: `upstream_${res.status}` }, 200)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let latestDate: string | null = null
    let headerSeen = false
    let stop = false
    let guard = 0
    const titles: Title[] = []

    while (!stop) {
      const { value, done } = await reader.read()
      if (value) buf += decoder.decode(value, { stream: true })

      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (++guard > 5000) { stop = true; break }       // trava de segurança
        if (!line) continue
        if (!headerSeen && /tipo\s*titulo/i.test(line)) { headerSeen = true; continue }

        const c = line.split(';')
        if (c.length < 7) continue
        const dataBase = c[2].trim()
        if (latestDate === null) latestDate = dataBase
        if (dataBase !== latestDate) { stop = true; break }   // saiu da data mais recente → para

        const tipo = c[0].trim()
        const venc = c[1].trim()
        const year = venc.slice(-4)
        const puVenda = brNum(c[6])   // PU Venda Manhã = valor de resgate (quanto vale hoje)
        if (!tipo || !/^\d{4}$/.test(year) || puVenda === null || puVenda <= 0) continue
        titles.push({ name: `${tipo} ${year}`, pu: puVenda, buyPu: brNum(c[5]), sellRate: brNum(c[4]), maturity: venc })
      }

      if (done) break
    }
    reader.cancel().catch(() => {})

    titles.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    return json({ titles, baseDate: latestDate, updatedAt: new Date().toISOString() }, 200, 3600)
  } catch {
    return json({ titles: [], error: 'fetch_failed' }, 200)
  }
}
