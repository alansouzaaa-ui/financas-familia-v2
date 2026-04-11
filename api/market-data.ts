export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
}

interface MarketItem {
  symbol: string
  label: string
  value: number
  change: number
  currency: string
}

// Yahoo Finance — sem token, funciona server-side
async function fetchYahoo(ticker: string, label: string, currency: string): Promise<MarketItem | null> {
  try {
    const encoded = encodeURIComponent(ticker)
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d`,
      {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }
    )
    if (!res.ok) return null
    const json = await res.json() as { chart: { result?: Array<{ meta: Record<string, number> }> } }
    const meta = json.chart?.result?.[0]?.meta
    if (!meta) return null
    const price = meta.regularMarketPrice
    const prev  = meta.chartPreviousClose
    if (!price || !prev) return null
    const change = ((price - prev) / prev) * 100
    return { symbol: ticker, label, value: price, change, currency }
  } catch { return null }
}

async function fetchIndices(): Promise<MarketItem[]> {
  const [ibov, sp] = await Promise.all([
    fetchYahoo('^BVSP',  'IBOV',    'pts'),
    fetchYahoo('^GSPC',  'S&P 500', 'USD'),
  ])
  return [ibov, sp].filter((x): x is MarketItem => x !== null)
}

async function fetchCrypto(): Promise<MarketItem[]> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=brl&include_24hr_change=true',
      { signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return []
    const json = await res.json() as Record<string, { brl: number; brl_24h_change?: number }>
    const items: MarketItem[] = []
    if (json.bitcoin)  items.push({ symbol: 'BTC', label: 'Bitcoin',  value: json.bitcoin.brl,  change: json.bitcoin.brl_24h_change ?? 0,  currency: 'BRL' })
    if (json.ethereum) items.push({ symbol: 'ETH', label: 'Ethereum', value: json.ethereum.brl, change: json.ethereum.brl_24h_change ?? 0, currency: 'BRL' })
    return items
  } catch { return [] }
}

// rss2json sem parâmetros extras (funciona no plano free)
async function fetchNews(): Promise<string[]> {
  try {
    const rssUrl = encodeURIComponent('https://www.infomoney.com.br/feed/')
    const res = await fetch(
      `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return []
    const json = await res.json() as { status?: string; items?: Array<{ title: string }> }
    if (json.status !== 'ok') return []
    return (json.items ?? []).map(i => i.title).filter(Boolean).slice(0, 20)
  } catch { return [] }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const [indices, crypto, news] = await Promise.allSettled([
    fetchIndices(),
    fetchCrypto(),
    fetchNews(),
  ])

  const markets = [
    ...(indices.status === 'fulfilled' ? indices.value : []),
    ...(crypto.status === 'fulfilled'  ? crypto.value  : []),
  ]

  const headlines = news.status === 'fulfilled' ? news.value : []

  return new Response(JSON.stringify({ markets, headlines }), { headers: CORS })
}
