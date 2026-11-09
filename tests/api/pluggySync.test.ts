import { describe, it, expect } from 'vitest'
import { applyPluggySync, type AccountFetch } from '../../api/_lib/pluggySync'
import type { SyncPayload } from '../../src/lib/syncService'
import type { PluggyState } from '../../src/lib/pluggyState'
import type { PluggyTx } from '../../api/_lib/pluggyMapping'
import type { MonthItem } from '../../src/types/finance'

const NOW = new Date('2026-11-09T10:00:00.000Z')
const acct = { id: 'acc1', name: 'Caixa', last4: '1234', cardId: 'card-alan', closeDate: '2026-11-03', dueDate: '2026-11-10', syncedOnce: true }
const st = (over: Partial<PluggyState> = {}): PluggyState => ({
  itemId: 'it', itemStatus: 'UPDATED', itemError: null, consentExpiresAt: null,
  accounts: [acct], lastSyncAt: null, lastResult: null, seen: {}, ...over,
})
const pay = (items: MonthItem[] = [], month: 'Nov' | 'Dez' = 'Dez'): SyncPayload => ({
  manual_months: [{ month, year: 2026, revenue: 0, fixedCosts: 0, loans: 0, cards: 0, source: 'manual', items }],
  goals: [], recurring_items: [], investment_positions: [],
})
const tx = (over: Partial<PluggyTx>): PluggyTx => ({
  id: 't1', description: 'MERCADO BOM', amount: 100, type: 'DEBIT', date: '2026-11-05T15:00:00.000Z',
  status: 'POSTED', category: null, creditCardMetadata: null, ...over,
})
const fetch1 = (txs: PluggyTx[], bills = []): AccountFetch[] => [{ account: acct, transactions: txs, bills, windowFrom: '2026-10-04' }]
const run = (p: SyncPayload, s: PluggyState, f: AccountFetch[]) => applyPluggySync(p, s, f, { now: NOW, cardDueDays: {} })
const items = (p: SyncPayload) => p.manual_months.flatMap(m => (m.items ?? []).map(i => ({ ...i, _m: `${m.month}/${m.year}` })))

describe('applyPluggySync', () => {
  it('cria item com os campos corretos no mês da fatura e recalcula o total', () => {
    const out = run(pay([], 'Nov'), st(), fetch1([tx({})]))
    const it = items(out.payload).find(i => i.id === 'pluggy:t1')!
    expect(it).toMatchObject({ externalId: 'pluggy:t1', source: 'pluggy', category: 'cards', isPaid: false, cardId: 'card-alan', value: 100, description: 'MERCADO BOM', tag: 'supermercado', _m: 'Dez/2026' })
    expect(out.payload.manual_months.find(m => m.month === 'Dez')!.cards).toBe(100)
    expect(out.counts.created).toBe(1)
    expect(out.state.seen.t1).toMatchObject({ appItemId: 'pluggy:t1', accountId: 'acc1', pending: false })
  })
  it('é idempotente', () => {
    const a = run(pay(), st(), fetch1([tx({})]))
    const b = run(a.payload, a.state, fetch1([tx({})]))
    expect(b.counts).toEqual({ created: 0, updated: 0, moved: 0, removed: 0, skippedDuplicates: 0 })
    expect(items(b.payload).filter(i => i.id === 'pluggy:t1')).toHaveLength(1)
  })
  it('ignora pagamento de fatura e registra como visto', () => {
    const out = run(pay(), st(), fetch1([tx({ id: 'p', type: 'CREDIT', category: 'Credit card payment' })]))
    expect(items(out.payload)).toHaveLength(0)
    expect(out.state.seen.p.appItemId).toBeNull()
  })
  it('estorno entra negativo', () => {
    const out = run(pay(), st(), fetch1([tx({ id: 'r', type: 'CREDIT', description: 'ESTORNO LOJA' })]))
    expect(items(out.payload)[0].value).toBe(-100)
  })
  it('não duplica lançamento manual do mesmo cartão (±R$0,01, até 3 dias)', () => {
    const manual: MonthItem = { id: 'm1', description: 'mercado', value: 100.01, category: 'cards', isPaid: false, cardId: 'card-alan', occurredAt: '2026-11-03T12:00:00.000Z' }
    const out = run(pay([manual]), st(), fetch1([tx({})]))
    expect(items(out.payload).map(i => i.id)).toEqual(['m1'])
    expect(out.counts.skippedDuplicates).toBe(1)
    expect(out.state.seen.t1.appItemId).toBeNull()
  })
  it('não casa com item de outro cartão nem do PDF de outro valor', () => {
    const other: MonthItem = { id: 'm2', description: 'x', value: 100, category: 'cards', isPaid: false, cardId: 'card-pai' }
    const out = run(pay([other]), st(), fetch1([tx({})]))
    expect(out.counts.created).toBe(1)
  })
  it('item apagado pelo usuário não volta', () => {
    const a = run(pay(), st(), fetch1([tx({})]))
    const deleted = { ...a.payload, manual_months: a.payload.manual_months.map(m => ({ ...m, items: [] })) }
    const b = run(deleted, a.state, fetch1([tx({})]))
    expect(items(b.payload)).toHaveLength(0)
    expect(b.counts.created).toBe(0)
  })
  it('pendente confirmado com o mesmo id atualiza valor', () => {
    const a = run(pay(), st(), fetch1([tx({ status: 'PENDING', amount: 90 })]))
    const b = run(a.payload, a.state, fetch1([tx({ status: 'POSTED', amount: 100 })]))
    expect(items(b.payload).find(i => i.id === 'pluggy:t1')!.value).toBe(100)
    expect(b.counts.updated).toBe(1)
    expect(b.state.seen.t1.pending).toBe(false)
  })
  it('pendente que vira POSTED com id novo reaproveita o item', () => {
    const a = run(pay(), st(), fetch1([tx({ id: 'pend', status: 'PENDING' })]))
    const b = run(a.payload, a.state, fetch1([tx({ id: 'post', status: 'POSTED', date: '2026-11-06T15:00:00.000Z' })]))
    expect(items(b.payload)).toHaveLength(1)
    expect(b.state.seen.post.appItemId).toBe('pluggy:pend')
    expect(b.state.seen.pend.appItemId).toBeNull()
  })
  it('pendente cancelado é removido se não pago nem editado', () => {
    const a = run(pay(), st(), fetch1([tx({ id: 'pend', status: 'PENDING' })]))
    const b = run(a.payload, a.state, fetch1([tx({ id: 'outra', amount: 7, description: 'OUTRA LOJA' })]))
    expect(items(b.payload).map(i => i.id)).toEqual(['pluggy:outra'])
    expect(b.counts.removed).toBe(1)
  })
  it('pendente cancelado é preservado se pago ou editado', () => {
    const a = run(pay(), st(), fetch1([tx({ id: 'pend', status: 'PENDING' })]))
    const paid = { ...a.payload, manual_months: a.payload.manual_months.map(m => ({ ...m, items: (m.items ?? []).map(i => ({ ...i, isPaid: true })) })) }
    const other = fetch1([tx({ id: 'outra', amount: 7, description: 'OUTRA LOJA' })])
    expect(items(run(paid, a.state, other).payload).some(i => i.id === 'pluggy:pend')).toBe(true)
    const edited = { ...a.payload, manual_months: a.payload.manual_months.map(m => ({ ...m, items: (m.items ?? []).map(i => ({ ...i, description: 'Mercado do mês' })) })) }
    expect(items(run(edited, a.state, other).payload).some(i => i.id === 'pluggy:pend')).toBe(true)
  })
  it('billId que aparece move o item de mês', () => {
    const a = run(pay(), st(), fetch1([tx({})]))                 // estimado: Dez/2026
    const bills = [{ id: 'b', dueDate: '2027-01-10' }]
    const b = run(a.payload, a.state, fetch1([tx({ creditCardMetadata: { billId: 'b' } })], bills as never))
    expect(items(b.payload).find(i => i.id === 'pluggy:t1')!._m).toBe('Jan/2027')
    expect(b.counts.moved).toBe(1)
  })
  it('conta sem cardId é ignorada', () => {
    const out = applyPluggySync(pay(), st({ accounts: [{ ...acct, cardId: null }] }), [{ account: { ...acct, cardId: null }, transactions: [tx({})], bills: [], windowFrom: '2026-10-04' }], { now: NOW, cardDueDays: {} })
    expect(items(out.payload)).toHaveLength(0)
  })
  it('poda seen com mais de 400 dias e sem item', () => {
    const old = { appItemId: null, fp: 'x', at: '2025-01-01T00:00:00.000Z', accountId: 'acc1', value: 1, date: '2025-01-01', pending: false }
    const out = run(pay(), st({ seen: { velho: old } }), fetch1([]))
    expect(out.state.seen.velho).toBeUndefined()
  })
  it('marca syncedOnce nas contas processadas', () => {
    const out = run(pay(), st({ accounts: [{ ...acct, syncedOnce: false }] }), [{ account: { ...acct, syncedOnce: false }, transactions: [], bills: [], windowFrom: '2026-10-04' }])
    expect(out.state.accounts[0].syncedOnce).toBe(true)
  })

  it('item manual casa uma vez só entre execuções', () => {
    const manual: MonthItem = { id: 'm1', description: 'mercado', value: 100, category: 'cards', isPaid: false, cardId: 'card-alan', occurredAt: '2026-11-05T12:00:00.000Z' }
    const a = run(pay([manual]), st(), fetch1([tx({ id: 'A' })]))
    expect(a.counts.skippedDuplicates).toBe(1)
    expect(a.state.seen.A.matchedItemId).toBe('m1')
    const b = run(a.payload, a.state, fetch1([tx({ id: 'A' }), tx({ id: 'B', date: '2026-11-06T15:00:00.000Z' })]))
    expect(b.counts.created).toBe(1)
    expect(items(b.payload).map(i => i.id).sort()).toEqual(['m1', 'pluggy:B'])
  })
  it('na mesma execução, dois lançamentos iguais casam um manual só uma vez', () => {
    const manual: MonthItem = { id: 'm1', description: 'mercado', value: 100, category: 'cards', isPaid: false, cardId: 'card-alan', occurredAt: '2026-11-05T12:00:00.000Z' }
    const out = run(pay([manual]), st(), fetch1([tx({ id: 'A' }), tx({ id: 'B' })]))
    expect(out.counts.skippedDuplicates).toBe(1)
    expect(out.counts.created).toBe(1)
  })
  it('pendente novo não reaproveita pendente antigo que sumiu', () => {
    const a = run(pay(), st(), fetch1([tx({ id: 'pend', status: 'PENDING' })]))
    const b = run(a.payload, a.state, fetch1([tx({ id: 'pend2', status: 'PENDING' })]))
    expect(items(b.payload).map(i => i.id)).toEqual(['pluggy:pend2'])
    expect(b.counts.created).toBe(1)
    expect(b.counts.removed).toBe(1)
  })
  // --- revisão final ---
  const manualM1: MonthItem = { id: 'm1', description: 'mercado', value: 100, category: 'cards', isPaid: false, cardId: 'card-alan', occurredAt: '2026-11-05T12:00:00.000Z' }
  const otherTx = () => tx({ id: 'outra', amount: 7, description: 'OUTRA LOJA' })

  it('pendente casado com manual que posta com id novo não duplica', () => {
    const a = run(pay([manualM1]), st(), fetch1([tx({ id: 'pend', status: 'PENDING' })]))
    expect(a.counts.skippedDuplicates).toBe(1)
    const b = run(a.payload, a.state, fetch1([tx({ id: 'post', status: 'POSTED', date: '2026-11-06T15:00:00.000Z' })]))
    expect(b.counts.created).toBe(0)
    expect(items(b.payload).map(i => i.id)).toEqual(['m1'])
    expect(b.state.seen.post.matchedItemId).toBe('m1')
    expect(b.state.seen.pend.matchedItemId).toBeUndefined()
  })
  it('pendente casado com manual e cancelado libera o manual', () => {
    const a = run(pay([manualM1]), st(), fetch1([tx({ id: 'pend', status: 'PENDING' })]))
    const b = run(a.payload, a.state, fetch1([otherTx()]))
    expect(b.state.seen.pend.matchedItemId).toBeUndefined()
    const c = run(b.payload, b.state, fetch1([otherTx(), tx({ id: 'nova' })]))
    expect(c.counts.skippedDuplicates).toBe(1)
    expect(c.state.seen.nova.matchedItemId).toBe('m1')
    expect(items(c.payload).map(i => i.id).sort()).toEqual(['m1', 'pluggy:outra'])
  })
  it('sem billId, item de fatura já fechada não muda de mês quando o closeDate avança', () => {
    const a = run(pay([], 'Nov'), st(), fetch1([tx({ date: '2026-10-20T15:00:00.000Z' })]))
    expect(items(a.payload).find(i => i.id === 'pluggy:t1')!._m).toBe('Nov/2026')
    const next = { ...acct, closeDate: '2026-12-03', dueDate: '2026-12-10' }
    const bills = [{ id: 'b', dueDate: '2026-11-10', billClosingDate: '2026-11-03' }]
    const b = applyPluggySync(a.payload, st({ ...a.state, accounts: [next] }),
      [{ account: next, transactions: [tx({ date: '2026-10-20T15:00:00.000Z' })], bills, windowFrom: '2026-10-04' }], { now: NOW, cardDueDays: {} })
    expect(b.counts.moved).toBe(0)
    expect(items(b.payload).find(i => i.id === 'pluggy:t1')!._m).toBe('Nov/2026')
  })
  it('reconectar (conta com id novo) não duplica item Pluggy órfão', () => {
    const a = run(pay(), st(), fetch1([tx({})]))
    const acc2 = { ...acct, id: 'acc2' }
    const b = applyPluggySync(a.payload, st({ ...a.state, accounts: [acc2] }),
      [{ account: acc2, transactions: [tx({ id: 't1-novo' })], bills: [], windowFrom: '2026-10-04' }], { now: NOW, cardDueDays: {} })
    expect(b.counts.skippedDuplicates).toBe(1)
    expect(b.counts.created).toBe(0)
    expect(items(b.payload).map(i => i.id)).toEqual(['pluggy:t1'])
    expect(b.state.seen['t1-novo'].matchedItemId).toBe('pluggy:t1')
  })
  it('lista vazia não cancela pendentes', () => {
    const a = run(pay(), st(), fetch1([tx({ id: 'pend', status: 'PENDING' })]))
    const b = run(a.payload, a.state, fetch1([]))
    expect(b.counts.removed).toBe(0)
    expect(items(b.payload).map(i => i.id)).toEqual(['pluggy:pend'])
    expect(b.state.seen.pend.pending).toBe(true)
  })
  it('pendente cancelado que reaparece é recriado', () => {
    const a = run(pay(), st(), fetch1([tx({ id: 'pend', status: 'PENDING' })]))
    const b = run(a.payload, a.state, fetch1([otherTx()]))
    expect(b.counts.removed).toBe(1)
    expect(b.state.seen.pend.cancelled).toBe(true)
    const c = run(b.payload, b.state, fetch1([otherTx(), tx({ id: 'pend', status: 'POSTED' })]))
    expect(c.counts.created).toBe(1)
    const back = items(c.payload).filter(i => i.id !== 'pluggy:outra')
    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({ source: 'pluggy', value: 100 })
    // o id antigo está em tombstone (o cliente o apagaria): o recriado usa id novo
    expect(back[0].id).not.toBe('pluggy:pend')
    expect(c.state.seen.pend.appItemId).toBe(back[0].id)
    expect(c.state.seen.pend.cancelled).toBeUndefined()
  })
  it('duplicata do Telegram um mês ao lado é reconhecida', () => {
    const tg: MonthItem = { id: 'telegram:1:2', source: 'telegram', description: 'mercado', value: 100, category: 'cards', isPaid: false, cardId: 'card-alan', occurredAt: '2026-11-03T12:00:00.000Z' }
    // compra em 02/11 (fecha 03/11) -> fatura de Nov; o item do Telegram está em Dez
    const out = run(pay([tg], 'Dez'), st(), fetch1([tx({ date: '2026-11-02T15:00:00.000Z' })]))
    expect(out.counts.skippedDuplicates).toBe(1)
    expect(out.counts.created).toBe(0)
  })
  it('cancelamento grava tombstone do item removido', () => {
    const a = run(pay(), st(), fetch1([tx({ id: 'pend', status: 'PENDING' })]))
    const b = run(a.payload, a.state, fetch1([otherTx()]))
    expect(b.payload.deleted_ids).toEqual([{ id: 'pluggy:pend', at: NOW.toISOString() }])
  })
  it('item sem data (recorrente) num mês vizinho não engole a compra', () => {
    const rec: MonthItem = { id: 'rec-dez', description: 'assinatura', value: 100, category: 'cards', isPaid: false, cardId: 'card-alan' }
    // compra em 02/11 -> fatura de Nov; o recorrente sem occurredAt está em Dez
    const out = run(pay([rec], 'Dez'), st(), fetch1([tx({ date: '2026-11-02T15:00:00.000Z' })]))
    expect(out.counts.created).toBe(1)
    expect(out.counts.skippedDuplicates).toBe(0)
  })
  it('item sem data no mesmo mês da fatura ainda casa', () => {
    const rec: MonthItem = { id: 'rec-dez', description: 'assinatura', value: 100, category: 'cards', isPaid: false, cardId: 'card-alan' }
    const out = run(pay([rec], 'Dez'), st(), fetch1([tx({})])) // 05/11 -> fatura de Dez
    expect(out.counts.skippedDuplicates).toBe(1)
    expect(out.counts.created).toBe(0)
  })
})
