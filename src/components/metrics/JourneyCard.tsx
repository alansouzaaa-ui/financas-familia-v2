import { useJourneyPlan } from '@/hooks/useJourneyPlan'
import { addMonthsLabel } from '@/lib/journey'
import { fmtFull } from '@/lib/formatters'

const SHORT: Record<string, string> = {
  dividas: 'Quitar dívidas',
  reserva: 'Reserva',
  investir: 'Investir',
}

const plural = (n: number) => (n === 1 ? 'mês' : 'meses')

export default function JourneyCard() {
  const p = useJourneyPlan()
  const { journey, now } = p

  const debtLine = (() => {
    if (p.overdueDebt <= 0) return <span className="pos">✓ Sem dívidas vencidas</span>
    if (p.budget <= 0) {
      return (
        <span>
          Dívidas vencidas: <strong className="font-mono">{fmtFull(p.overdueDebt)}</strong> —{' '}
          <span className="neg">sem sobra para pagar; defina um valor mensal no plano de quitação.</span>
        </span>
      )
    }
    if (!p.plan.feasible || p.debtMonths === null) {
      return (
        <span>
          Dívidas vencidas: <strong className="font-mono">{fmtFull(p.overdueDebt)}</strong> —{' '}
          <span className="neg">
            com {fmtFull(p.budget)}/mês os juros ({fmtFull(p.plan.firstMonthInterest)}/mês) crescem mais rápido que o pagamento.
          </span>
        </span>
      )
    }
    return (
      <span>
        Dívidas vencidas: <strong className="font-mono">{fmtFull(p.overdueDebt)}</strong> — quitadas em ~{p.debtMonths}{' '}
        {plural(p.debtMonths)} ({addMonthsLabel(now, p.debtMonths)})
      </span>
    )
  })()

  const reserveLine = (() => {
    if (p.reserveTarget <= 0) return <span className="text-[var(--color-text-muted)]">Defina a meta da reserva em Investimentos</span>
    if (p.reserveGap <= 0) return <span className="pos">✓ Reserva completa ({fmtFull(p.reserveCurrent)})</span>
    return (
      <span>
        Reserva: {fmtFull(p.reserveCurrent)} de {fmtFull(p.reserveTarget)} —{' '}
        {p.reserveDoneInMonths !== null
          ? `completa em ~${p.reserveDoneInMonths} ${plural(p.reserveDoneInMonths)} (${addMonthsLabel(now, p.reserveDoneInMonths)})`
          : 'sem previsão com a sobra atual'}
      </span>
    )
  })()

  const investLine = (() => {
    if (journey.current === 'investir') return <span>Hora de investir com estratégia — veja &apos;Onde aportar&apos;</span>
    if (p.reserveDoneInMonths !== null) return <span>Começa a investir em {addMonthsLabel(now, p.reserveDoneInMonths)}</span>
    return null
  })()

  return (
    <div className="card mb-5">
      <p className="section-head label">Jornada</p>
      <h2 className="serif text-[clamp(18px,2.6vw,22px)] tracking-[-0.01em] mt-1">Sua jornada financeira</h2>

      <ol className="grid grid-cols-3 gap-2 mt-4">
        {journey.steps.map((s, i) => {
          const current = s.id === journey.current
          return (
            <li key={s.id} className="flex flex-col sm:flex-row items-center sm:gap-2.5 text-center sm:text-left min-w-0">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold flex-shrink-0 border-2"
                style={
                  s.done
                    ? { background: 'var(--color-pos)', borderColor: 'var(--color-pos)', color: 'white' }
                    : current
                      ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: 'white' }
                      : { background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }
                }
                aria-current={current ? 'step' : undefined}
              >
                {s.done ? '✓' : i + 1}
              </span>
              <span
                className={`text-[12px] mt-1.5 sm:mt-0 leading-tight ${current ? 'font-semibold text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}
              >
                {SHORT[s.id]}
              </span>
            </li>
          )
        })}
      </ol>

      <div className="mt-4 pt-4 border-t border-[var(--hairline)]">
        <div className="section-head label mb-2">Seu plano</div>
        <div className="flex flex-col gap-1.5 text-[13px] text-[var(--color-text-primary)]">
          <div>{debtLine}</div>
          <div>{reserveLine}</div>
          {investLine && <div>{investLine}</div>}
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-3">
          {p.budgetIsOverride
            ? `Base: ${fmtFull(p.budget)}/mês definido no plano de quitação`
            : `Base: sobra média de ${p.surplus.avg < 0 ? "−" : ""}${fmtFull(p.surplus.avg)}/mês nos últimos ${p.surplus.monthsUsed} meses`}
        </p>
        {p.surplus.avg <= 0 && !p.budgetIsOverride && (
          <p className="text-[12px] neg mt-1.5">
            Sua sobra média recente foi negativa — defina quanto pode destinar por mês no Plano de quitação.
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[12px] font-medium">
          <a href="#/dividas" style={{ color: 'var(--color-primary)' }}>Plano de quitação →</a>
          <a href="#/investimentos" style={{ color: 'var(--color-primary)' }}>Reserva e aportes →</a>
        </div>
      </div>
    </div>
  )
}
