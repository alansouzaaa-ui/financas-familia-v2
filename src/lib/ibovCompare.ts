import type { IbovHistoryPoint } from '@/lib/brapiService'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Fechamento do IBOV na data (ou no pregão anterior mais próximo). `history` deve
// vir em ordem crescente de data (é como o Yahoo devolve).
export function ibovCloseOnOrBefore(history: IbovHistoryPoint[], date: string): number | null {
  if (!history.length) return null
  let best: number | null = null
  for (const h of history) {
    if (h.date <= date) best = h.close
    else break
  }
  // Comprou antes do 1º ponto do histórico → usa o mais antigo disponível.
  return best ?? history[0].close
}

export interface PosForCompare {
  totalInvested: number
  currentValue: number
  buyDate: string
  valued: boolean   // tem cotação ou saldo manual (senão o valor atual é "chute")
}

export interface IbovComparison {
  carteiraReturnPct: number
  ibovReturnPct: number
  deltaPp: number         // carteira − ibov, em pontos percentuais
  investedBase: number    // total investido considerado
  coverageCount: number   // nº de posições consideradas
}

// Comparação money-weighted: para cada posição com data e valor, projeta o quanto
// o MESMO valor investido teria rendido no IBOV entre a compra e hoje. Compara com
// o rendimento real da carteira sobre a mesma base.
export function compareToIbov(
  positions: PosForCompare[],
  history: IbovHistoryPoint[],
  ibovNow: number,
): IbovComparison | null {
  if (!history.length || !(ibovNow > 0)) return null

  let invested = 0
  let current = 0
  let ibovEquiv = 0
  let count = 0

  for (const p of positions) {
    if (!p.valued || !(p.totalInvested > 0) || !ISO_DATE.test(p.buyDate)) continue
    const closeAtBuy = ibovCloseOnOrBefore(history, p.buyDate)
    if (!closeAtBuy || closeAtBuy <= 0) continue
    invested += p.totalInvested
    current += p.currentValue
    ibovEquiv += p.totalInvested * (ibovNow / closeAtBuy)
    count++
  }

  if (count === 0 || invested <= 0) return null

  const carteiraReturnPct = (current / invested - 1) * 100
  const ibovReturnPct = (ibovEquiv / invested - 1) * 100
  return {
    carteiraReturnPct,
    ibovReturnPct,
    deltaPp: carteiraReturnPct - ibovReturnPct,
    investedBase: invested,
    coverageCount: count,
  }
}
