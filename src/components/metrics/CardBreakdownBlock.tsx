import { useMemo } from 'react'
import type { MonthPoint } from '@/types/finance'
import { useCardsStore } from '@/stores/useCardsStore'
import { fmt } from '@/lib/formatters'
import Card from '@/components/ui/Card'

interface Props {
  months: MonthPoint[]
}

// Total de cada cartão = soma dos itens de categoria 'cards' com aquele cardId,
// no período filtrado. Sempre derivado dos itens — nunca desencontra.
export default function CardBreakdownBlock({ months }: Props) {
  const accounts = useCardsStore(s => s.accounts)

  const { rows, semCartao, total } = useMemo(() => {
    const byCard = new Map<string, number>()
    let semCartao = 0
    let total = 0
    for (const m of months) {
      for (const item of m.items ?? []) {
        if (item.category !== 'cards') continue
        total += item.value
        if (item.cardId) {
          byCard.set(item.cardId, (byCard.get(item.cardId) ?? 0) + item.value)
        } else {
          semCartao += item.value
        }
      }
    }
    const rows = accounts
      .map(a => ({ id: a.id, name: a.name, value: byCard.get(a.id) ?? 0 }))
      .filter(r => r.value > 0)
      .sort((a, b) => b.value - a.value)
    return { rows, semCartao, total }
  }, [months, accounts])

  if (total === 0) return null

  return (
    <Card title="Por cartão">
      <div className="flex flex-col gap-2 text-[13px]">
        {rows.map(r => (
          <div key={r.id} className="flex justify-between items-center">
            <span className="text-[var(--color-text-muted)]">{r.name}</span>
            <span className="font-mono font-medium neg">{fmt(r.value)}</span>
          </div>
        ))}
        {semCartao > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-[var(--color-text-muted)] italic">Sem cartão definido</span>
            <span className="font-mono font-medium neg">{fmt(semCartao)}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-2 mt-1 border-t border-[var(--color-border)]">
          <span className="font-medium">Total cartões</span>
          <span className="font-mono font-semibold neg">{fmt(total)}</span>
        </div>
      </div>
    </Card>
  )
}
