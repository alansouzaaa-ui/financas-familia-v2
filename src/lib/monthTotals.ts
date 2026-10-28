import type { MonthItem, MonthRecord } from '../types/finance'

export type CategoryTotals = Required<Pick<MonthRecord, 'revenue' | 'fixedCosts' | 'loans' | 'cards' | 'variableCosts' | 'renegociacoes'>>

/** Soma os itens por categoria (todas, inclusive renegociacoes). Puro: usado no client e na API. */
export function totalsFromItems(items: MonthItem[]): CategoryTotals {
  const t = { revenue: 0, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0, renegociacoes: 0 }
  for (const i of items) t[i.category] += i.value
  return t
}
