import { useState, useEffect, useRef } from 'react'

interface MarketItem {
  symbol: string
  label: string
  value: number
  change: number
  currency: string
}

const CACHE_KEY = 'mktbar_v2'
const CACHE_TTL = 60 * 1000 // 60s

function readCache(): { markets: MarketItem[]; headlines: string[]; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Date.now() - parsed.ts < CACHE_TTL ? parsed : null
  } catch { return null }
}

function writeCache(markets: MarketItem[], headlines: string[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ markets, headlines, ts: Date.now() })) } catch { /* noop */ }
}

function fmtMarket(value: number, currency: string) {
  if (currency === 'pts') return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' pts'
  if (currency === 'USD') return 'US$ ' + value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  return 'R$ ' + value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

export default function MarketBar() {
  const [markets, setMarkets] = useState<MarketItem[]>([])
  const [headlines, setHeadlines] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [paused, setPaused] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/market-data')
      if (!res.ok) return
      const data = await res.json() as { markets: MarketItem[]; headlines: string[] }
      setMarkets(data.markets ?? [])
      setHeadlines(data.headlines ?? [])
      writeCache(data.markets ?? [], data.headlines ?? [])
    } catch { /* silent — uses cache */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setMarkets(cached.markets)
      setHeadlines(cached.headlines)
      setLoading(false)
    }
    load()
    intervalRef.current = setInterval(load, CACHE_TTL)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  // Skeleton while loading first time
  if (loading && markets.length === 0) {
    return (
      <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-2 flex gap-6">
        {[1,2,3,4].map(i => (
          <div key={i} className="flex gap-2 items-center animate-pulse">
            <div className="h-3 w-10 bg-[var(--color-surface-2)] rounded" />
            <div className="h-3 w-16 bg-[var(--color-surface-2)] rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (!loading && markets.length === 0 && headlines.length === 0) return null

  return (
    <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] transition-colors duration-200">
      {/* Market quotes */}
      {markets.length > 0 && (
        <div className="flex items-center gap-5 px-4 py-2 overflow-x-auto scrollbar-hide border-b border-[var(--color-border)]">
          {markets.map(m => (
            <div key={m.symbol} className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">{m.label}</span>
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
          <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider flex-shrink-0 border border-[var(--color-border)] rounded px-1.5 py-0.5">
            NEWS
          </span>
          <div className="overflow-hidden flex-1">
            <div
              className="flex gap-10 whitespace-nowrap"
              style={{
                animation: 'ticker-scroll 80s linear infinite',
                animationPlayState: paused ? 'paused' : 'running',
              }}
            >
              {[...headlines, ...headlines].map((h, i) => (
                <span key={i} className="text-[12px] text-[var(--color-text-muted)] flex-shrink-0">
                  {h}
                  <span className="opacity-25 mx-4">·</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
