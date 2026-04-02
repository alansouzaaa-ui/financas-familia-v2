import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FinancialGoal } from '@/types/finance'

interface GoalsStore {
  goals: FinancialGoal[]
  setGoals: (goals: FinancialGoal[]) => void
  upsertGoal: (goal: FinancialGoal) => void
  deleteGoal: (id: string) => void
}

export const useGoalsStore = create<GoalsStore>()(
  persist(
    (set) => ({
      goals: [],
      setGoals: (goals) => set({ goals }),
      upsertGoal: (goal) =>
        set((s) => {
          const exists = s.goals.find(g => g.id === goal.id)
          return {
            goals: exists
              ? s.goals.map(g => g.id === goal.id ? goal : g)
              : [...s.goals, goal],
          }
        }),
      deleteGoal: (id) => set((s) => ({ goals: s.goals.filter(g => g.id !== id) })),
    }),
    { name: 'goals-store' }
  )
)
