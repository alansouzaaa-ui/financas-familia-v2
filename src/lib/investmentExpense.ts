import { MONTHS, type MonthAbbr, type MonthItem } from '@/types/finance'
import type { InvestmentOperation, InvestmentPosition } from '@/types/investment'
import { isManualPosition, isValidISODate } from '@/lib/operations'

/** Id do lançamento (despesa ou receita) vinculado a uma operação de investimento. */
export const expenseItemId = (opId: string): string => 'invest:' + opId

export interface InvestEntry {
  ym: { year: number; month: MonthAbbr }
  item: MonthItem
}

const cents = (n: number) => Math.round(n * 100) / 100
const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * Lançamento pago correspondente a uma operação: compra/aporte/abertura geram despesa;
 * venda (líquida de taxas) e resgate geram receita. Devolve null se o valor for <= 0
 * ou a data for inválida.
 */
export function entryFromOperation(op: InvestmentOperation, position: InvestmentPosition): InvestEntry | null {
  if (!isValidISODate(op.date)) return null
  const manual = isManualPosition(position)
  let raw: number
  let verb: 'Compra' | 'Aporte' | 'Venda' | 'Resgate'
  let category: 'variableCosts' | 'revenue' = 'variableCosts'
  if (op.type === 'buy') {
    if (!num(op.quantity) || !num(op.price)) return null
    raw = op.quantity * op.price + (num(op.fees) ? op.fees : 0)
    verb = 'Compra'
  } else if (op.type === 'deposit') {
    if (!num(op.amount)) return null
    raw = op.amount
    verb = 'Aporte'
  } else if (op.type === 'opening') {
    // A abertura guarda o valor depositado em quantity*price (balance: quantity 1, price = depositado).
    if (!num(op.quantity) || !num(op.price)) return null
    raw = op.quantity * op.price
    verb = manual ? 'Aporte' : 'Compra'
  } else if (op.type === 'sell') {
    if (!num(op.quantity) || !num(op.price)) return null
    raw = op.quantity * op.price - (num(op.fees) ? op.fees : 0)
    verb = 'Venda'
    category = 'revenue'
  } else if (op.type === 'withdraw') {
    if (!num(op.amount)) return null
    raw = op.amount
    verb = 'Resgate'
    category = 'revenue'
  } else return null

  const value = cents(raw)
  if (!(value > 0)) return null
  const [y, m] = op.date.split('-')
  const id = expenseItemId(op.id)
  return {
    ym: { year: Number(y), month: MONTHS[Number(m) - 1] },
    item: {
      id,
      externalId: id,
      description: `${verb} ${position.ticker}`,
      value,
      category,
      tag: 'investimentos',
      isPaid: true,
      source: 'invest',
      occurredAt: `${op.date}T12:00:00.000Z`,
    },
  }
}
