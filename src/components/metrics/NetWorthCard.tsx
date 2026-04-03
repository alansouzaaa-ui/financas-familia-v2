import { useMemo } from 'react'
import { useInvestmentStore } from '@/stores/useInvestmentStore'
import type { MonthPoint } from '@/types/finance'
import { fmt, fmtSigned } from '@/lib/formatters'

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
      <div className="label mb-3">Patrimônio Líquido</div>

      <div className={`font-mono font-bold text-[26px] leading-none mb-4 ${netWorth >= 0 ? 'pos' : 'neg'}`}>
        {fmtSigned(netWorth)}
      </div>

      <div className="flex flex-col gap-2 flex-1">
        <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">
          Ativos
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-[var(--color-text-muted)]">Carteira (custo base)</span>
          <span className="font-mono pos">{fmt(portfolio)}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-[var(--color-text-muted)]">Balanço acumulado</span>
          <span className={`font-mono ${accumulated >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(accumulated)}</span>
        </div>

        <div className="border-t border-[var(--color-border)] my-1" />

        <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">
          Compromissos mensais
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-[var(--color-text-muted)]">Empréstimos</span>
          <span className="font-mono neg">{fmt(monthlyLoans)}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-[var(--color-text-muted)]">Cartões</span>
          <span className="font-mono neg">{fmt(monthlyCards)}</span>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-[var(--color-border)]">
        <div className="text-[10px] text-[var(--color-text-muted)]">
          Carteira + Acumulado − Emp. × 12 (estimativa)
        </div>
      </div>
    </div>
  )
}
