import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchDividends } from '@/lib/dividendsService'
import {
  dividendYield,
  monthlyPattern,
  projectNext12,
  receivedSince,
  trailing12m,
  type DividendEvent,
} from '@/lib/dividends'
import { fmtFull } from '@/lib/formatters'
import { MONTHS } from '@/types/finance'

type Pos = {
  ticker: string
  assetType: string
  quantity: number
  avgPrice: number
  buyDate: string
  quote?: { regularMarketPrice: number } | null
}

interface Holding {
  ticker: string
  quantity: number
  avgPrice: number
  buyDate: string
  price: number | null
}

const ELIGIBLE = new Set(['acao', 'fii', 'etf'])

function groupHoldings(positions: Pos[]): Holding[] {
  const map = new Map<string, { qty: number; cost: number; buyDate: string; price: number | null }>()
  for (const p of positions) {
    if (!ELIGIBLE.has(p.assetType)) continue
    const t = p.ticker.trim().toUpperCase()
    if (!t) continue
    const cur = map.get(t) ?? { qty: 0, cost: 0, buyDate: p.buyDate, price: null }
    cur.qty += p.quantity
    cur.cost += p.quantity * p.avgPrice
    if (p.buyDate && (!cur.buyDate || p.buyDate < cur.buyDate)) cur.buyDate = p.buyDate
    if (cur.price == null && p.quote?.regularMarketPrice) cur.price = p.quote.regularMarketPrice
    map.set(t, cur)
  }
  return [...map.entries()].map(([ticker, v]) => ({
    ticker,
    quantity: v.qty,
    avgPrice: v.qty > 0 ? v.cost / v.qty : 0,
    buyDate: v.buyDate,
    price: v.price,
  }))
}

const fmtPS = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPS4 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
const fmtPct1 = (n: number) => `${n.toFixed(1).replace('.', ',')}%`

export default function DividendsCard({
  positions,
  open,
  onToggle,
}: {
  positions: Pos[]
  open: boolean
  onToggle: () => void
}) {
  const holdings = useMemo(() => groupHoldings(positions), [positions])
  const key = useMemo(() => holdings.map((h) => h.ticker).sort().join(','), [holdings])
  const [data, setData] = useState<Record<string, DividendEvent[]> | null>(null)
  const [failed, setFailed] = useState(false)
  const fetchedKey = useRef<string | null>(null)

  useEffect(() => {
    if (!open || !key || fetchedKey.current === key) return
    fetchedKey.current = key
    let cancelled = false
    fetchDividends(key.split(','))
      .then((res) => {
        if (cancelled) return
        setData(res)
        setFailed(Object.keys(res).length === 0)
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
      })
    return () => {
      cancelled = true
      // permite nova tentativa se o efeito for refeito antes de concluir
      if (fetchedKey.current === key) fetchedKey.current = null
    }
  }, [open, key])

  const loading = open && key !== '' && data === null && !failed

  const calc = useMemo(() => {
    if (!data) return null
    const now = new Date()
    const rows = holdings
      .filter((h) => (data[h.ticker]?.length ?? 0) > 0)
      .map((h) => {
        const events = data[h.ticker]
        const patterns = monthlyPattern(events, now, 3)
        const trailing = trailing12m(events, now)
        return {
          h,
          patterns,
          trailing,
          dy: dividendYield(trailing, h.price),
          projection: projectNext12(patterns, h.quantity, now, 0.5),
          received: receivedSince(events, h.quantity, h.buyDate || '0000-00-00', now, 12),
        }
      })
    const months = Array.from({ length: 12 }, (_, i) => {
      const idx = now.getMonth() + i + 1
      return {
        year: now.getFullYear() + Math.floor(idx / 12),
        month: idx % 12,
        amount: rows.reduce((s, r) => s + r.projection[i].amount, 0),
      }
    })
    const total = months.reduce((s, m) => s + m.amount, 0)
    const received = rows.reduce((s, r) => s + r.received, 0)
    // Custo de TODOS os ativos com histórico conhecido (inclusive os que não pagam,
    // ex. BOVA11): excluí-los inflaria o yield on cost. Sem dados da API → fora.
    const cost = holdings
      .filter((h) => data[h.ticker])
      .reduce((s, h) => s + h.avgPrice * h.quantity, 0)
    const income = rows.reduce((s, r) => s + r.trailing * r.h.quantity, 0)
    return {
      rows,
      months,
      total,
      received,
      yieldOnCost: cost > 0 ? (income / cost) * 100 : null,
      noHistory: holdings.filter((h) => data[h.ticker] && data[h.ticker].length === 0).map((h) => h.ticker),
      noData: holdings.filter((h) => !data[h.ticker]).map((h) => h.ticker),
    }
  }, [data, holdings])

  const subtitle =
    holdings.length === 0
      ? 'Adicione ações, FIIs ou ETFs para ver os proventos'
      : calc
        ? `≈ ${fmtFull(calc.total / 12)}/mês projetados · ${calc.rows.length} ${calc.rows.length === 1 ? 'ativo' : 'ativos'}`
        : 'Quando cada ativo costuma pagar'

  const maxMonth = calc ? Math.max(...calc.months.map((m) => m.amount), 0) : 0

  return (
    <div className="card">
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="section-head label">Renda passiva</p>
          <h2 className="serif text-[clamp(18px,2.6vw,22px)] tracking-[-0.01em] mt-1">Calendário de proventos</h2>
          <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>
        </div>
        <svg
          width="18" height="18" viewBox="0 0 14 14" fill="none"
          className={`flex-shrink-0 text-[var(--color-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M3.5 5.5L7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && holdings.length > 0 && (
        <div className="mt-4 flex flex-col gap-5">
          {loading && (
            <p className="text-[13px] text-[var(--color-text-muted)]">Buscando histórico de proventos…</p>
          )}
          {failed && !calc && (
            <p className="text-[13px] text-[var(--color-text-muted)]">Não consegui buscar os proventos agora.</p>
          )}

          {calc && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Próximos 12 meses', value: fmtFull(calc.total), color: 'var(--color-pos)' },
                  { label: 'Média mensal', value: fmtFull(calc.total / 12), color: 'var(--color-text-primary)' },
                  { label: 'Recebido (12m, estim.)', value: fmtFull(calc.received), color: 'var(--color-text-primary)' },
                  {
                    label: 'Yield on cost',
                    value: calc.yieldOnCost == null ? '—' : fmtPct1(calc.yieldOnCost),
                    color: 'var(--color-accent)',
                  },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl p-3 bg-[var(--color-surface-2)] border border-[var(--color-border)]">
                    <p className="text-[11px] text-[var(--color-text-muted)]">{k.label}</p>
                    <p className="font-mono text-[15px] font-semibold mt-1" style={{ color: k.color }}>{k.value}</p>
                  </div>
                ))}
              </div>

              {calc.rows.length > 0 && (
                <>
                  <div>
                    <p className="label mb-2">Mapa de calor — meses em que costuma pagar</p>
                    <div className="overflow-x-auto">
                      <table className="border-collapse text-[11px] w-full" style={{ minWidth: 640 }}>
                        <thead>
                          <tr>
                            <th className="sticky left-0 z-10 bg-[var(--color-surface)] text-left font-medium text-[var(--color-text-muted)] px-2 py-1">Ativo</th>
                            {MONTHS.map((m) => (
                              <th key={m} className="font-medium text-[var(--color-text-muted)] px-1 py-1 text-center">{m}</th>
                            ))}
                            <th className="font-medium text-[var(--color-text-muted)] px-2 py-1 text-right">DY 12m</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calc.rows.map((r) => (
                            <tr key={r.h.ticker}>
                              <td className="sticky left-0 z-10 bg-[var(--color-surface)] font-mono font-semibold text-[var(--color-text-primary)] px-2 py-1">
                                {r.h.ticker}
                              </td>
                              {r.patterns.map((p) => {
                                const pct = Math.round(p.freq * 60)
                                const years = Math.round(p.freq * 3)
                                return (
                                  <td
                                    key={p.month}
                                    title={`${MONTHS[p.month]}: pagou em ${years} de 3 anos${years > 0 ? ` · média R$ ${fmtPS4(p.avgPerShare)}/cota` : ''}`}
                                    className="text-center font-mono text-[10px] h-8 px-1"
                                    style={{
                                      background: pct > 0
                                        ? `color-mix(in srgb, var(--color-primary) ${pct}%, transparent)`
                                        : 'transparent',
                                      border: '1px solid var(--hairline)',
                                      color: 'var(--color-text-primary)',
                                    }}
                                  >
                                    {p.freq >= 0.5 ? fmtPS(p.avgPerShare) : ''}
                                  </td>
                                )
                              })}
                              <td className="font-mono text-right px-2 py-1 text-[var(--color-text-primary)]">
                                {r.dy == null ? '—' : fmtPct1(r.dy)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <p className="label mb-2">Projeção dos próximos 12 meses (suas cotas)</p>
                    <div className="overflow-x-auto">
                      <div className="flex items-end gap-2" style={{ minWidth: 560, height: 130 }}>
                        {calc.months.map((m) => {
                          const h = maxMonth > 0 ? Math.round((m.amount / maxMonth) * 80) : 0
                          return (
                            <div key={`${m.year}-${m.month}`} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                              <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                                {m.amount > 0 ? fmtPS(m.amount) : '—'}
                              </span>
                              <div
                                className="w-full rounded-t"
                                style={{ height: Math.max(h, m.amount > 0 ? 3 : 1), background: m.amount > 0 ? 'var(--color-pos)' : 'var(--hairline)' }}
                              />
                              <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                                {MONTHS[m.month]}/{String(m.year).slice(2)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {calc.noHistory.length > 0 && (
                <p className="text-[12px] text-[var(--color-text-muted)]">Sem proventos registrados: {calc.noHistory.join(', ')}</p>
              )}
              {calc.noData.length > 0 && (
                <p className="text-[12px] text-[var(--color-text-muted)]">Sem dados: {calc.noData.join(', ')}</p>
              )}
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Baseado nos últimos 3 anos (Yahoo Finance). O mês é o da data com — o pagamento costuma cair semanas depois.
                Projeção considera meses em que o ativo pagou em pelo menos 2 de 3 anos; valores passados não garantem futuros.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
