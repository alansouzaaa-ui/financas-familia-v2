import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mergeTombstones, normalizeTombstones, type Tombstone } from '@/lib/tombstones'

interface TombstoneStore {
  items: Tombstone[]
  add: (ids: string[]) => void
  forget: (ids: string[]) => void
  merge: (remote: Tombstone[] | undefined) => void
}

export const useTombstoneStore = create<TombstoneStore>()(
  persist(
    (set, get) => ({
      items: [],
      add: (ids) => {
        if (!ids.length) return
        const at = new Date().toISOString()
        set({ items: mergeTombstones(get().items, ids.map(id => ({ id, at }))) })
      },
      forget: (ids) => {
        if (!ids.length || !get().items.length) return
        const drop = new Set(ids)
        const next = get().items.filter(t => !drop.has(t.id))
        if (next.length !== get().items.length) set({ items: next })
      },
      merge: (remote) => {
        if (!remote?.length) return
        set({ items: mergeTombstones(get().items, remote) })
      },
    }),
    {
      name: 'finance-tombstones',
      partialize: (s) => ({ items: s.items }),
      merge: (persisted, current) => {
        const p = persisted as { items?: Tombstone[] } | undefined
        return { ...current, items: normalizeTombstones(p?.items ?? []) }
      },
    }
  )
)
