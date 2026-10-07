import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Limites mensais de orçamento por linha (id de tag ou `grp:<categoria>`).
// Sincronizados em `budget`.
interface BudgetStore {
  limits: Record<string, number>
  setLimit: (key: string, v: number | null) => void
  applySuggested: (s: Record<string, number>, overwrite: boolean) => void
  clearAll: () => void
  hydrate: (data: unknown) => void
}

const norm = (v: number) => Math.round(Math.max(0, Math.min(v, 10_000_000)) * 100) / 100
const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

export const useBudgetStore = create<BudgetStore>()(
  persist(
    (set) => ({
      limits: {},
      setLimit: (key, v) => set((s) => {
        const next = { ...s.limits }
        const n = v === null ? 0 : norm(Number(v) || 0)
        if (n > 0) next[key] = n
        else delete next[key]
        return { limits: next }
      }),
      applySuggested: (sug, overwrite) => set((s) => {
        const next = { ...s.limits }
        for (const [k, v] of Object.entries(sug)) {
          if (!valid(v)) continue
          if (!overwrite && next[k] > 0) continue
          next[k] = norm(v)
        }
        return { limits: next }
      }),
      clearAll: () => set({ limits: {} }),
      hydrate: (data) => {
        if (!data || typeof data !== 'object') return
        const raw = (data as Record<string, unknown>).limits
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
        const limits: Record<string, number> = {}
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
          if (valid(v)) limits[k] = norm(v)
        }
        set({ limits })
      },
    }),
    { name: 'budget-store' }
  )
)
