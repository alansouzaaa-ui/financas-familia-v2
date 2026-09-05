import { useMemo } from 'react'
import { useInvestmentStore } from '@/stores/useInvestmentStore'
import type { MonthPoint } from '@/types/finance'
import Money from '@/components/ui/Money'

interface Props {
  months: MonthPoint[]
}

export default function NetWorthCard({ months }: Props) {
  const { positions } = useInvestmentStore()

  const { portfolio, accumulated, monthlyLoans, monthlyCards, netWorth } = useMemo(() => {
    const portfolio = positions.reduce((s, p) => s + p.quantity * p.avgPrice, 0)
    const accumulated = months.reduce((s, m) => s + m.balance, 0)
    const lastMonth = months[months.length - 1]
    const monthlyLoans = lastMonth?.loans ?? 0
    const monthlyCards = lastMonth?.cards ?? 0
    // Net worth: carteira + acumulado positivo − estimativa anual de empréstimos
    const netWorth = portfolio + accumulated - (monthlyLoans * 12)
    return { portfolio, accumulated, monthlyLoans, monthlyCards, netWorth }
  }, [positions, months])

  return (
    <div className="card h-full flex flex-col">
      <div className="section-head label mb-3">Patrimônio Líquido</div>

      <div className={`font-semibold text-[27px] leading-none mb-5 ${netWorth >= 0 ? 'pos' : 'neg'}`}>
        <Money value={netWorth} signed />
      </div>

      <div className="flex flex-col gap-2.5 flex-1">
        <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.09em] font-semibold">
          Ativos
        </div>
        <div className="flex justify-between items-baseline text-[12.5px]">
          <span className="text-[var(--color-text-muted)]">Carteira (custo base)</span>
          <span className="pos"><Money value={portfolio} /></span>
        </div>
        <div className="flex justify-between items-baseline text-[12.5px]">
          <span className="text-[var(--color-text-muted)]">Balanço acumulado</span>
          <span className={accumulated >= 0 ? 'pos' : 'neg'}><Money value={accumulated} signed /></span>
        </div>

        <div className="border-t border-[var(--hairline)] my-1.5" />

        <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.09em] font-semibold">
          Compromissos mensais
        </div>
        <div className="flex justify-between items-baseline text-[12.5px]">
          <span className="text-[var(--color-text-muted)]">Empréstimos</span>
          <span className="text-[var(--color-text-primary)]"><Money value={monthlyLoans} /></span>
        </div>
        <div className="flex justify-between items-baseline text-[12.5px]">
          <span className="text-[var(--color-text-muted)]">Cartões</span>
          <span className="text-[var(--color-text-primary)]"><Money value={monthlyCards} /></span>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-[var(--hairline)]">
        <div className="text-[10px] text-[var(--color-text-muted)]">
          Carteira + Acumulado − Emp. × 12 (estimativa)
        </div>
      </div>
    </div>
  )
}
