import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import PageHeader from '@/components/ui/PageHeader'
import Input from '@/components/ui/Input'
import ChartTooltip from '@/components/charts/ChartTooltip'
import { useChartColors } from '@/hooks/useChartColors'
import { useInvestmentStore } from '@/stores/useInvestmentStore'
import { useAllocationStore } from '@/stores/useAllocationStore'
import { useJourneyPlan } from '@/hooks/useJourneyPlan'
import { fetchRates, DEFAULT_RATES, type Rates } from '@/lib/ratesService'
import { fmt, fmtFull, fmtK } from '@/lib/formatters'
import { addMonthsLabel } from '@/lib/journey'
import {
  simulateGrowth,
  monthsToTarget,
  requiredMonthly,
  compareFixedIncome,
  retirementPlan,
} from '@/lib/simulators'

type Tab = 'juros' | 'aposentadoria' | 'rendafixa'
type Mode = 'futuro' | 'prazo' | 'aporte'

const TABS: { value: Tab; label: string }[] = [
  { value: 'juros', label: 'Juros compostos' },
  { value: 'aposentadoria', label: 'Aposentadoria' },
  { value: 'rendafixa', label: 'Renda fixa' },
]
const MODES: { value: Mode; label: string }[] = [
  { value: 'futuro', label: 'Quanto vou ter' },
  { value: 'prazo', label: 'Quando chego lá' },
  { value: 'aporte', label: 'Quanto aportar' },
]
const MAX_MONTHS = 1200

function Segmented<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      {label && <div className="label mb-1.5">{label}</div>}
      <div className="flex rounded-xl border border-[var(--color-border)] overflow-hidden">
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 px-2 sm:px-3 py-2 text-[12px] font-medium transition-colors ${value === o.value ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Valor padrão (vindo das taxas) até o usuário editar; depois vale o que ele digitou.
function useDefaulted(def: string): [string, (v: string) => void] {
  const [over, setOver] = useState<string | null>(null)
  return [over ?? def, setOver]
}

function num(s: string): number {
  const v = Number(s.replace(',', '.'))
  return isFinite(v) ? v : 0
}

function NumInput({ label, value, onChange, step = '1', min = '0', disabled }: { label: string; value: string; onChange: (v: string) => void; step?: string; min?: string; disabled?: boolean }) {
  return (
    <Input
      label={label}
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
    />
  )
}

function Result({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl p-4 mt-4" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
      <p className="serif text-[clamp(20px,4.6vw,28px)] tracking-[-0.01em] leading-tight" style={{ color: 'var(--color-primary)' }}>{children}</p>
      {sub && <p className="text-[12px] text-[var(--color-text-muted)] mt-1.5">{sub}</p>}
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-[var(--color-text-muted)] mt-3">{children}</p>
}

function yearsMonthsText(months: number): string {
  const y = Math.floor(months / 12)
  const m = months % 12
  const parts: string[] = []
  if (y > 0) parts.push(`${y} ${y === 1 ? 'ano' : 'anos'}`)
  if (m > 0 || y === 0) parts.push(`${m} ${m === 1 ? 'mês' : 'meses'}`)
  return parts.join(' e ')
}

function fmtRefDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return d
}

function GrowthChart({ points }: { points: { month: number; invested: number; total: number }[] }) {
  const c = useChartColors()
  const data = points.map(p => ({ year: p.month / 12, Investido: Math.round(p.invested), Total: Math.round(p.total) }))
  const renderTip = ({ active, payload, label }: { active?: boolean; payload?: unknown; label?: unknown }) => (
    <ChartTooltip
      active={active}
      payload={payload as ComponentProps<typeof ChartTooltip>['payload']}
      label={`Ano ${Number(label).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`}
    />
  )
  return (
    <div className="mt-4">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gradSimTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.green} stopOpacity={0.45} />
              <stop offset="100%" stopColor={c.green} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="gradSimInv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.blue} stopOpacity={0.4} />
              <stop offset="100%" stopColor={c.blue} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
          <XAxis
            dataKey="year"
            type="number"
            domain={[0, 'dataMax']}
            tick={{ fontSize: 10, fill: c.axis, fontFamily: 'DM Mono' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${Math.round(v)}a`}
            dy={4}
          />
          <YAxis
            tick={{ fontSize: 10, fill: c.axis, fontFamily: 'DM Mono' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtK}
            width={52}
          />
          <Tooltip content={renderTip} />
          <Area type="monotone" dataKey="Total" stroke={c.green} strokeWidth={2} fill="url(#gradSimTotal)" />
          <Area type="monotone" dataKey="Investido" stroke={c.blue} strokeWidth={2} fill="url(#gradSimInv)" />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex gap-4 text-[11px] text-[var(--color-text-muted)] mt-1 pl-1">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: c.blue }} />Investido</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: c.green }} />Total</span>
      </div>
    </div>
  )
}

interface Shared {
  wealth: number
  aporte: number
  rates: Rates | null
}

function CompoundTab({ wealth, aporte, rates }: Shared) {
  const [mode, setMode] = useState<Mode>('futuro')
  const [initial, setInitial] = useState(String(wealth))
  const [monthly, setMonthly] = useState(String(aporte))
  const [rate, setRate] = useDefaulted(String(rates?.cdi ?? DEFAULT_RATES.cdi))
  const [years, setYears] = useState('10')
  const [target, setTarget] = useState('1000000')


  const i0 = num(initial)
  const m0 = num(monthly)
  const r0 = num(rate)
  const yrs = Math.max(0, num(years))
  const tgt = num(target)
  const months = Math.min(MAX_MONTHS, Math.round(yrs * 12))

  const calc = useMemo(() => {
    const now = new Date()
    if (mode === 'futuro') {
      const g = simulateGrowth({ initial: i0, monthly: m0, annualRatePct: r0, months })
      return { g, headline: `Em ${yrs} ${yrs === 1 ? 'ano' : 'anos'} você terá ${fmtFull(g.final)}`, sub: `${fmtFull(g.invested)} investido · ${fmtFull(g.interest)} de juros` as string | null }
    }
    if (mode === 'prazo') {
      const n = monthsToTarget({ initial: i0, monthly: m0, annualRatePct: r0, target: tgt, maxMonths: MAX_MONTHS })
      if (n === null) {
        const g = simulateGrowth({ initial: i0, monthly: m0, annualRatePct: r0, months: MAX_MONTHS })
        return { g, headline: 'Com esses valores a meta não é atingida em 100 anos', sub: null as string | null }
      }
      const g = simulateGrowth({ initial: i0, monthly: m0, annualRatePct: r0, months: n })
      return { g, headline: `Você chega a ${fmtFull(tgt)} em ${yearsMonthsText(n)} (${addMonthsLabel(now, n)})`, sub: n === 0 ? 'Seu valor inicial já atinge a meta.' : `${fmtFull(g.invested)} investido · ${fmtFull(g.interest)} de juros` }
    }
    const req = requiredMonthly({ initial: i0, annualRatePct: r0, months, target: tgt })
    const g = simulateGrowth({ initial: i0, monthly: isFinite(req) ? req : 0, annualRatePct: r0, months })
    const headline = !isFinite(req)
      ? 'Informe um prazo maior que zero'
      : req === 0
        ? 'Seu valor inicial já chega lá sem aportes'
        : `Aporte ${fmtFull(req)} por mês para chegar a ${fmtFull(tgt)} em ${yrs} ${yrs === 1 ? 'ano' : 'anos'}`
    return { g, headline, sub: isFinite(req) && req > 0 ? `${fmtFull(g.invested)} investido · ${fmtFull(g.interest)} de juros` : null }
  }, [mode, i0, m0, r0, months, yrs, tgt])

  const ipca = rates?.ipca12m ?? DEFAULT_RATES.ipca12m
  const cdi = rates?.cdi ?? DEFAULT_RATES.cdi
  const realRate = ((1 + cdi / 100) / (1 + ipca / 100) - 1) * 100

  return (
    <div className="card">
      <Segmented value={mode} options={MODES} onChange={setMode} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        <NumInput label="Valor inicial (R$)" value={initial} onChange={setInitial} step="100" />
        {mode !== 'aporte' && <NumInput label="Aporte mensal (R$)" value={monthly} onChange={setMonthly} step="50" />}
        <NumInput label="Taxa anual (% a.a.)" value={rate} onChange={setRate} step="0.1" min="-100" />
        {mode !== 'prazo' && <NumInput label="Prazo (anos)" value={years} onChange={setYears} />}
        {mode !== 'futuro' && <NumInput label="Meta (ex.: primeiro milhão)" value={target} onChange={setTarget} step="10000" />}
      </div>
      <Result sub={calc.sub}>{calc.headline}</Result>
      <GrowthChart points={calc.g.points} />
      <Note>
        Taxa nominal, sem descontar inflação e IR. Para valores em dinheiro de hoje use a taxa real (ex.: CDI − IPCA ≈ {realRate.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%).
      </Note>
    </div>
  )
}

function RetirementTab({ wealth }: Shared) {
  const [age, setAge] = useState('35')
  const [retireAge, setRetireAge] = useState('60')
  const [income, setIncome] = useState('8000')
  const [current, setCurrent] = useState(String(wealth))
  const [real, setReal] = useState('5')

  const a = num(age)
  const ra = num(retireAge)
  const invalid = ra <= a
  const plan = useMemo(
    () => retirementPlan({ currentAge: a, retireAge: ra, monthlyIncome: num(income), currentWealth: num(current), realAnnualPct: num(real) }),
    [a, ra, income, current, real],
  )
  const yrs = plan.months / 12

  return (
    <div className="card">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NumInput label="Idade atual" value={age} onChange={setAge} />
        <NumInput label="Idade para se aposentar" value={retireAge} onChange={setRetireAge} />
        <NumInput label="Renda mensal desejada (R$)" value={income} onChange={setIncome} step="500" />
        <NumInput label="Patrimônio atual (R$)" value={current} onChange={setCurrent} step="1000" />
        <NumInput label="Rentabilidade real (% a.a. acima da inflação)" value={real} onChange={setReal} step="0.1" />
      </div>
      {invalid ? (
        <Result>A idade de aposentadoria deve ser maior que a idade atual</Result>
      ) : !isFinite(plan.requiredWealth) ? (
        <Result>Informe uma rentabilidade real maior que zero</Result>
      ) : (
        <Result sub={`Sem novos aportes, seu patrimônio atual viraria ${fmtFull(plan.projectedWealth)}`}>
          Você precisa de {fmtFull(plan.requiredWealth)}
          <span className="block text-[0.7em] mt-1" style={{ color: 'var(--color-text-primary)' }}>
            {plan.requiredMonthly > 0
              ? `Aporte ${fmtFull(plan.requiredMonthly)}/mês por ${yrs.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos`
              : 'Seu patrimônio atual já chega lá sem novos aportes'}
          </span>
        </Result>
      )}
      <Note>Valores em dinheiro de hoje (taxa real). Modelo de viver de renda: o patrimônio não é consumido.</Note>
    </div>
  )
}

function FixedIncomeTab({ rates }: Shared) {
  const [amount, setAmount] = useState('10000')
  const [months, setMonths] = useState('12')
  const [cdbPct, setCdbPct] = useState('100')
  const [lciPct, setLciPct] = useState('90')
  const [cdi, setCdi] = useDefaulted(String(rates?.cdi ?? DEFAULT_RATES.cdi))
  const [selic, setSelic] = useDefaulted(String(rates?.selic ?? DEFAULT_RATES.selic))
  const [poup, setPoup] = useDefaulted(String(rates?.poupancaMonthly ?? DEFAULT_RATES.poupancaMonthly))


  const rows = useMemo(
    () => compareFixedIncome({
      amount: num(amount), months: Math.max(1, Math.round(num(months))),
      cdiAnnualPct: num(cdi), selicAnnualPct: num(selic), poupancaMonthlyPct: num(poup),
      cdbPctCdi: num(cdbPct), lciPctCdi: num(lciPct),
    }),
    [amount, months, cdi, selic, poup, cdbPct, lciPct],
  )
  const poupRow = rows.find(r => r.id === 'poupanca')
  const best = rows[0]
  const diff = best && poupRow ? best.net - poupRow.net : 0

  return (
    <div className="card">
      <div className="grid grid-cols-2 gap-3">
        <NumInput label="Valor (R$)" value={amount} onChange={setAmount} step="500" />
        <NumInput label="Prazo (meses)" value={months} onChange={setMonths} min="1" />
        <NumInput label="CDB (% do CDI)" value={cdbPct} onChange={setCdbPct} />
        <NumInput label="LCI/LCA (% do CDI)" value={lciPct} onChange={setLciPct} />
      </div>
      <details className="mt-3">
        <summary className="text-[12px] font-medium cursor-pointer" style={{ color: 'var(--color-primary)' }}>Ajustar taxas</summary>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <NumInput label="CDI (% a.a.)" value={cdi} onChange={setCdi} step="0.05" />
          <NumInput label="Selic (% a.a.)" value={selic} onChange={setSelic} step="0.05" />
          <NumInput label="Poupança (% a.m.)" value={poup} onChange={setPoup} step="0.01" />
        </div>
      </details>

      <div className="mt-4 flex flex-col gap-2.5">
        {rows.map((r, idx) => (
          <div key={r.id} className="rounded-xl p-3.5" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{r.label}</span>
                  {idx === 0 && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white" style={{ background: 'var(--color-pos)' }}>Melhor</span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                  {r.taxFree ? 'Isento de IR' : `IR ${fmtFull(r.ir)} · taxas ${fmtFull(r.fees)}`}
                </p>
                <p className="text-[11px] text-[var(--color-text-muted)]">{r.note}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="serif text-[18px] tracking-[-0.01em]" style={{ color: 'var(--color-text-primary)' }}>{fmtFull(r.net)}</div>
                <div className="text-[11px] font-mono" style={{ color: r.netGain >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}>
                  {r.netGain >= 0 ? '+' : '−'}{fmtFull(r.netGain)}
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)]">{r.netAnnualPct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.a. líq.</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {best && poupRow && best.id !== 'poupanca' && diff > 0 && (
        <Result>{fmt(diff)} a mais que a poupança</Result>
      )}
      <Note>Simulação simplificada: IR regressivo por prazo, custódia B3 do Tesouro (0,20% a.a. acima de R$ 10 mil), sem IOF (prazos &lt; 30 dias).</Note>
    </div>
  )
}

function readTab(): Tab {
  try {
    const v = localStorage.getItem('sim-tab')
    if (v === 'juros' || v === 'aposentadoria' || v === 'rendafixa') return v
  } catch { /* ignore */ }
  return 'juros'
}

export default function SimulatorsPage() {
  const positions = useInvestmentStore(s => s.positions)
  const allocAporte = useAllocationStore(s => s.aporte)
  const plan = useJourneyPlan()
  const [tab, setTab] = useState<Tab>(readTab)
  const [rates, setRates] = useState<Rates | null>(null)

  useEffect(() => {
    let alive = true
    fetchRates().then(r => { if (alive) setRates(r) }).catch(() => { if (alive) setRates({ ...DEFAULT_RATES }) })
    return () => { alive = false }
  }, [])

  function changeTab(t: Tab) {
    setTab(t)
    try { localStorage.setItem('sim-tab', t) } catch { /* ignore */ }
  }

  const wealth = useMemo(
    () => Math.round(positions.reduce((s, p) => s + (p.manualValue ?? p.quantity * p.avgPrice), 0)),
    [positions],
  )
  const aporte = allocAporte > 0 ? allocAporte : Math.max(0, Math.round(plan.surplus.avg)) || 500

  const shared: Shared = { wealth, aporte, rates }

  return (
    <div>
      <PageHeader
        eyebrow="Planejamento"
        title="Simuladores"
        subtitle="Projete juros compostos, aposentadoria e compare renda fixa com as taxas de hoje."
      />

      <div className="card mb-4">
        <p className="label mb-2">Taxas de referência</p>
        {!rates ? (
          <p className="text-[12px] text-[var(--color-text-muted)] animate-pulse">carregando…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {[
                `Selic ${rates.selic.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`,
                `CDI ${rates.cdi.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`,
                `IPCA 12m ${rates.ipca12m.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`,
                `Poupança ${rates.poupancaMonthly.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.m.`,
              ].map(t => (
                <span key={t} className="text-[12px] font-mono px-2.5 py-1 rounded-full" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>{t}</span>
              ))}
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-2">
              {rates.source === 'bcb'
                ? `Fonte: Banco Central${rates.refDate ? ' · ' + fmtRefDate(rates.refDate) : ''}`
                : 'Valores de referência (Banco Central indisponível)'}
            </p>
          </>
        )}
      </div>

      <div className="mb-4">
        <Segmented value={tab} options={TABS} onChange={changeTab} />
      </div>

      {tab === 'juros' && <CompoundTab {...shared} />}
      {tab === 'aposentadoria' && <RetirementTab {...shared} />}
      {tab === 'rendafixa' && <FixedIncomeTab {...shared} />}
    </div>
  )
}
