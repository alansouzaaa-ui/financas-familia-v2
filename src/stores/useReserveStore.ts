import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Parâmetros da reserva de emergência. Persistidos localmente e sincronizados (reserve_settings);
// a reserva em si vive nas posições da carteira marcadas com a categoria "Reserva".
interface ReserveStore {
  monthlyCost: number   // custo fixo mensal (R$) — base do dimensionamento
  months: number        // meses de cobertura desejados (padrão 6)
  setMonthlyCost: (v: number) => void
  setMonths: (v: number) => void
  hydrate: (data: { monthlyCost?: unknown; months?: unknown }) => void
}

export const useReserveStore = create<ReserveStore>()(
  persist(
    (set) => ({
      monthlyCost: 0,
      months: 6,
      setMonthlyCost: (v) => set({ monthlyCost: Math.max(0, Math.min(v, 10_000_000)) }),
      setMonths: (v) => set({ months: Math.max(1, Math.min(Math.round(v), 24)) }),
      hydrate: (data) =>
        set((s) => ({
          monthlyCost:
            typeof data.monthlyCost === 'number' && Number.isFinite(data.monthlyCost)
              ? Math.max(0, Math.min(data.monthlyCost, 10_000_000))
              : s.monthlyCost,
          months:
            typeof data.months === 'number' && Number.isFinite(data.months)
              ? Math.max(1, Math.min(Math.round(data.months), 24))
              : s.months,
        })),
    }),
    { name: 'reserve-store' }
  )
)
