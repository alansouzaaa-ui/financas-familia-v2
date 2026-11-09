// Transação Pluggy (cartão) -> dados de um lançamento do app. Lib pura, sem I/O.
import { guessTag } from '../../src/lib/autoTag'
import { cleanDescription } from '../../src/lib/invoiceImport'
import type { PluggyAccountLink } from '../../src/lib/pluggyState'

export interface PluggyTx {
  id: string
  description: string
  amount: number
  type: 'DEBIT' | 'CREDIT'
  date: string
  status: 'PENDING' | 'POSTED'
  category: string | null
  creditCardMetadata?: { billId?: string | null; installmentNumber?: number | null; totalInstallments?: number | null } | null
}

export interface PluggyBill { id: string; dueDate: string; billClosingDate?: string | null }

const cents = (n: number) => Math.round(n * 100) / 100
const pad2 = (n: number) => String(n).padStart(2, '0')

/** Normaliza data da Pluggy (ISO datetime ou YYYY-MM-DD) para YYYY-MM-DD; inválida -> null. */
export function toYmd(s: string | null | undefined): string | null {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10)
}

export function spDate(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso.slice(0, 10)
  return new Date(t - 3 * 3600_000).toISOString().slice(0, 10)
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`
}

function addDays(ymd: string, n: number): string {
  const t = Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

export function billMonthKey(
  tx: PluggyTx,
  bills: Map<string, PluggyBill>,
  acct: Pick<PluggyAccountLink, 'closeDate' | 'dueDate'>,
  cardDueDay?: number,
): string {
  const billId = tx.creditCardMetadata?.billId
  const bill = billId ? bills.get(billId) : undefined
  const billDue = toYmd(bill?.dueDate)
  if (billDue) return billDue.slice(0, 7)

  const d = spDate(tx.date)
  // Sem billId: a fatura mais antiga cujo fechamento ainda cobre a compra (evita
  // mandar para o mês seguinte uma compra de fatura já fechada quando o closeDate avança).
  const covering = [...bills.values()]
    .map(b => ({ close: toYmd(b.billClosingDate), due: toYmd(b.dueDate) }))
    .filter((b): b is { close: string; due: string | null } => !!b.close && d <= b.close)
    .sort((a, b) => a.close.localeCompare(b.close))[0]
  if (covering?.due) return covering.due.slice(0, 7)

  const acctClose = toYmd(acct.closeDate)
  const acctDue = toYmd(acct.dueDate)
  if (acctClose && acctDue) {
    const due = acctDue.slice(0, 7)
    return d <= acctClose ? due : addMonths(due, 1)
  }
  if (cardDueDay && cardDueDay >= 1 && cardDueDay <= 31) {
    for (let k = 0; k <= 2; k++) {
      const ym = addMonths(d.slice(0, 7), k)
      const dueDay = Math.min(cardDueDay, 28)
      const close = addDays(`${ym}-${pad2(dueDay)}`, -7)
      if (d <= close) return ym
    }
  }
  return addMonths(d.slice(0, 7), 1)
}

export function signedValue(tx: PluggyTx): number {
  const v = cents(Math.abs(tx.amount))
  return tx.type === 'CREDIT' ? -v : v
}

const PAYMENT_RE = /^\s*(pagamento|pgto)\b/i
const REFUND_RE = /estorno|devolu|cancel|reembols|cashback/i
const PREV_BALANCE_RE = /saldo\s+anterior/i

export function isIgnored(tx: PluggyTx): boolean {
  if (cents(Math.abs(tx.amount)) === 0) return true
  if (PREV_BALANCE_RE.test(tx.description)) return true
  if (tx.type === 'CREDIT') {
    if (tx.category === 'Credit card payment') return true
    // Sem categoria: só "PAGAMENTO..." no início e que não seja estorno/devolução.
    if (!tx.category && PAYMENT_RE.test(tx.description) && !REFUND_RE.test(tx.description)) return true
  }
  return false
}

export function describe(tx: PluggyTx): string {
  const base = cleanDescription(tx.description)
  const n = tx.creditCardMetadata?.installmentNumber
  const t = tx.creditCardMetadata?.totalInstallments
  return n && t && t > 1 ? `${base} (${pad2(n)}/${pad2(t)})` : base
}

// Categoria Pluggy (nome exato, en) -> tag do app. Só tags existentes em EXPENSE_TAGS.
const CATEGORY_TAG: Record<string, string> = {
  'Groceries': 'supermercado',
  'Eating out': 'alimentacao',
  'Food delivery': 'alimentacao',
  'Pharmacy': 'farmacia',
  'Taxi and ride-hailing': 'uber',
  'Pet supplies and vet': 'pets',
  'Clothing': 'vestuario',
  'Airport and airlines': 'viagem',
  'Accommodation': 'viagem',
  'Gyms and fitness centers': 'academia',
  'Gas stations': 'combustivel',
}

export function tagFor(description: string, category: string | null): string | undefined {
  return guessTag(description) ?? (category ? CATEGORY_TAG[category] : undefined)
}

export function fingerprint(value: number, description: string, monthKey: string): string {
  return `${value.toFixed(2)}|${description}|${monthKey}`
}

export function windowStart(acct: PluggyAccountLink, bills: PluggyBill[], lastSyncAt: string | null): string {
  if (acct.syncedOnce && lastSyncAt) return addDays(spDate(lastSyncAt), -45)
  // 1ª sync: do dia seguinte ao fechamento anterior ao fechamento corrente.
  const closes = bills.map(b => toYmd(b.billClosingDate)).filter((c): c is string => !!c).sort()
  const closeDate = toYmd(acct.closeDate)
  if (closeDate) {
    const prev = closes.filter(c => c < closeDate).pop()
    // Sem fatura anterior: mesmo dia no mês anterior, limitado ao último dia dele (31/03 -> 28/02).
    const ym = addMonths(closeDate.slice(0, 7), -1)
    const [y, m] = ym.split('-').map(Number)
    const day = Math.min(Number(closeDate.slice(8, 10)), new Date(Date.UTC(y, m, 0)).getUTCDate())
    const prevClose = prev ?? `${ym}-${pad2(day)}`
    return addDays(prevClose, 1)
  }
  const lastClose = closes.pop()
  if (lastClose) return addDays(lastClose, 1)
  return addDays(new Date().toISOString().slice(0, 10), -40)
}
