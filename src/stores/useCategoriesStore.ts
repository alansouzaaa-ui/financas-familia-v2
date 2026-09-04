import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ExpenseTag } from '@/types/finance'
import { EXPENSE_TAGS } from '@/types/finance'

interface CategoriesStore {
  tags: ExpenseTag[]
  setTags: (tags: ExpenseTag[]) => void
  addTag: (label: string, emoji: string, color: string) => ExpenseTag
  updateTag: (id: string, patch: Partial<Omit<ExpenseTag, 'id'>>) => void
  deleteTag: (id: string) => void
}

function slugify(label: string): string {
  return label.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30) || crypto.randomUUID().slice(0, 8)
}

export const useCategoriesStore = create<CategoriesStore>()(
  persist(
    (set, get) => ({
      // Semeado com a lista padrão; o usuário pode editar/adicionar/remover
      tags: EXPENSE_TAGS,
      setTags: (tags) => set({ tags }),
      addTag: (label, emoji, color) => {
        let id = slugify(label)
        const existing = get().tags
        if (existing.some(t => t.id === id)) id = `${id}-${crypto.randomUUID().slice(0, 4)}`
        const tag: ExpenseTag = { id, label: label.trim().slice(0, 30) || 'Categoria', emoji: emoji || '🏷️', color: color || '#9CA3AF' }
        set({ tags: [...existing, tag] })
        return tag
      },
      updateTag: (id, patch) =>
        set((s) => ({ tags: s.tags.map(t => t.id === id ? { ...t, ...patch } : t) })),
      deleteTag: (id) =>
        set((s) => ({ tags: s.tags.filter(t => t.id !== id) })),
    }),
    { name: 'categories-store' }
  )
)
