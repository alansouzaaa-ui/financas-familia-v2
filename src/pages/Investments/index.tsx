import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useInvestmentStore } from '@/stores/useInvestmentStore'
import { fetchQuotes, fetchIbovData, type IbovHistoryPoint } from '@/lib/brapiService'
import { compareToIbov } from '@/lib/ibovCompare'
import { fetchTesouroTitles, fetchTesouroPuOnDate, type TesouroTitle } from '@/lib/tesouroService'
import { fmtFull, fmtPct } from '@/lib/formatters'
import Button from '@/components/ui/Button'
import ChartTooltip from '@/components/charts/ChartTooltip'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import type { BrapiQuote, AssetType, InvestmentPosition, ReservePillar } from '@/types/investment'
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, INVESTMENT_BROKERS, INVESTMENT_PURPOSES } from '@/types/investment'
import AporteCard from './AporteCard'
import ReserveCard, { ReserveSummaryCard } from './ReserveCard'
import { reserveBreakdown, RESERVE_PILLAR_LABELS, pillarOf, isReservePurpose } from '@/lib/reserve'

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
  manualValue: string     // saldo atual (poupança)
  broker: string          // banco / corretora
  investedAmount: string  // valor investido (Tesouro) → calcula as cotas
  purpose: string         // objetivo/categoria
  reservePillar: string   // pilar da reserva ('' = auto pelo tipo)
}

const EMPTY_FORM: FormState = {
  ticker: '',
  quantity: '',
  avgPrice: '',
  buyDate: new Date().toISOString().slice(0, 10),
  assetType: 'acao',
  notes: '',
  manualValue: '',
  broker: '',
  investedAmount: '',
  purpose: '',
  reservePillar: '',
}

function pct(value: number) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function trendClass(value: number) {
  if (value > 0) return 'pos'
  if (value < 0) return 'neg'
  return 'text-[var(--color-text-muted)]'
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
    <div className="bg-[var(--color-surface)] rounded-2xl p-4 border border-[var(--color-border)]">
      <div className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
        {label}
      </div>
      {loading ? (
        <div className="h-7 w-24 bg-[var(--color-surface-2)] rounded animate-pulse mt-1" />
      ) : (
        <>
          <div className="text-[20px] font-semibold text-[var(--color-text-primary)] leading-tight">{main}</div>
          {sub && (
            <div className={`text-[12px] font-medium mt-0.5 ${subTrend !== undefined ? trendClass(subTrend) : 'text-[var(--color-text-muted)]'}`}>
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
  const valued = hasQuote || pos.manualValue != null   // tem valor atual (cotação OU saldo manual)
  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[15px] text-[var(--color-text-primary)] font-mono">{pos.ticker}</span>
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{
                background: ASSET_TYPE_COLORS[pos.assetType] + '20',
                color: ASSET_TYPE_COLORS[pos.assetType],
              }}
            >
              {ASSET_TYPE_LABELS[pos.assetType]}
            </span>
            {pos.purpose && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)]">
                {pos.purpose}
              </span>
            )}
            {isReservePurpose(pos.purpose) && pillarOf(pos) && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                {RESERVE_PILLAR_LABELS[pillarOf(pos)!]}
              </span>
            )}
          </div>
          {pos.quote?.shortName && (
            <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate max-w-[200px]">
              {pos.quote.shortName}
            </div>
          )}
          {pos.broker && (
            <div className="text-[11px] text-[var(--color-text-muted)] mt-1 flex items-center gap-1 truncate max-w-[200px]">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                <path d="M2 5.5L7 2l5 3.5M2.5 6v5M11.5 6v5M5 6v5M9 6v5M1.5 12h11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {pos.broker}
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-neg)] hover:bg-[var(--color-neg)]/10 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5h3v1M5.5 6v4.5M8.5 6v4.5M3 3.5l.75 8h6.5L11 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-[12px]">
        <div>
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">Qtd</div>
          <div className="font-medium text-[var(--color-text-primary)]">{pos.quantity.toLocaleString('pt-BR')}</div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">Preço Médio</div>
          <div className="font-medium text-[var(--color-text-primary)]">{fmtFull(pos.avgPrice)}</div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">Preço Atual</div>
          <div className="font-medium text-[var(--color-text-primary)]">
            {hasQuote ? fmtFull(pos.quote!.regularMarketPrice) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">Investido</div>
          <div className="font-medium text-[var(--color-text-primary)]">{fmtFull(pos.totalInvested)}</div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">Atual</div>
          <div className="font-medium text-[var(--color-text-primary)]">
            {valued ? fmtFull(pos.currentValue) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">Rentab.</div>
          {valued ? (
            <div className={`font-semibold ${trendClass(pos.pnl)}`}>
              {pct(pos.pnlPercent)}
            </div>
          ) : (
            <div className="text-[var(--color-text-muted)]">—</div>
          )}
        </div>
      </div>

      {hasQuote && pos.quote && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
          <span className="text-[11px] text-[var(--color-text-muted)]">Hoje</span>
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
  quotes: Record<string, BrapiQuote>,
  tesouroPu?: Map<string, number>
) {
  return positions.map((p) => {
    let quote = quotes[p.ticker] ?? null
    // Tesouro Direto: sintetiza uma "cotação" a partir do PU atual do título
    if (p.assetType === 'tesouro') {
      const pu = tesouroPu?.get(p.ticker)
      if (pu != null && pu > 0) {
        quote = {
          symbol: p.ticker, shortName: p.ticker, longName: p.ticker, currency: 'BRL',
          regularMarketPrice: pu, regularMarketChange: 0, regularMarketChangePercent: 0, regularMarketPreviousClose: pu,
        }
      }
    }
    const totalInvested = safe(p.quantity * p.avgPrice)
    const currentValue  = quote
      ? safe(p.quantity * quote.regularMarketPrice)
      : (p.manualValue != null ? safe(p.manualValue) : totalInvested)
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
  const [ibovHistory, setIbovHistory] = useState<IbovHistoryPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [quotesError, setQuotesError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [reserveOpen, setReserveOpen] = useState(false)
  const reserveRef = useRef<HTMLDivElement>(null)
  const [aporteOpen, setAporteOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [tesouroTitles, setTesouroTitles] = useState<TesouroTitle[]>([])
  const [tesouroPuLoading, setTesouroPuLoading] = useState(false)
  const [tesouroPuError, setTesouroPuError] = useState<string | null>(null)
  const [tesouroPuDate, setTesouroPuDate] = useState<string | null>(null)
  const lastPuKey = useRef<string>('')

  // ── quote fetching ──────────────────────────────────────────────────────

  const loadQuotes = useCallback(async () => {
    if (!positions.length) return
    setLoading(true)
    setQuotesError(null)

    // Só tipos com cotação na brapi (Tesouro tem PU próprio; poupança/renda fixa/
    // outro são valorizados à mão e o "ticker" não é um símbolo da B3).
    const MARKET_TYPES = new Set<AssetType>(['acao', 'fii', 'etf', 'cripto'])
    const marketPositions = positions.filter(p => MARKET_TYPES.has(p.assetType))
    const tickers = marketPositions.filter(p => p.assetType !== 'cripto').map((p) => p.ticker)
    const cryptoTickers = marketPositions.filter(p => p.assetType === 'cripto').map((p) => p.ticker)
    // Data do aporte mais antigo → janela do histórico do IBOV p/ comparação
    const dated = positions.map(p => p.buyDate).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    const earliest = dated.length ? dated.reduce((a, b) => (a < b ? a : b)) : undefined

    // Cotações das ações — falha aqui NÃO deve derrubar o IBOV nem o resto.
    if (tickers.length > 0 || cryptoTickers.length > 0) {
      try {
        const quoteList = await fetchQuotes(tickers, { crypto: cryptoTickers })
        const map: Record<string, BrapiQuote> = {}
        quoteList.forEach((q) => { map[q.symbol] = q })
        setQuotes(map)
      } catch {
        setQuotesError('Não foi possível buscar as cotações das ações. Verifique sua conexão.')
      }
    }

    // IBOV + histórico — independente das ações (fetchIbovData nunca lança).
    const ibovData = await fetchIbovData(earliest)
    setIbov(ibovData.quote)
    setIbovHistory(ibovData.history)

    // Tesouro (independente) — permite retry pelo botão Atualizar.
    fetchTesouroTitles().then(setTesouroTitles).catch(() => {})

    setLastUpdated(new Date())
    setLoading(false)
  }, [positions])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadQuotes()
  }, [loadQuotes])

  // Lista de títulos do Tesouro (para o seletor e para valorizar as posições)
  useEffect(() => {
    fetchTesouroTitles().then(setTesouroTitles).catch(() => setTesouroTitles([]))
  }, [])

  // Tesouro: ao escolher título + data, busca o PU na data e auto-preenche
  // (o valor investido ÷ PU vira a quantidade de cotas).
  useEffect(() => {
    if (!showForm || form.assetType !== 'tesouro') return
    const titulo = tesouroTitles.find(t => t.name === form.ticker)
    if (!titulo || !titulo.maturity || !/^\d{4}-\d{2}-\d{2}$/.test(form.buyDate)) return
    const key = `${form.ticker}|${form.buyDate}`
    if (key === lastPuKey.current) return
    lastPuKey.current = key

    let cancelled = false
    /* eslint-disable react-hooks/set-state-in-effect */
    setTesouroPuLoading(true)
    setTesouroPuError(null)
    /* eslint-enable react-hooks/set-state-in-effect */
    const timer = setTimeout(() => {
      fetchTesouroPuOnDate(titulo.tipo, titulo.maturity!, form.buyDate).then(res => {
        if (cancelled) return
        setTesouroPuLoading(false)
        if (res) {
          setTesouroPuDate(res.date)
          setForm(f => ({ ...f, avgPrice: String(res.pu) }))
        } else {
          setTesouroPuDate(null)
          setTesouroPuError('Não encontrei o PU nessa data. Informe o PU manualmente abaixo.')
        }
      })
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [showForm, form.assetType, form.ticker, form.buyDate, tesouroTitles])

  // ── derived data ────────────────────────────────────────────────────────

  const tesouroPu = useMemo(() => new Map(tesouroTitles.map(t => [t.name, t.pu])), [tesouroTitles])
  const enriched = useMemo(() => enrichPositions(positions, quotes, tesouroPu), [positions, quotes, tesouroPu])

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

  // Carteira × IBOV no mesmo período (ponderado por valor e data de cada aporte)
  const ibovCompare = useMemo(() => {
    if (!ibov) return null
    return compareToIbov(
      enriched.map(p => ({
        totalInvested: p.totalInvested,
        currentValue: p.currentValue,
        buyDate: p.buyDate,
        valued: p.quote !== null || p.manualValue != null,
      })),
      ibovHistory,
      ibov.regularMarketPrice,
    )
  }, [enriched, ibovHistory, ibov])

  // Quanto há em cada objetivo/categoria (pelo valor atual)
  const purposeBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of enriched) {
      if (!p.purpose) continue
      map.set(p.purpose, (map.get(p.purpose) ?? 0) + p.currentValue)
    }
    const rows = [...map.entries()].map(([purpose, value]) => ({ purpose, value })).sort((a, b) => b.value - a.value)
    const total = rows.reduce((s, r) => s + r.value, 0)
    return { rows, total }
  }, [enriched])

  // Reserva de emergência: total e por pilar (acesso imediato / Selic / renda fixa)
  const reserve = useMemo(() => reserveBreakdown(enriched), [enriched])

  // ── form handlers ───────────────────────────────────────────────────────

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    lastPuKey.current = ''
    setTesouroPuError(null)
    setTesouroPuDate(null)
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
      manualValue: pos.manualValue != null ? String(pos.manualValue) : '',
      broker: pos.broker ?? '',
      investedAmount: pos.assetType === 'tesouro'
        ? String(Math.round(pos.quantity * pos.avgPrice * 100) / 100)
        : '',
      purpose: pos.purpose ?? '',
      reservePillar: pos.reservePillar ?? '',
    })
    // Não deixa o auto-preenchimento do PU sobrescrever a posição em edição.
    lastPuKey.current = `${pos.ticker}|${pos.buyDate}`
    setTesouroPuError(null)
    setTesouroPuDate(null)
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

    // Pilar da reserva só é guardado quando a categoria é "Reserva" e foi escolhido.
    const reservePillarValue: ReservePillar | undefined =
      isReservePurpose(form.purpose) && form.reservePillar
        ? (form.reservePillar as ReservePillar)
        : undefined

    // Poupança / saldo manual: nome + saldo atual (+ total depositado opcional)
    if (form.assetType === 'poupanca') {
      const nome = form.ticker.trim().slice(0, 60)
      const saldo = Number(form.manualValue.replace(',', '.'))
      if (!nome || !isFinite(saldo) || saldo < 0 || saldo > 1_000_000_000) return
      const dep = form.avgPrice ? Number(form.avgPrice.replace(',', '.')) : saldo
      const depositado = isFinite(dep) && dep >= 0 ? dep : saldo
      const data = {
        ticker: nome,
        quantity: 1,
        avgPrice: Math.round(depositado * 100) / 100,
        manualValue: Math.round(saldo * 100) / 100,
        buyDate: form.buyDate,
        assetType: 'poupanca' as AssetType,
        notes: form.notes.trim().slice(0, 200) || undefined,
        broker: form.broker.trim().slice(0, 40) || undefined,
        purpose: form.purpose.trim().slice(0, 40) || undefined,
        reservePillar: reservePillarValue,
      }
      if (editingId) updatePosition(editingId, data)
      else addPosition(data)
      cancelForm()
      return
    }

    // Tesouro: valor investido ÷ PU na data = quantidade de cotas
    if (form.assetType === 'tesouro') {
      const titulo = form.ticker.trim()
      const pu = Number(form.avgPrice.replace(',', '.'))
      const valor = Number(form.investedAmount.replace(',', '.'))
      if (!titulo || titulo.length > 60) return
      if (!isFinite(pu) || pu <= 0 || !isFinite(valor) || valor <= 0) return
      const quantity = valor / pu
      if (!isFinite(quantity) || quantity <= 0 || quantity > 1_000_000_000) return
      const data = {
        ticker: titulo,
        quantity: Math.round(quantity * 100) / 100,   // Tesouro fraciona em 0,01 de título
        avgPrice: Math.round(pu * 100) / 100,
        buyDate: form.buyDate,
        assetType: 'tesouro' as AssetType,
        notes: form.notes.trim().slice(0, 200) || undefined,
        broker: form.broker.trim().slice(0, 40) || undefined,
        purpose: form.purpose.trim().slice(0, 40) || undefined,
        reservePillar: reservePillarValue,
      }
      if (editingId) updatePosition(editingId, data)
      else addPosition(data)
      cancelForm()
      return
    }

    // Demais tipos (Tesouro e poupança já foram tratados acima).
    // Ativos com cotação na B3 → símbolo em maiúsculas e validado; renda fixa/outro
    // aceitam um nome livre.
    const isMarket = ['acao', 'fii', 'etf', 'cripto'].includes(form.assetType)
    const ticker = isMarket ? form.ticker.trim().toUpperCase() : form.ticker.trim()
    if (!ticker || !form.quantity || !form.avgPrice) return

    const quantity = Number(form.quantity)
    const avgPrice = Number(form.avgPrice.replace(',', '.'))

    if (!isFinite(quantity) || quantity <= 0 || quantity > 1_000_000_000) return
    if (!isFinite(avgPrice) || avgPrice <= 0 || avgPrice > 1_000_000_000) return
    if (isMarket && !/^[A-Z0-9^]{1,12}$/.test(ticker)) return
    if (ticker.length > 60) return

    const data = {
      ticker: ticker.slice(0, 60),
      quantity: Math.round(quantity * 1000) / 1000,
      avgPrice: Math.round(avgPrice * 100) / 100,
      buyDate: form.buyDate,
      assetType: form.assetType,
      notes: form.notes.trim().slice(0, 200) || undefined,
      broker: form.broker.trim().slice(0, 40) || undefined,
      purpose: form.purpose.trim().slice(0, 40) || undefined,
      reservePillar: reservePillarValue,
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

  function openReserve() {
    setReserveOpen(true)
    setTimeout(() => reserveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  // ── render ──────────────────────────────────────────────────────────────

  const hasPositions = positions.length > 0
  const hasQuotes = Object.keys(quotes).length > 0
  // Há valorização se qualquer posição tem cotação — inclui Tesouro (PU),
  // que não entra no mapa `quotes` da brapi.
  const hasValuation = enriched.some(p => p.quote !== null || p.manualValue != null)

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="section-head label">Patrimônio</p>
          <h1 className="display text-[clamp(22px,3.4vw,27px)] tracking-[-0.015em] mt-1.5">Carteira</h1>
          {lastUpdated && (
            <div className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono">
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

      {/* ── KPIs em destaque (bater o olho) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <ReserveSummaryCard current={reserve.total} onClick={openReserve} />
        <SummaryCard
          label="Total Investido"
          main={fmtFull(totals.totalInvested)}
        />
        <SummaryCard
          label="Patrimônio"
          main={hasValuation ? fmtFull(totals.currentValue) : '—'}
          sub={hasQuotes && totals.dayChange !== 0
            ? `${totals.dayChange >= 0 ? '+' : ''}${fmtFull(totals.dayChange)} hoje`
            : undefined}
          subTrend={totals.dayChange}
          loading={loading && !hasValuation}
        />
        <SummaryCard
          label="Rentabilidade"
          main={hasValuation ? fmtFull(totals.pnl) : '—'}
          sub={hasValuation ? pct(totals.pnlPercent) : undefined}
          subTrend={totals.pnl}
          loading={loading && !hasValuation}
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

      {/* ── Error ── */}
      {quotesError && (
        <div className="bg-[#FFF1EC] dark:bg-[#993C1D]/20 border border-[#F4C4B0] dark:border-[#993C1D]/40 rounded-xl px-4 py-3 text-[13px] neg">
          {quotesError}
        </div>
      )}

      {/* ── Add / Edit Form ── */}
      {showForm && (
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5">
          <div className="text-[14px] font-semibold text-[var(--color-text-primary)] mb-4">
            {editingId ? 'Editar posição' : 'Nova posição'}
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Select
                label="Tipo"
                options={ASSET_OPTIONS}
                value={form.assetType}
                onChange={(e) => {
                  setForm((f) => ({ ...f, assetType: e.target.value as AssetType, ticker: '', avgPrice: '', quantity: '', investedAmount: '', manualValue: '' }))
                  lastPuKey.current = ''
                  setTesouroPuError(null)
                  setTesouroPuDate(null)
                }}
              />
              {form.assetType === 'poupanca' ? (
                <>
                  <div className="sm:col-span-2">
                    <Input
                      label="Instituição / apelido"
                      placeholder="Poupança Caixa"
                      value={form.ticker}
                      onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
                      required
                    />
                  </div>
                  <Input
                    label="Saldo atual (R$)"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="5000.00"
                    value={form.manualValue}
                    onChange={(e) => setForm((f) => ({ ...f, manualValue: e.target.value }))}
                    required
                  />
                  <Input
                    label="Total depositado (opcional)"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="para calcular o rendimento"
                    value={form.avgPrice}
                    onChange={(e) => setForm((f) => ({ ...f, avgPrice: e.target.value }))}
                  />
                  <Input
                    label="Desde (opcional)"
                    type="date"
                    value={form.buyDate}
                    onChange={(e) => setForm((f) => ({ ...f, buyDate: e.target.value }))}
                  />
                  <Input
                    label="Observação (opcional)"
                    placeholder="Reserva de emergência…"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </>
              ) : form.assetType === 'tesouro' ? (
                <>
                  <div className="sm:col-span-2">
                    {tesouroTitles.length > 0 ? (
                      <Select
                        label="Título do Tesouro"
                        options={[{ value: '', label: 'Selecione o título…' }, ...tesouroTitles.map(t => ({ value: t.name, label: t.name }))]}
                        value={form.ticker}
                        onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
                      />
                    ) : (
                      <Input
                        label="Título do Tesouro"
                        placeholder="Ex: Tesouro Selic 2029"
                        value={form.ticker}
                        onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
                        required
                      />
                    )}
                  </div>
                  <Input
                    label="Data da compra"
                    type="date"
                    value={form.buyDate}
                    onChange={(e) => setForm((f) => ({ ...f, buyDate: e.target.value }))}
                    required
                  />
                  <Input
                    label="Valor investido (R$)"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="1000.00"
                    value={form.investedAmount}
                    onChange={(e) => setForm((f) => ({ ...f, investedAmount: e.target.value }))}
                    required
                  />
                  <Input
                    label={tesouroPuLoading ? 'PU na data (buscando…)' : 'PU na data (R$)'}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="automático"
                    value={form.avgPrice}
                    onChange={(e) => setForm((f) => ({ ...f, avgPrice: e.target.value }))}
                    required
                  />
                  <Input
                    label="Observação (opcional)"
                    placeholder="Aposentadoria, meta…"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                  <div className="col-span-2 sm:col-span-3 text-[12px] -mt-1">
                    {tesouroPuLoading ? (
                      <span className="text-[var(--color-text-muted)]">Buscando o PU do título na data da compra…</span>
                    ) : tesouroPuError ? (
                      <span className="neg">{tesouroPuError}</span>
                    ) : (() => {
                      const puN = Number((form.avgPrice || '').replace(',', '.'))
                      const valorN = Number((form.investedAmount || '').replace(',', '.'))
                      if (!(puN > 0) || !(valorN > 0)) return null
                      const cotas = Math.round((valorN / puN) * 100) / 100
                      return (
                        <span className="text-[var(--color-text-muted)]">
                          PU {tesouroPuDate ? `em ${tesouroPuDate.split('-').reverse().join('/')}` : 'informado'}:{' '}
                          <span className="font-mono text-[var(--color-text-primary)]">{fmtFull(puN)}</span>
                          {' · '}≈ <span className="font-mono text-[var(--color-text-primary)]">{cotas.toFixed(2)}</span> cotas
                          {' · '}investido <span className="font-mono text-[var(--color-text-primary)]">{fmtFull(cotas * puN)}</span>
                        </span>
                      )
                    })()}
                  </div>
                </>
              ) : (
                <>
                  <Input
                    label="Ticker"
                    placeholder="PETR4"
                    value={form.ticker}
                    onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                    required
                    className="font-mono uppercase"
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
                </>
              )}
              <Input
                label="Banco / corretora (opcional)"
                list="ff-brokers"
                placeholder="XP, Nubank, Inter…"
                value={form.broker}
                onChange={(e) => setForm((f) => ({ ...f, broker: e.target.value }))}
              />
              <datalist id="ff-brokers">
                {INVESTMENT_BROKERS.map((b) => <option key={b} value={b} />)}
              </datalist>
              <Input
                label="Categoria (opcional)"
                list="ff-purposes"
                placeholder="Reserva, Aposentadoria…"
                value={form.purpose}
                onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
              />
              <datalist id="ff-purposes">
                {INVESTMENT_PURPOSES.map((p) => <option key={p} value={p} />)}
              </datalist>
              {isReservePurpose(form.purpose) && (
                <Select
                  label="Pilar da reserva"
                  options={[
                    { value: '', label: 'Automático (pelo tipo)' },
                    { value: 'imediato', label: RESERVE_PILLAR_LABELS.imediato },
                    { value: 'selic', label: RESERVE_PILLAR_LABELS.selic },
                    { value: 'rendafixa', label: RESERVE_PILLAR_LABELS.rendafixa },
                  ]}
                  value={form.reservePillar}
                  onChange={(e) => setForm((f) => ({ ...f, reservePillar: e.target.value }))}
                />
              )}
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

      {/* ── Reserva de emergência (recomendação, recolhível) ── */}
      <div ref={reserveRef} className="scroll-mt-4">
        <ReserveCard
          current={reserve.total}
          byPillar={reserve.byPillar}
          assets={reserve.assets}
          open={reserveOpen}
          onToggle={() => setReserveOpen((o) => !o)}
        />
      </div>

      <AporteCard positions={enriched} open={aporteOpen} onToggle={() => setAporteOpen((o) => !o)} />

      {/* ── Empty state ── */}
      {!hasPositions && !showForm && (
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] py-16 flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-2)] flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M4 20L10 13l4 4 4-5 6 8" stroke="var(--color-text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="22" cy="8" r="4" stroke="var(--color-chart-green)" strokeWidth="1.8"/>
              <path d="M22 6v4M20 8h4" stroke="var(--color-chart-green)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="text-center">
            <div className="font-semibold text-[var(--color-text-primary)] mb-1">Nenhuma posição ainda</div>
            <div className="text-[13px] text-[var(--color-text-muted)]">
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

      {/* ── Carteira × IBOV (mesmo período) ── */}
      {ibovCompare && (
        <div className="card">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
            <div className="section-head label lg:w-[170px] flex-shrink-0">Carteira × IBOV · mesmo período</div>
            <div className="flex items-center gap-8 flex-wrap flex-1">
              <div>
                <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-0.5">Sua carteira</div>
                <div className={`text-[20px] font-semibold ${trendClass(ibovCompare.carteiraReturnPct)}`}>{pct(ibovCompare.carteiraReturnPct)}</div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-0.5">IBOV</div>
                <div className={`text-[20px] font-semibold ${trendClass(ibovCompare.ibovReturnPct)}`}>{pct(ibovCompare.ibovReturnPct)}</div>
              </div>
              <div className="flex-1 min-w-[150px]">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold"
                  style={{
                    background: `color-mix(in srgb, ${ibovCompare.deltaPp >= 0 ? 'var(--color-pos)' : 'var(--color-neg)'} 14%, transparent)`,
                    color: ibovCompare.deltaPp >= 0 ? 'var(--color-pos)' : 'var(--color-neg)',
                  }}
                >
                  {ibovCompare.deltaPp >= 0 ? '▲' : '▼'} {Math.abs(ibovCompare.deltaPp).toFixed(1)} pp {ibovCompare.deltaPp >= 0 ? 'acima' : 'abaixo'} do índice
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-3 pt-3 border-t border-[var(--hairline)]">
            Simula o mesmo dinheiro aplicado no IBOV nas datas dos seus aportes. Considera {ibovCompare.coverageCount} {ibovCompare.coverageCount === 1 ? 'posição' : 'posições'} com data e valor.
          </p>
        </div>
      )}

      {/* ── Por objetivo/categoria ── */}
      {purposeBreakdown.rows.length > 0 && (
        <div className="card">
          <div className="section-head label mb-3">Por objetivo</div>
          <div className="flex flex-col gap-2.5">
            {purposeBreakdown.rows.map(r => {
              const pc = purposeBreakdown.total > 0 ? (r.value / purposeBreakdown.total) * 100 : 0
              return (
                <div key={r.purpose}>
                  <div className="flex items-center justify-between text-[13px] mb-1">
                    <span className="text-[var(--color-text-primary)]">{r.purpose}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] text-[var(--color-text-muted)] font-mono">{pc.toFixed(0)}%</span>
                      <span className="font-mono font-medium text-[var(--color-text-primary)]">{fmtFull(r.value)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pc}%`, background: 'var(--color-primary)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Positions + Chart ── */}
      {hasPositions && (
        <div className="grid lg:grid-cols-[1fr_280px] gap-6 items-start">

          {/* Positions list */}
          <div className="space-y-3">
            <div className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
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
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5">
              <div className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-4">
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
                  <Tooltip content={<ChartTooltip />} />
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
                        <span className="text-[var(--color-text-primary)]">{entry.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-medium text-[var(--color-text-primary)]">{fmtPct(share, 1)}</span>
                        <span className="text-[var(--color-text-muted)] ml-1.5">{fmtFull(entry.value)}</span>
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
