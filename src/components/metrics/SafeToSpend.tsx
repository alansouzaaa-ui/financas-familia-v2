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
  const accent = positive ? 'var(--color-pos)' : 'var(--color-neg)'

  return (
    <div
      className="rise relative overflow-hidden mb-5 border border-[var(--color-border)] p-5 md:p-7"
      style={{
        borderRadius: 'var(--r-card)',
        background: 'var(--hero-glow), var(--color-surface)',
        boxShadow: 'var(--shadow-hero)',
      }}
    >
      {/* faixa-assinatura à esquerda, na cor do veredito */}
      <span aria-hidden className="absolute left-0 top-5 bottom-5 w-[3px] rounded-full" style={{ background: accent, opacity: 0.9 }} />

      <div className="flex items-start justify-between gap-5 flex-wrap pl-3 md:pl-4">
        <div className="min-w-0 max-w-[52ch]">
          <div className="label" style={{ color: accent }}>
            {positive ? 'Posso gastar' : 'Acima do orçamento'} · {data.label}
          </div>
          <div className={`font-mono font-medium text-[clamp(34px,7vw,52px)] leading-[0.95] tracking-[-0.025em] mt-3 ${positive ? 'pos' : 'neg'}`}>
            <Money value={data.available} />
          </div>
          <p className="serif text-[clamp(15px,2.4vw,18px)] leading-snug text-[var(--color-text-primary)] mt-4">
            {positive
              ? (data.perDay !== null
                  ? <>Dá pra gastar cerca de <span className="font-mono" style={{ color: accent }}>{fmt(data.perDay)}</span> por dia nos {data.daysLeft} dias que faltam — sem ficar no vermelho.</>
                  : <>Sobra depois de todas as despesas já lançadas de {data.label}.</>)
              : <>As despesas de {data.label} já superam a renda. Segure gastos novos até equilibrar.</>}
          </p>
        </div>
        {data.isCurrent && (
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className="label !tracking-[0.08em]">dia {data.dayNum} de {data.daysInMonth}</span>
            <div className="w-[128px] h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${elapsedPct}%`, background: 'var(--color-primary)' }} />
            </div>
            <span className="text-[11px] text-[var(--color-text-muted)]">{data.daysLeft} dias restantes</span>
          </div>
        )}
      </div>
    </div>
  )
}
