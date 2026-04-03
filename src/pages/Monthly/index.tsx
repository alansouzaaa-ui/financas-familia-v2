import { useState, useMemo } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { fmt, fmtSigned } from '@/lib/formatters'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/types/finance'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { fmtK } from '@/lib/formatters'
import ChartTooltip from '@/components/charts/ChartTooltip'

type CategoryKey = 'revenue' | 'fixedCosts' | 'loans' | 'cards'
const CAT_PILLS: { key: CategoryKey; label: string }[] = [
  { key: 'revenue',    label: 'Receitas' },
  { key: 'fixedCosts', label: 'Custos Fixos' },
  { key: 'loans',      label: 'Empréstimos' },
  { key: 'cards',      label: 'Cartões' },
]

export default function MonthlyPage() {
  const { allMonths, years, selectedYear, setSelectedYear } = useFinanceStore()
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
  const [trendCategory, setTrendCategory] = useState<CategoryKey>('revenue')

  const yearList = years()
  const currentYear = selectedYear === 'all'
    ? (yearList.length > 0 ? yearList[yearList.length - 1] : new Date().getFullYear())
    : selectedYear

  const monthsForYear = useMemo(
    () => allMonths.filter(m => m.year === currentYear),
    [allMonths, currentYear]
  )

  const trendData = monthsForYear.map(m => {
    const raw = m[trendCategory] as number
    const value = isFinite(raw) ? Math.round(raw) : 0
    return { name: m.label, value }
  })

  return (
    <div>
      <h1 className="text-[20px] font-semibold mb-5">Detalhamento Mensal</h1>

      {/* Year pills */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {yearList.map(y => (
          <button
            key={y}
            className={`pill ${currentYear === y ? 'active' : ''}`}
            onClick={() => setSelectedYear(y)}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Trend chart */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="label">Evolução {currentYear}</div>
          <div className="flex flex-wrap gap-1">
            {CAT_PILLS.map(c => (
              <button
                key={c.key}
                className={`pill ${trendCategory === c.key ? 'active' : ''}`}
                style={{ fontSize: 11 }}
                onClick={() => setTrendCategory(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        {monthsForYear.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-text-muted)', fontFamily: 'DM Mono' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)', fontFamily: 'DM Mono' }} tickLine={false} axisLine={false} tickFormatter={fmtK} width={52} />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                name={CATEGORY_LABELS[trendCategory]}
                stroke={CATEGORY_COLORS[trendCategory]}
                strokeWidth={2}
                dot={{ r: 3, fill: CATEGORY_COLORS[trendCategory] }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="Sem dados para este ano" />
        )}
      </Card>

      {/* Monthly Table */}
      <Card>
        {monthsForYear.length === 0 ? (
          <EmptyState message="Sem dados para este ano" hint="Lance um mês na aba Lançar" />
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-[13px] min-w-[560px]">
              <thead>
                <tr>
                  {['Mês', 'Receitas', 'Fixos', 'Empréstimos', 'Cartões', 'Balanço'].map(h => (
                    <th key={h} className="label px-5 py-2.5 text-left border-b border-[var(--color-border)] first:pl-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthsForYear.map(m => {
                  const key = `${m.year}-${m.month}`
                  const isExpanded = expandedMonth === key
                  return (
                    <>
                      <tr
                        key={key}
                        className="hover:bg-[var(--color-surface-2)] cursor-pointer transition-colors"
                        onClick={() => setExpandedMonth(isExpanded ? null : key)}
                      >
                        <td className="px-5 py-3 font-medium border-b border-[var(--color-border)]">
                          <div className="flex items-center gap-2">
                            <span>{m.month}</span>
                            {m.source === 'manual' && <Badge variant="manual" size="sm">manual</Badge>}
                            {m.items && m.items.length > 0 && (
                              <svg
                                width="12" height="12" viewBox="0 0 12 12" fill="none"
                                className={`text-[#6B6860] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              >
                                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono border-b border-[var(--color-border)] pos">{fmt(m.revenue)}</td>
                        <td className="px-5 py-3 font-mono border-b border-[var(--color-border)] text-[var(--color-text-muted)]">{fmt(m.fixedCosts)}</td>
                        <td className="px-5 py-3 font-mono border-b border-[var(--color-border)] text-[var(--color-text-muted)]">{fmt(m.loans)}</td>
                        <td className="px-5 py-3 font-mono border-b border-[var(--color-border)] neg">{fmt(m.cards)}</td>
                        <td className={`px-5 py-3 font-mono font-semibold border-b border-[var(--color-border)] ${m.balance >= 0 ? 'pos' : 'neg'}`}>
                          {fmtSigned(m.balance)}
                        </td>
                      </tr>
                      {isExpanded && m.items && m.items.length > 0 && (
                        <tr key={`${key}-detail`}>
                          <td colSpan={6} className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                            <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {(['revenue', 'fixedCosts', 'loans', 'cards'] as CategoryKey[]).map(cat => {
                                const items = m.items!.filter(i => i.category === cat)
                                if (!items.length) return null
                                return (
                                  <div key={cat}>
                                    <div className="label mb-1.5" style={{ color: CATEGORY_COLORS[cat] }}>
                                      {CATEGORY_LABELS[cat]}
                                    </div>
                                    {items.map(item => (
                                      <div key={item.id} className="flex items-center justify-between py-1 text-[12px]">
                                        <div className="flex items-center gap-2">
                                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.isPaid ? 'bg-[var(--color-pos)]' : 'bg-[var(--color-border)]'}`} />
                                          <span className="text-[var(--color-text-primary)]">{item.description}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Badge variant={item.isPaid ? 'green' : 'gray'} size="sm">
                                            {item.isPaid ? 'pago' : 'pend.'}
                                          </Badge>
                                          <span className="font-mono text-[var(--color-text-primary)]">{fmt(item.value)}</span>
                                        </div>
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
                  <td className="px-5 py-3 text-[12px] text-[var(--color-text-muted)]">Total {currentYear}</td>
                  <td className="px-5 py-3 font-mono pos">{fmt(monthsForYear.reduce((s,m)=>s+m.revenue,0))}</td>
                  <td className="px-5 py-3 font-mono text-[var(--color-text-muted)]">{fmt(monthsForYear.reduce((s,m)=>s+m.fixedCosts,0))}</td>
                  <td className="px-5 py-3 font-mono text-[var(--color-text-muted)]">{fmt(monthsForYear.reduce((s,m)=>s+m.loans,0))}</td>
                  <td className="px-5 py-3 font-mono neg">{fmt(monthsForYear.reduce((s,m)=>s+m.cards,0))}</td>
                  <td className={`px-5 py-3 font-mono ${monthsForYear.reduce((s,m)=>s+m.balance,0)>=0?'pos':'neg'}`}>
                    {fmtSigned(monthsForYear.reduce((s,m)=>s+m.balance,0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
