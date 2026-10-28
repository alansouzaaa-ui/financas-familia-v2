import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Saldo em conta informado pelo usuário (entra no patrimônio líquido). Persistido e sincronizado (net_worth).
interface NetWorthStore {
  cash: number | null          // null = não informado
  cashUpdatedAt?: string       // ISO
  setCash: (v: number | null) => void
  hydrate: (data: { cash?: unknown; cashUpdatedAt?: unknown }) => void
}

const clamp = (v: number) => Math.max(-100_000_000, Math.min(v, 100_000_000))

export const useNetWorthStore = create<NetWorthStore>()(
  persist(
    (set) => ({
      cash: null,
      cashUpdatedAt: undefined,
      setCash: (v) =>
        set({
          cash: v == null || !Number.isFinite(v) ? null : clamp(v),
          cashUpdatedAt: new Date().toISOString(),
        }),
      hydrate: (data) =>
        set((s) => ({
          cash:
            data.cash === null ? null
            : typeof data.cash === 'number' && Number.isFinite(data.cash) ? clamp(data.cash)
            : s.cash,
          cashUpdatedAt: typeof data.cashUpdatedAt === 'string' ? data.cashUpdatedAt : s.cashUpdatedAt,
        })),
    }),
    { name: 'net-worth-store' }
  )
)
