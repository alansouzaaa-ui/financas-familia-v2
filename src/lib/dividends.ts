import type { DividendEvent } from '../../api/lib/yahooDividends'

export type { DividendEvent }

export interface MonthPattern {
  /** 0-11 */
  month: number
  /** 0..1: fração dos anos-base com pagamento nesse mês */
  freq: number
  /** média do total pago por cota nesse mês, nos anos em que pagou */
  avgPerShare: number
}

export interface ProjectionMonth { year: number; month: number; amount: number }

const cents = (n: number) => Math.round(n * 100) / 100

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

/** Padrão mensal a partir dos `years` anos-calendário completos anteriores ao de `now`. */
export function monthlyPattern(events: DividendEvent[], now: Date, years = 3): MonthPattern[] {
  const cur = now.getFullYear()
  const base = cur - years
  const sums = new Map<string, number>() // `${ano}-${mes}` → total por cota
  for (const e of events) {
    const y = Number(e.date.slice(0, 4))
    const m = Number(e.date.slice(5, 7)) - 1
    if (y < base || y >= cur) continue
    const k = `${y}-${m}`
    sums.set(k, (sums.get(k) ?? 0) + e.amount)
  }
  const out: MonthPattern[] = []
  for (let m = 0; m < 12; m++) {
    let n = 0
    let total = 0
    for (let y = base; y < cur; y++) {
      const s = sums.get(`${y}-${m}`)
      if (s !== undefined && s > 0) { n++; total += s }
    }
    out.push({ month: m, freq: years > 0 ? n / years : 0, avgPerShare: n > 0 ? total / n : 0 })
  }
  return out
}

/** Soma por cota dos eventos com data em (now − 12 meses, now]. */
export function trailing12m(events: DividendEvent[], now: Date): number {
  const end = toIso(now.getFullYear(), now.getMonth(), now.getDate())
  const start = toIso(now.getFullYear() - 1, now.getMonth(), now.getDate())
  let s = 0
  for (const e of events) if (e.date > start && e.date <= end) s += e.amount
  return s
}

/** Projeção dos 12 meses seguintes ao mês de `now`. */
export function projectNext12(patterns: MonthPattern[], quantity: number, now: Date, minFreq = 0.5): ProjectionMonth[] {
  const out: ProjectionMonth[] = []
  for (let i = 1; i <= 12; i++) {
    const idx = now.getMonth() + i
    const year = now.getFullYear() + Math.floor(idx / 12)
    const month = idx % 12
    const p = patterns.find((x) => x.month === month)
    const amount = p && p.freq >= minFreq ? cents(quantity * p.avgPerShare) : 0
    out.push({ year, month, amount })
  }
  return out
}

/** Σ amount×qty dos eventos com data ≥ since e dentro dos últimos `monthsBack` meses. */
export function receivedSince(
  events: DividendEvent[],
  quantity: number,
  since: string,
  now: Date,
  monthsBack = 12,
): number {
  const end = toIso(now.getFullYear(), now.getMonth(), now.getDate())
  const sd = new Date(now.getFullYear(), now.getMonth() - monthsBack, now.getDate())
  const start = toIso(sd.getFullYear(), sd.getMonth(), sd.getDate())
  let s = 0
  for (const e of events) {
    if (e.date >= since && e.date > start && e.date <= end) s += e.amount * quantity
  }
  return cents(s)
}

/** Dividend yield (%) = proventos 12m por cota / preço. */
export function dividendYield(trailingPerShare: number, price: number | null): number | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null
  if (!Number.isFinite(trailingPerShare)) return null
  return (trailingPerShare / price) * 100
}
