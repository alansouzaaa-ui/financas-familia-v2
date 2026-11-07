import type { MonthPoint } from '@/types/finance'

const MONTHS_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const KEYS = ['revenue', 'fixedCosts', 'loans', 'cards'] as const

export type GroupTotals = Record<(typeof KEYS)[number], number>

/**
 * Totais por grupo: derivados dos itens quando existem; o agregado é só cache.
 * Com `paidOnly`, soma só itens pagos/recebidos (isPaid === true).
 */
export function groupTotals(m: MonthPoint, opts?: { paidOnly?: boolean }): GroupTotals {
  if (m.items && m.items.length > 0) {
    const t: GroupTotals = { revenue: 0, fixedCosts: 0, loans: 0, cards: 0 }
    for (const it of m.items) {
      if (opts?.paidOnly && it.isPaid !== true) continue
      if ((KEYS as readonly string[]).includes(it.category) && Number.isFinite(it.value)) {
        t[it.category as keyof GroupTotals] += it.value
      }
    }
    return t
  }
  return { revenue: m.revenue, fixedCosts: m.fixedCosts, loans: m.loans, cards: m.cards }
}

/** Soma dos itens ainda não pagos/recebidos por grupo (zeros se não houver itens). */
export function groupPending(m: MonthPoint): GroupTotals {
  const t: GroupTotals = { revenue: 0, fixedCosts: 0, loans: 0, cards: 0 }
  for (const it of m.items ?? []) {
    if (it.isPaid === true) continue
    if ((KEYS as readonly string[]).includes(it.category) && Number.isFinite(it.value)) {
      t[it.category as keyof GroupTotals] += it.value
    }
  }
  return t
}

/** Mês atual e janela de calendário dos últimos 12 meses (inclusive), sem meses futuros. */
export function goalsBasis(months: MonthPoint[], now: Date): { current: MonthPoint | null; last12: MonthPoint[] } {
  const idx = (year: number, month: string) => year * 12 + MONTHS_ABR.indexOf(month)
  const cur = now.getFullYear() * 12 + now.getMonth()
  const current = months.find(m => idx(m.year, m.month) === cur) ?? null
  const last12 = months.filter(m => {
    const i = idx(m.year, m.month)
    return i >= cur - 11 && i <= cur
  })
  return { current, last12 }
}
