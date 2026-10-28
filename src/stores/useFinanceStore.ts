import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MonthRecord, MonthPoint, MonthItem, MonthAbbr, PeriodFilter, PeriodPreset } from '@/types/finance'
import { toMonthPoint, filterByPeriod } from '@/lib/calculations'
import { SEED_DATA } from '@/lib/seedData'
import { totalsFromItems } from '@/lib/monthTotals'
import { removedItemIds, addedItemIds } from '@/lib/tombstones'
import { useTombstoneStore } from '@/stores/useTombstoneStore'

interface FinanceStore {
  allMonths: MonthPoint[]
  periodFilter: PeriodFilter
  selectedYear: number | 'all'
  isLoading: boolean
  lastSync: string | null
  historyCutoff: string | null   // "YYYYMM": oculta meses anteriores; null = mostra tudo

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
  setHistoryCutoff: (key: string | null) => void

  visibleMonths: () => MonthPoint[]
  filteredMonths: () => MonthPoint[]
  years: () => number[]
}

// Chave comparável YYYYMM (ex: Jun/2026 = 202606) para o corte de histórico.
export function monthKey(year: number, month: string): number {
  return year * 100 + (MONTHS_ORDER.indexOf(month) + 1)
}

const MONTHS_ORDER = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

// Registra tombstones dos itens que sumiram (exceto movidos entre meses) e
// limpa os de itens que voltaram. Chamado em toda mutação local; NÃO em setMonths (pull).
function trackItemChanges(before: MonthRecord[], after: MonthRecord[]) {
  const ts = useTombstoneStore.getState()
  ts.add(removedItemIds(before, after))
  ts.forget(addedItemIds(before, after))
}

function sortMonths(months: MonthRecord[]): MonthPoint[] {
  return [...months]
    .sort((a, b) => a.year !== b.year ? a.year - b.year : MONTHS_ORDER.indexOf(a.month) - MONTHS_ORDER.indexOf(b.month))
    .map(toMonthPoint)
}

function mergeRecords(seed: MonthRecord[], extras: MonthRecord[]): MonthRecord[] {
  const map = new Map<string, MonthRecord>()
  for (const r of seed) map.set(`${r.year}-${r.month}`, r)
  // extras override seed. Totais recalculados dos itens: o registro remoto pode
  // trazer agregados defasados (ex.: bug antigo do Telegram em 'renegociacoes').
  for (const r of extras) {
    const fixed = r.items && r.items.length ? { ...r, ...totalsFromItems(r.items) } : r
    map.set(`${r.year}-${r.month}`, fixed)
  }
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
      historyCutoff: null,

      setMonths: (records) => {
        const merged = mergeRecords(SEED_DATA, records)
        set({ allMonths: sortMonths(merged) })
      },

      addMonth: (record) => {
        const before = get().allMonths
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
        trackItemChanges(before, get().allMonths)
      },

      updateMonth: (id, partial) => {
        // id aqui é a chave composta "year-month"
        const before = get().allMonths
        set(s => ({
          allMonths: sortMonths(
            s.allMonths.map(m => `${m.year}-${m.month}` === id ? { ...m, ...partial } : m)
          )
        }))
        trackItemChanges(before, get().allMonths)
      },

      removeMonth: (year, month) => {
        const before = get().allMonths
        set(s => ({
          allMonths: s.allMonths.filter(m => !(m.year === year && m.month === month))
        }))
        trackItemChanges(before, get().allMonths)
      },

      // Adiciona ou atualiza um item dentro de um mês (cria o mês se faltar),
      // recalculando os totais das categorias a partir dos itens.
      upsertItem: (year, month, item) => {
        const existing = get().allMonths.find(m => m.year === year && m.month === month)
        const items = existing?.items ? [...existing.items] : []
        const idx = items.findIndex(i => i.id === item.id)
        if (idx >= 0) items[idx] = item
        else items.push(item)
        // Editar um item torna o mês 'manual' (converte um mês seed), senão
        // o partialize (que só persiste meses manual) descartaria a alteração.
        get().addMonth({
          month, year,
          source: 'manual',
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
          source: 'manual',
          items,
          ...totalsFromItems(items),
        })
      },

      setPeriodFilter: (filter) => set({ periodFilter: filter }),
      setPeriodPreset: (preset) => set({ periodFilter: { preset } }),
      setSelectedYear: (year) => set({ selectedYear: year }),
      setLoading: (isLoading) => set({ isLoading }),
      setLastSync: (ts) => set({ lastSync: ts }),

      setHistoryCutoff: (key) => set({ historyCutoff: key }),

      // Meses visíveis = allMonths sem os anteriores ao corte de histórico.
      // Não afeta persistência/sync (allMonths continua completo).
      visibleMonths: () => {
        const { allMonths, historyCutoff } = get()
        if (!historyCutoff) return allMonths
        const cut = parseInt(historyCutoff, 10)
        return allMonths.filter(m => monthKey(m.year, m.month) >= cut)
      },

      filteredMonths: () => {
        const { periodFilter } = get()
        return filterByPeriod(get().visibleMonths(), periodFilter.preset, periodFilter.customRange)
      },

      years: () => {
        return [...new Set(get().visibleMonths().map(m => m.year))].sort()
      },
    }),
    {
      name: 'finance-store',
      partialize: (s) => ({
        periodFilter: s.periodFilter,
        selectedYear: s.selectedYear,
        historyCutoff: s.historyCutoff,
        manualMonths: s.allMonths.filter(m => m.source === 'manual'),
      }),
      merge: (persisted: unknown, current) => {
        const p = persisted as { periodFilter?: typeof current.periodFilter; selectedYear?: typeof current.selectedYear; historyCutoff?: string | null; manualMonths?: MonthRecord[] }
        // manualMonths override seed — mergeRecords já garante isso via Map
        return {
          ...current,
          periodFilter: p.periodFilter ?? current.periodFilter,
          selectedYear: p.selectedYear ?? current.selectedYear,
          historyCutoff: p.historyCutoff ?? null,
          allMonths: sortMonths(mergeRecords(SEED_DATA, p.manualMonths ?? [])),
        }
      },
    }
  )
)
