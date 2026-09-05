import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { MonthPoint } from '@/types/finance'
import Money from '@/components/ui/Money'

interface Props {
  month: MonthPoint | null
  label: string
}

// A pagar / a receber do mês — deriva do que já existe: itens marcados como
// pagos entram no "consolidado"; o que falta é total − consolidado.
export default function PayablesPanel({ month, label }: Props) {
  const data = useMemo(() => {
    if (!month) return null
    const toPay = Math.max(0, month.totalExpenses - month.consolidatedExpenses)
    const toReceive = Math.max(0, month.revenue - month.consolidatedRevenue)
    const items = month.items ?? []
    const pendingPay = items
      .filter(i => i.category !== 'revenue' && !i.isPaid)
      .sort((a, b) => b.value - a.value)
    const payProgress = month.totalExpenses > 0 ? (month.consolidatedExpenses / month.totalExpenses) * 100 : 100
    const recProgress = month.revenue > 0 ? (month.consolidatedRevenue / month.revenue) * 100 : 100
    return { toPay, toReceive, pendingPay, payProgress, recProgress, paidCount: items.filter(i => i.category !== 'revenue' && i.isPaid).length, payCount: items.filter(i => i.category !== 'revenue').length }
  }, [month])

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="section-head label">A pagar &amp; a receber</div>
        <span className="text-[11px] text-[var(--color-text-muted)] font-mono">{label}</span>
      </div>

      {!data ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6 gap-1.5">
          <p className="text-[12px] text-[var(--color-text-muted)]">Sem lançamentos neste mês.</p>
          <Link to="/lancar" className="text-[12px] font-medium text-[var(--color-chart-blue)] hover:underline">Lançar agora →</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4 flex-1">
          {/* A pagar */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-[var(--color-text-muted)]">Falta pagar</span>
              <span className={`font-semibold text-[18px] ${data.toPay > 0.005 ? 'neg' : 'pos'}`}>
                <Money value={data.toPay} />
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden mt-2">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${data.payProgress}%`, background: 'var(--color-pos)' }} />
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)] mt-1.5">
              {data.paidCount}/{data.payCount} pagos · de <span className="font-mono tnum">{money(month!.totalExpenses)}</span>
            </div>
          </div>

          {/* Itens pendentes — acionável */}
          {data.pendingPay.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {data.pendingPay.slice(0, 3).map(it => (
                <div key={it.id} className="flex items-center justify-between text-[12.5px]">
                  <span className="flex items-center gap-2 min-w-0 text-[var(--color-text-muted)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-chart-amber)] flex-shrink-0" />
                    <span className="truncate">{it.description}</span>
                  </span>
                  <span className="font-mono tnum text-[var(--color-text-primary)] flex-shrink-0 ml-2"><Money value={it.value} /></span>
                </div>
              ))}
              {data.pendingPay.length > 3 && (
                <Link to="/lancar" className="text-[11px] text-[var(--color-chart-blue)] hover:underline mt-0.5">
                  +{data.pendingPay.length - 3} pendentes →
                </Link>
              )}
            </div>
          )}

          {/* A receber */}
          <div className="mt-auto pt-4 border-t border-[var(--hairline)]">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-[var(--color-text-muted)]">Falta receber</span>
              <span className={`font-semibold text-[16px] ${data.toReceive > 0.005 ? 'text-[var(--color-text-primary)]' : 'pos'}`}>
                <Money value={data.toReceive} />
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden mt-2">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${data.recProgress}%`, background: 'var(--color-chart-green)' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function money(v: number) {
  return 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
