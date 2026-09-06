import { useState, useMemo } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { fmtNum, fmtNumSigned } from '@/lib/formatters'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/types/finance'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { fmtK } from '@/lib/formatters'
import ChartTooltip from '@/components/charts/ChartTooltip'
import { useChartColors } from '@/hooks/useChartColors'

type CategoryKey = 'revenue' | 'fixedCosts' | 'variableCosts' | 'loans' | 'cards'
const CAT_PILLS: { key: CategoryKey; label: string }[] = [
  { key: 'revenue',       label: 'Receitas' },
  { key: 'fixedCosts',    label: 'Custos Fixos' },
  { key: 'variableCosts', label: 'Variáveis' },
  { key: 'loans',         label: 'Empréstimos' },
  { key: 'cards',         label: 'Cartões' },
]

export default function MonthlyPage() {
  const c = useChartColors()
  const { years, selectedYear, setSelectedYear } = useFinanceStore()
  const rawMonths = useFinanceStore(s => s.allMonths)
  const historyCutoff = useFinanceStore(s => s.historyCutoff)
  const visibleFn = useFinanceStore(s => s.visibleMonths)
  const allMonths = useMemo(() => visibleFn(), [rawMonths, historyCutoff, visibleFn])
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
  const [trendCategory, setTrendCategory] = useState<CategoryKey>('revenue')

  const yearList = years()
  const currentYear = selectedYear === 'all'
    ? (yearList.length > 0 ? yearList[yearList.length - 1] : new Date().getFullYear())
    : selectedYear

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const monthsForYear = useMemo(
    () => allMonths.filter(m => m.year === currentYear),
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    [allMonths, currentYear]
  )

  const trendData = monthsForYear.map(m => {
    const raw = m[trendCategory] as number
    const value = isFinite(raw) ? Math.round(raw) : 0
    return { name: m.label, value }
  })

  const totals = useMemo(() => ({
    revenue:       monthsForYear.reduce((s, m) => s + m.revenue, 0),
    fixedCosts:    monthsForYear.reduce((s, m) => s + m.fixedCosts, 0),
    variableCosts: monthsForYear.reduce((s, m) => s + m.variableCosts, 0),
    loans:         monthsForYear.reduce((s, m) => s + m.loans, 0),
    cards:         monthsForYear.reduce((s, m) => s + m.cards, 0),
    balance:       monthsForYear.reduce((s, m) => s + m.balance, 0),
  }), [monthsForYear])

  const numTh = 'label px-4 py-2.5 text-right'
  const numTd = 'px-4 py-3 font-mono tnum text-right border-b border-[var(--hairline)]'

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-[21px] font-semibold tracking-[-0.01em]">Detalhamento Mensal</h1>
        <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">Evolução mês a mês e composição de cada mês em {currentYear}.</p>
      </header>

      {/* Seletor de ano */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {yearList.map(y => (
          <button key={y} className={`pill ${currentYear === y ? 'active' : ''}`} onClick={() => setSelectedYear(y)}>{y}</button>
        ))}
      </div>

      {/* Gráfico de evolução */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="section-head label">Evolução {currentYear}</div>
          <div className="flex flex-wrap gap-1">
            {CAT_PILLS.map(cat => (
              <button
                key={cat.key}
                className={`pill ${trendCategory === cat.key ? 'active' : ''}`}
                style={{ fontSize: 11 }}
                onClick={() => setTrendCategory(cat.key)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
        {monthsForYear.length > 0 ? (
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: c.axis, fontFamily: 'DM Mono' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: c.axis, fontFamily: 'DM Mono' }} tickLine={false} axisLine={false} tickFormatter={fmtK} width={52} />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone" dataKey="value"
                name={CATEGORY_LABELS[trendCategory]}
                stroke={CATEGORY_COLORS[trendCategory]}
                strokeWidth={2.25}
                dot={{ r: 2.5, fill: CATEGORY_COLORS[trendCategory], strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="Sem dados para este ano" />
        )}
      </Card>

      {/* Tabela mensal */}
      <Card>
        {monthsForYear.length === 0 ? (
          <EmptyState message="Sem dados para este ano" hint="Lance um mês na aba Lançar" />
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-[13px] min-w-[680px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="label px-4 py-2.5 text-left">Mês</th>
                  <th className={numTh}>Receitas</th>
                  <th className={numTh}>Fixos</th>
                  <th className={numTh}>Variáveis</th>
                  <th className={numTh}>Empréstimos</th>
                  <th className={numTh}>Cartões</th>
                  <th className={numTh}>Balanço</th>
                </tr>
              </thead>
              <tbody>
                {monthsForYear.map(m => {
                  const key = `${m.year}-${m.month}`
                  const isExpanded = expandedMonth === key
                  const hasItems = !!(m.items && m.items.length > 0)
                  return (
                    <>
                      <tr
                        key={key}
                        className={`transition-colors ${hasItems ? 'cursor-pointer hover:bg-[var(--color-surface-2)]' : ''}`}
                        onClick={() => hasItems && setExpandedMonth(isExpanded ? null : key)}
                      >
                        <td className="px-4 py-3 font-medium border-b border-[var(--hairline)]">
                          <div className="flex items-center gap-2">
                            {hasItems && (
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className={`text-[var(--color-text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                            <span>{m.month}</span>
                            {m.source === 'manual' && <Badge variant="manual" size="sm">manual</Badge>}
                          </div>
                        </td>
                        <td className={`${numTd} pos`}>{fmtNum(m.revenue)}</td>
                        <td className={`${numTd} text-[var(--color-text-muted)]`}>{fmtNum(m.fixedCosts)}</td>
                        <td className={`${numTd} text-[var(--color-text-muted)]`}>{fmtNum(m.variableCosts)}</td>
                        <td className={`${numTd} text-[var(--color-text-muted)]`}>{fmtNum(m.loans)}</td>
                        <td className={`${numTd} text-[var(--color-text-muted)]`}>{fmtNum(m.cards)}</td>
                        <td className={`${numTd} font-semibold ${m.balance >= 0 ? 'pos' : 'neg'}`}>{fmtNumSigned(m.balance)}</td>
                      </tr>
                      {isExpanded && hasItems && (
                        <tr key={`${key}-detail`}>
                          <td colSpan={7} className="border-b border-[var(--hairline)] bg-[var(--color-surface-2)]">
                            <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                              {(['revenue', 'fixedCosts', 'variableCosts', 'loans', 'cards'] as CategoryKey[]).map(cat => {
                                const items = m.items!.filter(i => i.category === cat)
                                if (!items.length) return null
                                return (
                                  <div key={cat}>
                                    <div className="label mb-1.5 flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: CATEGORY_COLORS[cat] }} />
                                      {CATEGORY_LABELS[cat]}
                                    </div>
                                    {items.map(item => (
                                      <div key={item.id} className="flex items-center justify-between py-1 text-[12px]">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.isPaid ? 'bg-[var(--color-pos)]' : 'bg-[var(--color-chart-amber)]'}`} />
                                          <span className="text-[var(--color-text-primary)] truncate">{item.description}</span>
                                        </div>
                                        <span className="font-mono tnum text-[var(--color-text-primary)] flex-shrink-0 ml-2">{fmtNum(item.value)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold bg-[var(--color-surface-2)]">
                  <td className="px-4 py-3 text-[12px] text-[var(--color-text-muted)]">Total {currentYear}</td>
                  <td className="px-4 py-3 font-mono tnum text-right pos">{fmtNum(totals.revenue)}</td>
                  <td className="px-4 py-3 font-mono tnum text-right text-[var(--color-text-muted)]">{fmtNum(totals.fixedCosts)}</td>
                  <td className="px-4 py-3 font-mono tnum text-right text-[var(--color-text-muted)]">{fmtNum(totals.variableCosts)}</td>
                  <td className="px-4 py-3 font-mono tnum text-right text-[var(--color-text-muted)]">{fmtNum(totals.loans)}</td>
                  <td className="px-4 py-3 font-mono tnum text-right text-[var(--color-text-muted)]">{fmtNum(totals.cards)}</td>
                  <td className={`px-4 py-3 font-mono tnum text-right ${totals.balance >= 0 ? 'pos' : 'neg'}`}>{fmtNumSigned(totals.balance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-[11px] text-[var(--color-text-muted)] mt-3 px-1">Valores em R$. Clique num mês com lançamentos para ver o detalhe.</p>
      </Card>
    </div>
  )
}
