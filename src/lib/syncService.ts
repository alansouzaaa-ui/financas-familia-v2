import { supabase } from '@/config/supabase'
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

const SYNC_ID = 'familia'

function stripComputed(p: MonthPoint): MonthRecord {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { totalExpenses, balance, consolidatedRevenue, consolidatedExpenses, consolidatedBalance, label, ...record } = p
  return record as MonthRecord
}

export async function pullSync(): Promise<SyncPayload | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('dashboard_sync')
      .select('manual_months, goals, recurring_items, investment_positions, updated_at')
      .eq('id', SYNC_ID)
      .single()
    if (error || !data) return null
    return data as SyncPayload
  } catch {
    return null
  }
}

export async function pushSync(months: MonthPoint[], payload: Omit<SyncPayload, 'manual_months' | 'updated_at'>): Promise<boolean> {
  if (!supabase) return false
  try {
    const manual_months = months.filter(m => m.source === 'manual').map(stripComputed)
    const { error } = await supabase
      .from('dashboard_sync')
      .upsert({
        id: SYNC_ID,
        manual_months,
        ...payload,
        updated_at: new Date().toISOString(),
      })
    return !error
  } catch {
    return false
  }
}
