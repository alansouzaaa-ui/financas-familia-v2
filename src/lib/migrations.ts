import { useFinanceStore } from '@/stores/useFinanceStore'
import { guessTag } from '@/lib/autoTag'

// Backfill único: reclassifica lançamentos antigos de "mercadinho condomínio"
// para a categoria dedicada. Roda uma vez (trava em localStorage) e depois do
// primeiro sync, para não ser sobrescrito pelo pull do Gist.
const FLAG = 'mig_mercado_condominio_v1'

export function backfillMercadoCondominio(): number {
  try {
    if (localStorage.getItem(FLAG)) return 0
  } catch { /* sem localStorage: segue e não trava */ }

  const store = useFinanceStore.getState()
  const target = 'mercado_condominio'

  // Coleta as mudanças antes de aplicar (upsertItem lê o estado a cada chamada)
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

  for (const u of updates) {
    store.upsertItem(u.year, u.month, u.item)
  }

  try { localStorage.setItem(FLAG, new Date().toISOString()) } catch { /* noop */ }
  return updates.length
}
