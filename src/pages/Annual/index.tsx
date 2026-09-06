import { useMemo } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { buildAnnualSummary } from '@/lib/calculations'
import { fmtNum, fmtNumSigned } from '@/lib/formatters'
import Money from '@/components/ui/Money'
import Card from '@/components/ui/Card'
import AnnualChart from '@/components/charts/AnnualChart'
import EmptyState from '@/components/ui/EmptyState'

export default function AnnualPage() {
  const rawMonths = useFinanceStore(s => s.allMonths)
  const historyCutoff = useFinanceStore(s => s.historyCutoff)
  const visibleFn = useFinanceStore(s => s.visibleMonths)
  const allMonths = useMemo(() => visibleFn(), [rawMonths, historyCutoff, visibleFn])
  const summary = useMemo(() => buildAnnualSummary(allMonths), [allMonths])

  const numTh = 'label px-4 py-2.5 text-right'
  const numTd = 'px-4 py-3 font-mono tnum text-right border-b border-[var(--hairline)]'

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-[21px] font-semibold tracking-[-0.01em]">Resumo Anual</h1>
        <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">Resultado consolidado de cada ano e a comparação entre eles.</p>
      </header>

      {summary.length === 0 ? (
        <Card><EmptyState message="Sem dados" hint="Lance meses na aba Lançar" /></Card>
      ) : (
        <>
          {/* Cards por ano */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
            {summary.map(s => (
              <div key={s.year} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold text-[14px]">{s.year}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)] font-mono">{s.monthCount} {s.monthCount === 1 ? 'mês' : 'meses'}</div>
                </div>
                <div className={`font-semibold text-[19px] leading-none ${s.balance >= 0 ? 'pos' : 'neg'}`}>
                  <Money value={s.balance} signed />
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)] mt-1">resultado do ano</div>
                <div className="mt-3 pt-3 border-t border-[var(--hairline)] flex flex-col gap-1.5 text-[12px]">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[var(--color-text-muted)]">Receita</span>
                    <span className="pos"><Money value={s.revenue} /></span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[var(--color-text-muted)]">Despesas</span>
                    <span className="text-[var(--color-text-primary)]"><Money value={s.totalExpenses} /></span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Comparativo */}
          <Card title="Comparativo anual" className="mb-4">
            <AnnualChart data={summary} />
          </Card>

          {/* Tabela */}
          <Card title="Detalhamento por ano">
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-[13px] min-w-[620px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="label px-4 py-2.5 text-left">Ano</th>
                    <th className={numTh}>Receitas</th>
                    <th className={numTh}>Fixos</th>
                    <th className={numTh}>Empréstimos</th>
                    <th className={numTh}>Cartões</th>
                    <th className={numTh}>Balanço</th>
                    <th className={numTh}>Média/mês</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(s => (
                    <tr key={s.year} className="hover:bg-[var(--color-surface-2)] transition-colors">
                      <td className="px-4 py-3 font-semibold border-b border-[var(--hairline)]">{s.year}</td>
                      <td className={`${numTd} pos`}>{fmtNum(s.revenue)}</td>
                      <td className={`${numTd} text-[var(--color-text-muted)]`}>{fmtNum(s.fixedCosts)}</td>
                      <td className={`${numTd} text-[var(--color-text-muted)]`}>{fmtNum(s.loans)}</td>
                      <td className={`${numTd} text-[var(--color-text-muted)]`}>{fmtNum(s.cards)}</td>
                      <td className={`${numTd} font-semibold ${s.balance >= 0 ? 'pos' : 'neg'}`}>{fmtNumSigned(s.balance)}</td>
                      <td className={`${numTd} ${s.avgBalance >= 0 ? 'pos' : 'neg'}`}>{fmtNumSigned(s.avgBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-3 px-1">Valores em R$.</p>
          </Card>
        </>
      )}
    </div>
  )
}
