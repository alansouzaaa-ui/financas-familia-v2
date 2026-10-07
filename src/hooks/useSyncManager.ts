import { useEffect, useRef, useState } from 'react'
import { pullSync, pushSync } from '@/lib/syncService'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useGoalsStore } from '@/stores/useGoalsStore'
import { useRecurringStore } from '@/stores/useRecurringStore'
import { useInvestmentStore } from '@/stores/useInvestmentStore'
import { useCardsStore } from '@/stores/useCardsStore'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import { useDebtsStore } from '@/stores/useDebtsStore'
import { useAllocationStore } from '@/stores/useAllocationStore'
import { useReserveStore } from '@/stores/useReserveStore'
import { useUiStore } from '@/stores/useUiStore'
import { isSupabaseConfigured } from '@/config/supabase'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

export function useSyncManager() {
  const [status, setStatus] = useState<SyncStatus>(isSupabaseConfigured ? 'idle' : 'offline')
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPush = useRef(false)
  // Prevents push before first pull completes (avoids overwriting newer remote data)
  const hasPulled = useRef(false)
  const isPulling = useRef(false)

  const allMonths = useFinanceStore(s => s.allMonths)
  const historyCutoff = useFinanceStore(s => s.historyCutoff)
  const goals = useGoalsStore(s => s.goals)
  const recurringItems = useRecurringStore(s => s.items)
  const positions = useInvestmentStore(s => s.positions)
  const cardAccounts = useCardsStore(s => s.accounts)
  const expenseTags = useCategoriesStore(s => s.tags)
  const debts = useDebtsStore(s => s.items)
  const allocTargets = useAllocationStore(s => s.targets)
  const aporte = useAllocationStore(s => s.aporte)
  const reserveCost = useReserveStore(s => s.monthlyCost)
  const reserveMonths = useReserveStore(s => s.months)

  async function doPull() {
    if (!isSupabaseConfigured) return
    isPulling.current = true
    setStatus('syncing')
    const settle = () => useUiStore.getState().markFirstSyncSettled()
    const remote = await pullSync()
    // null = sem dados ainda (primeiro uso) → não é erro, continua para push
    if (remote === null) {
      setStatus('synced')
      setLastSync(new Date())
      isPulling.current = false
      hasPulled.current = true
      settle()
      return
    }
    // false = erro de rede/API
    if (remote === false) {
      setStatus('error')
      isPulling.current = false
      hasPulled.current = true
      settle()
      return
    }
    // 'unauthorized' = sem sessão válida
    if (remote === 'unauthorized') {
      setStatus('error')
      isPulling.current = false
      hasPulled.current = true
      settle()
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
    if (remote.card_accounts?.length) {
      useCardsStore.getState().setAccounts(remote.card_accounts)
    }
    if (remote.expense_tags?.length) {
      useCategoriesStore.getState().setTags(remote.expense_tags)
    }
    if (remote.history_cutoff !== undefined) {
      useFinanceStore.getState().setHistoryCutoff(remote.history_cutoff)
    }
    // Dívidas: substitui quando o remoto já tem o campo (mesmo vazio = intencional);
    // se o Gist ainda não tiver dívidas (pré-feature), mantém o que há localmente.
    if (Array.isArray(remote.debts)) {
      useDebtsStore.getState().replaceAll(remote.debts, remote.debts_reference_month)
    }
    // Alocação e reserva: se o Gist ainda não tem o campo (pré-feature), mantém o
    // local e o próximo push envia.
    if (remote.allocation && typeof remote.allocation === 'object') {
      useAllocationStore.getState().hydrate(remote.allocation)
    }
    if (remote.reserve_settings && typeof remote.reserve_settings === 'object') {
      useReserveStore.getState().hydrate(remote.reserve_settings)
    }
    setStatus('synced')
    setLastSync(new Date())
    settle()
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
      card_accounts: useCardsStore.getState().accounts,
      expense_tags: useCategoriesStore.getState().tags,
      history_cutoff: useFinanceStore.getState().historyCutoff,
      debts: useDebtsStore.getState().items,
      debts_reference_month: useDebtsStore.getState().referenceMonth,
      allocation: {
        targets: useAllocationStore.getState().targets,
        aporte: useAllocationStore.getState().aporte,
      },
      reserve_settings: {
        monthlyCost: useReserveStore.getState().monthlyCost,
        months: useReserveStore.getState().months,
      },
    })
    setStatus(ok ? 'synced' : 'error')
    if (ok) setLastSync(new Date())
  }

  // Pull once on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    doPull()
  }, [])

  // Debounced auto-push whenever store data changes
  useEffect(() => {
    if (!isSupabaseConfigured || !hasPulled.current || isPulling.current) return
    pendingPush.current = true
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => { pendingPush.current = false; doPush() }, 1200)
    return () => { if (pushTimer.current) clearTimeout(pushTimer.current) }
  }, [allMonths, goals, recurringItems, positions, cardAccounts, expenseTags, historyCutoff, debts, allocTargets, aporte, reserveCost, reserveMonths])

  // Flush imediato quando a aba é ocultada/fechada — evita perder alterações
  // recentes (ex: parcelamento) que ainda estavam no debounce. keepalive garante
  // o envio durante o unload.
  useEffect(() => {
    const flush = () => {
      if (!isSupabaseConfigured || !hasPulled.current || isPulling.current || !pendingPush.current) return
      if (pushTimer.current) { clearTimeout(pushTimer.current); pushTimer.current = null }
      pendingPush.current = false
      doPush()
    }
    const onVis = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', flush)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { status, lastSync, pull: doPull, push: doPush }
}
