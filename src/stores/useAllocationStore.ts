import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_TARGETS, sanitizeTargets, type AllocClass } from '@/lib/aporte'

// Metas de alocação por classe de ativo e valor do aporte do mês (planejamento local).
interface AllocationStore {
  targets: Record<AllocClass, number>
  aporte: number
  setTarget: (cls: AllocClass, v: number) => void
  setAporte: (v: number) => void
  resetTargets: () => void
  hydrate: (data: { targets?: unknown; aporte?: unknown }) => void
}

export const useAllocationStore = create<AllocationStore>()(
  persist(
    (set) => ({
      targets: { ...DEFAULT_TARGETS },
      aporte: 0,
      setTarget: (cls, v) =>
        set((s) => ({
          targets: { ...s.targets, [cls]: Math.max(0, Math.min(Math.round(Number(v) || 0), 100)) },
        })),
      setAporte: (v) => set({ aporte: Math.max(0, Math.min(Number(v) || 0, 10_000_000)) }),
      resetTargets: () => set({ targets: { ...DEFAULT_TARGETS } }),
      hydrate: (data) =>
        set((s) => ({
          targets: sanitizeTargets(data.targets),
          aporte:
            typeof data.aporte === 'number' && Number.isFinite(data.aporte)
              ? Math.max(0, Math.min(data.aporte, 10_000_000))
              : s.aporte,
        })),
    }),
    { name: 'allocation-store' }
  )
)
