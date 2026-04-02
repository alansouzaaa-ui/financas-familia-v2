import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MonthRecord, MonthPoint, PeriodFilter, PeriodPreset } from '@/types/finance'
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
  setPeriodFilter: (filter: PeriodFilter) => void
  setPeriodPreset: (preset: PeriodPreset) => void
  setSelectedYear: (year: number | 'all') => void
  setLoading: (v: boolean) => void
  setLastSync: (ts: string) => void

  filteredMonths: () => MonthPoint[]
  years: () => number[]
}

const MONTHS_ORDER = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

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
        set(s => ({
          allMonths: sortMonths(s.allMonths.map(m => m.id === id ? { ...m, ...partial } : m))
        }))
      },

      removeMonth: (year, month) => {
        set(s => ({
          allMonths: s.allMonths.filter(m => !(m.year === year && m.month === month))
        }))
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
