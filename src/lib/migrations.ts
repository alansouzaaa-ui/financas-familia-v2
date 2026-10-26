import { useFinanceStore } from '@/stores/useFinanceStore'
import { guessTag } from '@/lib/autoTag'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import { useBudgetStore } from '@/stores/useBudgetStore'
import { planCategoryMerge } from '@/lib/mergeCategory'
import { EXPENSE_TAGS } from '@/types/finance'

// Backfill genérico: reclassifica lançamentos antigos cuja descrição casa com
// uma categoria por palavra-chave (guessTag), movendo-os para essa categoria.
// Roda uma vez por chave (trava em localStorage) e depois do 1º sync, para não
// ser sobrescrito pelo pull do Gist.
function backfillTag(target: string, flag: string): number {
  try {
    if (localStorage.getItem(flag)) return 0
  } catch { /* sem localStorage: segue e não trava */ }

  const store = useFinanceStore.getState()
  const updates: { year: number; month: (typeof store.allMonths)[number]['month']; item: NonNullable<(typeof store.allMonths)[number]['items']>[number] }[] = []
  for (const m of store.allMonths) {
    for (const it of m.items ?? []) {
      if (it.category === 'revenue') continue
      if (it.tag === target) continue
      if (guessTag(it.description) === target) {
        updates.push({ year: m.year, month: m.month, item: { ...it, tag: target } })
      }
    }
  }
  for (const u of updates) store.upsertItem(u.year, u.month, u.item)

  try { localStorage.setItem(flag, new Date().toISOString()) } catch { /* noop */ }
  return updates.length
}

export function backfillMercadoCondominio(): number {
  return backfillTag('mercado_condominio', 'mig_mercado_condominio_v1')
}

export function backfillUber(): number {
  return backfillTag('uber', 'mig_uber_v1')
}

// Fusão "Restaurante" → "Alimentação". Idempotente e SEM trava em localStorage:
// roda a cada abertura, depois do 1º sync, e só escreve quando algo muda
// (pega itens tardios, ex.: Telegram antes do deploy). Devolve itens movidos.
export function mergeRestauranteIntoAlimentacao(): number {
  const plan = planCategoryMerge(
    useFinanceStore.getState().allMonths,
    useCategoriesStore.getState().tags,
    useBudgetStore.getState().limits,
    'restaurante',
    'alimentacao',
    EXPENSE_TAGS,
  )
  const fin = useFinanceStore.getState()
  for (const u of plan.itemUpdates) fin.upsertItem(u.year, u.month, u.item)
  if (plan.tagsChanged) useCategoriesStore.getState().setTags(plan.tags)
  if (plan.limitsChanged) {
    const b = useBudgetStore.getState()
    b.setLimit('restaurante', null)
    if (plan.limits.alimentacao) b.setLimit('alimentacao', plan.limits.alimentacao)
  }
  return plan.itemUpdates.length
}
