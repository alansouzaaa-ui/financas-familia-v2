import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useInvestmentStore } from '@/stores/useInvestmentStore'
import { useOperationsStore } from '@/stores/useOperationsStore'
import { fetchQuotes, fetchIbovData, type IbovHistoryPoint } from '@/lib/brapiService'
import { compareToIbov, expandForCompare, type PosForCompare } from '@/lib/ibovCompare'
import { fetchTesouroTitles, fetchTesouroPuOnDate, type TesouroTitle } from '@/lib/tesouroService'
import { fmtFull, fmtPct, fmtQuantity, fmtSignedFull, unitLabel } from '@/lib/formatters'
import Button from '@/components/ui/Button'
import ChartTooltip from '@/components/charts/ChartTooltip'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import ActionMenu from '@/components/ui/ActionMenu'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/hooks/useToast'
import type { BrapiQuote, AssetType, InvestmentPosition, ReservePillar } from '@/types/investment'
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, INVESTMENT_BROKERS, INVESTMENT_PURPOSES } from '@/types/investment'
import AporteCard from './AporteCard'
import ChecklistCard from './ChecklistCard'
import DividendsCard from './DividendsCard'
import ResultsCard from './ResultsCard'
import { useDividendEvents } from './useDividendEvents'
import { useAssetScores, TIER_COLORS, fmtScore } from './useAssetScores'
import { tierOf } from '@/lib/checklist'
import { enrichPositions, splitQuoteTickers } from '@/lib/portfolio'
import { dividendSymbol } from '@/lib/dividends'
import { buildPortfolioResults, type DividendEstimate } from '@/lib/portfolioResults'
import ReserveCard, { ReserveSummaryCard } from './ReserveCard'
import OperationModal, { type OperationMode } from './OperationModal'
import HistoryModal from './HistoryModal'
import ClosedPositionsSection from './ClosedPositionsSection'
import ModalShell from './ModalShell'
import { BTN_DANGER, BTN_GHOST } from './modalStyles'
import { consolidationKey, isManualPosition, isValidISODate, openLots } from '@/lib/operations'
import { createPosition, deletePosition, registerOperation, removeOperation, todayISO } from '@/lib/investmentActions'
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
  return `${sign}${value.toFixed(2).replace('.', ',')}%`
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
          <div className="text-[18px] xl:text-[20px] font-semibold text-[var(--color-text-primary)] leading-tight whitespace-nowrap tabular-nums">{main}</div>
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

const ICON_HISTORY = <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7a5 5 0 1 0 1.6-3.7M2 2.5v2.3h2.3M7 4.5V7l1.8 1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
const ICON_EDIT = <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
const ICON_TRASH = <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5.5 3.5V2.5h3v1M5.5 6v4.5M8.5 6v4.5M3 3.5l.75 8h6.5L11 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>

const CARD_ACTION = 'flex-1 sm:flex-none h-10 sm:h-8 px-4 rounded-[10px] text-[13px] sm:text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]'

function PositionCard({
  pos,
  score,
  opCount,
  realized,
  dividends,
  onBuy,
  onSell,
  onHistory,
  onEdit,
  onDelete,
}: {
  pos: ReturnType<typeof enrichPositions>[number]
  score?: number | null
  opCount: number
  realized: number
  dividends: DividendEstimate
  onBuy: () => void
  onSell: () => void
  onHistory: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const hasQuote = pos.quote !== null
  const valued = hasQuote || pos.manualValue != null   // tem valor atual (cotação OU saldo manual)
  const manual = isManualPosition(pos)
  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-[15px] text-[var(--color-text-primary)] font-mono min-w-0 truncate">{pos.ticker}</span>
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
            {score != null && (
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded-full font-mono"
                style={{
                  background: `color-mix(in srgb, ${TIER_COLORS[tierOf(score, 1)]} 16%, transparent)`,
                  color: TIER_COLORS[tierOf(score, 1)],
                }}
              >
                Nota {fmtScore(score)}
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
        <ActionMenu
          label={`Mais ações de ${pos.ticker}`}
          className="!w-10 !h-10 sm:!w-8 sm:!h-8 flex-shrink-0 -mr-1 -mt-1"
          items={[
            { key: 'history', label: 'Histórico', icon: ICON_HISTORY, onSelect: onHistory },
            { key: 'edit', label: 'Editar dados', icon: ICON_EDIT, onSelect: onEdit },
            { key: 'delete', label: 'Excluir', icon: ICON_TRASH, danger: true, separatorBefore: true, onSelect: onDelete },
          ]}
        />
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
          <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">Em aberto</div>
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

      {(Math.abs(realized) > 0.005 || (dividends.status === 'ok' && dividends.total > 0)) && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {Math.abs(realized) > 0.005 && (
            <span className="text-[11px] text-[var(--color-text-muted)]">
              Realizado <span className={`text-[12px] font-medium ${trendClass(realized)}`}>{fmtSignedFull(realized)}</span>
            </span>
          )}
          {dividends.status === 'ok' && dividends.total > 0 && (
            <span className="text-[11px] text-[var(--color-text-muted)]">
              Dividendos <span className="text-[12px] font-medium text-[var(--color-text-primary)]">≈ {fmtFull(dividends.total)}</span>
            </span>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex flex-wrap items-center gap-2">
        {opCount > 1 && (
          <button
            type="button"
            onClick={onHistory}
            className="order-last sm:order-first sm:mr-auto w-full sm:w-auto h-10 sm:h-8 px-1 -ml-1 rounded-[8px] text-left text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] transition-colors"
          >
            {opCount} operações
          </button>
        )}
        <button
          type="button"
          onClick={onBuy}
          className={`${CARD_ACTION} bg-[var(--color-primary-tint)] text-[var(--color-primary)] hover:opacity-80 sm:ml-auto`}
        >
          {manual ? 'Aportar' : 'Comprar mais'}
        </button>
        <button
          type="button"
          onClick={onSell}
          className={`${CARD_ACTION} border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-text-muted)]`}
        >
          {manual ? 'Resgatar' : 'Vender'}
        </button>
      </div>
    </div>
  )
}

// ─── helpers used in JSX ─────────────────────────────────────────────────────

// ─── main page ───────────────────────────────────────────────────────────────

interface QuoteLookup {
  key: string
  status: 'idle' | 'loading' | 'found' | 'notfound' | 'error'
  price?: number
  name?: string
  changePct?: number
}
const IDLE_LOOKUP: QuoteLookup = { key: '', status: 'idle' }
const TICKER_PLACEHOLDER: Partial<Record<AssetType, string>> = { acao: 'PETR4', fii: 'MXRF11', etf: 'BOVA11', cripto: 'BTC' }

/** Preço como string de input: 2 casas (cripto < 1: até 8 significativas), sem notação científica. */
function priceToInput(price: number, crypto: boolean): string {
  if (!crypto || price >= 1) return (Math.round(price * 100) / 100).toFixed(2)
  return Number(price.toPrecision(8)).toFixed(12).replace(/0+$/, '').replace(/\.$/, '')
}

export default function InvestmentsPage() {
  const { positions, updatePosition } = useInvestmentStore()
  const operations = useOperationsStore(s => s.operations)
  const closedPositions = useOperationsStore(s => s.closedPositions)
  const { toast, show: showToast, clear: clearToast } = useToast()
  const [opModal, setOpModal] = useState<{ posId: string; mode: OperationMode; editingId?: string } | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
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
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [dividendsOpen, setDividendsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [tesouroTitles, setTesouroTitles] = useState<TesouroTitle[]>([])
  const [tesouroPuLoading, setTesouroPuLoading] = useState(false)
  const [tesouroPuError, setTesouroPuError] = useState<string | null>(null)
  const [tesouroPuDate, setTesouroPuDate] = useState<string | null>(null)
  const lastPuKey = useRef<string>('')
  const [quoteLookup, setQuoteLookup] = useState<QuoteLookup>(IDLE_LOOKUP)
  const lastQuoteKey = useRef<string>('')

  // ── quote fetching ──────────────────────────────────────────────────────

  const loadQuotes = useCallback(async () => {
    if (!positions.length) return
    setLoading(true)
    setQuotesError(null)

    // Só tipos com cotação na brapi (ver MARKET_TYPES em lib/portfolio).
    const { b3: tickers, crypto: cryptoTickers } = splitQuoteTickers(positions)
    // Data do aporte mais antigo → janela do histórico do IBOV p/ comparação
    const opDates = useOperationsStore.getState().operations.filter(o => !o.dateUnknown).map(o => o.date)
    const dated = [...positions.map(p => p.buyDate), ...opDates].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
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

  // Ações/FIIs/ETFs/cripto: ao digitar o ticker, busca a cotação atual e
  // sugere o preço médio (nunca sobrescreve o que o usuário digitou).
  useEffect(() => {
    const type = form.assetType
    if (!showForm || !(type === 'acao' || type === 'fii' || type === 'etf' || type === 'cripto')) return
    const isCrypto = type === 'cripto'
    const t = form.ticker.trim().toUpperCase()
    const valid = (isCrypto ? /^[A-Z0-9]{2,10}$/ : /^[A-Z0-9]{4,12}$/).test(t)
    const key = `${type}|${t}`
    if (!valid) {
      lastQuoteKey.current = ''
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuoteLookup(prev => (prev.status === 'idle' ? prev : IDLE_LOOKUP))
      return
    }
    if (key === lastQuoteKey.current) return
    lastQuoteKey.current = key

    let cancelled = false
    const timer = setTimeout(() => {
      setQuoteLookup({ key, status: 'loading' })
      const req = isCrypto ? fetchQuotes([], { crypto: [t] }) : fetchQuotes([t])
      req.then(list => {
        if (cancelled) return
        const q = list.find(x => x.symbol?.toUpperCase() === t)
        if (q && q.regularMarketPrice > 0) {
          const price = q.regularMarketPrice
          setQuoteLookup({ key, status: 'found', price, name: q.shortName, changePct: q.regularMarketChangePercent })
          if (!editingId) {
            setForm(f => (f.avgPrice.trim() === '' && f.assetType === type && f.ticker.trim().toUpperCase() === t
              ? { ...f, avgPrice: priceToInput(price, isCrypto) }
              : f))
          }
        } else {
          setQuoteLookup({ key, status: 'notfound' })
        }
      }).catch(() => {
        if (!cancelled) setQuoteLookup({ key, status: 'error' })
      })
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
      // Efeito cancelado antes de concluir: permite nova busca da mesma chave.
      if (lastQuoteKey.current === key) lastQuoteKey.current = ''
    }
  }, [showForm, form.assetType, form.ticker, editingId])

  // ── derived data ────────────────────────────────────────────────────────

  const opsByPos = useMemo(() => {
    const m = new Map<string, typeof operations>()
    for (const o of operations) {
      const l = m.get(o.positionId)
      if (l) l.push(o)
      else m.set(o.positionId, [o])
    }
    return m
  }, [operations])

  const tesouroPu = useMemo(() => new Map(tesouroTitles.map(t => [t.name, t.pu])), [tesouroTitles])
  const enriched = useMemo(() => enrichPositions(positions, quotes, tesouroPu), [positions, quotes, tesouroPu])
  const { scores: assetScores } = useAssetScores(enriched)

  const dividendSymbols = useMemo(() => {
    const set = new Set<string>()
    const eligible = (t: string) => t === 'acao' || t === 'fii' || t === 'etf'
    for (const p of enriched) if (eligible(p.assetType) && p.ticker.trim()) set.add(dividendSymbol(p.ticker))
    for (const c of closedPositions) if (eligible(c.position.assetType) && c.position.ticker.trim()) set.add(dividendSymbol(c.position.ticker))
    return [...set]
  }, [enriched, closedPositions])
  const { events: dividendEvents, status: dividendStatus, reload: reloadDividends } = useDividendEvents(dividendSymbols)
  const results = useMemo(
    () => buildPortfolioResults({ enriched, closed: closedPositions, operations, events: dividendEvents, now: new Date() }),
    [enriched, closedPositions, operations, dividendEvents],
  )
  const resultById = useMemo(() => new Map(results.rows.map(r => [r.id, r])), [results])

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
      // Cada posição vira um item por lote em aberto (data e custo de cada compra);
      // sem operações, cai no comportamento antigo (data da posição).
      enriched.flatMap((p): PosForCompare[] => {
        const list = opsByPos.get(p.id)
        return expandForCompare(
          {
            totalInvested: p.totalInvested,
            currentValue: p.currentValue,
            buyDate: p.buyDate,
            valued: p.quote !== null || p.manualValue != null,
          },
          list ? openLots(list) : undefined,
        )
      }),
      ibovHistory,
      ibov.regularMarketPrice,
    )
  }, [enriched, ibovHistory, ibov, opsByPos])

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

  // Posição aberta com a mesma chave de consolidação do que está sendo digitado:
  // o envio vira uma nova compra dela em vez de uma linha duplicada.
  const mergeTarget = useMemo(() => {
    if (editingId || !showForm || form.assetType === 'poupanca') return null
    const ticker = form.ticker.trim()
    if (!ticker) return null
    const key = consolidationKey({
      id: '__new__', ticker, quantity: 0, avgPrice: 0, buyDate: '', assetType: form.assetType,
      broker: form.broker, purpose: form.purpose,
      reservePillar: isReservePurpose(form.purpose) && form.reservePillar ? (form.reservePillar as ReservePillar) : undefined,
    })
    if (key === '__new__') return null
    return positions.find(p => consolidationKey(p) === key) ?? null
  }, [editingId, showForm, form.assetType, form.ticker, form.broker, form.purpose, form.reservePillar, positions])

  // Posição em edição já com livro de operações: quantidade/preço médio/data saem do formulário.
  const editingPos = editingId ? positions.find(p => p.id === editingId) : undefined
  const editingLedger = !!editingPos && opsByPos.has(editingPos.id)

  // ── form handlers ───────────────────────────────────────────────────────

  function openAdd() {
    setFormError(null)
    setEditingId(null)
    setForm(EMPTY_FORM)
    lastPuKey.current = ''
    lastQuoteKey.current = ''
    setQuoteLookup(IDLE_LOOKUP)
    setTesouroPuError(null)
    setTesouroPuDate(null)
    setShowForm(true)
  }

  function openEdit(pos: InvestmentPosition) {
    setFormError(null)
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
    lastQuoteKey.current = ''
    setQuoteLookup(IDLE_LOOKUP)
    setTesouroPuError(null)
    setTesouroPuDate(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelForm() {
    setFormError(null)
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    lastQuoteKey.current = ''
    setQuoteLookup(IDLE_LOOKUP)
  }

  function undoOperation(opId: string) {
    const r = removeOperation(opId)
    if (!r.ok) showToast(`Não foi possível desfazer: ${r.error}`)
  }

  // Compra na posição existente (mesma chave de consolidação) em vez de uma linha duplicada.
  function registerMergedBuy(target: InvestmentPosition, quantity: number, price: number): boolean {
    const date = isValidISODate(form.buyDate) ? form.buyDate : todayISO()
    const res = registerOperation(target.id, {
      type: 'buy', date, quantity, price,
      note: form.notes.trim().slice(0, 200) || undefined,
    })
    if (!res.ok) { setFormError(res.error); return false }
    const opId = res.value.id
    cancelForm()
    showToast(`Compra de ${fmtQuantity(quantity)} ${target.ticker} registrada`, { label: 'Desfazer', onClick: () => undoOperation(opId) })
    return true
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (form.assetType !== 'poupanca' && isValidISODate(form.buyDate) && form.buyDate > todayISO()) {
      setFormError('A data da compra não pode ser no futuro.')
      return
    }

    // Pilar da reserva só é guardado quando a categoria é "Reserva" e foi escolhido.
    const reservePillarValue: ReservePillar | undefined =
      isReservePurpose(form.purpose) && form.reservePillar
        ? (form.reservePillar as ReservePillar)
        : undefined

    // Posição com livro de operações: só dados cadastrais (e o saldo, nas manuais).
    // Quantidade e preço médio mudam por Comprar/Vender/Aportar/Resgatar/Histórico.
    if (editingId && editingLedger) {
      const common = {
        notes: form.notes.trim().slice(0, 200) || undefined,
        broker: form.broker.trim().slice(0, 40) || undefined,
        purpose: form.purpose.trim().slice(0, 40) || undefined,
        reservePillar: reservePillarValue,
      }
      if (form.assetType === 'poupanca') {
        const nome = form.ticker.trim().slice(0, 60)
        const saldo = Number(form.manualValue.replace(',', '.'))
        if (!nome || !isFinite(saldo) || saldo < 0 || saldo > 1_000_000_000) return
        updatePosition(editingId, { ...common, ticker: nome, manualValue: Math.round(saldo * 100) / 100 })
      } else {
        updatePosition(editingId, common)
      }
      cancelForm()
      return
    }

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
      else createPosition(data)
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
      const qtyRounded = Math.round(quantity * 100) / 100   // Tesouro fraciona em 0,01 de título
      const puRounded = Math.round(pu * 100) / 100
      if (!editingId && mergeTarget) { registerMergedBuy(mergeTarget, qtyRounded, puRounded); return }
      const data = {
        ticker: titulo,
        quantity: qtyRounded,
        avgPrice: puRounded,
        buyDate: form.buyDate,
        assetType: 'tesouro' as AssetType,
        notes: form.notes.trim().slice(0, 200) || undefined,
        broker: form.broker.trim().slice(0, 40) || undefined,
        purpose: form.purpose.trim().slice(0, 40) || undefined,
        reservePillar: reservePillarValue,
      }
      if (editingId) updatePosition(editingId, data)
      else createPosition(data)
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

    const qtyRounded = Math.round(quantity * 1000) / 1000
    const priceRounded = Math.round(avgPrice * 100) / 100
    if (!editingId && mergeTarget) { registerMergedBuy(mergeTarget, qtyRounded, priceRounded); return }

    const data = {
      ticker: ticker.slice(0, 60),
      quantity: qtyRounded,
      avgPrice: priceRounded,
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
      createPosition(data)
    }

    cancelForm()
  }

  const deleteTarget = deleteId ? positions.find(p => p.id === deleteId) : undefined
  function confirmDelete() {
    if (!deleteTarget) return
    deletePosition(deleteTarget.id)
    showToast(`Posição ${deleteTarget.ticker} excluída`)
    setDeleteId(null)
  }

  function openReserve() {
    setReserveOpen(true)
    setTimeout(() => reserveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  // Linha só de leitura no lugar de quantidade/preço/data quando a posição já tem histórico.
  function ledgerSummary(p: InvestmentPosition) {
    const text = isManualPosition(p)
      ? `${fmtFull(p.quantity * p.avgPrice)} investidos · Para mudar, use Aportar, Resgatar ou o Histórico`
      : `${fmtQuantity(p.quantity)} ${unitLabel(p.assetType, p.quantity)} · preço médio ${fmtFull(p.avgPrice)} · Para mudar, use Comprar, Vender ou o Histórico`
    return (
      <div className="rounded-[10px] bg-[var(--color-surface-2)] px-3 py-2.5 text-[12.5px] text-[var(--color-text-muted)]">
        {text}
      </div>
    )
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
              onClick={() => { loadQuotes(); reloadDividends() }}
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
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
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
          label="Resultado total"
          main={results.total !== null ? fmtSignedFull(results.total) : '—'}
          sub={results.total !== null && results.totalPct !== null ? pct(results.totalPct) : undefined}
          subTrend={results.total ?? undefined}
          loading={loading && !hasValuation}
        />
        <SummaryCard
          label="IBOV Hoje"
          main={ibov ? `${ibov.regularMarketChangePercent.toFixed(2).replace('.', ',')}%` : '—'}
          sub={ibov
            ? ibov.regularMarketPrice.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + ' pts'
            : undefined}
          subTrend={ibov?.regularMarketChangePercent}
          loading={loading && !ibov}
        />
      </div>

      <ResultsCard
        results={results}
        status={dividendStatus}
        hasEvents={dividendEvents !== null}
        reload={reloadDividends}
        onOpenHistory={setHistoryId}
      />

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
                disabled={editingLedger}
                className={editingLedger ? 'opacity-60 cursor-not-allowed' : ''}
                onChange={(e) => {
                  setForm((f) => ({ ...f, assetType: e.target.value as AssetType, ticker: '', avgPrice: '', quantity: '', investedAmount: '', manualValue: '' }))
                  lastPuKey.current = ''
                  lastQuoteKey.current = ''
                  setQuoteLookup(IDLE_LOOKUP)
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
                  {editingLedger && editingPos ? (
                    <div className="col-span-2 sm:col-span-3">{ledgerSummary(editingPos)}</div>
                  ) : (
                    <>
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
                        max={todayISO()}
                        value={form.buyDate}
                        onChange={(e) => setForm((f) => ({ ...f, buyDate: e.target.value }))}
                      />
                    </>
                  )}
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
                        disabled={editingLedger}
                        className={editingLedger ? 'opacity-60 cursor-not-allowed' : ''}
                        onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
                      />
                    ) : (
                      <Input
                        label="Título do Tesouro"
                        placeholder="Ex: Tesouro Selic 2029"
                        value={form.ticker}
                        disabled={editingLedger}
                        onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
                        required
                      />
                    )}
                  </div>
                  {!editingLedger && (
                    <>
                  <Input
                    label="Data da compra"
                    type="date"
                    max={todayISO()}
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
                    </>
                  )}
                  <Input
                    label="Observação (opcional)"
                    placeholder="Aposentadoria, meta…"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                  {editingLedger && editingPos ? (
                    <div className="col-span-2 sm:col-span-3">{ledgerSummary(editingPos)}</div>
                  ) : (
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
                  )}
                </>
              ) : (
                <>
                  <Input
                    label="Ticker"
                    placeholder={TICKER_PLACEHOLDER[form.assetType] ?? 'PETR4'}
                    value={form.ticker}
                    disabled={editingLedger}
                    onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                    required
                    className={`font-mono uppercase ${editingLedger ? 'opacity-60 cursor-not-allowed' : ''}`}
                  />
                  {!editingLedger && (
                    <>
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
                    label="Preço médio (R$) — preço que você pagou"
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
                    max={todayISO()}
                    value={form.buyDate}
                    onChange={(e) => setForm((f) => ({ ...f, buyDate: e.target.value }))}
                  />
                    </>
                  )}
                  <Input
                    label="Observação (opcional)"
                    placeholder="PGBL, Prev…"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                  {editingLedger && editingPos ? (
                    <div className="col-span-2 sm:col-span-3">{ledgerSummary(editingPos)}</div>
                  ) : (
                  <div className="col-span-2 sm:col-span-3 text-[12px] -mt-1">
                    {(() => {
                      const t = form.ticker.trim().toUpperCase()
                      const isCrypto = form.assetType === 'cripto'
                      const qL = quoteLookup
                      const cur = `${form.assetType}|${t}`
                      const avgN = Number((form.avgPrice || '').replace(',', '.'))
                      const qtyN = Number((form.quantity || '').replace(',', '.'))
                      const total = avgN > 0 && qtyN > 0 ? (
                        <span className="text-[var(--color-text-muted)] block">
                          Total investido: <span className="font-mono text-[var(--color-text-primary)]">{fmtFull(qtyN * avgN)}</span>
                        </span>
                      ) : null
                      let status: React.ReactNode = null
                      if (qL.status !== 'idle' && qL.key === cur) {
                        if (qL.status === 'loading') {
                          status = <span className="text-[var(--color-text-muted)]">Buscando cotação de {t}…</span>
                        } else if (qL.status === 'notfound') {
                          status = <span className="neg">Não encontrei {t}. Confira o código (ex.: PETR4, MXRF11, BOVA11).</span>
                        } else if (qL.status === 'error') {
                          status = <span className="text-[var(--color-text-muted)]">Não consegui buscar a cotação agora — informe o preço manualmente.</span>
                        } else if (qL.status === 'found' && qL.price != null) {
                          const pct = qL.changePct ?? 0
                          const price = qL.price
                          const differs = !(Math.abs(avgN - price) < 0.005)
                          status = (
                            <span className="text-[var(--color-text-muted)]">
                              {qL.name ? `${qL.name} · ` : ''}cotação atual{' '}
                              <span className="font-mono text-[var(--color-text-primary)]">{fmtFull(price)}</span>{' '}
                              <span className={pct >= 0 ? 'pos' : 'neg'}>({pct >= 0 ? '+' : ''}{pct.toFixed(2).replace('.', ',')}% hoje)</span>
                              {differs && (
                                <>
                                  {' · '}
                                  <button
                                    type="button"
                                    className="underline cursor-pointer"
                                    style={{ color: 'var(--color-primary)' }}
                                    onClick={() => setForm((f) => ({ ...f, avgPrice: priceToInput(price, isCrypto) }))}
                                  >
                                    usar como preço médio
                                  </button>
                                </>
                              )}
                            </span>
                          )
                        }
                      }
                      if (!status && !total) return null
                      return <>{status && <span className="block">{status}</span>}{total}</>
                    })()}
                  </div>
                  )}
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
            {mergeTarget && (
              <p className="rounded-[10px] bg-[var(--color-primary-tint)] text-[var(--color-primary)] text-[12.5px] font-medium px-3 py-2.5" role="status">
                Você já tem {mergeTarget.ticker}{mergeTarget.broker ? ` em ${mergeTarget.broker}` : ''}. Isto será registrado como nova compra dessa posição.
              </p>
            )}
            {formError && <p className="text-[12.5px] neg" role="alert">{formError}</p>}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={cancelForm} className="!px-4 !py-2.5 sm:!py-1.5 min-h-10 sm:min-h-0">
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="!px-4 !py-2.5 sm:!py-1.5 min-h-10 sm:min-h-0">
                {editingId ? 'Salvar' : mergeTarget ? 'Registrar compra' : 'Adicionar'}
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
      <ChecklistCard positions={enriched} open={checklistOpen} onToggle={() => setChecklistOpen((o) => !o)} />
      <DividendsCard
        positions={enriched}
        open={dividendsOpen}
        onToggle={() => setDividendsOpen((o) => !o)}
        events={dividendEvents}
        status={dividendStatus}
        received12m={results.received12m}
        reload={reloadDividends}
      />

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
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start [&>*]:min-w-0">

          {/* Positions list */}
          <div className="space-y-3 min-w-0">
            <div className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              Posições ({positions.length})
            </div>
            {enriched.map((pos) => (
              <PositionCard
                key={pos.id}
                pos={pos}
                score={assetScores[pos.ticker.trim().toUpperCase()]}
                opCount={opsByPos.get(pos.id)?.length ?? 0}
                realized={resultById.get(pos.id)?.realized ?? 0}
                dividends={resultById.get(pos.id)?.dividends ?? { status: 'na', total: 0, last12m: 0 }}
                onBuy={() => setOpModal({ posId: pos.id, mode: isManualPosition(pos) ? 'deposit' : 'buy' })}
                onSell={() => setOpModal({ posId: pos.id, mode: isManualPosition(pos) ? 'withdraw' : 'sell' })}
                onHistory={() => setHistoryId(pos.id)}
                onEdit={() => openEdit(pos)}
                onDelete={() => setDeleteId(pos.id)}
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

      {/* ── Posições encerradas (recolhida; fora dos totais) ── */}
      <ClosedPositionsSection onOpenHistory={setHistoryId} />

      {/* ── Compra / venda / aporte / resgate (e edição de operação) ── */}
      {opModal && (() => {
        // Operações de posição encerrada também podem ser editadas (a posição vem do arquivo de encerradas).
        const closedSnap = closedPositions.find(c => c.position.id === opModal.posId)?.position
        const target = enriched.find(p => p.id === opModal.posId)
          ?? (closedSnap ? enrichPositions([closedSnap], quotes, tesouroPu)[0] : undefined)
        if (!target) return null
        const editing = opModal.editingId ? operations.find(o => o.id === opModal.editingId) : undefined
        return (
          <OperationModal
            key={`${opModal.posId}-${opModal.mode}-${opModal.editingId ?? 'new'}`}
            position={target}
            mode={opModal.mode}
            editing={editing}
            tesouroTitles={tesouroTitles}
            onClose={() => setOpModal(null)}
            onDone={({ text, undoId }) => {
              setOpModal(null)
              showToast(text, undoId ? { label: 'Desfazer', onClick: () => undoOperation(undoId) } : undefined)
            }}
          />
        )
      })()}

      {historyId && (
        <HistoryModal
          positionId={historyId}
          onClose={() => setHistoryId(null)}
          onEditOperation={(op) => {
            const mode: OperationMode = op.type === 'opening' ? 'buy' : op.type
            setOpModal({ posId: op.positionId, mode, editingId: op.id })
          }}
          onToast={showToast}
        />
      )}

      {deleteTarget && (
        <ModalShell
          title={`Excluir ${deleteTarget.ticker}?`}
          onClose={() => setDeleteId(null)}
          role="alertdialog"
          footer={
            <div className="flex gap-2">
              <button type="button" className={BTN_GHOST} onClick={() => setDeleteId(null)}>Cancelar</button>
              <button type="button" className={BTN_DANGER} onClick={confirmDelete}>Excluir posição</button>
            </div>
          }
        >
          <p className="text-[13.5px] text-[var(--color-text-primary)]">
            A posição e {(opsByPos.get(deleteTarget.id)?.length ?? 0) > 1 ? `as ${opsByPos.get(deleteTarget.id)!.length} operações` : 'o histórico'} dela
            serão apagados. Não dá para desfazer.
          </p>
        </ModalShell>
      )}

      <Toast toast={toast} onClose={clearToast} />
    </div>
  )
}
