import { useMemo } from 'react'
import { useChecklistStore } from '@/stores/useChecklistStore'
import { checklistKindOf, isRated, scoreOf, tierOf, TIER_LABELS, type ChecklistKind, type Tier } from '@/lib/checklist'

export interface AssetScoreItem {
  ticker: string
  kind: ChecklistKind
  score: number
  answered: number
  total: number
  tier: Tier
}

export const TIER_COLORS: Record<Tier, string> = {
  robusto: 'var(--color-pos)',
  bom: 'var(--color-primary)',
  arriscado: 'var(--color-neg)',
  'sem-nota': 'var(--color-text-muted)',
}

export const fmtScore = (n: number) => (n > 0 ? `+${n}` : String(n))
export { TIER_LABELS }

export function useAssetScores(positions: { ticker: string; assetType: string }[]) {
  const questions = useChecklistStore((s) => s.questions)
  const answers = useChecklistStore((s) => s.answers)

  return useMemo(() => {
    const seen = new Map<string, ChecklistKind>()
    for (const p of positions) {
      const kind = checklistKindOf(p.assetType)
      const t = p.ticker.trim().toUpperCase()
      if (kind && t && !seen.has(t)) seen.set(t, kind)
    }
    const items: AssetScoreItem[] = []
    const scores: Record<string, number | null> = {}
    for (const [ticker, kind] of seen) {
      const r = scoreOf(questions[kind], answers[ticker])
      items.push({ ticker, kind, ...r, tier: tierOf(r.score, r.answered, r.total) })
      scores[ticker] = isRated(r.answered, r.total) ? r.score : null
    }
    items.sort((a, b) => {
      const an = !isRated(a.answered, a.total)
      const bn = !isRated(b.answered, b.total)
      if (an !== bn) return an ? 1 : -1
      return b.score - a.score || a.ticker.localeCompare(b.ticker)
    })
    return { items, scores }
  }, [positions, questions, answers])
}
