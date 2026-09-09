import { useMemo } from 'react'
import type { MonthPoint, ExpenseTag } from '@/types/finance'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import { buildInsights } from '@/lib/insights'

interface Props {
  months: MonthPoint[]
}

const TONE_DOT: Record<string, string> = {
  pos: 'var(--color-pos)',
  neg: 'var(--color-neg)',
  neutral: 'var(--color-text-muted)',
}

// Insights narrativos — DADO → INSIGHT. Some quando não há o que dizer.
export default function InsightsCard({ months }: Props) {
  const tags = useCategoriesStore(s => s.tags)
  const tagMap = useMemo(() => Object.fromEntries(tags.map(t => [t.id, t])) as Record<string, ExpenseTag>, [tags])
  const insights = useMemo(() => buildInsights(months, tagMap), [months, tagMap])

  if (insights.length === 0) return null

  return (
    <div className="card mb-5">
      <div className="section-head label mb-3">O que mudou</div>
      <div className="flex flex-col gap-2.5">
        {insights.map((ins, i) => (
          <div key={i} className="flex items-start gap-2.5 text-[13.5px] leading-snug">
            <span className="flex-shrink-0 text-[15px] leading-none mt-0.5">{ins.emoji}</span>
            <span className="text-[var(--color-text-primary)]">{ins.text}</span>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ml-auto" style={{ background: TONE_DOT[ins.tone] }} />
          </div>
        ))}
      </div>
    </div>
  )
}
