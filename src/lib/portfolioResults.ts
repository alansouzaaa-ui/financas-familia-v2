import type { ClosedPosition, InvestmentOperation, InvestmentPosition } from '../types/investment'
import type { EnrichedPosition } from './portfolio'
import { dividendSymbol, receivedFromEvents, type DividendEvent } from './dividends'
import { heldOn, openingFor, replayOperations, totalBought } from './operations'

// Resultado da carteira (em aberto + realizado + dividendos) — funções puras, sem React/store.

export type DividendStatus = 'ok' | 'na' | 'no-data' | 'no-date'

export interface DividendEstimate {
  status: DividendStatus
  total: number
  last12m: number
}

export interface PositionResult {
  id: string
  ticker: string
  closed: boolean
  /** Posição aberta com valor atual conhecido (cotação ou saldo manual). */
  valued: boolean
  /** null se aberta sem valor conhecido; 0 se encerrada. */
  unrealized: number | null
  realized: number
  dividends: DividendEstimate
  /** (unrealized ?? 0) + realized + dividends.total */
  total: number
  bought: number
  /** Replay das operações inválido. */
  inconsistent: boolean
}

export interface PortfolioResults {
  rows: PositionResult[]
  /** null se há posições abertas e nenhuma tem valor conhecido; 0 se não há abertas. */
  unrealized: number | null
  /** unrealized / custo SOMENTE das posições com valor conhecido. */
  unrealizedPct: number | null
  realized: number
  dividends: number
  /** null quando `unrealized` é null. */
  total: number | null
  /** total / bought */
  totalPct: number | null
  bought: number
  received12m: number
  missingQuotes: string[]
  noDividendData: string[]
  noDividendDate: string[]
  inconsistent: string[]
}

const DIVIDEND_TYPES = new Set(['acao', 'fii', 'etf'])
const ZERO_DIVIDENDS = (status: DividendStatus): DividendEstimate => ({ status, total: 0, last12m: 0 })

/** Véspera (YYYY-MM-DD) calculada em UTC sobre a própria string. */
export function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function estimateDividends(
  position: InvestmentPosition,
  ops: InvestmentOperation[],
  events: Record<string, DividendEvent[]> | null,
  now: Date,
): DividendEstimate {
  if (!DIVIDEND_TYPES.has(position.assetType)) return ZERO_DIVIDENDS('na')
  if (ops.some(o => o.dateUnknown)) return ZERO_DIVIDENDS('no-date')
  const list = events?.[dividendSymbol(position.ticker)]
  if (!list) return ZERO_DIVIDENDS('no-data')
  const { total, last12m } = receivedFromEvents(list, d => heldOn(ops, dayBefore(d)), now)
  return { status: 'ok', total, last12m }
}

function push(list: string[], ticker: string) {
  if (!list.includes(ticker)) list.push(ticker)
}

export function buildPortfolioResults(input: {
  enriched: EnrichedPosition[]
  closed: ClosedPosition[]
  operations: InvestmentOperation[]
  /** chave = dividendSymbol */
  events: Record<string, DividendEvent[]> | null
  now: Date
}): PortfolioResults {
  const { enriched, closed, operations, events, now } = input

  const byPos = new Map<string, InvestmentOperation[]>()
  for (const o of operations) {
    const l = byPos.get(o.positionId)
    if (l) l.push(o)
    else byPos.set(o.positionId, [o])
  }
  const opsOf = (p: InvestmentPosition) => {
    const own = byPos.get(p.id)
    return own && own.length > 0 ? own : [openingFor(p, p.id)]
  }

  const rows: PositionResult[] = []
  const missingQuotes: string[] = []
  const noDividendData: string[] = []
  const noDividendDate: string[] = []
  const inconsistent: string[] = []
  let unrealizedSum = 0
  let valuedCount = 0
  let valuedCost = 0

  const track = (r: PositionResult) => {
    if (r.dividends.status === 'no-data') push(noDividendData, r.ticker)
    if (r.dividends.status === 'no-date') push(noDividendDate, r.ticker)
    if (r.inconsistent) push(inconsistent, r.ticker)
    rows.push(r)
  }

  for (const p of enriched) {
    const ops = opsOf(p)
    const replay = replayOperations(ops)
    const valued = p.quote !== null || p.manualValue != null
    if (valued) {
      unrealizedSum += p.pnl
      valuedCount++
      valuedCost += p.totalInvested
    } else {
      push(missingQuotes, p.ticker)
    }
    const dividends = estimateDividends(p, ops, events, now)
    const unrealized = valued ? p.pnl : null
    track({
      id: p.id,
      ticker: p.ticker,
      closed: false,
      valued,
      unrealized,
      realized: replay.realizedGain,
      dividends,
      total: (unrealized ?? 0) + replay.realizedGain + dividends.total,
      bought: totalBought(ops),
      inconsistent: !replay.valid,
    })
  }

  for (const c of closed) {
    const p = c.position
    const ops = opsOf(p)
    const replay = replayOperations(ops)
    const dividends = estimateDividends(p, ops, events, now)
    track({
      id: p.id,
      ticker: p.ticker,
      closed: true,
      valued: false,
      unrealized: 0,
      realized: c.realizedGain,
      dividends,
      total: c.realizedGain + dividends.total,
      bought: totalBought(ops),
      inconsistent: !replay.valid,
    })
  }

  rows.sort((a, b) => b.total - a.total || (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0))

  const unrealized = enriched.length === 0 ? 0 : valuedCount === 0 ? null : unrealizedSum
  const realized = rows.reduce((s, r) => s + r.realized, 0)
  const dividends = rows.reduce((s, r) => s + r.dividends.total, 0)
  const bought = rows.reduce((s, r) => s + r.bought, 0)
  const received12m = rows.reduce((s, r) => s + r.dividends.last12m, 0)
  const total = unrealized === null ? null : unrealized + realized + dividends

  return {
    rows,
    unrealized,
    unrealizedPct: unrealized !== null && valuedCost > 0 ? (unrealized / valuedCost) * 100 : null,
    realized,
    dividends,
    total,
    totalPct: total !== null && bought > 0 ? (total / bought) * 100 : null,
    bought,
    received12m,
    missingQuotes,
    noDividendData,
    noDividendDate,
    inconsistent,
  }
}
