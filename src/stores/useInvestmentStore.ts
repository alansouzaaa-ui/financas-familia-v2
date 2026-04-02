import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { InvestmentPosition } from '@/types/investment'

interface InvestmentStore {
  positions: InvestmentPosition[]
  addPosition: (p: Omit<InvestmentPosition, 'id'>) => void
  updatePosition: (id: string, updates: Partial<Omit<InvestmentPosition, 'id'>>) => void
  removePosition: (id: string) => void
}

export const useInvestmentStore = create<InvestmentStore>()(
  persist(
    (set) => ({
      positions: [],

      addPosition: (p) =>
        set((s) => ({
          positions: [...s.positions, { ...p, id: crypto.randomUUID() }],
        })),

      updatePosition: (id, updates) =>
        set((s) => ({
          positions: s.positions.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),

      removePosition: (id) =>
        set((s) => ({
          positions: s.positions.filter((p) => p.id !== id),
        })),
    }),
    { name: 'investment-store' }
  )
)
