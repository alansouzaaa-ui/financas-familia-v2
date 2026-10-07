// Dívidas do relatório SCR (Registrato / Banco Central) — visão de tudo que se
// deve, por banco e por modalidade. Snapshot mensal, editável.

export type DebtModality = 'cartao' | 'emprestimo' | 'financiamento' | 'cheque_especial' | 'outros'
export type DebtStatus = 'em_dia' | 'vencida'

export interface DebtItem {
  id: string
  bank: string
  modality: DebtModality
  detail: string        // subcategoria do SCR (ex: "Cartão de crédito - não migrado")
  status: DebtStatus
  value: number
  paid?: boolean        // quitada → fica fora do montante
  monthlyRate?: number  // juros % ao mês informados pelo usuário
}

export const MODALITY_LABELS: Record<DebtModality, string> = {
  cartao: 'Cartão de crédito',
  emprestimo: 'Empréstimo',
  financiamento: 'Financiamento',
  cheque_especial: 'Cheque especial',
  outros: 'Outros',
}

export const MODALITY_EMOJI: Record<DebtModality, string> = {
  cartao: '💳',
  emprestimo: '🏦',
  financiamento: '🚗',
  cheque_especial: '🩹',
  outros: '📄',
}

export const MODALITY_COLORS: Record<DebtModality, string> = {
  cartao: '#D85A30',
  emprestimo: '#EF9F27',
  financiamento: '#378ADD',
  cheque_especial: '#8B5CF6',
  outros: '#94A3B8',
}

export const STATUS_LABELS: Record<DebtStatus, string> = {
  em_dia: 'Em dia',
  vencida: 'Vencida',
}

// Estimativas médias de mercado (% ao mês), usadas quando o usuário não informa a taxa.
export const DEFAULT_MONTHLY_RATE: Record<DebtModality, number> = {
  cartao: 14,
  cheque_especial: 8,
  emprestimo: 4,
  financiamento: 1.8,
  outros: 4,
}
