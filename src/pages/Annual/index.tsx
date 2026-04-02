import { useMemo } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { buildAnnualSummary } from '@/lib/calculations'
import { fmt, fmtSigned } from '@/lib/formatters'
import Card from '@/components/ui/Card'
import AnnualChart from '@/components/charts/AnnualChart'

export default function AnnualPage() {
  const { allMonths } = useFinanceStore()
  const summary = useMemo(() => buildAnnualSummary(allMonths), [allMonths])

  return (
    <div>
      <h1 className="text-[20px] font-semibold mb-5">Resumo Anual</h1>

      {/* Annual cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        {summary.map(s => (
          <div key={s.year} className="card">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-[13px] text-[#6B6860]">{s.year}</div>
              <div className="text-[11px] text-[#6B6860] font-mono">{s.monthCount} meses</div>
            </div>
            <div className={`font-mono font-semibold text-[17px] ${s.balance >= 0 ? 'pos' : 'neg'}`}>
              {fmtSigned(s.balance)}
            </div>
            <div className="mt-2 pt-2 border-t border-[#E8E6E0] grid grid-cols-2 gap-y-1 text-[11px]">
              <span className="text-[#6B6860]">Receita</span>
              <span className="font-mono text-right pos">{fmt(s.revenue)}</span>
              <span className="text-[#6B6860]">Despesas</span>
              <span className="font-mono text-right neg">{fmt(s.totalExpenses)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Annual comparison chart */}
      <Card title="Comparativo anual" className="mb-4">
        <AnnualChart data={summary} />
      </Card>

      {/* Full table */}
      <Card title="Detalhamento por ano">
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-[13px] min-w-[540px]">
            <thead>
              <tr>
                {['Ano', 'Receitas', 'Custos Fixos', 'Empréstimos', 'Cartões', 'Balanço', 'Média/mês'].map(h => (
                  <th key={h} className="label px-5 py-2.5 text-left border-b border-[#E8E6E0]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.map(s => (
                <tr key={s.year} className="hover:bg-[#F7F6F3] transition-colors">
                  <td className="px-5 py-3 font-semibold border-b border-[#E8E6E0]">{s.year}</td>
                  <td className="px-5 py-3 font-mono border-b border-[#E8E6E0] pos">{fmt(s.revenue)}</td>
                  <td className="px-5 py-3 font-mono border-b border-[#E8E6E0] text-[#6B6860]">{fmt(s.fixedCosts)}</td>
                  <td className="px-5 py-3 font-mono border-b border-[#E8E6E0] text-[#6B6860]">{fmt(s.loans)}</td>
                  <td className="px-5 py-3 font-mono border-b border-[#E8E6E0] neg">{fmt(s.cards)}</td>
                  <td className={`px-5 py-3 font-mono font-semibold border-b border-[#E8E6E0] ${s.balance >= 0 ? 'pos' : 'neg'}`}>
                    {fmtSigned(s.balance)}
                  </td>
                  <td className={`px-5 py-3 font-mono border-b border-[#E8E6E0] ${s.avgBalance >= 0 ? 'pos' : 'neg'}`}>
                    {fmtSigned(s.avgBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
