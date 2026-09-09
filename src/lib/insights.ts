import type { MonthPoint } from '@/types/finance'
import { fmt } from '@/lib/formatters'

export interface Insight {
  emoji: string
  text: string
  tone: 'pos' | 'neg' | 'neutral'
}

type TagInfo = { label: string; emoji: string }

function tagTotals(m: MonthPoint): Map<string, number> {
  const map = new Map<string, number>()
  for (const it of m.items ?? []) {
    if (it.category === 'revenue' || !it.tag) continue
    map.set(it.tag, (map.get(it.tag) ?? 0) + it.value)
  }
  return map
}

// Gera 2–4 frases de leitura (DADO → INSIGHT) a partir dos meses visíveis.
// Só inclui um insight quando há dado suficiente — nada inventado.
export function buildInsights(allMonths: MonthPoint[], tagMap: Record<string, TagInfo>): Insight[] {
  const out: Insight[] = []
  // Só meses com dados reais (evita meses futuros vazios/parciais como referência)
  const months = allMonths.filter(m => m.revenue > 0 || (m.items?.length ?? 0) > 0)
  if (months.length === 0) return out
  const last = months[months.length - 1]
  const prev = months[months.length - 2]

  // 1. Despesas vs mês anterior
  if (prev && prev.totalExpenses > 0) {
    const d = ((last.totalExpenses - prev.totalExpenses) / prev.totalExpenses) * 100
    if (Math.abs(d) >= 5) {
      out.push({
        emoji: d > 0 ? '📈' : '📉',
        text: `Despesas ${d > 0 ? 'subiram' : 'caíram'} ${Math.abs(d).toFixed(0)}% vs ${prev.label} — ${fmt(last.totalExpenses)} em ${last.label}.`,
        tone: d > 0 ? 'neg' : 'pos',
      })
    }
  }

  // 2. Categoria que mais subiu vs média dos 3 meses anteriores
  const prev3 = months.slice(-4, -1)
  if (prev3.length > 0) {
    const lastByTag = tagTotals(last)
    const avgByTag = new Map<string, number>()
    for (const m of prev3) for (const [t, v] of tagTotals(m)) avgByTag.set(t, (avgByTag.get(t) ?? 0) + v / prev3.length)
    let best: { tag: string; d: number; val: number } | null = null
    for (const [tag, val] of lastByTag) {
      const avg = avgByTag.get(tag) ?? 0
      if (avg < 50) continue // ignora bases minúsculas
      const d = ((val - avg) / avg) * 100
      if (d >= 20 && (!best || d > best.d)) best = { tag, d, val }
    }
    if (best) {
      const t = tagMap[best.tag]
      out.push({
        emoji: t?.emoji ?? '🏷️',
        text: `${t?.label ?? best.tag} subiu ${best.d.toFixed(0)}% acima da média — ${fmt(best.val)} em ${last.label}.`,
        tone: 'neg',
      })
    }
  }

  // 3. Total em assinaturas
  const assin = (last.items ?? []).filter(i => i.tag === 'assinaturas').reduce((s, i) => s + i.value, 0)
  if (assin > 0) {
    out.push({ emoji: '📱', text: `Você tem ${fmt(assin)} em assinaturas em ${last.label}.`, tone: 'neutral' })
  }

  // 4. Fallback: se ainda temos poucos insights, aponta o maior gasto por grupo
  if (out.length < 2) {
    const groups: [string, number, string][] = [
      ['Cartões', last.cards, '💳'], ['Custos fixos', last.fixedCosts, '🏠'],
      ['Empréstimos', last.loans, '🏦'], ['Custos variáveis', last.variableCosts, '🛒'],
    ]
    const top = groups.filter(g => g[1] > 0).sort((a, b) => b[1] - a[1])[0]
    if (top) out.push({ emoji: top[2], text: `Maior gasto em ${last.label}: ${top[0]} — ${fmt(top[1])}.`, tone: 'neutral' })
  }

  return out.slice(0, 3)
}
