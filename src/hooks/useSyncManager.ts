import { useEffect, useRef, useState } from 'react'
import { pullSync, pushSync } from '@/lib/syncService'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useGoalsStore } from '@/stores/useGoalsStore'
import { useRecurringStore } from '@/stores/useRecurringStore'
import { useInvestmentStore } from '@/stores/useInvestmentStore'
import { isSupabaseConfigured } from '@/config/supabase'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

export function useSyncManager() {
  const [status, setStatus] = useState<SyncStatus>(isSupabaseConfigured ? 'idle' : 'offline')
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Prevents push before first pull completes (avoids overwriting newer remote data)
  const hasPulled = useRef(false)
  const isPulling = useRef(false)

  const allMonths = useFinanceStore(s => s.allMonths)
  const goals = useGoalsStore(s => s.goals)
  const recurringItems = useRecurringStore(s => s.items)
  const positions = useInvestmentStore(s => s.positions)

  async function doPull() {
    if (!isSupabaseConfigured) return
    isPulling.current = true
    setStatus('syncing')
    const remote = await pullSync()
    if (!remote) {
      setStatus('error')
      isPulling.current = false
      hasPulled.current = true
      return
    }
    if (remote.manual_months?.length) {
      useFinanceStore.getState().setMonths(remote.manual_months)
    }
    if (remote.goals?.length) {
      useGoalsStore.getState().setGoals(remote.goals)
    }
    if (remote.recurring_items?.length) {
      useRecurringStore.getState().setItems(remote.recurring_items)
    }
    if (remote.investment_positions?.length) {
      useInvestmentStore.getState().setPositions(remote.investment_positions)
    }
    setStatus('synced')
    setLastSync(new Date())
    // Small delay so store updates propagate before re-enabling push
    setTimeout(() => {
      isPulling.current = false
      hasPulled.current = true
    }, 200)
  }

  async function doPush() {
    if (!isSupabaseConfigured) return
    setStatus('syncing')
    const months = useFinanceStore.getState().allMonths
    const ok = await pushSync(months, {
      goals: useGoalsStore.getState().goals,
      recurring_items: useRecurringStore.getState().items,
      investment_positions: useInvestmentStore.getState().positions,
    })
    setStatus(ok ? 'synced' : 'error')
    if (ok) setLastSync(new Date())
  }

  // Pull once on mount
  useEffect(() => {
    doPull()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced auto-push whenever store data changes
  useEffect(() => {
    if (!isSupabaseConfigured || !hasPulled.current || isPulling.current) return
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(doPush, 2500)
    return () => { if (pushTimer.current) clearTimeout(pushTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMonths, goals, recurringItems, positions])

  return { status, lastSync, pull: doPull, push: doPush }
}
