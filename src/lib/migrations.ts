import { useFinanceStore } from '@/stores/useFinanceStore'
import { guessTag } from '@/lib/autoTag'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import { useBudgetStore } from '@/stores/useBudgetStore'
import { planCategoryMerge } from '@/lib/mergeCategory'
import { EXPENSE_TAGS } from '@/types/finance'
import { useInvestmentStore } from '@/stores/useInvestmentStore'
import { useOperationsStore } from '@/stores/useOperationsStore'
import { migratePositions } from '@/lib/operations'
import type { InvestmentPosition } from '@/types/investment'

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

export interface PositionsMigrationCounts {
  /** Operações de abertura criadas. */
  created: number
  /** Linhas absorvidas por consolidação. */
  merged: number
  positionsBefore: number
  positionsAfter: number
}

export const POSITIONS_BACKUP_KEY = 'investment-positions-backup-v1'

// Cópia de segurança das posições antes da 1ª escrita da migração (só se ainda não existir).
function backupPositionsOnce(positions: InvestmentPosition[]): void {
  try {
    if (localStorage.getItem(POSITIONS_BACKUP_KEY)) return
    localStorage.setItem(POSITIONS_BACKUP_KEY, JSON.stringify({ at: new Date().toISOString(), positions }))
  } catch { /* sem localStorage ou cota cheia: a migração segue sem a cópia */ }
}

// Migração das posições para o livro de operações (abertura determinística +
// consolidação de linhas duplicadas). Idempotente; só escreve nas stores quando
// algo muda. Roda depois do 1º sync (AppShell), então as mudanças sobem pelo push.
export function runPositionsMigration(): PositionsMigrationCounts {
  const inv = useInvestmentStore.getState()
  const ops = useOperationsStore.getState()
  const result = migratePositions(inv.positions, ops.operations)
  const created = result.operations.length - ops.operations.length
  const remapped = result.operations.some((o, i) => i < ops.operations.length && o !== ops.operations[i])
  const positionsChanged = result.positions.length !== inv.positions.length
    || result.positions.some((p, i) => p !== inv.positions[i])
  if (created > 0 || remapped || positionsChanged) backupPositionsOnce(inv.positions)
  if (created > 0 || remapped) ops.setAll({ operations: result.operations })
  if (positionsChanged) inv.setPositions(result.positions)
  return {
    created,
    merged: result.merged,
    positionsBefore: inv.positions.length,
    positionsAfter: result.positions.length,
  }
}
