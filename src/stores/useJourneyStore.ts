import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PayoffStrategy, PayoffScope } from '@/lib/journey'

// Preferências do plano de quitação ("jornada"). Sincronizadas em journey_settings.
interface JourneyStore {
  strategy: PayoffStrategy
  scope: PayoffScope
  budgetOverride: number | null   // null = usar a sobra mensal média
  setStrategy: (s: PayoffStrategy) => void
  setScope: (s: PayoffScope) => void
  setBudgetOverride: (v: number | null) => void
  hydrate: (data: unknown) => void
}

const clamp = (v: number) => Math.max(0, Math.min(v, 10_000_000))

export const useJourneyStore = create<JourneyStore>()(
  persist(
    (set) => ({
      strategy: 'avalanche',
      scope: 'vencidas',
      budgetOverride: null,
      setStrategy: (strategy) => set({ strategy }),
      setScope: (scope) => set({ scope }),
      setBudgetOverride: (v) => set({ budgetOverride: v === null ? null : clamp(Number(v) || 0) }),
      hydrate: (data) => {
        if (!data || typeof data !== 'object') return
        const d = data as Record<string, unknown>
        set((s) => ({
          strategy: d.strategy === 'avalanche' || d.strategy === 'snowball' ? d.strategy : s.strategy,
          scope: d.scope === 'vencidas' || d.scope === 'todas' ? d.scope : s.scope,
          budgetOverride:
            d.budgetOverride === null
              ? null
              : typeof d.budgetOverride === 'number' && Number.isFinite(d.budgetOverride) && d.budgetOverride >= 0
                ? clamp(d.budgetOverride)
                : s.budgetOverride,
        }))
      },
    }),
    { name: 'journey-store' }
  )
)
