import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ExpenseTag } from '@/types/finance'
import { EXPENSE_TAGS } from '@/types/finance'

// Categorias "de sistema" que devem existir sempre — mesmo para quem já tem
// a lista salva/sincronizada (senão a auto-categoria do Telegram apontaria
// para uma tag inexistente e cairia em "sem categoria").
const GUARANTEED_IDS = ['mercado_condominio']

function ensureGuaranteed(tags: ExpenseTag[]): ExpenseTag[] {
  const have = new Set(tags.map(t => t.id))
  const missing = EXPENSE_TAGS.filter(t => GUARANTEED_IDS.includes(t.id) && !have.has(t.id))
  return missing.length ? [...tags, ...missing] : tags
}

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
      tags: ensureGuaranteed(EXPENSE_TAGS),
      // Todo setTags (inclusive o pull do Gist) garante as categorias de sistema
      setTags: (tags) => set({ tags: ensureGuaranteed(tags) }),
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
    {
      name: 'categories-store',
      // Ao reidratar do localStorage, garante as categorias de sistema
      merge: (persisted, current) => {
        const p = persisted as { tags?: ExpenseTag[] } | undefined
        return { ...current, tags: ensureGuaranteed(p?.tags ?? current.tags) }
      },
    }
  )
)
