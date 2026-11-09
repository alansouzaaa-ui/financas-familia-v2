// Histórico de proventos via Yahoo Finance (gratuito, sem token), usado server-side
// por /api/dividends. Nenhuma função lança: falhas viram null / são ignoradas.
//
// Formato verificado com curl (range=5y&interval=1mo&events=div):
//   chart.result[0].events.dividends = { "<ts do candle mensal>": { amount, date } }
// `date` = timestamp (segundos) da data com/ex; a chave é o início do candle do mês
// e pode divergir de `date` (ex.: ITSA4, chave de jan/22 com date de dez/21).

export interface DividendEvent {
  /** YYYY-MM-DD (data com / ex-date), fuso de Brasília */
  date: string
  /** valor por cota, na moeda do ativo */
  amount: number
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const TIMEOUT_MS = 8000
const BRT_OFFSET_S = -3 * 3600

function tsToBrDate(ts: number): string {
  return new Date((ts + BRT_OFFSET_S) * 1000).toISOString().slice(0, 10)
}

export function parseYahooDividends(json: unknown): DividendEvent[] {
  try {
    const result = (json as { chart?: { result?: { events?: { dividends?: Record<string, unknown> } }[] | null } })
      ?.chart?.result?.[0]
    const divs = result?.events?.dividends
    if (!divs || typeof divs !== 'object') return []
    const out: DividendEvent[] = []
    for (const [key, raw] of Object.entries(divs)) {
      const v = raw as { amount?: unknown; date?: unknown } | null
      const amount = typeof v?.amount === 'number' ? v.amount : NaN
      if (!isFinite(amount) || amount <= 0) continue
      const tsRaw = typeof v?.date === 'number' && isFinite(v.date) ? v.date : Number(key)
      if (!isFinite(tsRaw) || tsRaw <= 0) continue
      out.push({ date: tsToBrDate(tsRaw), amount })
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  } catch {
    return []
  }
}

export async function fetchYahooDividends(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DividendEvent[] | null> {
  try {
    const t = ticker.trim().toUpperCase()
    if (!t) return null
    const sym = t.endsWith('.SA') ? t : `${t}.SA`
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5y&interval=1mo&events=div`
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const json = await res.json()
    const result = (json as { chart?: { result?: unknown[] | null } })?.chart?.result?.[0]
    if (!result) return null
    return parseYahooDividends(json)
  } catch {
    return null
  }
}

export async function fetchManyDividends(
  tickers: string[],
  fetchImpl: typeof fetch = fetch,
  concurrency = 4,
): Promise<{ symbol: string; events: DividendEvent[] }[]> {
  const queue = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))]
  const out: { symbol: string; events: DividendEvent[] }[] = []
  let idx = 0
  async function worker() {
    while (idx < queue.length) {
      const symbol = queue[idx++]
      try {
        const events = await fetchYahooDividends(symbol, fetchImpl)
        if (events) out.push({ symbol, events })
      } catch { /* ignora */ }
    }
  }
  const n = Math.max(1, Math.min(concurrency, queue.length))
  await Promise.all(Array.from({ length: n }, worker))
  return out
}
