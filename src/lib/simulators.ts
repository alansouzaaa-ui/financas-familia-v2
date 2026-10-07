// ─── Simuladores financeiros ────────────────────────────────────────────────
// Funções puras (sem I/O). Taxas anuais em % a.a.; valores em R$.

export function monthlyRateFromAnnual(annualPct: number): number {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1
}

export interface GrowthPoint { month: number; invested: number; total: number }

function fin(n: number): number {
  return isFinite(n) ? n : 0
}

export function simulateGrowth(p: {
  initial: number; monthly: number; annualRatePct: number; months: number
}): { points: GrowthPoint[]; final: number; invested: number; interest: number } {
  const initial = fin(p.initial)
  const monthly = fin(p.monthly)
  const months = Math.max(0, Math.floor(fin(p.months)))
  const i = monthlyRateFromAnnual(fin(p.annualRatePct))
  const all: GrowthPoint[] = [{ month: 0, invested: initial, total: initial }]
  let total = initial
  let invested = initial
  for (let m = 1; m <= months; m++) {
    total = total * (1 + i) + monthly
    invested += monthly
    all.push({ month: m, invested, total })
  }
  let points = all
  const MAX = 600
  if (all.length > MAX) {
    const step = Math.ceil(all.length / MAX)
    points = all.filter((_, idx) => idx % step === 0)
    const last = all[all.length - 1]
    if (points[points.length - 1] !== last) points.push(last)
  }
  const end = all[all.length - 1]
  return { points, final: end.total, invested: end.invested, interest: end.total - end.invested }
}

export function monthsToTarget(p: {
  initial: number; monthly: number; annualRatePct: number; target: number; maxMonths?: number
}): number | null {
  if (p.initial >= p.target) return 0
  const max = p.maxMonths ?? 1200
  const i = monthlyRateFromAnnual(p.annualRatePct)
  let total = p.initial
  for (let m = 1; m <= max; m++) {
    total = total * (1 + i) + p.monthly
    if (total >= p.target) return m
  }
  return null
}

export function requiredMonthly(p: {
  initial: number; annualRatePct: number; months: number; target: number
}): number {
  const i = monthlyRateFromAnnual(p.annualRatePct)
  const n = p.months
  const grown = n > 0 ? p.initial * Math.pow(1 + i, n) : p.initial
  const need = p.target - grown
  if (need <= 0) return 0
  if (n <= 0) return Infinity
  if (Math.abs(i) < 1e-12) return need / n
  return (need * i) / (Math.pow(1 + i, n) - 1)
}

/** Alíquota regressiva de IR por prazo em dias. */
export function irRateForDays(days: number): number {
  if (days <= 180) return 0.225
  if (days <= 360) return 0.2
  if (days <= 720) return 0.175
  return 0.15
}

/** Taxa anual efetiva (%) de "X% do CDI" (base 252 dias úteis). */
export function cdiPctToAnnual(cdiAnnualPct: number, pctOfCdi: number): number {
  const d = Math.pow(1 + cdiAnnualPct / 100, 1 / 252) - 1
  return (Math.pow(1 + (d * pctOfCdi) / 100, 252) - 1) * 100
}

export interface FixedIncomeRow {
  id: 'cdb' | 'lci' | 'tesouro' | 'poupanca'
  label: string
  gross: number
  ir: number
  fees: number
  net: number
  netGain: number
  netAnnualPct: number
  taxFree: boolean
  note: string
}

export function compareFixedIncome(p: {
  amount: number; months: number; cdiAnnualPct: number; selicAnnualPct: number
  poupancaMonthlyPct: number; cdbPctCdi: number; lciPctCdi: number
}): FixedIncomeRow[] {
  const { amount, months } = p
  if (!(amount > 0)) return []
  const days = Math.round(months * 30.4375) // dias médios por mês (365,25/12): 6m≈183d → 20%; 12m≈365d → 17,5%
  const years = months / 12
  const irRate = irRateForDays(days)

  const build = (
    id: FixedIncomeRow['id'], label: string, gross: number, taxFree: boolean, fees: number, note: string,
  ): FixedIncomeRow => {
    const ir = taxFree ? 0 : Math.max(0, gross - amount) * irRate
    const net = gross - ir - fees
    const netAnnualPct = years > 0 && net > 0 ? (Math.pow(net / amount, 1 / years) - 1) * 100 : 0
    return { id, label, gross, ir, fees, net, netGain: net - amount, netAnnualPct, taxFree, note }
  }

  const grow = (annualPct: number) => amount * Math.pow(1 + annualPct / 100, years)
  const cdbGross = grow(cdiPctToAnnual(p.cdiAnnualPct, p.cdbPctCdi))
  const lciGross = grow(cdiPctToAnnual(p.cdiAnnualPct, p.lciPctCdi))
  const tesGross = grow(p.selicAnnualPct)
  const poupGross = amount * Math.pow(1 + p.poupancaMonthlyPct / 100, months)
  const custody = Math.max(0, tesGross - 10000) * 0.002 * years

  const rows = [
    build('cdb', `CDB ${p.cdbPctCdi}% do CDI`, cdbGross, false, 0, 'IR regressivo · FGC até R$ 250 mil'),
    build('lci', `LCI/LCA ${p.lciPctCdi}% do CDI`, lciGross, true, 0, 'Isento de IR · FGC · costuma ter carência'),
    build('tesouro', 'Tesouro Selic', tesGross, false, custody, 'Garantia do Tesouro · liquidez D+1 · custódia 0,20% a.a. acima de R$ 10 mil'),
    build('poupanca', 'Poupança', poupGross, true, 0, 'Isenta · rende só no aniversário'),
  ]
  return rows.sort((a, b) => b.net - a.net)
}

/** Aposentadoria em valores de hoje (taxa real). Viver de renda = perpetuidade. */
export function retirementPlan(p: {
  currentAge: number; retireAge: number; monthlyIncome: number; currentWealth: number; realAnnualPct: number
}): { months: number; requiredWealth: number; requiredMonthly: number; projectedWealth: number } {
  const i = monthlyRateFromAnnual(p.realAnnualPct)
  const months = Math.max(0, (p.retireAge - p.currentAge) * 12)
  const requiredWealth = i <= 0 ? Infinity : p.monthlyIncome / i
  return {
    months,
    requiredWealth,
    requiredMonthly: requiredMonthly({
      initial: p.currentWealth, annualRatePct: p.realAnnualPct, months, target: requiredWealth,
    }),
    projectedWealth: p.currentWealth * Math.pow(1 + i, months),
  }
}
