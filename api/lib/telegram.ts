import type { SyncPayload } from '../../src/lib/syncService'
import type { MonthRecord, MonthAbbr } from '../../src/types/finance'

export interface ParsedTransaction {
  description: string
  value: number
  category: 'revenue' | 'fixedCosts' | 'loans' | 'cards' | 'variableCosts'
  occurredAt: string   // ISO 8601
  externalId: string   // 'telegram:<chatId>:<updateId>'
  chatId: string
  updateId: number
}

const MONTH_ABBRS: MonthAbbr[] = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function classifyCategory(normalized: string): ParsedTransaction['category'] {
  if (/receita|salario/.test(normalized)) return 'revenue'
  if (/cartao/.test(normalized))          return 'cards'
  if (/emprestimo/.test(normalized))      return 'loans'
  if (/fixo/.test(normalized))            return 'fixedCosts'
  return 'variableCosts'
}

export function parseTransaction(
  text: string,
  chatId: string,
  updateId: number,
): ParsedTransaction | null {
  const norm = normalize(text)
  const matches = norm.match(/\d+(?:[.,]\d{1,2})?/g)
  if (!matches || matches.length === 0) return null

  const raw = matches[matches.length - 1]
  const value = parseFloat(raw.replace(',', '.'))
  if (!value || value <= 0 || value > 1_000_000) return null

  // Remove the matched number token from description, then strip a trailing
  // currency symbol left behind when the amount was written as "R$100" (no space)
  const descRaw = text
    .replace(new RegExp(raw.replace('.', '\\.') + ''), '')
    .replace(/\s*(r\$|\$)\s*$/i, '')
    .trim()
  const description = descRaw || text.trim()

  const category = classifyCategory(norm)
  const occurredAt = new Date().toISOString()
  const externalId = `telegram:${chatId}:${updateId}`

  return { description, value, category, occurredAt, externalId, chatId, updateId }
}

function spTzMonth(isoString: string): { month: MonthAbbr; year: number } {
  const date = new Date(isoString)
  // Use Intl.DateTimeFormat to reliably extract month and year in São Paulo timezone
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
  const parts = fmt.formatToParts(date)
  const monthNum = parseInt(parts.find(p => p.type === 'month')!.value, 10)
  const year = parseInt(parts.find(p => p.type === 'year')!.value, 10)
  return { month: MONTH_ABBRS[monthNum - 1], year }
}

export function appendTelegramTransaction(
  payload: SyncPayload,
  transaction: ParsedTransaction,
): { payload: SyncPayload; inserted: boolean } {
  const { month, year } = spTzMonth(transaction.occurredAt)

  // Deep-clone manual_months to avoid mutation
  const manual_months: MonthRecord[] = JSON.parse(JSON.stringify(payload.manual_months ?? []))

  let record = manual_months.find(m => m.month === month && m.year === year)

  if (!record) {
    record = {
      month,
      year,
      revenue: 0,
      fixedCosts: 0,
      loans: 0,
      cards: 0,
      variableCosts: 0,
      source: 'manual',
      items: [],
    }
    manual_months.push(record)
  }

  if (!record.items) record.items = []

  // Idempotency check
  const alreadyExists = record.items.some(i => i.externalId === transaction.externalId)
  if (alreadyExists) {
    return { payload, inserted: false }
  }

  // Append new item
  record.items.push({
    id: transaction.externalId,
    description: transaction.description,
    value: transaction.value,
    category: transaction.category,
    isPaid: true,
    source: 'telegram',
    occurredAt: transaction.occurredAt,
    externalId: transaction.externalId,
  })

  // Recalculate totals from items
  record.revenue = 0
  record.fixedCosts = 0
  record.loans = 0
  record.cards = 0
  record.variableCosts = 0
  for (const item of record.items) {
    record[item.category] += item.value
  }

  return {
    payload: { ...payload, manual_months },
    inserted: true,
  }
}
