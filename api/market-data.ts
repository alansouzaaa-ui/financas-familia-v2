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

async function fetchBrapi(): Promise<MarketItem[]> {
  const items: MarketItem[] = []
  try {
    const res = await fetch(
      'https://brapi.dev/api/quote/%5EBVSP,%5EGSPC?fundamental=false&dividends=false',
      { signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return items
    const json = await res.json() as { results?: Array<Record<string, unknown>> }
    for (const q of json.results ?? []) {
      if (q.symbol === '^BVSP') {
        items.push({ symbol: 'IBOV', label: 'IBOV', value: q.regularMarketPrice as number, change: q.regularMarketChangePercent as number, currency: 'pts' })
      }
      if (q.symbol === '^GSPC') {
        items.push({ symbol: 'SP500', label: 'S&P 500', value: q.regularMarketPrice as number, change: q.regularMarketChangePercent as number, currency: 'USD' })
      }
    }
  } catch { /* silent */ }
  return items
}

async function fetchCrypto(): Promise<MarketItem[]> {
  const items: MarketItem[] = []
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=brl&include_24hr_change=true',
      { signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return items
    const json = await res.json() as Record<string, { brl: number; brl_24h_change?: number }>
    if (json.bitcoin) items.push({ symbol: 'BTC', label: 'Bitcoin', value: json.bitcoin.brl, change: json.bitcoin.brl_24h_change ?? 0, currency: 'BRL' })
    if (json.ethereum) items.push({ symbol: 'ETH', label: 'Ethereum', value: json.ethereum.brl, change: json.ethereum.brl_24h_change ?? 0, currency: 'BRL' })
  } catch { /* silent */ }
  return items
}

async function fetchNews(): Promise<string[]> {
  try {
    const rssUrl = encodeURIComponent('https://www.infomoney.com.br/feed/')
    const res = await fetch(
      `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=20`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return []
    const json = await res.json() as { items?: Array<{ title: string }> }
    return (json.items ?? []).map(i => i.title).filter(Boolean).slice(0, 20)
  } catch { return [] }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const [brapi, crypto, headlines] = await Promise.allSettled([
    fetchBrapi(),
    fetchCrypto(),
    fetchNews(),
  ])

  const markets = [
    ...(brapi.status === 'fulfilled' ? brapi.value : []),
    ...(crypto.status === 'fulfilled' ? crypto.value : []),
  ]

  const news = headlines.status === 'fulfilled' ? headlines.value : []

  return new Response(JSON.stringify({ markets, headlines: news }), { headers: CORS })
}
