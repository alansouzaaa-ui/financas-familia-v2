import { MONTHS } from '../types/finance'
import type { MonthRecord, MonthAbbr } from '../types/finance'
import type { DebtItem } from '../types/debt'
import { totalsFromItems } from './monthTotals'

export interface NetWorthInput {
  investmentsCurrent: number
  /** Saldo em conta informado pelo usuário; null = não informado (tratado como 0). */
  cash: number | null
  debts: Pick<DebtItem, 'value' | 'paid'>[]
}

export interface NetWorthResult {
  investments: number
  cash: number
  /** true quando o saldo em conta não foi informado (valor assumido como 0). */
  cashMissing: boolean
  debts: number
  netWorth: number
}

/** Soma das dívidas em aberto (quitadas ficam de fora). */
export function sumOpenDebts(debts: Pick<DebtItem, 'value' | 'paid'>[]): number {
  return debts.reduce((s, d) => (d.paid ? s : s + (Number.isFinite(d.value) ? d.value : 0)), 0)
}

/** Patrimônio líquido = Investimentos + Saldo em conta − Dívidas. */
export function computeNetWorth({ investmentsCurrent, cash, debts }: NetWorthInput): NetWorthResult {
  const investments = Number.isFinite(investmentsCurrent) ? investmentsCurrent : 0
  const cashMissing = cash == null || !Number.isFinite(cash)
  const cashValue = cashMissing ? 0 : (cash as number)
  const debtTotal = sumOpenDebts(debts)
  return {
    investments,
    cash: cashValue,
    cashMissing,
    debts: debtTotal,
    netWorth: investments + cashValue - debtTotal,
  }
}

export interface MonthCommitments {
  month: MonthAbbr
  year: number
  loans: number
  cards: number
  renegociacoes: number
  /** true se existe registro para o mês-calendário atual. */
  found: boolean
}

/** Compromissos (empréstimos, cartões, renegociações) do mês-calendário de `now`, nunca do último mês da lista. */
export function currentMonthCommitments(
  allMonths: Pick<MonthRecord, 'month' | 'year' | 'loans' | 'cards' | 'renegociacoes' | 'items'>[],
  now: Date = new Date(),
): MonthCommitments {
  const month = MONTHS[now.getMonth()]
  const year = now.getFullYear()
  const rec = allMonths.find(m => m.month === month && m.year === year)
  if (!rec) return { month, year, loans: 0, cards: 0, renegociacoes: 0, found: false }
  if (rec.items && rec.items.length > 0) {
    const t = totalsFromItems(rec.items)
    return { month, year, loans: t.loans, cards: t.cards, renegociacoes: t.renegociacoes, found: true }
  }
  return { month, year, loans: rec.loans ?? 0, cards: rec.cards ?? 0, renegociacoes: rec.renegociacoes ?? 0, found: true }
}
