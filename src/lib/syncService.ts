import type { MonthRecord, FinancialGoal, RecurringItem } from '@/types/finance'
import type { InvestmentPosition } from '@/types/investment'
import type { MonthPoint } from '@/types/finance'

export interface SyncPayload {
  manual_months: MonthRecord[]
  goals: FinancialGoal[]
  recurring_items: RecurringItem[]
  investment_positions: InvestmentPosition[]
  updated_at?: string
}

function stripComputed(p: MonthPoint): MonthRecord {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { totalExpenses, balance, consolidatedRevenue, consolidatedExpenses, consolidatedBalance, label, ...record } = p
  return record as MonthRecord
}

// null = sem dados ainda | false = erro de rede/API | 'unauthorized' = sem sessão válida
export async function pullSync(): Promise<SyncPayload | null | false | 'unauthorized'> {
  try {
    const res = await fetch('/api/sync', { method: 'GET', credentials: 'same-origin' })
    if (res.status === 401) return 'unauthorized'
    if (!res.ok) return false
    const data = await res.json() as SyncPayload | null
    return data ?? null
  } catch {
    return false
  }
}

export async function pushSync(months: MonthPoint[], payload: Omit<SyncPayload, 'manual_months' | 'updated_at'>): Promise<boolean> {
  try {
    const manual_months = months.filter(m => m.source === 'manual').map(stripComputed)
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ manual_months, ...payload }),
    })
    return res.ok
  } catch {
    return false
  }
}
