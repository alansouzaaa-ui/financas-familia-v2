// Cotações via Yahoo Finance (gratuito, sem token), usado server-side por /api/quotes.
// A brapi sem token só responde 4 tickers de teste; aqui cobrimos B3 e cripto.
// Nenhuma função lança: falhas viram null / são ignoradas.

export interface QuoteOut {
  symbol: string
  shortName: string
  longName: string
  currency: string
  regularMarketPrice: number
  regularMarketChange: number
  regularMarketChangePercent: number
  regularMarketPreviousClose: number
}

export type QuoteKind = 'b3' | 'crypto'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const TIMEOUT_MS = 6000

export function toYahooSymbol(ticker: string, kind: QuoteKind): string {
  const t = ticker.trim().toUpperCase()
  if (kind === 'crypto') return t.includes('-') ? t : `${t}-BRL`
  return t.endsWith('.SA') ? t : `${t}.SA`
}

function num(v: unknown): number {
  return typeof v === 'number' && isFinite(v) ? v : NaN
}

/**
 * Fechamento do pregão ANTERIOR.
 *
 * Verificado com curl: com range=5d, `meta.chartPreviousClose` é o fechamento
 * ANTES da janela de 5 dias (ex.: ITSA4 14.16 vs. 16.36 real) — errado. Com
 * range=1d ele coincide com o fechamento anterior, mas só há 1 candle. Então,
 * com range=5d usamos os closes diários válidos (null = candle em formação):
 *  - se o último candle válido é do mesmo dia (no fuso da bolsa, meta.gmtoffset)
 *    de meta.regularMarketTime, o anterior é o penúltimo close válido;
 *  - senão (candle de hoje ainda null, ex.: IVVB11), é o último close válido.
 * Fallback: meta.previousClose / meta.regularMarketPreviousClose.
 */
function previousClose(result: Record<string, unknown>, meta: Record<string, unknown>): number {
  const ts: unknown[] = Array.isArray(result.timestamp) ? result.timestamp : []
  const quote0 = (result.indicators as { quote?: { close?: unknown[] }[] } | undefined)?.quote?.[0]
  const closes: unknown[] = quote0?.close ?? []
  const offset = num(meta.gmtoffset)
  const off = isFinite(offset) ? offset : -3 * 3600
  const day = (t: number) => Math.floor((t + off) / 86400)

  const valid: { t: number; c: number }[] = []
  for (let i = 0; i < ts.length; i++) {
    const t = num(ts[i])
    const c = num(closes[i])
    if (isFinite(t) && isFinite(c) && c > 0) valid.push({ t, c })
  }
  const rt = num(meta.regularMarketTime)
  if (valid.length > 0 && isFinite(rt)) {
    const last = valid[valid.length - 1]
    if (day(last.t) === day(rt)) {
      if (valid.length >= 2) return valid[valid.length - 2].c
    } else {
      return last.c
    }
  }
  for (const k of ['previousClose', 'regularMarketPreviousClose']) {
    const v = num(meta[k])
    if (v > 0) return v
  }
  return NaN
}

export function parseYahooChart(json: unknown, originalTicker: string): QuoteOut | null {
  try {
    const result = (json as { chart?: { result?: Record<string, unknown>[] | null } })?.chart?.result?.[0]
    const meta = result?.meta as Record<string, unknown> | undefined
    if (!result || !meta) return null
    const price = num(meta.regularMarketPrice)
    if (!(price > 0)) return null
    const prev = previousClose(result, meta)
    const hasPrev = prev > 0
    const change = hasPrev ? price - prev : 0
    const pct = hasPrev ? (change / prev) * 100 : 0
    const symbol = originalTicker.trim().toUpperCase()
    const shortName = String(meta.shortName || meta.longName || symbol)
    return {
      symbol,
      shortName,
      longName: String(meta.longName || shortName),
      currency: String(meta.currency || 'BRL'),
      regularMarketPrice: price,
      regularMarketChange: change,
      regularMarketChangePercent: pct,
      regularMarketPreviousClose: hasPrev ? prev : price,
    }
  } catch {
    return null
  }
}

async function fetchChart(symbol: string, ticker: string, fetchImpl: typeof fetch): Promise<QuoteOut | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    return parseYahooChart(await res.json(), ticker)
  } catch {
    return null
  }
}

export async function fetchYahooQuote(
  ticker: string,
  kind: QuoteKind,
  fetchImpl: typeof fetch = fetch,
): Promise<QuoteOut | null> {
  const t = ticker.trim().toUpperCase()
  const direct = await fetchChart(toYahooSymbol(t, kind), t, fetchImpl)
  if (direct || kind !== 'crypto' || t.includes('-')) return direct

  // O Yahoo não tem pares X-BRL (ex.: BTC-BRL → 404). Fallback: X-USD × USD/BRL.
  // A variação % é a do par em USD (aplicada ao câmbio atual).
  const [usd, fx] = await Promise.all([
    fetchChart(`${t}-USD`, t, fetchImpl),
    fetchChart('BRL=X', 'BRL=X', fetchImpl),
  ])
  if (!usd || !fx) return null
  const rate = fx.regularMarketPrice
  return {
    ...usd,
    currency: 'BRL',
    regularMarketPrice: usd.regularMarketPrice * rate,
    regularMarketChange: usd.regularMarketChange * rate,
    regularMarketPreviousClose: usd.regularMarketPreviousClose * rate,
  }
}

export async function fetchManyQuotes(
  items: { ticker: string; kind: QuoteKind }[],
  fetchImpl: typeof fetch = fetch,
  concurrency = 6,
): Promise<QuoteOut[]> {
  const seen = new Set<string>()
  const queue = items
    .map((i) => ({ ticker: i.ticker.trim().toUpperCase(), kind: i.kind }))
    .filter((i) => {
      const key = `${i.kind}:${i.ticker}`
      if (!i.ticker || seen.has(key)) return false
      seen.add(key)
      return true
    })
  const out: QuoteOut[] = []
  let idx = 0
  async function worker() {
    while (idx < queue.length) {
      const item = queue[idx++]
      try {
        const q = await fetchYahooQuote(item.ticker, item.kind, fetchImpl)
        if (q) out.push(q)
      } catch { /* ignora */ }
    }
  }
  const n = Math.max(1, Math.min(concurrency, queue.length))
  await Promise.all(Array.from({ length: n }, worker))
  return out
}
