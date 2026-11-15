import { MONTHS, type MonthAbbr, type MonthItem } from '@/types/finance'
import type { InvestmentOperation, InvestmentPosition } from '@/types/investment'
import { isManualPosition, isValidISODate } from '@/lib/operations'

/** Id do lançamento de despesa vinculado a uma operação de investimento. */
export const expenseItemId = (opId: string): string => 'invest:' + opId

export interface InvestExpense {
  ym: { year: number; month: MonthAbbr }
  item: MonthItem
}

const cents = (n: number) => Math.round(n * 100) / 100
const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * Despesa pago correspondente a uma compra/aporte/abertura. Venda e resgate não geram
 * despesa. Devolve null se o valor for <= 0 ou a data for inválida.
 */
export function expenseFromOperation(op: InvestmentOperation, position: InvestmentPosition): InvestExpense | null {
  if (!isValidISODate(op.date)) return null
  const manual = isManualPosition(position)
  let raw: number
  let verb: 'Compra' | 'Aporte'
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
      category: 'variableCosts',
      tag: 'investimentos',
      isPaid: true,
      source: 'invest',
      occurredAt: `${op.date}T12:00:00.000Z`,
    },
  }
}
