import { useState, useEffect, useRef } from 'react'

interface MarketItem {
  symbol: string
  label: string
  value: number
  change: number
  currency: string
}

const NEWS_CACHE_KEY = 'mktbar_news'
const QUOTES_CACHE_KEY = 'mktbar_quotes'
const NEWS_TTL  = 5 * 60 * 1000   // 5 min
const QUOTES_TTL = 60 * 1000      // 60 s

function readCache<T>(key: string, ttl: number): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw) as { data: T; ts: number }
    return Date.now() - ts < ttl ? data : null
  } catch { return null }
}

function writeCache<T>(key: string, data: T) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch { /* noop */ }
}

async function fetchMarkets(): Promise<MarketItem[]> {
  const items: MarketItem[] = []
  try {
    // IBOV + S&P via Brapi
    const res = await fetch(
      'https://brapi.dev/api/quote/%5EBVSP,%5EGSPC?fundamental=false&dividends=false',
      { signal: AbortSignal.timeout(8000) }
    )
    if (res.ok) {
      const json = await res.json()
      const results: Array<Record<string, unknown>> = json.results ?? []
      for (const q of results) {
        if (q.symbol === '^BVSP') {
          items.push({ symbol: 'IBOV', label: 'IBOV', value: q.regularMarketPrice as number, change: q.regularMarketChangePercent as number, currency: 'pts' })
        }
        if (q.symbol === '^GSPC') {
          items.push({ symbol: 'S&P', label: 'S&P 500', value: q.regularMarketPrice as number, change: q.regularMarketChangePercent as number, currency: 'USD' })
        }
      }
    }
  } catch { /* silent */ }

  try {
    // BTC + ETH via CoinGecko (free, no key)
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=brl&include_24hr_change=true',
      { signal: AbortSignal.timeout(8000) }
    )
    if (res.ok) {
      const json = await res.json()
      if (json.bitcoin) items.push({ symbol: 'BTC', label: 'Bitcoin', value: json.bitcoin.brl, change: json.bitcoin.brl_24h_change ?? 0, currency: 'BRL' })
      if (json.ethereum) items.push({ symbol: 'ETH', label: 'Ethereum', value: json.ethereum.brl, change: json.ethereum.brl_24h_change ?? 0, currency: 'BRL' })
    }
  } catch { /* silent */ }

  return items
}

async function fetchNews(): Promise<string[]> {
  try {
    // RSS InfoMoney via rss2json (free, no key needed)
    const rssUrl = encodeURIComponent('https://www.infomoney.com.br/feed/')
    const res = await fetch(
      `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=15`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return []
    const json = await res.json()
    const items: Array<{ title: string; link: string }> = json.items ?? []
    return items.map(i => i.title).filter(Boolean)
  } catch { return [] }
}

function fmtMarket(value: number, currency: string) {
  if (currency === 'pts') return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  if (currency === 'USD') return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export default function MarketBar() {
  const [markets, setMarkets] = useState<MarketItem[]>([])
  const [headlines, setHeadlines] = useState<string[]>([])
  const [paused, setPaused] = useState(false)
  const tickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cached = readCache<MarketItem[]>(QUOTES_CACHE_KEY, QUOTES_TTL)
    if (cached) setMarkets(cached)

    const load = () => fetchMarkets().then(data => { if (data.length) { setMarkets(data); writeCache(QUOTES_CACHE_KEY, data) } })
    if (!cached) load()
    const id = setInterval(load, QUOTES_TTL)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const cached = readCache<string[]>(NEWS_CACHE_KEY, NEWS_TTL)
    if (cached?.length) { setHeadlines(cached); return }

    fetchNews().then(data => {
      if (data.length) { setHeadlines(data); writeCache(NEWS_CACHE_KEY, data) }
    })
    const id = setInterval(() => {
      fetchNews().then(data => { if (data.length) { setHeadlines(data); writeCache(NEWS_CACHE_KEY, data) } })
    }, NEWS_TTL)
    return () => clearInterval(id)
  }, [])

  if (!markets.length && !headlines.length) return null

  return (
    <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] transition-colors duration-200">
      {/* Market quotes */}
      {markets.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 overflow-x-auto scrollbar-hide border-b border-[var(--color-border)]">
          {markets.map(m => (
            <div key={m.symbol} className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">{m.label}</span>
              <span className="text-[12px] font-mono text-[var(--color-text-primary)]">{fmtMarket(m.value, m.currency)}</span>
              <span className={`text-[11px] font-mono font-medium flex items-center gap-0.5 ${m.change >= 0 ? 'pos' : 'neg'}`}>
                {m.change >= 0 ? '▲' : '▼'}{Math.abs(m.change).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* News ticker */}
      {headlines.length > 0 && (
        <div
          className="flex items-center gap-2 px-4 py-1.5 overflow-hidden"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider flex-shrink-0 mr-1">
            Notícias
          </span>
          <div className="overflow-hidden flex-1">
            <div
              ref={tickerRef}
              className="flex gap-8 whitespace-nowrap"
              style={{
                animation: `ticker-scroll 60s linear infinite`,
                animationPlayState: paused ? 'paused' : 'running',
              }}
            >
              {[...headlines, ...headlines].map((h, i) => (
                <span key={i} className="text-[12px] text-[var(--color-text-muted)]">
                  {h} <span className="opacity-30 mx-2">·</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
