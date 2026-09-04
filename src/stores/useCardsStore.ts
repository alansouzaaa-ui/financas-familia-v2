import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CardAccount } from '@/types/finance'

interface CardsStore {
  accounts: CardAccount[]
  setAccounts: (accounts: CardAccount[]) => void
  addAccount: (name: string) => CardAccount
  renameAccount: (id: string, name: string) => void
  setDueDay: (id: string, dueDay: number) => void
  deleteAccount: (id: string) => void
}

export const useCardsStore = create<CardsStore>()(
  persist(
    (set, get) => ({
      accounts: [],
      setAccounts: (accounts) => set({ accounts }),
      addAccount: (name) => {
        const trimmed = name.trim().slice(0, 40)
        // Reaproveita um cartão de mesmo nome (case-insensitive) se já existir
        const existing = get().accounts.find(a => a.name.toLowerCase() === trimmed.toLowerCase())
        if (existing) return existing
        const account: CardAccount = { id: crypto.randomUUID(), name: trimmed }
        set((s) => ({ accounts: [...s.accounts, account] }))
        return account
      },
      renameAccount: (id, name) =>
        set((s) => ({ accounts: s.accounts.map(a => a.id === id ? { ...a, name: name.trim().slice(0, 40) } : a) })),
      setDueDay: (id, dueDay) =>
        set((s) => ({ accounts: s.accounts.map(a => a.id === id ? { ...a, dueDay } : a) })),
      deleteAccount: (id) =>
        set((s) => ({ accounts: s.accounts.filter(a => a.id !== id) })),
    }),
    { name: 'cards-store' }
  )
)
