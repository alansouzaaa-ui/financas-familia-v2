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
  variableCosts: number  // custos variáveis
  source: 'seed' | 'manual'
  items?: MonthItem[]    // lançamentos por item (meses manuais)
}

export interface MonthItem {
  id: string
  description: string
  value: number
  category: 'revenue' | 'fixedCosts' | 'loans' | 'cards' | 'variableCosts'
  isPaid: boolean
  source?: 'manual' | 'telegram'
  occurredAt?: string   // ISO 8601
  externalId?: string   // 'telegram:<chatId>:<updateId>'
  cardId?: string       // qual cartão (titular), só para itens da categoria 'cards'
  recurringId?: string  // vincula a uma regra recorrente (repete nos próximos meses)
  tag?: string          // categoria de gasto (id de EXPENSE_TAGS): alimentacao, moradia, etc.
}

// Categorias de gasto (para relatórios) — separado dos 5 grupos contábeis.
export interface ExpenseTag {
  id: string
  label: string
  emoji: string
  color: string
}

export const EXPENSE_TAGS: ExpenseTag[] = [
  { id: 'moradia',       label: 'Moradia',        emoji: '🏠', color: '#3B82F6' },
  { id: 'supermercado',  label: 'Supermercado',   emoji: '🛒', color: '#84CC16' },
  { id: 'alimentacao',   label: 'Alimentação',    emoji: '🍽️', color: '#F59E0B' },
  { id: 'restaurante',   label: 'Restaurante',    emoji: '🍔', color: '#F97316' },
  { id: 'transporte',    label: 'Transporte',     emoji: '🚗', color: '#10B981' },
  { id: 'combustivel',   label: 'Combustível',    emoji: '⛽', color: '#6EE7B7' },
  { id: 'saude',         label: 'Saúde',          emoji: '❤️', color: '#EF4444' },
  { id: 'farmacia',      label: 'Farmácia',       emoji: '💊', color: '#F87171' },
  { id: 'academia',      label: 'Academia',       emoji: '🏋️', color: '#FB923C' },
  { id: 'lazer',         label: 'Lazer',          emoji: '🎉', color: '#8B5CF6' },
  { id: 'viagem',        label: 'Viagem',         emoji: '✈️', color: '#22D3EE' },
  { id: 'educacao',      label: 'Educação',       emoji: '📚', color: '#06B6D4' },
  { id: 'vestuario',     label: 'Vestuário',      emoji: '👕', color: '#EC4899' },
  { id: 'assinaturas',   label: 'Assinaturas',    emoji: '📱', color: '#A78BFA' },
  { id: 'servicos',      label: 'Serviços',       emoji: '🔧', color: '#6B7280' },
  { id: 'impostos',      label: 'Impostos/Taxas', emoji: '📋', color: '#94A3B8' },
  { id: 'pets',          label: 'Pets',           emoji: '🐾', color: '#A3A300' },
  { id: 'presentes',     label: 'Presentes',      emoji: '🎁', color: '#F472B6' },
  { id: 'salario',       label: 'Salário',        emoji: '💵', color: '#1D9E75' },
  { id: 'investimentos', label: 'Investimentos',  emoji: '💰', color: '#0EA5E9' },
  { id: 'outros',        label: 'Outros',         emoji: '📦', color: '#9CA3AF' },
]

export const TAG_MAP: Record<string, ExpenseTag> = Object.fromEntries(EXPENSE_TAGS.map(t => [t.id, t]))

// Cartão de crédito por titular (Alan, Pai, etc.) — o total de cada cartão é
// sempre a soma dos itens com esse cardId, nunca um número guardado à parte.
export interface CardAccount {
  id: string
  name: string
  dueDay?: number   // dia de vencimento da fatura (ex: 10)
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
  variableCosts: number
  totalExpenses: number
  balance: number
  avgBalance: number
}

export interface FinancialGoal {
  id: string
  category: 'revenue' | 'fixedCosts' | 'loans' | 'cards' | 'variableCosts'
  targetValue: number
}

export interface RecurringItem {
  id: string
  description: string
  value: number
  category: 'revenue' | 'fixedCosts' | 'variableCosts' | 'loans' | 'cards'
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
  category: 'cards' | 'loans' | 'fixedCosts' | 'variableCosts' | 'balance' | 'revenue'
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
  variableCosts: 'Custos Variáveis',
}

export const CATEGORY_COLORS: Record<string, string> = {
  revenue: '#1D9E75',
  fixedCosts: '#378ADD',
  loans: '#EF9F27',
  cards: '#D85A30',
  variableCosts: '#8B5CF6',
}
