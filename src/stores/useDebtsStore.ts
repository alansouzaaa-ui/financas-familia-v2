import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DebtItem } from '@/types/debt'

// Seed: relatório SCR (Banco Central) — mês de referência 08/2026.
// Totais conferidos: Em dia R$ 35.566,75 · Vencida R$ 32.529,59.
const d = (bank: string, modality: DebtItem['modality'], detail: string, status: DebtItem['status'], value: number, id: string): DebtItem =>
  ({ id, bank, modality, detail, status, value })

const SEED_DEBTS: DebtItem[] = [
  // Banco Santander
  d('Banco Santander', 'cartao', 'Cartão de crédito (não migrado)', 'vencida', 1466.84, 'scr-01'),
  // Mercado Crédito
  d('Mercado Crédito', 'emprestimo', 'Crédito pessoal', 'em_dia', 218.20, 'scr-02'),
  d('Mercado Crédito', 'financiamento', 'Aquisição de bens', 'em_dia', 790.40, 'scr-03'),
  // Banco Bradesco
  d('Banco Bradesco', 'emprestimo', 'Crédito pessoal consignado', 'em_dia', 10676.52, 'scr-04'),
  d('Banco Bradesco', 'emprestimo', 'Crédito pessoal consignado', 'vencida', 668.16, 'scr-05'),
  d('Banco Bradesco', 'cheque_especial', 'Cheque especial', 'vencida', 564.33, 'scr-06'),
  d('Banco Bradesco', 'cartao', 'Cartão de crédito (não migrado)', 'vencida', 12505.57, 'scr-07'),
  d('Banco Bradesco', 'cartao', 'Cartão de crédito (lojista)', 'em_dia', 3266.41, 'scr-08'),
  // Nu Financeira (Nubank)
  d('Nu Financeira', 'emprestimo', 'Crédito pessoal', 'em_dia', 1552.01, 'scr-09'),
  d('Nu Financeira', 'emprestimo', 'Crédito pessoal', 'vencida', 567.89, 'scr-10'),
  d('Nu Financeira', 'cartao', 'Crédito rotativo (cartão)', 'vencida', 100.38, 'scr-11'),
  d('Nu Financeira', 'cartao', 'Cartão de crédito', 'vencida', 5367.74, 'scr-12'),
  d('Nu Financeira', 'cartao', 'Cartão de crédito (não migrado)', 'vencida', 1054.36, 'scr-13'),
  // Nu Pagamentos (Nubank)
  d('Nu Pagamentos', 'cartao', 'Cartão de crédito (lojista)', 'em_dia', 300.00, 'scr-14'),
  // Caixa Econômica Federal
  d('Caixa Econômica Federal', 'emprestimo', 'Crédito pessoal', 'em_dia', 662.16, 'scr-15'),
  // Banco Pan
  d('Banco Pan', 'emprestimo', 'Crédito pessoal', 'em_dia', 5059.29, 'scr-16'),
  d('Banco Pan', 'emprestimo', 'Crédito pessoal', 'vencida', 6388.90, 'scr-17'),
  d('Banco Pan', 'cartao', 'Cartão de crédito (não migrado)', 'vencida', 153.85, 'scr-18'),
  // PicPay
  d('PicPay', 'emprestimo', 'Crédito pessoal', 'em_dia', 473.44, 'scr-19'),
  // Sicoob Credivale
  d('Sicoob Credivale', 'emprestimo', 'Crédito pessoal consignado', 'em_dia', 11509.52, 'scr-20'),
  d('Sicoob Credivale', 'emprestimo', 'Crédito pessoal consignado', 'vencida', 513.12, 'scr-21'),
  d('Sicoob Credivale', 'emprestimo', 'Crédito pessoal', 'em_dia', 475.17, 'scr-22'),
  d('Sicoob Credivale', 'outros', 'Avais e fianças honrados', 'vencida', 1371.35, 'scr-23'),
  // Realize CFI
  d('Realize', 'cartao', 'Cartão de crédito', 'em_dia', 385.71, 'scr-24'),
  d('Realize', 'cartao', 'Cartão de crédito', 'vencida', 349.91, 'scr-25'),
  d('Realize', 'cartao', 'Cartão de crédito (lojista)', 'em_dia', 197.92, 'scr-26'),
  // Banco Triângulo
  d('Banco Triângulo', 'cartao', 'Cartão de crédito (não migrado)', 'vencida', 1457.19, 'scr-27'),
]

interface DebtsStore {
  items: DebtItem[]
  referenceMonth: string
  addDebt: (item: Omit<DebtItem, 'id'>) => void
  updateDebt: (id: string, patch: Partial<Omit<DebtItem, 'id'>>) => void
  removeDebt: (id: string) => void
  setReferenceMonth: (m: string) => void
  replaceAll: (items: DebtItem[], referenceMonth?: string) => void
}

export const useDebtsStore = create<DebtsStore>()(
  persist(
    (set) => ({
      items: SEED_DEBTS,
      referenceMonth: '08/2026',
      addDebt: (item) => set(s => ({ items: [...s.items, { ...item, id: crypto.randomUUID() }] })),
      updateDebt: (id, patch) => set(s => ({ items: s.items.map(i => i.id === id ? { ...i, ...patch } : i) })),
      removeDebt: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),
      setReferenceMonth: (m) => set({ referenceMonth: m }),
      replaceAll: (items, referenceMonth) => set(s => ({ items, referenceMonth: referenceMonth ?? s.referenceMonth })),
    }),
    { name: 'debts-store' }
  )
)
