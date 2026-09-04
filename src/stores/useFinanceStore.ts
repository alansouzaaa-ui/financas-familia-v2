import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MonthRecord, MonthPoint, MonthItem, MonthAbbr, PeriodFilter, PeriodPreset } from '@/types/finance'
import { toMonthPoint, filterByPeriod } from '@/lib/calculations'
import { SEED_DATA } from '@/lib/seedData'

interface FinanceStore {
  allMonths: MonthPoint[]
  periodFilter: PeriodFilter
  selectedYear: number | 'all'
  isLoading: boolean
  lastSync: string | null

  setMonths: (records: MonthRecord[]) => void
  addMonth: (record: MonthRecord) => void
  updateMonth: (id: string, record: Partial<MonthRecord>) => void
  removeMonth: (year: number, month: string) => void
  upsertItem: (year: number, month: MonthAbbr, item: MonthItem) => void
  removeItem: (year: number, month: MonthAbbr, itemId: string) => void
  setPeriodFilter: (filter: PeriodFilter) => void
  setPeriodPreset: (preset: PeriodPreset) => void
  setSelectedYear: (year: number | 'all') => void
  setLoading: (v: boolean) => void
  setLastSync: (ts: string) => void

  filteredMonths: () => MonthPoint[]
  years: () => number[]
}

const MONTHS_ORDER = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function totalsFromItems(items: MonthItem[]): Pick<MonthRecord, 'revenue' | 'fixedCosts' | 'loans' | 'cards' | 'variableCosts'> {
  const t = { revenue: 0, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0 }
  for (const i of items) t[i.category] += i.value
  return t
}

function sortMonths(months: MonthRecord[]): MonthPoint[] {
  return [...months]
    .sort((a, b) => a.year !== b.year ? a.year - b.year : MONTHS_ORDER.indexOf(a.month) - MONTHS_ORDER.indexOf(b.month))
    .map(toMonthPoint)
}

function mergeRecords(seed: MonthRecord[], extras: MonthRecord[]): MonthRecord[] {
  const map = new Map<string, MonthRecord>()
  for (const r of seed) map.set(`${r.year}-${r.month}`, r)
  for (const r of extras) map.set(`${r.year}-${r.month}`, r) // extras override seed
  return Array.from(map.values())
}

export const useFinanceStore = create<FinanceStore>()(
  persist(
    (set, get) => ({
      allMonths: sortMonths(SEED_DATA),
      periodFilter: { preset: 'all' },
      selectedYear: 'all',
      isLoading: false,
      lastSync: null,

      setMonths: (records) => {
        const merged = mergeRecords(SEED_DATA, records)
        set({ allMonths: sortMonths(merged) })
      },

      addMonth: (record) => {
        const key = `${record.year}-${record.month}`
        const existing = get().allMonths.find(m => `${m.year}-${m.month}` === key)
        if (existing) {
          set(s => ({
            allMonths: sortMonths(
              s.allMonths.map(m => `${m.year}-${m.month}` === key ? { ...m, ...record } : m)
            )
          }))
        } else {
          set(s => ({ allMonths: sortMonths([...s.allMonths, record]) }))
        }
      },

      updateMonth: (id, partial) => {
        // id aqui é a chave composta "year-month"
        set(s => ({
          allMonths: sortMonths(
            s.allMonths.map(m => `${m.year}-${m.month}` === id ? { ...m, ...partial } : m)
          )
        }))
      },

      removeMonth: (year, month) => {
        set(s => ({
          allMonths: s.allMonths.filter(m => !(m.year === year && m.month === month))
        }))
      },

      // Adiciona ou atualiza um item dentro de um mês (cria o mês se faltar),
      // recalculando os totais das categorias a partir dos itens.
      upsertItem: (year, month, item) => {
        const existing = get().allMonths.find(m => m.year === year && m.month === month)
        const items = existing?.items ? [...existing.items] : []
        const idx = items.findIndex(i => i.id === item.id)
        if (idx >= 0) items[idx] = item
        else items.push(item)
        get().addMonth({
          month, year,
          source: existing?.source ?? 'manual',
          items,
          ...totalsFromItems(items),
        })
      },

      removeItem: (year, month, itemId) => {
        const existing = get().allMonths.find(m => m.year === year && m.month === month)
        if (!existing?.items) return
        const items = existing.items.filter(i => i.id !== itemId)
        get().addMonth({
          month, year,
          source: existing.source ?? 'manual',
          items,
          ...totalsFromItems(items),
        })
      },

      setPeriodFilter: (filter) => set({ periodFilter: filter }),
      setPeriodPreset: (preset) => set({ periodFilter: { preset } }),
      setSelectedYear: (year) => set({ selectedYear: year }),
      setLoading: (isLoading) => set({ isLoading }),
      setLastSync: (ts) => set({ lastSync: ts }),

      filteredMonths: () => {
        const { allMonths, periodFilter } = get()
        return filterByPeriod(allMonths, periodFilter.preset, periodFilter.customRange)
      },

      years: () => {
        return [...new Set(get().allMonths.map(m => m.year))].sort()
      },
    }),
    {
      name: 'finance-store',
      partialize: (s) => ({
        periodFilter: s.periodFilter,
        selectedYear: s.selectedYear,
        manualMonths: s.allMonths.filter(m => m.source === 'manual'),
      }),
      merge: (persisted: unknown, current) => {
        const p = persisted as { periodFilter?: typeof current.periodFilter; selectedYear?: typeof current.selectedYear; manualMonths?: MonthRecord[] }
        // manualMonths override seed — mergeRecords já garante isso via Map
        return {
          ...current,
          periodFilter: p.periodFilter ?? current.periodFilter,
          selectedYear: p.selectedYear ?? current.selectedYear,
          allMonths: sortMonths(mergeRecords(SEED_DATA, p.manualMonths ?? [])),
        }
      },
    }
  )
)
