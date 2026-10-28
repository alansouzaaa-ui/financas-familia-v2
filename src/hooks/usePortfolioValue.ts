import { useState, useEffect, useMemo } from 'react'
import { useInvestmentStore } from '@/stores/useInvestmentStore'
import { fetchQuotes } from '@/lib/brapiService'
import { fetchTesouroTitles } from '@/lib/tesouroService'
import { enrichPositions, splitQuoteTickers } from '@/lib/portfolio'
import type { BrapiQuote } from '@/types/investment'

const CACHE_KEY = 'inv_quotes_cache'
const CACHE_TTL = 5 * 60 * 1000 // 5 min

interface Loaded { quotes: BrapiQuote[]; tesouro: Map<string, number>; ts: number | null }

function getCachedQuotes(): { quotes: BrapiQuote[]; ts: number } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function setCachedQuotes(quotes: BrapiQuote[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ quotes, ts: Date.now() }))
  } catch { /* noop */ }
}

// Promises em andamento compartilhadas entre todos os consumidores (evita buscas duplicadas).
const inflight = new Map<string, Promise<Loaded>>()

function loadPortfolioData(b3: string[], crypto: string[], hasTesouro: boolean): Promise<Loaded> {
  const needQuotes = b3.length > 0 || crypto.length > 0
  const key = `${[...b3].sort().join(',')}|${[...crypto].sort().join(',')}|${hasTesouro}`
  const existing = inflight.get(key)
  if (existing) return existing

  const task = (async (): Promise<Loaded> => {
    const tesouroTask: Promise<Map<string, number>> = hasTesouro
      ? fetchTesouroTitles()
          .then(titles => new Map(titles.map(t => [t.name, t.pu] as [string, number])))
          .catch(() => new Map<string, number>())
      : Promise.resolve(new Map<string, number>())
    let quotes: BrapiQuote[] = []
    let ts: number | null = null
    if (needQuotes) {
      const cached = getCachedQuotes()
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        quotes = cached.quotes
        ts = cached.ts
      } else {
        try {
          quotes = await fetchQuotes(b3, { crypto })
          setCachedQuotes(quotes)
          ts = Date.now()
        } catch { /* fallback silencioso: preço de custo */ }
      }
    }
    return { quotes, tesouro: await tesouroTask, ts }
  })().finally(() => { inflight.delete(key) })

  inflight.set(key, task)
  return task
}

/** Valor da carteira (custo e valor atual de mercado) com cotações em cache e busca compartilhada. */
export function usePortfolioValue() {
  const positions = useInvestmentStore(s => s.positions)
  const [quotes, setQuotes] = useState<BrapiQuote[]>([])
  const [tesouroPu, setTesouroPu] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  useEffect(() => {
    if (!positions.length) return
    const { b3, crypto } = splitQuoteTickers(positions)
    const hasTesouro = positions.some(p => p.assetType === 'tesouro')
    if (b3.length === 0 && crypto.length === 0 && !hasTesouro) return

    let cancelled = false
    async function run() {
      setLoading(true)
      try {
        const r = await loadPortfolioData(b3, crypto, hasTesouro)
        if (cancelled) return
        setQuotes(r.quotes)
        setTesouroPu(r.tesouro)
        setLastUpdate(r.ts != null ? new Date(r.ts) : null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [positions])

  const enriched = useMemo(() => {
    const map: Record<string, BrapiQuote> = {}
    quotes.forEach(q => { map[q.symbol] = q })
    return enrichPositions(positions, map, tesouroPu)
  }, [positions, quotes, tesouroPu])

  const invested = enriched.reduce((s, p) => s + p.totalInvested, 0)
  const current = enriched.reduce((s, p) => s + p.currentValue, 0)

  return { positions, enriched, invested, current, loading, hasQuotes: quotes.length > 0, lastUpdate }
}
