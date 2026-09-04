import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RecurringItem } from '@/types/finance'

interface RecurringStore {
  items: RecurringItem[]
  addItem: (item: Omit<RecurringItem, 'id'>) => void
  upsertRule: (rule: RecurringItem) => void
  toggleActive: (id: string) => void
  deleteItem: (id: string) => void
  setItems: (items: RecurringItem[]) => void
}

export const useRecurringStore = create<RecurringStore>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) =>
        set((s) => ({
          items: [...s.items, { ...item, id: crypto.randomUUID() }],
        })),
      upsertRule: (rule) =>
        set((s) => {
          const exists = s.items.some(i => i.id === rule.id)
          return { items: exists ? s.items.map(i => i.id === rule.id ? rule : i) : [...s.items, rule] }
        }),
      toggleActive: (id) =>
        set((s) => ({
          items: s.items.map(i => i.id === id ? { ...i, isActive: !i.isActive } : i),
        })),
      deleteItem: (id) =>
        set((s) => ({ items: s.items.filter(i => i.id !== id) })),
      setItems: (items) => set({ items }),
    }),
    { name: 'recurring-store' }
  )
)
