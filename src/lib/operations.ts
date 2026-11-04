import type { ClosedPosition, InvestmentOperation, InvestmentPosition, OperationType } from '../types/investment'
import { pillarOf } from './reserve'

// Livro de operações de investimentos — funções puras (sem React/store). As
// operações são a fonte da verdade de quantidade e preço médio; os campos
// `quantity`/`avgPrice` de InvestmentPosition são cache derivado (ver
// applyOperationsToPositions).

const EPS = 1e-6      // tolerância de quantidade
const CENT = 0.005    // tolerância de saldo em BRL

/** Data fixa das aberturas migradas sem data válida. */
export const UNKNOWN_DATE = '2000-01-01'
/** createdAt fixo das aberturas migradas: todo dispositivo gera operações idênticas. */
export const MIGRATION_CREATED_AT = '2000-01-01T00:00:00.000Z'

export function isValidISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function isManualPosition(p: Pick<InvestmentPosition, 'manualValue' | 'assetType'>): boolean {
  return p.manualValue != null || p.assetType === 'poupanca'
}

// ── Ordenação ────────────────────────────────────────────────────────────────

const TYPE_RANK: Record<OperationType, number> = {
  opening: 0,
  buy: 1,
  deposit: 1,
  withdraw: 2,
  sell: 2,
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Por data; no mesmo dia: abertura, compra/aporte, retirada/venda; depois createdAt e id. */
export function sortOperations(ops: InvestmentOperation[]): InvestmentOperation[] {
  return [...ops].sort((a, b) =>
    cmpStr(a.date, b.date)
    || ((TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9))
    || cmpStr(a.createdAt ?? '', b.createdAt ?? '')
    || cmpStr(a.id, b.id))
}

// ── Replay ───────────────────────────────────────────────────────────────────

export interface ReplayResult {
  quantity: number
  /** Custo total em aberto (BRL). */
  cost: number
  avgPrice: number
  realizedGain: number
  closed: boolean
  valid: boolean
  firstInvalid?: InvestmentOperation
  /** Quantidade em carteira logo antes da operação inválida (para mensagens). */
  heldBeforeInvalid?: number
  firstDate?: string
}

function num(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * Reproduz as operações em ordem. SEM arredondamento: uma única abertura devolve
 * exatamente a quantidade e o preço dela (`avgPrice === price`).
 */
export function replayOperations(ops: InvestmentOperation[]): ReplayResult {
  const sorted = sortOperations(ops)
  let quantity = 0
  let cost = 0
  let avg = 0
  let realized = 0
  let everHeld = false
  let closedByWithdraw = false
  let valid = true
  let firstInvalid: InvestmentOperation | undefined
  let heldBeforeInvalid: number | undefined

  const fail = (op: InvestmentOperation) => {
    if (valid) { valid = false; firstInvalid = op; heldBeforeInvalid = quantity }
  }

  for (const op of sorted) {
    const fees = num(op.fees) && op.fees > 0 ? op.fees : 0
    switch (op.type) {
      case 'opening':
      case 'buy': {
        const q = op.quantity, p = op.price
        if (!num(q) || q < 0 || !num(p) || p < 0) { fail(op); break }
        if (quantity <= EPS) {
          quantity = q
          cost = q * p + fees
          avg = q > 0 && fees > 0 ? cost / q : p
        } else {
          cost += q * p + fees
          quantity += q
          avg = cost / quantity
        }
        if (quantity > EPS) everHeld = true
        closedByWithdraw = false
        break
      }
      case 'sell': {
        const q = op.quantity, p = op.price
        if (!num(q) || q <= 0 || !num(p) || p < 0 || q > quantity + EPS) { fail(op); break }
        realized += (p - avg) * q - fees
        cost -= avg * q
        quantity -= q
        if (quantity <= EPS) { quantity = 0; cost = 0 }
        else if (cost < 0) cost = 0
        closedByWithdraw = false
        break
      }
      case 'deposit': {
        const a = op.amount
        if (!num(a) || a <= 0) { fail(op); break }
        if (quantity <= EPS) quantity = 1 // convenção das posições manuais
        cost += a
        avg = cost / quantity
        everHeld = true
        closedByWithdraw = false
        break
      }
      case 'withdraw': {
        const a = op.amount
        if (!num(a) || a <= 0) { fail(op); break }
        const bb = op.balanceBefore
        const proportion = num(bb) && bb > 0 ? a / bb : (cost > 0 ? Math.min(a, cost) / cost : 0)
        const removed = cost * Math.min(1, proportion)
        realized += a - removed
        cost = Math.max(0, cost - removed)
        avg = quantity > 0 ? cost / quantity : 0
        closedByWithdraw = cost <= CENT && num(bb) && bb - a <= CENT
        break
      }
      default:
        fail(op)
    }
  }

  const closed = sorted.length > 0 && (closedByWithdraw || (everHeld && quantity <= EPS))
  const firstDate = (sorted.find(o => !o.dateUnknown) ?? sorted[0])?.date
  return {
    quantity, cost, avgPrice: avg, realizedGain: realized, closed, valid,
    ...(firstInvalid ? { firstInvalid, heldBeforeInvalid } : {}),
    ...(firstDate !== undefined ? { firstDate } : {}),
  }
}

/** Quantidade em carteira ao fim de `date` (YYYY-MM-DD). `ops` = operações de UMA posição. */
export function heldOn(ops: InvestmentOperation[], date: string): number {
  return replayOperations(ops.filter(o => o.date <= date)).quantity
}

export interface OpenLot {
  date: string
  quantity: number
  cost: number
  /** Lote de abertura migrada sem data válida: consumidores devem ignorá-lo em análises por data. */
  dateUnknown: boolean
}

/**
 * Lotes remanescentes (opening/buy) para a quantidade em aberto. Sem FIFO: cada
 * venda reduz todos os lotes proporcionalmente (coerente com preço médio).
 */
export function openLots(ops: InvestmentOperation[]): OpenLot[] {
  const lots: OpenLot[] = []
  const scale = (keep: number) => { for (const l of lots) { l.quantity *= keep; l.cost *= keep } }
  for (const op of sortOperations(ops)) {
    if (op.type === 'opening' || op.type === 'buy') {
      const q = op.quantity, p = op.price
      if (!num(q) || !num(p) || q <= 0) continue
      const fees = num(op.fees) && op.fees > 0 ? op.fees : 0
      lots.push({ date: op.date, quantity: q, cost: q * p + fees, dateUnknown: !!op.dateUnknown })
    } else if (op.type === 'sell') {
      const q = op.quantity
      if (!num(q) || q <= 0) continue
      const total = lots.reduce((s, l) => s + l.quantity, 0)
      if (total <= EPS) continue
      scale(1 - Math.min(1, q / total))
    } else if (op.type === 'deposit') {
      // Posição manual: o aporte é um lote em reais (quantidade = valor aportado).
      const a = op.amount
      if (!num(a) || a <= 0) continue
      lots.push({ date: op.date, quantity: a, cost: a, dateUnknown: !!op.dateUnknown })
    } else if (op.type === 'withdraw') {
      const a = op.amount
      if (!num(a) || a <= 0) continue
      const totalCost = lots.reduce((s, l) => s + l.cost, 0)
      const bb = op.balanceBefore
      const proportion = num(bb) && bb > 0 ? a / bb : (totalCost > 0 ? Math.min(a, totalCost) / totalCost : 0)
      scale(1 - Math.min(1, proportion))
    }
  }
  return lots.filter(l => l.quantity > EPS)
}

// ── Validação de mudanças ────────────────────────────────────────────────────

export type OperationChange =
  | { kind: 'add'; op: InvestmentOperation }
  | { kind: 'update'; op: InvestmentOperation }
  | { kind: 'remove'; id: string }

function brDate(iso: string): string {
  return isValidISODate(iso) ? iso.split('-').reverse().join('/') : iso
}

function fmtQty(n: number): string {
  return String(Math.round(n * 1e8) / 1e8).replace('.', ',')
}

function basicError(op: InvestmentOperation): string | null {
  if (!isValidISODate(op.date)) return 'Data inválida.'
  if (op.type === 'opening' || op.type === 'buy' || op.type === 'sell') {
    if (!num(op.quantity) || op.quantity <= 0) return 'A quantidade deve ser maior que zero.'
    if (!num(op.price) || op.price < 0) return 'O preço deve ser zero ou maior.'
  } else if (op.type === 'deposit' || op.type === 'withdraw') {
    if (!num(op.amount) || op.amount <= 0) return 'O valor deve ser maior que zero.'
  } else {
    return 'Tipo de operação inválido.'
  }
  if (op.fees != null && (!num(op.fees) || op.fees < 0)) return 'As taxas não podem ser negativas.'
  return null
}

/**
 * Aplica `change` à lista e devolve uma mensagem (pt-BR) se o resultado ficar
 * inválido em QUALQUER ponto no tempo (ex.: apagar uma compra de que uma venda
 * posterior depende, vender mais do que se tinha na data). null = ok.
 */
export function validateOperationChange(ops: InvestmentOperation[], change: OperationChange): string | null {
  let next: InvestmentOperation[]
  const affected = new Set<string>()
  if (change.kind === 'add') {
    const err = basicError(change.op)
    if (err) return err
    if (ops.some(o => o.id === change.op.id)) return 'Já existe uma operação com este identificador.'
    next = [...ops, change.op]
    affected.add(change.op.positionId)
  } else if (change.kind === 'update') {
    const old = ops.find(o => o.id === change.op.id)
    if (!old) return 'Operação não encontrada.'
    const err = basicError(change.op)
    if (err) return err
    next = ops.map(o => (o.id === change.op.id ? change.op : o))
    affected.add(old.positionId)
    affected.add(change.op.positionId)
  } else {
    const old = ops.find(o => o.id === change.id)
    if (!old) return 'Operação não encontrada.'
    next = ops.filter(o => o.id !== change.id)
    affected.add(old.positionId)
  }

  for (const positionId of affected) {
    const r = replayOperations(next.filter(o => o.positionId === positionId))
    if (r.valid || !r.firstInvalid) continue
    const bad = r.firstInvalid
    if (bad.type === 'sell') {
      return `A venda de ${fmtQty(bad.quantity ?? 0)} em ${brDate(bad.date)} ficaria maior que a quantidade em carteira nessa data (${fmtQty(r.heldBeforeInvalid ?? 0)}).`
    }
    return `A operação de ${brDate(bad.date)} ficaria inválida com esta alteração.`
  }
  return null
}

// ── Resultado por operação, prévias e saldo manual ───────────────────────────

export interface OperationResult {
  /** Resultado realizado (BRL) da venda/resgate, já líquido de taxas. */
  realized: number
  /** Custo (preço médio × quantidade vendida, ou custo retirado) que gerou o resultado; base do %. */
  soldCost: number
}

/**
 * Resultado de cada venda/resgate, por id, na ordem histórica (só conta as operações
 * até aquele ponto). Calculado pela diferença do replay acumulado, então a soma bate
 * com `replayOperations(...).realizedGain`.
 */
export function operationResults(ops: InvestmentOperation[]): Map<string, OperationResult> {
  const sorted = sortOperations(ops)
  const out = new Map<string, OperationResult>()
  let prev = replayOperations([])
  for (let i = 0; i < sorted.length; i++) {
    const cur = replayOperations(sorted.slice(0, i + 1))
    const op = sorted[i]
    if (op.type === 'sell') out.set(op.id, { realized: cur.realizedGain - prev.realizedGain, soldCost: prev.avgPrice * (op.quantity ?? 0) })
    else if (op.type === 'withdraw') out.set(op.id, { realized: cur.realizedGain - prev.realizedGain, soldCost: Math.max(0, prev.cost - cur.cost) })
    prev = cur
  }
  return out
}

/** Resultado realizado (BRL) de cada venda/resgate, por id. */
export function realizedByOperation(ops: InvestmentOperation[]): Map<string, number> {
  return new Map([...operationResults(ops)].map(([id, r]) => [id, r.realized]))
}

/** Valor da linha da operação: quantidade × preço, ou o valor do aporte/resgate. */
export function operationAmount(op: InvestmentOperation): number {
  if (op.type === 'deposit' || op.type === 'withdraw') return num(op.amount) ? op.amount : 0
  return (num(op.quantity) ? op.quantity : 0) * (num(op.price) ? op.price : 0)
}

export interface OperationPreview {
  before: ReplayResult
  after: ReplayResult
  /** Resultado realizado causado por esta operação (venda/resgate; 0 nas demais). */
  realized: number
  /** Custo (preço médio × quantidade) da parte vendida; base do percentual. */
  soldCost: number
}

/** Efeito de `op` sobre a posição (substitui a operação de mesmo id, se houver). */
export function previewOperation(ops: InvestmentOperation[], op: InvestmentOperation): OperationPreview {
  const base = ops.filter(o => o.id !== op.id)
  const before = replayOperations(base)
  const after = replayOperations([...base, op])
  const realized = op.type === 'sell' || op.type === 'withdraw' ? after.realizedGain - before.realizedGain : 0
  let soldCost = 0
  if (op.type === 'sell') soldCost = before.avgPrice * (op.quantity ?? 0)
  else if (op.type === 'withdraw') soldCost = before.cost - after.cost
  return { before, after, realized, soldCost }
}

/** Saldo atual de uma posição manual (saldo informado, ou o custo se ainda não houver). */
export function manualBalance(p: Pick<InvestmentPosition, 'manualValue' | 'quantity' | 'avgPrice'>): number {
  return p.manualValue != null ? p.manualValue : p.quantity * p.avgPrice
}

function manualEffect(op: InvestmentOperation | undefined): number {
  if (!op || !num(op.amount)) return 0
  if (op.type === 'deposit') return op.amount
  if (op.type === 'withdraw') return -op.amount
  return 0
}

/**
 * Quanto o saldo manual muda quando a operação `prev` vira `next` (aporte soma,
 * resgate subtrai). `prev` ausente = operação nova; `next` ausente = apagada.
 */
export function manualBalanceDelta(prev: InvestmentOperation | undefined, next: InvestmentOperation | undefined): number {
  return Math.round((manualEffect(next) - manualEffect(prev)) * 100) / 100
}

/** Aplica `delta` ao saldo; null se ficaria negativo (além da tolerância de centavo). */
export function applyBalanceDelta(balance: number, delta: number): number | null {
  const next = Math.round((balance + delta) * 100) / 100
  if (next < -CENT) return null
  return Math.max(0, next)
}

/** Total já colocado na posição (aberturas, compras com taxas e aportes): base do % de resultado. */
export function totalBought(ops: InvestmentOperation[]): number {
  let t = 0
  for (const o of ops) {
    if (o.type === 'opening' || o.type === 'buy') {
      t += (num(o.quantity) ? o.quantity : 0) * (num(o.price) ? o.price : 0) + (num(o.fees) && o.fees > 0 ? o.fees : 0)
    } else if (o.type === 'deposit') t += num(o.amount) ? o.amount : 0
  }
  return t
}

const TYPE_NOUN: Record<OperationType, string> = {
  opening: 'abertura', buy: 'compra', sell: 'venda', deposit: 'aporte', withdraw: 'resgate',
}

/**
 * Por que a operação `id` não pode ser apagada (mensagem em pt-BR), ou null se pode.
 * Ex.: "Esta compra sustenta a venda de 30/10. Apague a venda primeiro."
 */
export function removalBlockReason(ops: InvestmentOperation[], id: string): string | null {
  const old = ops.find(o => o.id === id)
  if (!old) return 'Operação não encontrada.'
  const siblings = ops.filter(o => o.positionId === old.positionId)
  // Posição juntada na migração tem várias aberturas: cada uma é uma compra e pode sair,
  // desde que reste ao menos uma e nenhuma venda dependa dela.
  const openings = siblings.filter(o => o.type === 'opening').length
  if (old.type === 'opening' && openings < 2) {
    return siblings.length > 1
      ? 'A abertura não pode ser apagada enquanto houver outras operações. Para remover tudo, exclua a posição.'
      : 'Esta é a única operação da posição. Para removê-la, exclua a posição.'
  }
  const r = replayOperations(siblings.filter(o => o.id !== id))
  if (r.valid || !r.firstInvalid) return null
  const bad = r.firstInvalid
  if (bad.type === 'sell' || bad.type === 'withdraw') {
    const short = brDate(bad.date).slice(0, 5)
    return `Esta ${old.type === 'opening' ? 'compra' : TYPE_NOUN[old.type]} sustenta ${bad.type === 'sell' ? 'a venda' : 'o resgate'} de ${short}. Apague ${bad.type === 'sell' ? 'a venda' : 'o resgate'} primeiro.`
  }
  return validateOperationChange(ops, { kind: 'remove', id })
}

// ── Uniões (cliente e servidor) ──────────────────────────────────────────────

/** União por id (a versão de `incoming` vence), menos os ids com tombstone. */
export function unionOperations(
  current: InvestmentOperation[] | undefined,
  incoming: InvestmentOperation[] | undefined,
  dead: ReadonlySet<string> = new Set(),
): InvestmentOperation[] {
  const byId = new Map<string, InvestmentOperation>()
  for (const o of current ?? []) if (o && typeof o.id === 'string') byId.set(o.id, o)
  for (const o of incoming ?? []) if (o && typeof o.id === 'string') byId.set(o.id, o)
  return [...byId.values()].filter(o => !dead.has(o.id))
}

/** União por `position.id` (a versão de `incoming` vence), menos os ids com tombstone. */
export function unionClosedPositions(
  current: ClosedPosition[] | undefined,
  incoming: ClosedPosition[] | undefined,
  dead: ReadonlySet<string> = new Set(),
): ClosedPosition[] {
  const byId = new Map<string, ClosedPosition>()
  for (const c of current ?? []) if (c?.position && typeof c.position.id === 'string') byId.set(c.position.id, c)
  for (const c of incoming ?? []) if (c?.position && typeof c.position.id === 'string') byId.set(c.position.id, c)
  return [...byId.values()].filter(c => !dead.has(c.position.id))
}

// ── Migração ─────────────────────────────────────────────────────────────────

function norm(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

export function normalizeTicker(t: string | undefined): string {
  return (t ?? '').trim().toUpperCase()
}

/** Chave de consolidação. Posições manuais (ou sem ticker) nunca se fundem: chave = id. */
export function consolidationKey(p: InvestmentPosition): string {
  const ticker = normalizeTicker(p.ticker)
  if (isManualPosition(p) || !ticker) return p.id
  // Pilar efetivo: vazio significa "detectar pelo tipo", então não separa de um escolhido igual
  return [ticker, p.assetType, norm(p.broker), norm(p.purpose), pillarOf(p) ?? ''].join('|')
}

export interface ConsolidationRow { id: string; quantity: number; avgPrice: number; buyDate: string }
export interface ConsolidationGroup {
  key: string
  keptId: string
  ticker: string
  broker: string
  purpose: string
  rows: ConsolidationRow[]
  totalQuantity: number
  totalCost: number
  avgPrice: number
}

// Linhas com data válida primeiro (mais antiga primeiro); empate pelo id.
function cmpRows(a: ConsolidationRow, b: ConsolidationRow): number {
  const av = isValidISODate(a.buyDate), bv = isValidISODate(b.buyDate)
  if (av !== bv) return av ? -1 : 1
  if (av && a.buyDate !== b.buyDate) return cmpStr(a.buyDate, b.buyDate)
  return cmpStr(a.id, b.id)
}

/**
 * `hasOps`: ids de posições que já têm alguma operação. Duas linhas com operações
 * nunca se fundem; uma linha sem operações só é absorvida por uma que tem (a mais
 * antiga delas). Sem `hasOps`, comportamento clássico (todas as linhas do grupo).
 */
export function planConsolidation(
  positions: InvestmentPosition[],
  hasOps: ReadonlySet<string> = new Set(),
): { groups: ConsolidationGroup[] } {
  const byKey = new Map<string, InvestmentPosition[]>()
  for (const p of positions) {
    const k = consolidationKey(p)
    const list = byKey.get(k)
    if (list) list.push(p)
    else byKey.set(k, [p])
  }
  const groups: ConsolidationGroup[] = []
  for (const [key, list] of byKey) {
    if (list.length < 2) continue
    let rows: ConsolidationRow[] = list
      .map(p => ({ id: p.id, quantity: p.quantity, avgPrice: p.avgPrice, buyDate: p.buyDate }))
      .sort(cmpRows)
    const owner = rows.find(r => hasOps.has(r.id))
    if (owner) {
      rows = [owner, ...rows.filter(r => !hasOps.has(r.id))]
      if (rows.length < 2) continue
    }
    const kept = list.find(p => p.id === rows[0].id)!
    let totalQuantity = 0, totalCost = 0
    for (const r of rows) { totalQuantity += r.quantity; totalCost += r.quantity * r.avgPrice }
    groups.push({
      key,
      keptId: kept.id,
      ticker: kept.ticker,
      broker: (kept.broker ?? '').trim(),
      purpose: (kept.purpose ?? '').trim(),
      rows,
      totalQuantity,
      totalCost,
      avgPrice: totalQuantity > 0 ? totalCost / totalQuantity : 0,
    })
  }
  return { groups }
}

const NOTES_MAX = 200

function joinNotes(list: InvestmentPosition[]): string | undefined {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const p of list) {
    const n = p.notes?.trim()
    if (n && !seen.has(n)) { seen.add(n); parts.push(n) }
  }
  return parts.length ? parts.join(' · ').slice(0, NOTES_MAX) : undefined
}

export interface MigrationResult {
  positions: InvestmentPosition[]
  operations: InvestmentOperation[]
  /** Linhas absorvidas por consolidação (linhas removidas). */
  merged: number
}

/** Abertura `open:<id>` de uma posição, com data desconhecida quando `buyDate` é inválida. */
export function openingFor(p: InvestmentPosition, positionId: string): InvestmentOperation {
  const known = isValidISODate(p.buyDate)
  return {
    id: `open:${p.id}`,
    positionId,
    type: 'opening',
    date: known ? p.buyDate : UNKNOWN_DATE,
    ...(known ? {} : { dateUnknown: true }),
    quantity: p.quantity,
    price: p.avgPrice,
    createdAt: MIGRATION_CREATED_AT,
  }
}

/**
 * Cria uma abertura determinística (`open:<rowId>`) para cada linha SEM operações
 * e consolida linhas duplicadas de mercado. Idempotente e idêntica em todo
 * dispositivo. Regras:
 * - linha que já tem QUALQUER operação nunca ganha abertura nova (uma `open:` apagada não volta);
 * - duas linhas que já têm operações nunca são fundidas automaticamente;
 * - linha sem operações com a mesma chave de uma linha com operações vira uma
 *   abertura dela (se o replay continuar válido), e o cache é recalculado pelo replay.
 * Posições de linha única ficam byte a byte iguais.
 */
export function migratePositions(positions: InvestmentPosition[], existingOps: InvestmentOperation[]): MigrationResult {
  const hasOps = new Set(existingOps.map(o => o.positionId))
  const byId = new Map(positions.map(p => [p.id, p]))
  const groups = planConsolidation(positions, hasOps).groups.filter(g => {
    if (!hasOps.has(g.keptId)) return true
    // Linha dona do histórico absorve as sem histórico só se nada ficar inválido (ex.: venda antes da compra).
    const extra = g.rows.filter(r => r.id !== g.keptId).map(r => openingFor(byId.get(r.id)!, g.keptId))
    return replayOperations([...existingOps.filter(o => o.positionId === g.keptId), ...extra]).valid
  })
  const survivorOf = new Map<string, string>()
  const groupOf = new Map<string, ConsolidationGroup>()
  for (const g of groups) {
    for (const r of g.rows) { survivorOf.set(r.id, g.keptId); groupOf.set(r.id, g) }
  }

  const haveIds = new Set(existingOps.map(o => o.id))
  const created: InvestmentOperation[] = []
  for (const p of positions) {
    if (hasOps.has(p.id)) continue
    const op = openingFor(p, survivorOf.get(p.id) ?? p.id)
    if (haveIds.has(op.id)) continue
    haveIds.add(op.id)
    created.push(op)
  }

  // Operações já existentes das linhas absorvidas passam a apontar para a sobrevivente.
  const remapped = existingOps.map(o => {
    const to = survivorOf.get(o.positionId)
    return to && to !== o.positionId ? { ...o, positionId: to } : o
  })
  const allOps = [...remapped, ...created]

  const out: InvestmentPosition[] = []
  const emitted = new Set<string>()
  let merged = 0
  for (const p of positions) {
    const g = groupOf.get(p.id)
    if (!g) { out.push(p); continue }
    if (emitted.has(g.key)) continue
    emitted.add(g.key)
    merged += g.rows.length - 1
    const kept = byId.get(g.keptId)!
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { manualValue, notes, ...rest } = kept
    const joined = joinNotes(g.rows.map(r => byId.get(r.id)!))
    const pillar = g.rows.map(r => byId.get(r.id)!.reservePillar).find(Boolean)
    out.push({
      ...rest,
      ...(pillar ? { reservePillar: pillar } : {}),
      quantity: g.totalQuantity,
      avgPrice: g.avgPrice,
      // `kept` é a linha dona do histórico, ou a de data válida mais antiga (sem nenhuma válida, a de menor id).
      buyDate: kept.buyDate,
      ...(joined !== undefined ? { notes: joined } : {}),
    })
  }

  // O cache de quantidade/preço médio é sempre o do replay das operações.
  return { positions: applyOperationsToPositions(out, allOps), operations: allOps, merged }
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
}

/**
 * Recalcula quantity/avgPrice em cache a partir das operações. Posições sem
 * operações, ou com replay inválido, ficam intactas (mesma referência), assim
 * como as que já batem com o replay.
 */
export function applyOperationsToPositions(
  positions: InvestmentPosition[],
  ops: InvestmentOperation[],
): InvestmentPosition[] {
  if (!ops.length) return positions
  const byPos = new Map<string, InvestmentOperation[]>()
  for (const o of ops) {
    const list = byPos.get(o.positionId)
    if (list) list.push(o)
    else byPos.set(o.positionId, [o])
  }
  let changed = false
  const next = positions.map(p => {
    const list = byPos.get(p.id)
    if (!list) return p
    const r = replayOperations(list)
    if (!r.valid) return p
    if (close(p.quantity, r.quantity) && close(p.avgPrice, r.avgPrice)) return p
    changed = true
    return { ...p, quantity: r.quantity, avgPrice: r.avgPrice }
  })
  return changed ? next : positions
}
