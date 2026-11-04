import { describe, it, expect } from 'vitest'
import { buildPortfolioResults, dayBefore } from '../src/lib/portfolioResults'
import { enrichPositions } from '../src/lib/portfolio'
import { replayOperations } from '../src/lib/operations'
import type { DividendEvent } from '../src/lib/dividends'
import type { AssetType, BrapiQuote, ClosedPosition, InvestmentOperation, InvestmentPosition } from '../src/types/investment'

const now = new Date(2026, 9, 7) // 07/10/2026

let seq = 0
function op(positionId: string, type: InvestmentOperation['type'], date: string, extra: Partial<InvestmentOperation> = {}): InvestmentOperation {
  seq++
  return { id: `o${seq}`, positionId, type, date, createdAt: `2026-01-01T00:00:${String(seq % 60).padStart(2, '0')}.000Z`, ...extra }
}
const buy = (pid: string, date: string, quantity: number, price: number, fees?: number) =>
  op(pid, 'buy', date, { quantity, price, ...(fees ? { fees } : {}) })
const sell = (pid: string, date: string, quantity: number, price: number, fees?: number) =>
  op(pid, 'sell', date, { quantity, price, ...(fees ? { fees } : {}) })

/** Posição com cache (quantidade/preço médio) derivado do replay, como o app faz. */
function position(id: string, ticker: string, assetType: AssetType, ops: InvestmentOperation[], extra: Partial<InvestmentPosition> = {}): InvestmentPosition {
  const r = replayOperations(ops.filter(o => o.positionId === id))
  return { id, ticker, quantity: r.quantity, avgPrice: r.avgPrice, buyDate: r.firstDate ?? '2025-01-01', assetType, ...extra }
}

const quote = (symbol: string, price: number): BrapiQuote => ({
  symbol, shortName: symbol, longName: symbol, currency: 'BRL',
  regularMarketPrice: price, regularMarketChange: 0, regularMarketChangePercent: 0, regularMarketPreviousClose: price,
})

function run(opts: {
  positions?: InvestmentPosition[]
  quotes?: Record<string, number>
  closed?: ClosedPosition[]
  operations?: InvestmentOperation[]
  events?: Record<string, DividendEvent[]> | null
}) {
  const quotes = Object.fromEntries(Object.entries(opts.quotes ?? {}).map(([t, p]) => [t, quote(t, p)]))
  return buildPortfolioResults({
    enriched: enrichPositions(opts.positions ?? [], quotes),
    closed: opts.closed ?? [],
    operations: opts.operations ?? [],
    events: opts.events === undefined ? {} : opts.events,
    now,
  })
}

const ev = (date: string, amount = 1): DividendEvent => ({ date, amount })

describe('dayBefore', () => {
  it('calcula a véspera em UTC, virando mês e ano', () => {
    expect(dayBefore('2025-10-28')).toBe('2025-10-27')
    expect(dayBefore('2025-11-01')).toBe('2025-10-31')
    expect(dayBefore('2026-01-01')).toBe('2025-12-31')
    expect(dayBefore('2024-03-01')).toBe('2024-02-29')
  })
})

describe('direito ao provento (véspera da data ex)', () => {
  const ops = [buy('a', '2025-10-27', 45, 10), buy('a', '2025-10-30', 39, 10)]
  const p = position('a', 'EZTC3', 'acao', ops)
  const total = (date: string) => run({ positions: [p], quotes: { EZTC3: 10 }, operations: ops, events: { EZTC3: [ev(date)] } }).rows[0].dividends.total

  it('compras escalonadas: cada evento paga a quantidade da véspera', () => {
    expect(total('2025-10-28')).toBe(45)
    expect(total('2025-10-31')).toBe(84)
    expect(total('2025-10-27')).toBe(0)
  })

  it('comprar na data ex não dá direito', () => {
    expect(total('2025-10-30')).toBe(45)
  })

  it('vender na data ex dá direito', () => {
    const o = [buy('b', '2025-01-10', 100, 10), sell('b', '2025-06-10', 100, 12)]
    const r = run({ positions: [], closed: [{ position: position('b', 'ITSA4', 'acao', o), closedAt: '2025-06-10', realizedGain: 200 }], operations: o, events: { ITSA4: [ev('2025-06-10')] } })
    expect(r.rows[0].dividends.total).toBe(100)
  })

  it('venda parcial reduz a quantidade dos eventos seguintes', () => {
    const o = [buy('c', '2025-01-10', 100, 10), sell('c', '2025-06-10', 40, 12)]
    const pc = position('c', 'KNRI11', 'fii', o)
    const r = run({ positions: [pc], quotes: { KNRI11: 12 }, operations: o, events: { KNRI11: [ev('2025-06-10'), ev('2025-06-11'), ev('2025-07-01')] } })
    expect(r.rows[0].dividends.total).toBe(100 + 60 + 60)
  })
})

describe('janela de 12 meses e eventos futuros', () => {
  it('last12m usa (now − 12m, now]; futuros não contam em nenhum', () => {
    const o = [buy('a', '2024-01-02', 10, 10)]
    const p = position('a', 'ITSA4', 'acao', o)
    const events = { ITSA4: [ev('2025-10-07'), ev('2025-10-08'), ev('2026-10-07'), ev('2026-10-08', 50)] }
    const r = run({ positions: [p], quotes: { ITSA4: 10 }, operations: o, events })
    expect(r.rows[0].dividends.total).toBe(30)
    expect(r.rows[0].dividends.last12m).toBe(20)
    expect(r.received12m).toBe(20)
    expect(r.dividends).toBe(30)
  })
})

describe('status dos dividendos', () => {
  const o = [buy('a', '2025-01-02', 10, 10)]
  const p = position('a', 'ITSA4', 'acao', o)

  it('events null ou símbolo ausente: no-data, fora do zero válido, sem repetir ticker', () => {
    for (const events of [null, { OUTRO3: [ev('2025-06-01')] }]) {
      const r = run({ positions: [p], quotes: { ITSA4: 10 }, operations: o, events })
      expect(r.rows[0].dividends).toEqual({ status: 'no-data', total: 0, last12m: 0 })
      expect(r.noDividendData).toEqual(['ITSA4'])
    }
    const p2 = position('a2', 'ITSA4', 'acao', [])
    const r = run({ positions: [p, { ...p2, quantity: 1, avgPrice: 1 }], quotes: { ITSA4: 10 }, operations: o, events: null })
    expect(r.noDividendData).toEqual(['ITSA4'])
  })

  it('lista vazia é ok com total 0', () => {
    const r = run({ positions: [p], quotes: { ITSA4: 10 }, operations: o, events: { ITSA4: [] } })
    expect(r.rows[0].dividends).toEqual({ status: 'ok', total: 0, last12m: 0 })
    expect(r.noDividendData).toEqual([])
  })

  it('dateUnknown vira no-date', () => {
    const o2 = [op('d', 'opening', '2000-01-01', { quantity: 10, price: 10, dateUnknown: true })]
    const pd = position('d', 'ITSA4', 'acao', o2)
    const r = run({ positions: [pd], quotes: { ITSA4: 10 }, operations: o2, events: { ITSA4: [ev('2025-06-01')] } })
    expect(r.rows[0].dividends).toEqual({ status: 'no-date', total: 0, last12m: 0 })
    expect(r.noDividendDate).toEqual(['ITSA4'])
    expect(r.noDividendData).toEqual([])
  })

  it('posição sem operações usa a abertura sintética (data conhecida ou não)', () => {
    const known = { ...p, id: 'k', quantity: 10, avgPrice: 10, buyDate: '2025-01-02' }
    const unknown = { ...p, id: 'u', ticker: 'KNRI11', quantity: 10, avgPrice: 10, buyDate: '' }
    const r = run({
      positions: [known, unknown],
      quotes: { ITSA4: 10, KNRI11: 10 },
      operations: [],
      events: { ITSA4: [ev('2025-06-01')], KNRI11: [ev('2025-06-01')] },
    })
    expect(r.rows.find(x => x.id === 'k')!.dividends.total).toBe(10)
    expect(r.rows.find(x => x.id === 'k')!.bought).toBe(100)
    expect(r.rows.find(x => x.id === 'u')!.dividends.status).toBe('no-date')
  })

  it('tipos sem proventos (tesouro, cripto, poupança) são na', () => {
    const t = position('t', 'Tesouro Selic 2029', 'tesouro', [], { quantity: 1, avgPrice: 100 })
    const c = position('c', 'BTC', 'cripto', [], { quantity: 1, avgPrice: 100 })
    const s = position('s', 'Poupança', 'poupanca', [], { quantity: 1, avgPrice: 100, manualValue: 110 })
    const r = run({ positions: [t, c, s], quotes: { BTC: 120 }, events: null })
    expect(r.rows.map(x => x.dividends.status)).toEqual(['na', 'na', 'na'])
    expect(r.noDividendData).toEqual([])
    expect(r.dividends).toBe(0)
  })

  it('EZTC3 e EZTC3F usam os mesmos eventos', () => {
    const o1 = [buy('a', '2025-01-02', 100, 10)]
    const o2 = [buy('b', '2025-01-02', 5, 10)]
    const r = run({
      positions: [position('a', 'EZTC3', 'acao', o1), position('b', 'EZTC3F', 'acao', o2)],
      quotes: { EZTC3: 10, EZTC3F: 10 },
      operations: [...o1, ...o2],
      events: { EZTC3: [ev('2025-06-01', 0.5)] },
    })
    expect(r.rows.find(x => x.ticker === 'EZTC3')!.dividends.total).toBe(50)
    expect(r.rows.find(x => x.ticker === 'EZTC3F')!.dividends.total).toBe(2.5)
    expect(r.noDividendData).toEqual([])
  })
})

describe('encerradas', () => {
  it('mantêm realizado e dividendos do período, com unrealized 0', () => {
    const o = [buy('x', '2025-01-10', 100, 10), sell('x', '2025-08-10', 100, 13)]
    const closed: ClosedPosition[] = [{ position: position('x', 'ITSA4', 'acao', o), closedAt: '2025-08-10', realizedGain: 300 }]
    const r = run({ closed, operations: o, events: { ITSA4: [ev('2025-03-10', 0.1), ev('2025-09-10', 0.1)] } })
    const row = r.rows[0]
    expect(row.closed).toBe(true)
    expect(row.unrealized).toBe(0)
    expect(row.realized).toBe(300)
    expect(row.dividends.total).toBe(10)
    expect(row.total).toBe(310)
    expect(r.unrealized).toBe(0)
    expect(r.total).toBe(310)
    expect(r.bought).toBe(1000)
    expect(r.totalPct).toBeCloseTo(31, 10)
  })
})

describe('cotação ausente', () => {
  const o1 = [buy('a', '2025-01-02', 10, 10)]
  const o2 = [buy('b', '2025-01-02', 10, 20)]
  const pa = position('a', 'ITSA4', 'acao', o1)
  const pb = position('b', 'KNRI11', 'fii', o2)

  it('fica fora do lucro em aberto e da base do percentual', () => {
    const r = run({ positions: [pa, pb], quotes: { ITSA4: 12 }, operations: [...o1, ...o2], events: {} })
    const rowB = r.rows.find(x => x.id === 'b')!
    expect(rowB.valued).toBe(false)
    expect(rowB.unrealized).toBeNull()
    expect(r.missingQuotes).toEqual(['KNRI11'])
    expect(r.unrealized).toBe(20)
    expect(r.unrealizedPct).toBeCloseTo(20, 10) // 20 / 100, sem os 200 de KNRI11
    expect(r.total).toBe(20)
  })

  it('todas sem cotação: total null', () => {
    const r = run({ positions: [pa, pb], operations: [...o1, ...o2], events: {} })
    expect(r.unrealized).toBeNull()
    expect(r.unrealizedPct).toBeNull()
    expect(r.total).toBeNull()
    expect(r.totalPct).toBeNull()
    expect(r.rows.every(x => x.total === 0)).toBe(true)
  })
})

describe('realizado + em aberto', () => {
  it('poupança com resgate: = saldo + resgates − depositado', () => {
    const o = [
      op('p', 'deposit', '2026-01-01', { amount: 1000 }),
      op('p', 'deposit', '2026-02-01', { amount: 500 }),
      op('p', 'withdraw', '2026-03-01', { amount: 400, balanceBefore: 1550 }),
    ]
    const p = position('p', 'Poupança', 'poupanca', o, { manualValue: 1200 })
    const r = run({ positions: [p], operations: o })
    expect(r.rows[0].realized + (r.rows[0].unrealized ?? 0)).toBeCloseTo(1200 + 400 - 1500, 8)
    expect(r.bought).toBe(1500)
  })

  it('taxas de compra e venda são refletidas', () => {
    const o = [buy('a', '2025-01-02', 10, 10, 5), sell('a', '2025-02-02', 4, 12, 2)]
    const p = position('a', 'ITSA4', 'acao', o)
    const r = run({ positions: [p], quotes: { ITSA4: 12 }, operations: o, events: {} })
    expect(r.realized).toBeCloseTo(4, 8) // (12 − 10,5) × 4 − 2
    expect(r.unrealized).toBeCloseTo(9, 8) // 6 × 12 − 6 × 10,5
    expect(r.total).toBeCloseTo(72 + 46 - 105, 8) // valor + venda líquida − comprado
    expect(r.bought).toBe(105)
  })
})

describe('histórico inconsistente', () => {
  it('replay inválido é listado', () => {
    const o = [buy('a', '2025-01-02', 10, 10), sell('a', '2025-02-02', 50, 12)]
    const p = { ...position('a', 'ITSA4', 'acao', []), quantity: 10, avgPrice: 10 }
    const r = run({ positions: [p], quotes: { ITSA4: 10 }, operations: o, events: {} })
    expect(r.rows[0].inconsistent).toBe(true)
    expect(r.inconsistent).toEqual(['ITSA4'])
  })
})

describe('invariantes', () => {
  it('total da linha e total geral = soma das partes; ordenação por total desc', () => {
    const o1 = [buy('a', '2025-01-02', 10, 10)]
    const o2 = [buy('b', '2025-01-02', 10, 20), sell('b', '2025-05-02', 10, 25)]
    const o3 = [buy('c', '2025-01-02', 3, 30)]
    const pa = position('a', 'ITSA4', 'acao', o1)
    const pc = position('c', 'AUVP11', 'fii', o3)
    const closed: ClosedPosition[] = [{ position: position('b', 'KNRI11', 'fii', o2), closedAt: '2025-05-02', realizedGain: 50 }]
    const r = run({
      positions: [pa, pc], quotes: { ITSA4: 12 }, closed, operations: [...o1, ...o2, ...o3],
      events: { ITSA4: [ev('2025-06-01', 0.3)], KNRI11: [ev('2025-03-01', 0.2)], AUVP11: [ev('2025-06-01', 1)] },
    })
    for (const row of r.rows) expect(row.total).toBeCloseTo((row.unrealized ?? 0) + row.realized + row.dividends.total, 8)
    expect(r.total).toBeCloseTo(r.unrealized! + r.realized + r.dividends, 8)
    expect(r.total).toBeCloseTo(r.rows.reduce((s, x) => s + x.total, 0), 8)
    const totals = r.rows.map(x => x.total)
    expect(totals).toEqual([...totals].sort((x, y) => y - x))
  })

  it('sem posições nem encerradas: tudo zero, sem exceção', () => {
    const r = run({ events: null })
    expect(r.rows).toEqual([])
    expect(r.unrealized).toBe(0)
    expect(r.unrealizedPct).toBeNull()
    expect(r.realized).toBe(0)
    expect(r.dividends).toBe(0)
    expect(r.total).toBe(0)
    expect(r.totalPct).toBeNull()
    expect(r.bought).toBe(0)
    expect(r.received12m).toBe(0)
    expect([r.missingQuotes, r.noDividendData, r.noDividendDate, r.inconsistent]).toEqual([[], [], [], []])
  })
})
