export type MonthAbbr = 'Jan' | 'Fev' | 'Mar' | 'Abr' | 'Mai' | 'Jun' | 'Jul' | 'Ago' | 'Set' | 'Out' | 'Nov' | 'Dez'

export const MONTHS: MonthAbbr[] = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
export const MONTH_NAMES: Record<MonthAbbr, string> = {
  Jan: 'Janeiro', Fev: 'Fevereiro', Mar: 'Março', Abr: 'Abril',
  Mai: 'Maio',    Jun: 'Junho',     Jul: 'Julho', Ago: 'Agosto',
  Set: 'Setembro',Out: 'Outubro',   Nov: 'Novembro', Dez: 'Dezembro',
}

export interface MonthRecord {
  id?: string
  month: MonthAbbr
  year: number
  revenue: number        // receitas
  fixedCosts: number     // custos fixos
  loans: number          // empréstimos
  cards: number          // cartões
  source: 'seed' | 'manual'
  items?: MonthItem[]    // lançamentos por item (meses manuais)
}

export interface MonthItem {
  id: string
  description: string
  value: number
  category: 'revenue' | 'fixedCosts' | 'loans' | 'cards'
  isPaid: boolean
}

export interface MonthPoint extends MonthRecord {
  totalExpenses: number
  balance: number
  consolidatedRevenue: number
  consolidatedExpenses: number
  consolidatedBalance: number
  label: string          // 'Jan/26'
}

export interface AnnualSummary {
  year: number
  monthCount: number
  revenue: number
  fixedCosts: number
  loans: number
  cards: number
  totalExpenses: number
  balance: number
  avgBalance: number
}

export interface FinancialGoal {
  id: string
  category: 'revenue' | 'fixedCosts' | 'loans' | 'cards'
  targetValue: number
}

export interface RecurringItem {
  id: string
  description: string
  value: number
  category: 'revenue' | 'fixedCosts' | 'loans' | 'cards'
  isActive: boolean
}

export interface HealthScore {
  score: number
  label: 'Crítico' | 'Atenção' | 'Regular' | 'Bom' | 'Excelente'
  color: string
  savingsRate: number
  debtRatio: number
  cardRatio: number
  trendPoints: number
}

export interface Alert {
  id: string
  type: 'warning' | 'danger'
  category: 'cards' | 'loans' | 'fixedCosts' | 'balance' | 'revenue'
  message: string
  deviation: number
}

export type PeriodPreset = 'current_month' | '3m' | '6m' | '12m' | 'current_year' | 'all' | 'custom'

export interface DateRange {
  from: string  // 'YYYY-MM'
  to: string
}

export interface PeriodFilter {
  preset: PeriodPreset
  customRange?: DateRange
}

export const CATEGORY_LABELS: Record<string, string> = {
  revenue: 'Receitas',
  fixedCosts: 'Custos Fixos',
  loans: 'Empréstimos',
  cards: 'Cartões',
}

export const CATEGORY_COLORS: Record<string, string> = {
  revenue: '#1D9E75',
  fixedCosts: '#378ADD',
  loans: '#EF9F27',
  cards: '#D85A30',
}
