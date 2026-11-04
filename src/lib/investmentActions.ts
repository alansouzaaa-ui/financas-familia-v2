import { useInvestmentStore } from '@/stores/useInvestmentStore'
import { useOperationsStore } from '@/stores/useOperationsStore'
import { useTombstoneStore } from '@/stores/useTombstoneStore'
import type { ClosedPosition, InvestmentOperation, InvestmentPosition } from '@/types/investment'
import {
  applyBalanceDelta, isManualPosition, isValidISODate, manualBalance, manualBalanceDelta, openingFor,
  removalBlockReason, replayOperations, sortOperations, validateOperationChange,
} from '@/lib/operations'

// Único ponto que altera posições e operações juntas (as regras puras ficam em
// lib/operations). Nada aqui passa por `removePosition` a não ser deletePosition,
// porque ele apaga o histórico e grava tombstones.

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string }

const ok = <T,>(value: T): ActionResult<T> => ({ ok: true, value })
const fail = <T = undefined,>(error: string): ActionResult<T> => ({ ok: false, error })

export type DraftType = 'buy' | 'sell' | 'deposit' | 'withdraw'

/** Campos editáveis de uma operação. `undefined` em fees/note = sem taxa/sem nota. */
export interface OperationFields {
  date: string
  quantity?: number
  price?: number
  amount?: number
  fees?: number
  note?: string
}
export interface OperationDraft extends OperationFields { type: DraftType }

const CENT = 0.005
const NOTE_MAX = 200

const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function opsOf(positionId: string): InvestmentOperation[] {
  return useOperationsStore.getState().operations.filter(o => o.positionId === positionId)
}

interface Found { pos: InvestmentPosition; closed: boolean }

function findPosition(id: string): Found | null {
  const open = useInvestmentStore.getState().positions.find(p => p.id === id)
  if (open) return { pos: open, closed: false }
  const c = useOperationsStore.getState().closedPositions.find(x => x.position.id === id)
  return c ? { pos: c.position, closed: true } : null
}

function patchPosition(id: string, patch: Partial<InvestmentPosition>): void {
  const inv = useInvestmentStore.getState()
  if (inv.positions.some(p => p.id === id)) { inv.updatePosition(id, patch); return }
  const ops = useOperationsStore.getState()
  if (ops.closedPositions.some(c => c.position.id === id)) {
    ops.setAll({
      closedPositions: ops.closedPositions.map(c => (c.position.id === id ? { ...c, position: { ...c.position, ...patch } } : c)),
    })
  }
}

/** Posição sem nenhuma operação (cliente antigo, antes da migração): cria a abertura a partir do cache. */
function ensureLedger(pos: InvestmentPosition): void {
  if (opsOf(pos.id).length > 0) return
  useOperationsStore.getState().addOperation({ ...openingFor(pos, pos.id), createdAt: new Date().toISOString() })
}

function cleanNote(note: string | undefined): string | undefined {
  const t = note?.trim().slice(0, NOTE_MAX)
  return t || undefined
}

/**
 * Recalcula quantidade/preço médio em cache e move a posição entre `positions` e
 * `closedPositions` conforme o replay (encerrada ⇄ aberta). Replay inválido: não mexe.
 */
export function syncPositionState(positionId: string): void {
  const found = findPosition(positionId)
  if (!found) return
  const list = opsOf(positionId)
  if (!list.length) return
  const r = replayOperations(list)
  if (!r.valid) return
  const inv = useInvestmentStore.getState()
  const opsStore = useOperationsStore.getState()
  // A data da posição acompanha a compra mais antiga (pode mudar ao editar ou apagar uma operação)
  const buyDate = r.firstDate && list.some(o => !o.dateUnknown) ? r.firstDate : found.pos.buyDate
  const base: InvestmentPosition = { ...found.pos, quantity: r.quantity, avgPrice: r.avgPrice, buyDate }

  if (r.closed) {
    const sorted = sortOperations(list)
    const snapshot: ClosedPosition = { position: base, closedAt: sorted[sorted.length - 1].date, realizedGain: r.realizedGain }
    if (!found.closed) inv.setPositions(inv.positions.filter(p => p.id !== positionId))
    const has = opsStore.closedPositions.some(c => c.position.id === positionId)
    opsStore.setAll({
      closedPositions: has
        ? opsStore.closedPositions.map(c => (c.position.id === positionId ? snapshot : c))
        : [...opsStore.closedPositions, snapshot],
    })
    return
  }

  if (found.closed) {
    opsStore.setAll({ closedPositions: opsStore.closedPositions.filter(c => c.position.id !== positionId) })
    inv.setPositions([...inv.positions, base])
  } else if (found.pos.quantity !== r.quantity || found.pos.avgPrice !== r.avgPrice) {
    inv.updatePosition(positionId, { quantity: r.quantity, avgPrice: r.avgPrice })
  }
}

/** Cria a posição E a abertura `open:<id>`: toda posição nova já nasce com livro. */
export function createPosition(data: Omit<InvestmentPosition, 'id'>): string {
  const id = crypto.randomUUID()
  const pos: InvestmentPosition = { ...data, id }
  const inv = useInvestmentStore.getState()
  inv.setPositions([...inv.positions, pos])
  useOperationsStore.getState().addOperation({ ...openingFor(pos, id), createdAt: new Date().toISOString() })
  return id
}

function applyFields(base: InvestmentOperation, f: OperationFields): InvestmentOperation {
  const next: InvestmentOperation = { ...base, date: f.date }
  // Data nova e válida: a abertura deixa de ser "data desconhecida".
  if (f.date !== base.date) delete next.dateUnknown
  const optional = ['quantity', 'price', 'amount', 'fees'] as const
  for (const k of optional) {
    const v = f[k]
    if (v === undefined || (k === 'fees' && !(v > 0))) delete next[k]
    else next[k] = v
  }
  const note = cleanNote(f.note)
  if (note) next.note = note
  else delete next.note
  return next
}

/** Registra compra/venda/aporte/resgate numa posição aberta. */
export function registerOperation(positionId: string, draft: OperationDraft): ActionResult<InvestmentOperation> {
  const found = findPosition(positionId)
  if (!found || found.closed) return fail('Posição não encontrada.')
  const pos = found.pos
  const manual = isManualPosition(pos)
  if (manual && (draft.type === 'buy' || draft.type === 'sell')) return fail('Esta posição é por saldo: use Aportar ou Resgatar.')
  if (!manual && (draft.type === 'deposit' || draft.type === 'withdraw')) return fail('Esta posição é por cotas: use Comprar ou Vender.')

  const balance = manual ? manualBalance(pos) : 0
  if (draft.type === 'withdraw' && (draft.amount ?? 0) > balance + CENT) {
    return fail(`O resgate não pode passar do saldo atual (${brl(balance)}).`)
  }

  ensureLedger(pos)
  const op = applyFields({
    id: crypto.randomUUID(),
    positionId,
    type: draft.type,
    date: draft.date,
    ...(draft.type === 'withdraw' ? { balanceBefore: Math.round(balance * 100) / 100 } : {}),
    createdAt: new Date().toISOString(),
  }, draft)

  const err = validateOperationChange(opsOf(positionId), { kind: 'add', op })
  if (err) return fail(err)

  useOperationsStore.getState().addOperation(op)
  if (manual && (op.type === 'deposit' || op.type === 'withdraw')) {
    const next = applyBalanceDelta(balance, manualBalanceDelta(undefined, op))
    if (next != null) patchPosition(positionId, { manualValue: next })
  }
  syncPositionState(positionId)
  return ok(op)
}

/** Edita uma operação (inclusive a abertura). Posições manuais: o saldo acompanha a diferença do valor. */
export function updateOperation(operationId: string, fields: OperationFields): ActionResult {
  const all = useOperationsStore.getState().operations
  const old = all.find(o => o.id === operationId)
  if (!old) return fail('Operação não encontrada.')
  const found = findPosition(old.positionId)
  if (!found) return fail('Posição não encontrada.')
  const next = applyFields(old, fields)

  if (next.type === 'withdraw' && next.balanceBefore != null && (next.amount ?? 0) > next.balanceBefore + CENT) {
    return fail(`O resgate não pode passar do saldo que havia na data (${brl(next.balanceBefore)}).`)
  }
  const err = validateOperationChange(all.filter(o => o.positionId === old.positionId), { kind: 'update', op: next })
  if (err) return fail(err)

  const manual = isManualPosition(found.pos)
  let balance: number | null = null
  if (manual) {
    const delta = manualBalanceDelta(old, next)
    if (delta !== 0) {
      balance = applyBalanceDelta(manualBalance(found.pos), delta)
      if (balance == null) return fail('O saldo atual não comporta esta alteração. Atualize o saldo antes.')
    }
  }
  // A store só faz merge em updateOperation: para campos removidos (taxa, nota) trocamos a operação inteira.
  useOperationsStore.getState().setAll({
    operations: all.map(o => (o.id === operationId ? next : o)),
  })
  if (balance != null) patchPosition(old.positionId, { manualValue: balance })
  syncPositionState(old.positionId)
  return ok(undefined)
}

/** Remove uma operação (com tombstone). A abertura só sai junto com a posição. */
export function removeOperation(operationId: string): ActionResult {
  const all = useOperationsStore.getState().operations
  const old = all.find(o => o.id === operationId)
  if (!old) return fail('Operação não encontrada.')
  const found = findPosition(old.positionId)
  const blocked = removalBlockReason(all, operationId)
  if (blocked) return fail(blocked)

  let balance: number | null = null
  if (found && isManualPosition(found.pos)) {
    const delta = manualBalanceDelta(old, undefined)
    if (delta !== 0) {
      balance = applyBalanceDelta(manualBalance(found.pos), delta)
      if (balance == null) return fail('O saldo atual ficaria negativo sem este aporte. Atualize o saldo antes.')
    }
  }
  useOperationsStore.getState().removeOperation(operationId)
  if (balance != null) patchPosition(old.positionId, { manualValue: balance })
  syncPositionState(old.positionId)
  return ok(undefined)
}

/** Exclui a posição (aberta ou encerrada) e todo o histórico dela, com tombstones. */
export function deletePosition(positionId: string): void {
  useInvestmentStore.getState().removePosition(positionId)
  useTombstoneStore.getState().add([positionId])
}

/**
 * Depois de um pull: posições cujas operações dão "encerrada" vão para
 * `closedPositions`; encerradas cujas operações dão "aberta" voltam. Só escreve se algo muda.
 */
export function reconcileClosed(): void {
  const inv = useInvestmentStore.getState()
  const opsStore = useOperationsStore.getState()
  if (!opsStore.operations.length) return
  const byPos = new Map<string, InvestmentOperation[]>()
  for (const o of opsStore.operations) {
    const l = byPos.get(o.positionId)
    if (l) l.push(o)
    else byPos.set(o.positionId, [o])
  }

  let positions = inv.positions
  let closed = opsStore.closedPositions
  let changed = false

  // Abertas que na verdade estão encerradas
  const toClose: ClosedPosition[] = []
  const stillOpen: InvestmentPosition[] = []
  for (const p of positions) {
    const list = byPos.get(p.id)
    const r = list ? replayOperations(list) : null
    if (list && r && r.valid && r.closed) {
      const sorted = sortOperations(list)
      toClose.push({ position: { ...p, quantity: r.quantity, avgPrice: r.avgPrice }, closedAt: sorted[sorted.length - 1].date, realizedGain: r.realizedGain })
    } else stillOpen.push(p)
  }
  if (toClose.length) {
    positions = stillOpen
    const ids = new Set(toClose.map(c => c.position.id))
    closed = [...closed.filter(c => !ids.has(c.position.id)), ...toClose]
    changed = true
  }

  // Encerradas que na verdade estão abertas
  const reopened: InvestmentPosition[] = []
  const keepClosed: ClosedPosition[] = []
  for (const c of closed) {
    const list = byPos.get(c.position.id)
    const r = list ? replayOperations(list) : null
    if (list && r && r.valid && !r.closed) {
      if (!positions.some(p => p.id === c.position.id) && !reopened.some(p => p.id === c.position.id)) {
        reopened.push({ ...c.position, quantity: r.quantity, avgPrice: r.avgPrice })
      }
    } else keepClosed.push(c)
  }
  if (reopened.length || keepClosed.length !== closed.length) {
    positions = [...positions, ...reopened]
    closed = keepClosed
    changed = true
  }

  if (!changed) return
  if (positions !== inv.positions) inv.setPositions(positions)
  if (closed !== opsStore.closedPositions) opsStore.setAll({ closedPositions: closed })
}

/** Data de hoje (YYYY-MM-DD) no fuso local. */
export function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function isFutureDate(date: string): boolean {
  return isValidISODate(date) && date > todayISO()
}
