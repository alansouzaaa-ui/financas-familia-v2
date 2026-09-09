import type { MonthPoint, MonthAbbr, RecurringItem } from '@/types/finance'

const ORDER: MonthAbbr[] = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export interface ProjMonth {
  label: string
  month: MonthAbbr
  year: number
  result: number      // resultado projetado do mês (receita − despesa)
  cumulative: number  // acumulado a partir do 1º mês da projeção
  launched: boolean   // true = veio de um mês já lançado; false = estimado pelo recorrente
}

export interface Projection {
  rows: ProjMonth[]
  baseline: number    // resultado mensal do "piloto automático" (só recorrentes)
  endOfHorizon: number
}

// Projeta o resultado dos próximos `horizon` meses (incluindo o atual).
// Mês já lançado com receita → usa o balanço real; senão usa o run-rate recorrente.
export function buildProjection(
  allMonths: MonthPoint[],
  recurring: RecurringItem[],
  now: Date = new Date(),
  horizon = 6,
): Projection {
  const active = recurring.filter(r => r.isActive)
  const recRevenue = active.filter(r => r.category === 'revenue').reduce((s, r) => s + r.value, 0)
  const recExpense = active.filter(r => r.category !== 'revenue').reduce((s, r) => s + r.value, 0)
  const baseline = recRevenue - recExpense

  const byKey = new Map(allMonths.map(m => [`${m.year}-${m.month}`, m]))

  let idx = now.getMonth()
  let year = now.getFullYear()
  let cumulative = 0
  const rows: ProjMonth[] = []

  for (let i = 0; i < horizon; i++) {
    const month = ORDER[idx]
    const rec = byKey.get(`${year}-${month}`)
    // Confia no mês lançado só quando tem receita (indício de que está completo)
    const launched = !!rec && rec.revenue > 0
    const result = launched ? rec!.balance : baseline
    cumulative += result
    rows.push({ label: `${month}/${String(year).slice(2)}`, month, year, result, cumulative, launched })
    idx += 1
    if (idx > 11) { idx = 0; year += 1 }
  }

  return { rows, baseline, endOfHorizon: cumulative }
}
