// Importação de fatura de cartão: normaliza a extração (IA), confere com o total,
// detecta duplicatas e gera lançamentos. Lib pura — sem React.
import type { MonthItem } from '../types/finance'
import { guessTag } from './autoTag'

export interface ExtractedLine {
  date: string
  description: string
  amount: number
  direction: 'debit' | 'credit'
  kind: string
  installmentCurrent: number | null
  installmentTotal: number | null
  cardLast4: string | null
}

export interface Extraction {
  totalAmount: number | null
  dueDate: string | null
  closingDate: string | null
  issuer: string | null
  lines: ExtractedLine[]
}

export type DraftStatus = 'new' | 'duplicate' | 'already-imported' | 'ignored'

export interface DraftLine {
  key: string
  include: boolean
  status: DraftStatus
  reason?: string
  date: string // YYYY-MM-DD
  description: string
  value: number // negativo para crédito
  installment: string | null // "02/02"
  tag?: string
  kind: string
}

const cents = (n: number) => Math.round(n * 100) / 100
const pad2 = (n: number) => String(n).padStart(2, '0')

export function cleanDescription(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** "05/09" + vencimento 2026-10-11 -> "2026-09-05". Mês do lançamento > mês do vencimento -> ano anterior. */
export function inferYear(ddmm: string, dueDate: string | null, fallbackYear: number): string {
  const m = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2}|\d{4}))?\s*$/.exec(ddmm)
  if (!m) return ddmm
  const day = Number(m[1])
  const month = Number(m[2])
  let year: number
  if (m[3]) {
    year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  } else {
    const due = dueDate ? /^(\d{4})-(\d{2})-\d{2}$/.exec(dueDate) : null
    if (due) {
      const dueYear = Number(due[1])
      const dueMonth = Number(due[2])
      year = month > dueMonth ? dueYear - 1 : dueYear
    } else {
      year = fallbackYear
    }
  }
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function normalizeForHash(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function lineHash(l: { date: string; description: string; value: number; installment: string | null }): string {
  return fnv1a(`${l.date}|${normalizeForHash(l.description)}|${l.value.toFixed(2)}|${l.installment ?? ''}`)
}

export function importExternalId(
  cardId: string,
  monthKey: string,
  l: { date: string; description: string; value: number; installment: string | null },
): string {
  return `import:${cardId}:${monthKey}:${lineHash(l)}`
}

function dayDiff(isoA: string, dateB: string): number {
  const a = Date.parse(isoA)
  const b = Date.parse(`${dateB}T12:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity
  return Math.abs(a - b) / 86_400_000
}

export function buildDrafts(
  ex: Extraction,
  opts: { cardId: string; fallbackYear: number; existing: MonthItem[] },
): DraftLine[] {
  const drafts: DraftLine[] = ex.lines.map((l, i) => {
    const date = inferYear(l.date, ex.dueDate, opts.fallbackYear)
    const installment =
      l.installmentCurrent && l.installmentTotal
        ? `${pad2(l.installmentCurrent)}/${pad2(l.installmentTotal)}`
        : null
    const description = cleanDescription(l.description) + (installment ? ` (${installment})` : '')
    const amount = cents(l.amount)
    const value = (l.direction === 'credit' ? -amount : amount) || 0
    const base: DraftLine = {
      key: '',
      include: true,
      status: 'new',
      date,
      description,
      value,
      installment,
      kind: l.kind,
    }
    if (l.direction === 'debit') {
      const tag = guessTag(description)
      if (tag) base.tag = tag
    }
    base.key = `${i}-${lineHash(base)}`

    if (l.kind === 'payment') {
      return { ...base, include: false, status: 'ignored', reason: 'Pagamento da fatura' }
    }
    if (l.kind === 'previous_balance') {
      return { ...base, include: false, status: 'ignored', reason: 'Saldo anterior' }
    }
    if (amount === 0) {
      return { ...base, include: false, status: 'ignored', reason: 'Valor zero' }
    }
    return base
  })

  // 1) Já importadas (mesmo externalId de import, independente do mês-alvo). Cada item casa uma vez.
  const importPrefix = `import:${opts.cardId}:`
  const importedPool = new Map<string, number>()
  for (const it of opts.existing) {
    const id = it.externalId
    if (id && id.startsWith(importPrefix)) {
      const hash = id.slice(id.lastIndexOf(':') + 1)
      importedPool.set(hash, (importedPool.get(hash) ?? 0) + 1)
    }
  }
  for (const d of drafts) {
    if (d.status !== 'new') continue
    const h = lineHash(d)
    const n = importedPool.get(h) ?? 0
    if (n > 0) {
      importedPool.set(h, n - 1)
      d.status = 'already-imported'
      d.include = false
      d.reason = 'Já importada anteriormente'
    }
  }

  // 2) Possíveis duplicatas de lançamentos manuais do mesmo cartão.
  const manual = opts.existing.filter(
    it => it.cardId === opts.cardId && !(it.externalId && it.externalId.startsWith('import:')),
  )
  const used = new Set<string>()
  for (const d of drafts) {
    if (d.status !== 'new') continue
    const match = manual.find(
      it =>
        !used.has(it.id) &&
        Math.abs(d.value - it.value) <= 0.01 &&
        (!it.occurredAt || dayDiff(it.occurredAt, d.date) <= 3),
    )
    if (match) {
      used.add(match.id)
      d.status = 'duplicate'
      d.include = false
      d.reason = `Parece já lançado: ${match.description}`
    }
  }

  return drafts
}

export function reconcile(
  drafts: DraftLine[],
  total: number | null,
): { sum: number; total: number | null; diff: number | null; ok: boolean } {
  const sum = cents(drafts.filter(d => d.include && d.status !== 'ignored').reduce((s, d) => s + d.value, 0))
  if (total === null) return { sum, total: null, diff: null, ok: false }
  const diff = cents(sum - total)
  return { sum, total, diff, ok: Math.abs(diff) <= 0.02 }
}

export function draftsToItems(drafts: DraftLine[], cardId: string, monthKey: string): MonthItem[] {
  return drafts
    .filter(d => d.include && (d.status === 'new' || d.status === 'duplicate'))
    .map(d => {
      const item: MonthItem = {
        id: crypto.randomUUID(),
        description: d.description,
        value: d.value,
        category: 'cards',
        isPaid: false,
        cardId,
        occurredAt: new Date(`${d.date}T12:00:00`).toISOString(),
        source: 'import',
        externalId: importExternalId(cardId, monthKey, d),
      }
      if (d.tag) item.tag = d.tag
      return item
    })
}
