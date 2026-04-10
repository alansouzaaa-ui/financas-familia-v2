import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useInvestmentStore } from '@/stores/useInvestmentStore'
import { fetchQuotes } from '@/lib/brapiService'
import { fmt, fmtSigned } from '@/lib/formatters'
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from '@/types/investment'
import type { BrapiQuote } from '@/types/investment'
import ChartTooltip from '@/components/charts/ChartTooltip'
import Card from '@/components/ui/Card'

const CACHE_KEY = 'inv_quotes_cache'
const CACHE_TTL = 5 * 60 * 1000 // 5 min

function getCachedQuotes(): { quotes: BrapiQuote[]; ts: number } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function setCachedQuotes(quotes: BrapiQuote[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ quotes, ts: Date.now() }))
  } catch { /* noop */ }
}

export default function InvestmentSummaryBlock() {
  const { positions } = useInvestmentStore()
  const [quotes, setQuotes] = useState<BrapiQuote[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  useEffect(() => {
    if (!positions.length) return

    const tickers = positions
      .filter(p => p.assetType !== 'renda_fixa')
      .map(p => p.ticker)

    if (!tickers.length) return

    const cached = getCachedQuotes()
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setQuotes(cached.quotes)
      setLastUpdate(new Date(cached.ts))
      return
    }

    setLoading(true)
    fetchQuotes(tickers)
      .then(q => {
        setQuotes(q)
        setCachedQuotes(q)
        setLastUpdate(new Date())
      })
      .catch(() => { /* silent fallback */ })
      .finally(() => setLoading(false))
  }, [positions])

  if (!positions.length) return null

  // Build enriched positions
  const enriched = positions.map(p => {
    const quote = quotes.find(q => q.symbol === p.ticker.toUpperCase())
    const totalInvested = p.quantity * p.avgPrice
    const currentPrice = quote?.regularMarketPrice ?? p.avgPrice
    const currentValue = p.quantity * currentPrice
    const pnl = currentValue - totalInvested
    const pnlPercent = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0
    return { ...p, quote, totalInvested, currentValue, pnl, pnlPercent }
  })

  const totalInvested = enriched.reduce((s, p) => s + p.totalInvested, 0)
  const currentValue  = enriched.reduce((s, p) => s + p.currentValue, 0)
  const totalPnl      = currentValue - totalInvested
  const totalPnlPct   = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0

  // Allocation by asset type
  const byType: Record<string, number> = {}
  for (const p of enriched) {
    byType[p.assetType] = (byType[p.assetType] ?? 0) + p.currentValue
  }
  const pieData = Object.entries(byType)
    .filter(([, v]) => v > 0)
    .map(([type, value]) => ({
      type,
      label: ASSET_TYPE_LABELS[type as keyof typeof ASSET_TYPE_LABELS] ?? type,
      value: Math.round(value),
      color: ASSET_TYPE_COLORS[type as keyof typeof ASSET_TYPE_COLORS] ?? '#94A3B8',
    }))

  const isPnlPos = totalPnl >= 0

  return (
    <Card
      title="Investimentos"
      className="mb-4"
      action={
        loading ? (
          <span className="text-[11px] text-[var(--color-text-muted)] animate-pulse">Buscando cotações...</span>
        ) : lastUpdate ? (
          <span className="text-[11px] text-[var(--color-text-muted)]">
            Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        ) : null
      }
    >
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Investido', value: fmt(totalInvested), sub: null, color: 'text-[var(--color-text-primary)]' },
          { label: 'Valor atual', value: fmt(currentValue), sub: null, color: 'text-[var(--color-text-primary)]' },
          {
            label: 'Resultado',
            value: fmtSigned(totalPnl),
            sub: `${isPnlPos ? '+' : ''}${totalPnlPct.toFixed(2)}%`,
            color: isPnlPos ? 'pos' : 'neg',
          },
          {
            label: 'Posições',
            value: String(positions.length),
            sub: `${pieData.length} tipo${pieData.length !== 1 ? 's' : ''}`,
            color: 'text-[var(--color-text-primary)]',
          },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface-2)] rounded-xl p-3">
            <div className="text-[11px] text-[var(--color-text-muted)] mb-1">{k.label}</div>
            <div className={`font-mono font-semibold text-[15px] ${k.color}`}>{k.value}</div>
            {k.sub && <div className={`text-[11px] font-mono mt-0.5 ${k.color}`}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Donut + positions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Allocation donut */}
        <div>
          <div className="text-[12px] text-[var(--color-text-muted)] mb-2">Alocação por tipo</div>
          {pieData.length > 0 && (
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={65}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-col gap-1.5 mt-1">
            {pieData.map(s => (
              <div key={s.type} className="flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                  <span className="text-[var(--color-text-muted)]">{s.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {currentValue > 0 ? ((s.value / currentValue) * 100).toFixed(0) + '%' : '-'}
                  </span>
                  <span className="font-mono font-medium text-[var(--color-text-primary)]">{fmt(s.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top positions */}
        <div>
          <div className="text-[12px] text-[var(--color-text-muted)] mb-2">Posições</div>
          <div className="flex flex-col gap-1.5">
            {enriched
              .sort((a, b) => b.currentValue - a.currentValue)
              .slice(0, 6)
              .map(p => (
                <div key={p.id} className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-[4px]"
                      style={{
                        backgroundColor: `${ASSET_TYPE_COLORS[p.assetType as keyof typeof ASSET_TYPE_COLORS] ?? '#94A3B8'}20`,
                        color: ASSET_TYPE_COLORS[p.assetType as keyof typeof ASSET_TYPE_COLORS] ?? '#94A3B8',
                      }}
                    >
                      {p.ticker}
                    </span>
                    <span className="text-[var(--color-text-muted)] truncate">{p.quantity} un.</span>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <div className="font-mono text-[var(--color-text-primary)]">{fmt(p.currentValue)}</div>
                    <div className={`text-[10px] font-mono ${p.pnl >= 0 ? 'pos' : 'neg'}`}>
                      {fmtSigned(p.pnl)} ({p.pnlPercent >= 0 ? '+' : ''}{p.pnlPercent.toFixed(1)}%)
                    </div>
                  </div>
                </div>
              ))}
            {enriched.length > 6 && (
              <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
                +{enriched.length - 6} posição(ões) não exibidas
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
