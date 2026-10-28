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
import { useNetWorthStore } from '@/stores/useNetWorthStore'
import { useReserveStore } from '@/stores/useReserveStore'
import { useJourneyStore } from '@/stores/useJourneyStore'
import { useBudgetStore } from '@/stores/useBudgetStore'
import { useChecklistStore } from '@/stores/useChecklistStore'
import { useUiStore } from '@/stores/useUiStore'
import { useTombstoneStore } from '@/stores/useTombstoneStore'
import { isSupabaseConfigured } from '@/config/supabase'

// Pull ao voltar para a aba só se o último pull tiver mais que isso.
export const REFRESH_AFTER_MS = 60_000

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

export function useSyncManager() {
  const [status, setStatus] = useState<SyncStatus>(isSupabaseConfigured ? 'idle' : 'offline')
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPush = useRef(false)
  // Prevents push before first pull completes (avoids overwriting newer remote data)
  const hasPulled = useRef(false)
  const isPulling = useRef(false)
  const lastPullAt = useRef(0)
  const refreshing = useRef(false)
  const pushInFlight = useRef<Promise<void> | null>(null)

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
  const reserveIncomeType = useReserveStore(s => s.incomeType)
  const netCash = useNetWorthStore(s => s.cash)
  const netCashAt = useNetWorthStore(s => s.cashUpdatedAt)
  const journeyStrategy = useJourneyStore(s => s.strategy)
  const journeyScope = useJourneyStore(s => s.scope)
  const journeyBudget = useJourneyStore(s => s.budgetOverride)
  const budgetLimits = useBudgetStore(s => s.limits)
  const checklistQuestions = useChecklistStore(s => s.questions)
  const checklistAnswers = useChecklistStore(s => s.answers)
  const tombstones = useTombstoneStore(s => s.items)

  // refresh=true: pull de atualização (foco/retorno à aba/pós-restauração). Nesse
  // caso, se o usuário editou localmente enquanto a rede respondia, o resultado é
  // descartado (a edição será enviada pelo push e a próxima atualização busca de novo).
  async function doPull(refresh = false) {
    if (!isSupabaseConfigured) return
    setStatus('syncing')
    const settle = () => useUiStore.getState().markFirstSyncSettled()
    const monthsBefore = useFinanceStore.getState().allMonths
    const remote = await pullSync()
    if (refresh && remote && remote !== 'unauthorized' && useFinanceStore.getState().allMonths !== monthsBefore) {
      setStatus('synced')
      return
    }
    // Só a partir daqui o push automático fica suspenso (aplicação das stores).
    isPulling.current = true
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
    lastPullAt.current = Date.now()
    // Tombstones remotos primeiro: valem para os próximos pushes deste cliente.
    useTombstoneStore.getState().merge(remote.deleted_ids)
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
    if (remote.net_worth && typeof remote.net_worth === 'object') {
      useNetWorthStore.getState().hydrate(remote.net_worth)
    }
    if (remote.journey_settings && typeof remote.journey_settings === 'object') {
      useJourneyStore.getState().hydrate(remote.journey_settings)
    }
    if (remote.budget && typeof remote.budget === 'object') {
      useBudgetStore.getState().hydrate(remote.budget)
    }
    if (remote.checklist && typeof remote.checklist === 'object') {
      useChecklistStore.getState().hydrate(remote.checklist)
    }
    setStatus('synced')
    setLastSync(new Date())
    // Small delay so store updates propagate before re-enabling push. O settle
    // (que dispara as migrações do AppShell) vem depois da liberação, para que as
    // alterações das migrações sejam enviadas pelo push automático.
    setTimeout(() => {
      isPulling.current = false
      hasPulled.current = true
      settle()
    }, 200)
  }

  function doPush(): Promise<void> {
    const run = pushOnce().finally(() => { if (pushInFlight.current === run) pushInFlight.current = null })
    pushInFlight.current = run
    return run
  }

  async function pushOnce() {
    if (!isSupabaseConfigured) return
    setStatus('syncing')
    const months = useFinanceStore.getState().allMonths
    const { ok, restored } = await pushSync(months, {
      deleted_ids: useTombstoneStore.getState().items,
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
        incomeType: useReserveStore.getState().incomeType,
      },
      net_worth: {
        cash: useNetWorthStore.getState().cash,
        cashUpdatedAt: useNetWorthStore.getState().cashUpdatedAt,
      },
      journey_settings: {
        strategy: useJourneyStore.getState().strategy,
        scope: useJourneyStore.getState().scope,
        budgetOverride: useJourneyStore.getState().budgetOverride,
      },
      budget: { limits: useBudgetStore.getState().limits },
      checklist: {
        questions: useChecklistStore.getState().questions,
        answers: useChecklistStore.getState().answers,
      },
    })
    setStatus(ok ? 'synced' : 'error')
    if (ok) setLastSync(new Date())
    // O servidor reinseriu itens do Telegram que este cliente não tinha → puxa já.
    if (ok && restored > 0) await doPull(true)
  }

  // Atualização ao voltar para a aba: empurra o que está pendente e depois puxa.
  async function refreshIfStale() {
    if (!isSupabaseConfigured || !hasPulled.current || isPulling.current || refreshing.current) return
    if (Date.now() - lastPullAt.current < REFRESH_AFTER_MS) return
    refreshing.current = true
    try {
      if (pendingPush.current) {
        if (pushTimer.current) { clearTimeout(pushTimer.current); pushTimer.current = null }
        pendingPush.current = false
        await doPush()
      } else if (pushInFlight.current) {
        await pushInFlight.current
      }
      // doPush pode já ter puxado (restored > 0)
      if (Date.now() - lastPullAt.current >= REFRESH_AFTER_MS) await doPull(true)
    } finally {
      refreshing.current = false
    }
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
  }, [allMonths, goals, recurringItems, positions, cardAccounts, expenseTags, historyCutoff, debts, allocTargets, aporte, reserveCost, reserveMonths, reserveIncomeType, netCash, netCashAt, journeyStrategy, journeyScope, journeyBudget, budgetLimits, checklistQuestions, checklistAnswers, tombstones])

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
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush()
      else void refreshIfStale()
    }
    const onFocus = () => { void refreshIfStale() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', flush)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('focus', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { status, lastSync, pull: () => doPull(), push: doPush }
}
