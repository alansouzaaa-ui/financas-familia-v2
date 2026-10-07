import type { AssetType, BrapiQuote, InvestmentPosition } from '../types/investment'

/** Tipos com cotação de mercado (brapi). Tesouro tem PU próprio; poupança/renda fixa/outro são valorizados à mão. */
export const MARKET_TYPES = new Set<AssetType>(['acao', 'fii', 'etf', 'cripto'])

function safe(n: number): number {
  return isFinite(n) ? n : 0
}

/** Tickers únicos (maiúsculos) a buscar na brapi: B3 (acao/fii/etf) e cripto. */
export function splitQuoteTickers(positions: InvestmentPosition[]): { b3: string[]; crypto: string[] } {
  const b3 = new Set<string>()
  const crypto = new Set<string>()
  for (const p of positions) {
    if (!MARKET_TYPES.has(p.assetType)) continue
    const t = p.ticker.trim().toUpperCase()
    if (!t) continue
    if (p.assetType === 'cripto') crypto.add(t)
    else b3.add(t)
  }
  return { b3: [...b3], crypto: [...crypto] }
}

export function enrichPositions(
  positions: InvestmentPosition[],
  quotes: Record<string, BrapiQuote>,
  tesouroPu?: Map<string, number>
) {
  return positions.map((p) => {
    let quote = quotes[p.ticker] ?? null
    // Tesouro Direto: sintetiza uma "cotação" a partir do PU atual do título
    if (p.assetType === 'tesouro') {
      const pu = tesouroPu?.get(p.ticker)
      if (pu != null && pu > 0) {
        quote = {
          symbol: p.ticker, shortName: p.ticker, longName: p.ticker, currency: 'BRL',
          regularMarketPrice: pu, regularMarketChange: 0, regularMarketChangePercent: 0, regularMarketPreviousClose: pu,
        }
      }
    }
    const totalInvested = safe(p.quantity * p.avgPrice)
    const currentValue  = quote
      ? safe(p.quantity * quote.regularMarketPrice)
      : (p.manualValue != null ? safe(p.manualValue) : totalInvested)
    const pnl           = safe(currentValue - totalInvested)
    const pnlPercent    = totalInvested > 0 ? safe((pnl / totalInvested) * 100) : 0
    return { ...p, quote, totalInvested, currentValue, pnl, pnlPercent }
  })
}

export type EnrichedPosition = ReturnType<typeof enrichPositions>[number]
