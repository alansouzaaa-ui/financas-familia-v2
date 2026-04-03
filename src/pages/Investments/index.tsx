import { useState, useEffect, useCallback, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useInvestmentStore } from '@/stores/useInvestmentStore'
import { fetchQuotes, fetchIbov } from '@/lib/brapiService'
import { fmtFull, fmtPct } from '@/lib/formatters'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import type { BrapiQuote, AssetType, InvestmentPosition } from '@/types/investment'
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from '@/types/investment'

// ─── helpers ────────────────────────────────────────────────────────────────

const ASSET_OPTIONS = Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}))

interface FormState {
  ticker: string
  quantity: string
  avgPrice: string
  buyDate: string
  assetType: AssetType
  notes: string
}

const EMPTY_FORM: FormState = {
  ticker: '',
  quantity: '',
  avgPrice: '',
  buyDate: new Date().toISOString().slice(0, 10),
  assetType: 'acao',
  notes: '',
}

function pct(value: number) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function trendClass(value: number) {
  if (value > 0) return 'text-[#1D9E75]'
  if (value < 0) return 'text-[#D85A30]'
  return 'text-[#6B6860]'
}

// ─── sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  main,
  sub,
  subTrend,
  loading,
}: {
  label: string
  main: string
  sub?: string
  subTrend?: number
  loading?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-[#E8E6E0]">
      <div className="text-[11px] font-medium text-[#6B6860] uppercase tracking-wider mb-1">
        {label}
      </div>
      {loading ? (
        <div className="h-7 w-24 bg-[#F7F6F3] rounded animate-pulse mt-1" />
      ) : (
        <>
          <div className="text-[20px] font-semibold text-[#1A1917] leading-tight">{main}</div>
          {sub && (
            <div className={`text-[12px] font-medium mt-0.5 ${subTrend !== undefined ? trendClass(subTrend) : 'text-[#6B6860]'}`}>
              {sub}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PositionCard({
  pos,
  onEdit,
  onRemove,
}: {
  pos: ReturnType<typeof enrichPositions>[number]
  onEdit: () => void
  onRemove: () => void
}) {
  const hasQuote = pos.quote !== null
  return (
    <div className="bg-white rounded-2xl border border-[#E8E6E0] p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[15px] text-[#1A1917] font-mono">{pos.ticker}</span>
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{
                background: ASSET_TYPE_COLORS[pos.assetType] + '20',
                color: ASSET_TYPE_COLORS[pos.assetType],
              }}
            >
              {ASSET_TYPE_LABELS[pos.assetType]}
            </span>
          </div>
          {pos.quote?.shortName && (
            <div className="text-[11px] text-[#6B6860] mt-0.5 truncate max-w-[200px]">
              {pos.quote.shortName}
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-[#6B6860] hover:text-[#1A1917] hover:bg-[#F7F6F3] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded-lg text-[#6B6860] hover:text-[#D85A30] hover:bg-[#FFF1EC] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5h3v1M5.5 6v4.5M8.5 6v4.5M3 3.5l.75 8h6.5L11 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-[12px]">
        <div>
          <div className="text-[10px] text-[#6B6860] mb-0.5">Qtd</div>
          <div className="font-medium text-[#1A1917]">{pos.quantity.toLocaleString('pt-BR')}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#6B6860] mb-0.5">Preço Médio</div>
          <div className="font-medium text-[#1A1917]">{fmtFull(pos.avgPrice)}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#6B6860] mb-0.5">Preço Atual</div>
          <div className="font-medium text-[#1A1917]">
            {hasQuote ? fmtFull(pos.quote!.regularMarketPrice) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[#6B6860] mb-0.5">Investido</div>
          <div className="font-medium text-[#1A1917]">{fmtFull(pos.totalInvested)}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#6B6860] mb-0.5">Atual</div>
          <div className="font-medium text-[#1A1917]">
            {hasQuote ? fmtFull(pos.currentValue) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[#6B6860] mb-0.5">Rentab.</div>
          {hasQuote ? (
            <div className={`font-semibold ${trendClass(pos.pnl)}`}>
              {pct(pos.pnlPercent)}
            </div>
          ) : (
            <div className="text-[#6B6860]">—</div>
          )}
        </div>
      </div>

      {hasQuote && pos.quote && (
        <div className="mt-3 pt-3 border-t border-[#F0EFE9] flex items-center justify-between">
          <span className="text-[11px] text-[#6B6860]">Hoje</span>
          <span className={`text-[12px] font-medium ${trendClass(pos.quote.regularMarketChange)}`}>
            {pos.quote.regularMarketChange >= 0 ? '+' : ''}
            {fmtFull(pos.quote.regularMarketChange)} ({pct(pos.quote.regularMarketChangePercent)})
          </span>
        </div>
      )}
    </div>
  )
}

// ─── helpers used in JSX ─────────────────────────────────────────────────────

function safe(n: number): number {
  return isFinite(n) ? n : 0
}

function enrichPositions(
  positions: InvestmentPosition[],
  quotes: Record<string, BrapiQuote>
) {
  return positions.map((p) => {
    const quote = quotes[p.ticker] ?? null
    const totalInvested = safe(p.quantity * p.avgPrice)
    const currentValue  = quote ? safe(p.quantity * quote.regularMarketPrice) : totalInvested
    const pnl           = safe(currentValue - totalInvested)
    const pnlPercent    = totalInvested > 0 ? safe((pnl / totalInvested) * 100) : 0
    return { ...p, quote, totalInvested, currentValue, pnl, pnlPercent }
  })
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function InvestmentsPage() {
  const { positions, addPosition, updatePosition, removePosition } = useInvestmentStore()
  const [quotes, setQuotes] = useState<Record<string, BrapiQuote>>({})
  const [ibov, setIbov] = useState<BrapiQuote | null>(null)
  const [loading, setLoading] = useState(false)
  const [quotesError, setQuotesError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  // ── quote fetching ──────────────────────────────────────────────────────

  const loadQuotes = useCallback(async () => {
    if (!positions.length) return
    setLoading(true)
    setQuotesError(null)
    try {
      const tickers = positions.map((p) => p.ticker)
      const [quoteList, ibovData] = await Promise.all([fetchQuotes(tickers), fetchIbov()])
      const map: Record<string, BrapiQuote> = {}
      quoteList.forEach((q) => {
        map[q.symbol] = q
      })
      setQuotes(map)
      setIbov(ibovData)
      setLastUpdated(new Date())
    } catch {
      setQuotesError('Não foi possível buscar cotações. Verifique sua conexão.')
    } finally {
      setLoading(false)
    }
  }, [positions])

  useEffect(() => {
    loadQuotes()
  }, [loadQuotes])

  // ── derived data ────────────────────────────────────────────────────────

  const enriched = useMemo(() => enrichPositions(positions, quotes), [positions, quotes])

  const totals = useMemo(() => {
    const totalInvested = enriched.reduce((s, p) => s + p.totalInvested, 0)
    const currentValue = enriched.reduce((s, p) => s + p.currentValue, 0)
    const pnl = currentValue - totalInvested
    const pnlPercent = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0
    const dayChange = enriched.reduce(
      (s, p) =>
        p.quote ? s + p.quantity * p.quote.regularMarketChange : s,
      0
    )
    return { totalInvested, currentValue, pnl, pnlPercent, dayChange }
  }, [enriched])

  const allocationData = useMemo(() => {
    const byType: Record<string, number> = {}
    enriched.forEach((p) => {
      byType[p.assetType] = (byType[p.assetType] ?? 0) + p.currentValue
    })
    return Object.entries(byType)
      .filter(([, v]) => v > 0)
      .map(([type, value]) => ({
        name: ASSET_TYPE_LABELS[type as AssetType],
        value,
        type: type as AssetType,
        color: ASSET_TYPE_COLORS[type as AssetType],
      }))
      .sort((a, b) => b.value - a.value)
  }, [enriched])

  // ── form handlers ───────────────────────────────────────────────────────

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(pos: InvestmentPosition) {
    setEditingId(pos.id)
    setForm({
      ticker: pos.ticker,
      quantity: String(pos.quantity),
      avgPrice: String(pos.avgPrice),
      buyDate: pos.buyDate,
      assetType: pos.assetType,
      notes: pos.notes ?? '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ticker = form.ticker.trim().toUpperCase()
    if (!ticker || !form.quantity || !form.avgPrice) return

    const quantity = Number(form.quantity)
    const avgPrice = Number(form.avgPrice.replace(',', '.'))

    if (!isFinite(quantity) || quantity <= 0 || quantity > 1_000_000_000) return
    if (!isFinite(avgPrice) || avgPrice <= 0 || avgPrice > 1_000_000_000) return
    if (!/^[A-Z0-9^]{1,12}$/.test(ticker)) return

    const data = {
      ticker,
      quantity: Math.round(quantity * 1000) / 1000,
      avgPrice: Math.round(avgPrice * 100) / 100,
      buyDate: form.buyDate,
      assetType: form.assetType,
      notes: form.notes.trim().slice(0, 200) || undefined,
    }

    if (editingId) {
      updatePosition(editingId, data)
    } else {
      addPosition(data)
    }

    cancelForm()
  }

  function handleRemove(id: string) {
    if (window.confirm('Remover esta posição da carteira?')) {
      removePosition(id)
    }
  }

  // ── render ──────────────────────────────────────────────────────────────

  const hasPositions = positions.length > 0
  const hasQuotes = Object.keys(quotes).length > 0

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-[#1A1917]">Carteira</h1>
          {lastUpdated && (
            <div className="text-[11px] text-[#6B6860] mt-0.5 font-mono">
              Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {hasPositions && (
            <Button
              variant="ghost"
              size="sm"
              onClick={loadQuotes}
              disabled={loading}
              className={loading ? 'opacity-50' : ''}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={loading ? 'animate-spin' : ''}>
                <path d="M12 7A5 5 0 1 1 7 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M10 2h2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Atualizar
            </Button>
          )}
          <Button size="sm" onClick={openAdd}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Adicionar
          </Button>
        </div>
      </div>

      {/* ── Error ── */}
      {quotesError && (
        <div className="bg-[#FFF1EC] border border-[#F4C4B0] rounded-xl px-4 py-3 text-[13px] text-[#993C1D]">
          {quotesError}
        </div>
      )}

      {/* ── Add / Edit Form ── */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-[#E8E6E0] p-5">
          <div className="text-[14px] font-semibold text-[#1A1917] mb-4">
            {editingId ? 'Editar posição' : 'Nova posição'}
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Input
                label="Ticker"
                placeholder="PETR4"
                value={form.ticker}
                onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                required
                className="font-mono uppercase"
              />
              <Select
                label="Tipo"
                options={ASSET_OPTIONS}
                value={form.assetType}
                onChange={(e) => setForm((f) => ({ ...f, assetType: e.target.value as AssetType }))}
              />
              <Input
                label="Quantidade"
                type="number"
                min="0"
                step="1"
                placeholder="100"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                required
              />
              <Input
                label="Preço médio (R$)"
                type="number"
                min="0"
                step="0.01"
                placeholder="35.00"
                value={form.avgPrice}
                onChange={(e) => setForm((f) => ({ ...f, avgPrice: e.target.value }))}
                required
              />
              <Input
                label="Data de compra"
                type="date"
                value={form.buyDate}
                onChange={(e) => setForm((f) => ({ ...f, buyDate: e.target.value }))}
              />
              <Input
                label="Observação (opcional)"
                placeholder="PGBL, Prev…"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={cancelForm}>
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                {editingId ? 'Salvar' : 'Adicionar'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ── Empty state ── */}
      {!hasPositions && !showForm && (
        <div className="bg-white rounded-2xl border border-[#E8E6E0] py-16 flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#F7F6F3] flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M4 20L10 13l4 4 4-5 6 8" stroke="#6B6860" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="22" cy="8" r="4" stroke="#1D9E75" strokeWidth="1.8"/>
              <path d="M22 6v4M20 8h4" stroke="#1D9E75" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="text-center">
            <div className="font-semibold text-[#1A1917] mb-1">Nenhuma posição ainda</div>
            <div className="text-[13px] text-[#6B6860]">
              Adicione suas ações, FIIs, ETFs e outros investimentos
            </div>
          </div>
          <Button size="sm" onClick={openAdd}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Adicionar primeira posição
          </Button>
        </div>
      )}

      {/* ── Summary cards ── */}
      {hasPositions && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            label="Total Investido"
            main={fmtFull(totals.totalInvested)}
            loading={false}
          />
          <SummaryCard
            label="Valor Atual"
            main={hasQuotes ? fmtFull(totals.currentValue) : '—'}
            sub={hasQuotes && totals.dayChange !== 0
              ? `${totals.dayChange >= 0 ? '+' : ''}${fmtFull(totals.dayChange)} hoje`
              : undefined}
            subTrend={totals.dayChange}
            loading={loading && !hasQuotes}
          />
          <SummaryCard
            label="Rentabilidade"
            main={hasQuotes ? fmtFull(totals.pnl) : '—'}
            sub={hasQuotes ? pct(totals.pnlPercent) : undefined}
            subTrend={totals.pnl}
            loading={loading && !hasQuotes}
          />
          <SummaryCard
            label="IBOV Hoje"
            main={ibov ? `${ibov.regularMarketChangePercent.toFixed(2)}%` : '—'}
            sub={ibov
              ? ibov.regularMarketPrice.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + ' pts'
              : undefined}
            subTrend={ibov?.regularMarketChangePercent}
            loading={loading && !ibov}
          />
        </div>
      )}

      {/* ── Positions + Chart ── */}
      {hasPositions && (
        <div className="grid lg:grid-cols-[1fr_280px] gap-6 items-start">

          {/* Positions list */}
          <div className="space-y-3">
            <div className="text-[13px] font-semibold text-[#6B6860] uppercase tracking-wider">
              Posições ({positions.length})
            </div>
            {enriched.map((pos) => (
              <PositionCard
                key={pos.id}
                pos={pos}
                onEdit={() => openEdit(pos)}
                onRemove={() => handleRemove(pos.id)}
              />
            ))}
          </div>

          {/* Allocation chart */}
          {allocationData.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E8E6E0] p-5">
              <div className="text-[13px] font-semibold text-[#6B6860] uppercase tracking-wider mb-4">
                Alocação
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={allocationData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {allocationData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [fmtFull(Number(value)), 'Valor']}
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid #E8E6E0',
                      borderRadius: '10px',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="space-y-2 mt-2">
                {allocationData.map((entry) => {
                  const share =
                    totals.currentValue > 0
                      ? (entry.value / totals.currentValue) * 100
                      : 0
                  return (
                    <div key={entry.type} className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ background: entry.color }}
                        />
                        <span className="text-[#1A1917]">{entry.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-medium text-[#1A1917]">{fmtPct(share, 1)}</span>
                        <span className="text-[#6B6860] ml-1.5">{fmtFull(entry.value)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
