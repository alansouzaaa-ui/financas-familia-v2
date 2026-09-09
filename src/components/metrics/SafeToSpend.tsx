import { useMemo } from 'react'
import type { MonthPoint } from '@/types/finance'
import { fmt } from '@/lib/formatters'
import Money from '@/components/ui/Money'

interface Props {
  month: MonthPoint | null
}

const MONTHS_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'] as const

// "Posso gastar" — o número da decisão. Quanto ainda dá pra gastar no mês sem
// ficar no vermelho (receita − despesas já lançadas) e a média por dia até o
// fim do mês. Reformula o balanço em algo acionável (estilo PocketGuard/Simplifi).
export default function SafeToSpend({ month }: Props) {
  const data = useMemo(() => {
    if (!month) return null
    const now = new Date()
    const curIdx = now.getMonth()
    const isCurrent = month.month === MONTHS_ABR[curIdx] && month.year === now.getFullYear()
    const available = month.revenue - month.totalExpenses
    const daysInMonth = new Date(now.getFullYear(), curIdx + 1, 0).getDate()
    const dayNum = now.getDate()
    const daysLeft = Math.max(1, daysInMonth - dayNum + 1)
    const perDay = available > 0 && isCurrent ? available / daysLeft : null
    return { available, perDay, daysLeft, dayNum, daysInMonth, isCurrent, label: month.label }
  }, [month])

  if (!data) return null

  const positive = data.available >= 0
  const elapsedPct = Math.min(100, Math.round((data.dayNum / data.daysInMonth) * 100))

  return (
    <div
      className="relative overflow-hidden rounded-[18px] border border-[var(--color-border)] p-5 md:p-6 mb-5"
      style={{
        background: positive
          ? 'radial-gradient(120% 140% at 90% -20%, color-mix(in srgb, var(--color-pos) 12%, transparent), transparent 55%), var(--color-surface)'
          : 'radial-gradient(120% 140% at 90% -20%, color-mix(in srgb, var(--color-neg) 12%, transparent), transparent 55%), var(--color-surface)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="section-head label">{positive ? 'Posso gastar' : 'Acima do orçamento'} · {data.label}</div>
          <div className={`font-mono font-medium text-[clamp(30px,6vw,42px)] leading-none tracking-[-0.02em] mt-2.5 ${positive ? 'pos' : 'neg'}`}>
            <Money value={data.available} />
          </div>
          <p className="text-[12.5px] text-[var(--color-text-muted)] mt-2.5 max-w-[42ch]">
            {positive
              ? (data.perDay !== null
                  ? <>Dá pra gastar cerca de <span className="font-mono text-[var(--color-text-primary)]">{fmt(data.perDay)}</span> por dia nos <span className="text-[var(--color-text-primary)]">{data.daysLeft}</span> dias que faltam sem ficar no vermelho.</>
                  : <>Sobra depois de todas as despesas já lançadas de {data.label}.</>)
              : <>As despesas de {data.label} já superam a renda. Segure gastos novos até equilibrar.</>}
          </p>
        </div>
        {data.isCurrent && (
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="label !tracking-[0.08em] opacity-80">{data.dayNum}/{data.daysInMonth} do mês</span>
            <div className="w-[120px] h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${elapsedPct}%`, background: 'var(--color-text-muted)' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
