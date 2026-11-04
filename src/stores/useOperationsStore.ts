import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ClosedPosition, InvestmentOperation } from '@/types/investment'
import { useTombstoneStore } from '@/stores/useTombstoneStore'

interface OperationsStore {
  operations: InvestmentOperation[]
  closedPositions: ClosedPosition[]
  /** Substitui o que for passado (campo omitido = mantém o atual). */
  setAll: (data: { operations?: InvestmentOperation[]; closedPositions?: ClosedPosition[] }) => void
  addOperation: (op: InvestmentOperation) => void
  updateOperation: (id: string, updates: Partial<Omit<InvestmentOperation, 'id'>>) => void
  /** Remove e registra tombstone (para o servidor/outros dispositivos não ressuscitarem). */
  removeOperation: (id: string) => void
  /** Remove todas as operações (e o arquivo de encerrada) de uma posição, com tombstones. */
  removeForPosition: (positionId: string) => void
}

export const useOperationsStore = create<OperationsStore>()(
  persist(
    (set, get) => ({
      operations: [],
      closedPositions: [],

      setAll: ({ operations, closedPositions }) =>
        set((s) => ({
          operations: operations ?? s.operations,
          closedPositions: closedPositions ?? s.closedPositions,
        })),

      addOperation: (op) => set((s) => ({ operations: [...s.operations, op] })),

      updateOperation: (id, updates) =>
        set((s) => ({
          operations: s.operations.map((o) => (o.id === id ? { ...o, ...updates } : o)),
        })),

      removeOperation: (id) => {
        if (!get().operations.some((o) => o.id === id)) return
        set((s) => ({ operations: s.operations.filter((o) => o.id !== id) }))
        useTombstoneStore.getState().add([id])
      },

      removeForPosition: (positionId) => {
        const s = get()
        const ids = s.operations.filter((o) => o.positionId === positionId).map((o) => o.id)
        const closedIds = s.closedPositions.filter((c) => c.position.id === positionId).map((c) => c.position.id)
        if (!ids.length && !closedIds.length) return
        set({
          operations: s.operations.filter((o) => o.positionId !== positionId),
          closedPositions: s.closedPositions.filter((c) => c.position.id !== positionId),
        })
        useTombstoneStore.getState().add([...ids, ...closedIds])
      },
    }),
    {
      name: 'investment-operations-store',
      partialize: (s) => ({ operations: s.operations, closedPositions: s.closedPositions }),
    }
  )
)
