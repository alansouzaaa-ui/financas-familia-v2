import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_TARGETS, type AllocClass } from '@/lib/aporte'

// Metas de alocação por classe de ativo e valor do aporte do mês (planejamento local).
interface AllocationStore {
  targets: Record<AllocClass, number>
  aporte: number
  setTarget: (cls: AllocClass, v: number) => void
  setAporte: (v: number) => void
  resetTargets: () => void
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
    }),
    { name: 'allocation-store' }
  )
)
