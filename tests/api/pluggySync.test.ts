import { describe, it, expect } from 'vitest'
import { applyPluggySync, type AccountFetch } from '../../api/_lib/pluggySync'
import type { SyncPayload } from '../../src/lib/syncService'
import type { PluggyState } from '../../src/lib/pluggyState'
import { fingerprint, type PluggyTx } from '../../api/_lib/pluggyMapping'
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

describe('applyPluggySync - dados reais Caixa', () => {
  it('parcela do PDF (data da compra original) casa com a Pluggy pela parcela (NN/TT), independente da data', () => {
    const pdf: MonthItem = { id: 'pdf1', description: 'AMAZON PRIME BR (06/12)', value: 13.9, category: 'cards', isPaid: false, cardId: 'card-alan', occurredAt: '2026-05-04T12:00:00.000Z' }
    const t = tx({ id: 'am', description: 'AMAZON PRIME BR', amount: 13.9, date: '2026-10-30T15:00:00.000Z', creditCardMetadata: { installmentNumber: 6, totalInstallments: 12 } })
    const out = run(pay([pdf]), st(), fetch1([t]))
    expect(items(out.payload).map(i => i.id)).toEqual(['pdf1'])
    expect(out.counts.skippedDuplicates).toBe(1)
  })
  it('parcela diferente não casa pelo critério de parcela', () => {
    const pdf: MonthItem = { id: 'pdf1', description: 'AMAZON PRIME BR (05/12)', value: 13.9, category: 'cards', isPaid: false, cardId: 'card-alan', occurredAt: '2026-05-04T12:00:00.000Z' }
    const t = tx({ id: 'am', description: 'AMAZON PRIME BR', amount: 13.9, date: '2026-10-30T15:00:00.000Z', creditCardMetadata: { installmentNumber: 6, totalInstallments: 12 } })
    expect(run(pay([pdf]), st(), fetch1([t])).counts.created).toBe(1)
  })
})

describe('applyPluggySync - fechamento Caixa (30/10, vence 11/11)', () => {
  const bills = [{ id: 'b', dueDate: '2026-11-11', billClosingDate: '2026-10-30' }]
  const caixa = { ...acct, closeDate: '2026-11-30', dueDate: '2026-11-11' }
  it('item Pluggy intocado em Nov, de 31/10, é movido para Dez', () => {
    const t = tx({ id: 'ub', description: 'UBER', date: '2026-10-31T15:00:00.000Z' })
    const a = run(pay([], 'Nov'), st(), fetch1([t]))
    expect(items(a.payload).find(i => i.id === 'pluggy:ub')!._m).toBe('Nov/2026')
    const b = applyPluggySync(a.payload, st({ ...a.state, accounts: [caixa] }),
      [{ account: caixa, transactions: [t], bills, windowFrom: '2026-10-04' }], { now: NOW, cardDueDays: {} })
    expect(b.counts.moved).toBe(1)
    expect(items(b.payload).find(i => i.id === 'pluggy:ub')!._m).toBe('Dez/2026')
  })
  it('item do PDF em Nov de 30/10 ainda deduplica a compra Pluggy de 30/10 (Dez)', () => {
    const pdf: MonthItem = { id: 'pdf-uber', description: 'UBER', value: 100, category: 'cards', isPaid: false, cardId: 'card-alan', occurredAt: '2026-10-30T12:00:00.000Z' }
    const t = tx({ id: 'ub2', description: 'UBER', date: '2026-10-30T15:00:00.000Z' })
    const out = applyPluggySync(pay([pdf], 'Nov'), st({ accounts: [caixa] }),
      [{ account: caixa, transactions: [t], bills, windowFrom: '2026-10-04' }], { now: NOW, cardDueDays: {} })
    expect(out.counts.skippedDuplicates).toBe(1)
    expect(out.counts.created).toBe(0)
  })
})

describe('applyPluggySync - data inicial, limpeza e PDF', () => {
  const lagBills = [
    { id: 'b10', dueDate: '2026-10-11', billClosingDate: '2026-10-01' },
    { id: 'b09', dueDate: '2026-09-11', billClosingDate: '2026-09-01' },
  ]
  const caixa = { ...acct, closeDate: null, dueDate: '2026-10-11' }
  const runC = (p: SyncPayload, s: PluggyState, txs: PluggyTx[]) =>
    applyPluggySync(p, s, [{ account: caixa, transactions: txs, bills: lagBills, windowFrom: '2026-11-01' }], { now: NOW, cardDueDays: {} })
  const imp = (id: string, description: string, value: number, d: string): MonthItem => ({
    id, description, value, category: 'cards', isPaid: false, cardId: 'card-alan', source: 'import', occurredAt: `${d}T12:00:00.000Z`,
  })
  const month = (m: 'Out' | 'Nov' | 'Dez', its: MonthItem[]) =>
    ({ month: m, year: 2026, revenue: 0, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0, source: 'manual' as const, items: its })
  const seenOf = (appItemId: string, value: number, desc: string, ym: string, date: string) =>
    ({ appItemId, fp: fingerprint(value, desc, ym), at: NOW.toISOString(), accountId: 'acc1', value, date, pending: true })

  it('compra anterior à data inicial não é criada (fica vista sem item)', () => {
    const out = runC(pay([], 'Dez'), st({ accounts: [caixa], startDate: '2026-11-01' }),
      [tx({ id: 'old', date: '2026-10-31T15:00:00.000Z' }), tx({ id: 'new', date: '2026-11-01T15:00:00.000Z' })])
    expect(items(out.payload).map(i => i.id)).toEqual(['pluggy:new'])
    expect(out.state.seen.old).toMatchObject({ appItemId: null, date: '2026-10-31' })
  })
  it('mês com fatura importada por PDF (mesmo cartão) não recebe item Pluggy novo', () => {
    const p = { ...pay(), manual_months: [month('Nov', [imp('i1', 'PADARIA', 33.3, '2026-10-10')])] }
    const out = runC(p, st({ accounts: [caixa] }), [tx({ id: 'n', date: '2026-10-15T15:00:00.000Z', amount: 77 })])
    expect(out.counts.created).toBe(0)
    expect(out.counts.skippedDuplicates).toBe(1)
    expect(out.state.seen.n.appItemId).toBeNull()
    expect(items(out.payload).map(i => i.id)).toEqual(['i1'])
  })
  it('PDF de outro cartão não bloqueia', () => {
    const p = { ...pay(), manual_months: [month('Nov', [{ ...imp('i1', 'PADARIA', 33.3, '2026-10-10'), cardId: 'card-pai' }])] }
    expect(runC(p, st({ accounts: [caixa] }), [tx({ id: 'n', date: '2026-10-15T15:00:00.000Z', amount: 77 })]).counts.created).toBe(1)
  })
  it('item intocado cuja transação passou a ser ignorada é removido com tombstone', () => {
    const t = tx({ id: 'tfa', description: 'TOTAL DA FATURA ANTERIOR', amount: 1069.74, date: '2026-10-01T15:00:00.000Z' })
    const it0: MonthItem = { id: 'pluggy:tfa', externalId: 'pluggy:tfa', source: 'pluggy', description: 'TOTAL DA FATURA ANTERIOR', value: 1069.74, category: 'cards', isPaid: false, cardId: 'card-alan', occurredAt: '2026-10-01T15:00:00.000Z' }
    const s = st({ accounts: [caixa], seen: { tfa: seenOf('pluggy:tfa', 1069.74, 'TOTAL DA FATURA ANTERIOR', '2026-11', '2026-10-01') } })
    const out = runC({ ...pay(), manual_months: [month('Nov', [it0])] }, s, [t])
    expect(items(out.payload)).toHaveLength(0)
    expect(out.counts.removed).toBe(1)
    expect(out.state.seen.tfa.appItemId).toBeNull()
    expect(out.payload.deleted_ids).toEqual([{ id: 'pluggy:tfa', at: NOW.toISOString() }])
    expect(out.payload.manual_months.find(m => m.month === 'Nov')!.cards).toBe(0)
  })
  it('item ignorado mas pago pelo usuário fica', () => {
    const t = tx({ id: 'tfa', description: 'TOTAL DA FATURA ANTERIOR', amount: 1069.74, date: '2026-10-01T15:00:00.000Z' })
    const it0: MonthItem = { id: 'pluggy:tfa', source: 'pluggy', description: 'TOTAL DA FATURA ANTERIOR', value: 1069.74, category: 'cards', isPaid: true, cardId: 'card-alan' }
    const s = st({ accounts: [caixa], seen: { tfa: seenOf('pluggy:tfa', 1069.74, 'TOTAL DA FATURA ANTERIOR', '2026-11', '2026-10-01') } })
    const out = runC({ ...pay(), manual_months: [month('Nov', [it0])] }, s, [t])
    expect(items(out.payload).map(i => i.id)).toEqual(['pluggy:tfa'])
    expect(out.counts.removed).toBe(0)
  })
  it('item intocado anterior à data inicial que não veio na consulta também é removido', () => {
    const it0: MonthItem = { id: 'pluggy:x', source: 'pluggy', description: 'ANUIDADE', value: 17.25, category: 'cards', isPaid: false, cardId: 'card-alan' }
    const s = st({ accounts: [caixa], startDate: '2026-11-01', seen: { x: seenOf('pluggy:x', 17.25, 'ANUIDADE', '2026-10', '2026-10-01') } })
    const out = runC({ ...pay(), manual_months: [month('Out', [it0])] }, s, [tx({ id: 'other', date: '2026-11-05T15:00:00.000Z' })])
    expect(items(out.payload).map(i => i.id)).toEqual(['pluggy:other'])
    expect(out.counts.removed).toBe(1)
    expect(out.state.seen.x.appItemId).toBeNull()
  })

  it('cenário real Caixa: limpa Out/Nov, Nov fica só com o PDF, Ubers a partir de 01/11 vão para Dez; 2ª rodada idempotente', () => {
    const C = 'card-alan'
    const seen: PluggyState['seen'] = {}
    const pl = (txId: string, description: string, value: number, d: string, ym: string): MonthItem => {
      const id = `pluggy:${txId}`
      seen[txId] = { ...seenOf(id, value, description, ym, d), at: '2026-11-02T10:00:00.000Z' }
      return { id, externalId: id, source: 'pluggy', description, value, category: 'cards', isPaid: false, cardId: C, occurredAt: `${d}T15:00:00.000Z` }
    }
    const telegram: MonthItem = { id: 'tg1', source: 'telegram', description: 'pague menos', value: 59.78, category: 'cards', isPaid: false, cardId: C, occurredAt: '2026-09-02T12:00:00.000Z' }
    const out1 = [
      pl('o1', 'PAGUE MENOS (02/02)', 59.78, '2026-10-01', '2026-10'),
      pl('o2', 'AMAZON PRIME BR (05/12)', 13.9, '2026-10-01', '2026-10'),
      pl('o3', 'ANUIDADE', 17.25, '2026-10-01', '2026-10'),
      pl('o4', 'CASHBACK ANUIDADE GASTOS TIT', -8.62, '2026-10-01', '2026-10'),
    ]
    const uberDays = ['2026-10-30', '2026-10-30', '2026-10-31', '2026-10-31', '2026-11-01', '2026-11-01', '2026-11-01']
    const ubers = uberDays.map((d, i) => pl(`u${i}`, 'UBER *TRIP', 20 + i, d, '2026-11'))
    const novPluggy = [
      pl('tfa', 'TOTAL DA FATURA ANTERIOR', 1069.74, '2026-10-01', '2026-11'),
      pl('cb', 'CASHBACK ANUIDADE GASTOS TIT', -8.62, '2026-10-01', '2026-11'),
      ...ubers,
    ]
    const imports = [
      imp('i1', 'PADARIA REAL', 33.3, '2026-10-05'),
      imp('i2', 'POSTO SHELL', 150, '2026-10-12'),
      imp('i3', 'NETFLIX', 55.9, '2026-10-20'),
      imp('i4', 'MERCADO LIVRE (03/10)', 89.9, '2026-08-15'),
      imp('i5', 'FARMACIA SP', 42.15, '2026-10-28'),
    ]
    const p: SyncPayload = { ...pay(), manual_months: [month('Out', [telegram, ...out1]), month('Nov', [...imports, ...novPluggy])] }
    const s = st({ accounts: [caixa], startDate: '2026-11-01', seen })
    const bill10 = { billId: 'b10' }
    const txs: PluggyTx[] = [
      tx({ id: 'o1', description: 'PAGUE MENOS', amount: 59.78, date: '2026-10-01T15:00:00.000Z', status: 'PENDING', creditCardMetadata: { ...bill10, installmentNumber: 2, totalInstallments: 2 } }),
      tx({ id: 'o2', description: 'AMAZON PRIME BR', amount: 13.9, date: '2026-10-01T15:00:00.000Z', status: 'PENDING', creditCardMetadata: { ...bill10, installmentNumber: 5, totalInstallments: 12 } }),
      tx({ id: 'o3', description: 'ANUIDADE', amount: 17.25, date: '2026-10-01T15:00:00.000Z', status: 'PENDING', creditCardMetadata: bill10 }),
      tx({ id: 'o4', description: 'CASHBACK ANUIDADE GASTOS TIT', amount: 8.62, date: '2026-10-01T15:00:00.000Z', status: 'PENDING', creditCardMetadata: bill10 }),
      tx({ id: 'tfa', description: 'TOTAL DA FATURA ANTERIOR', amount: 1069.74, date: '2026-10-01T15:00:00.000Z', status: 'PENDING' }),
      tx({ id: 'cb', description: 'CASHBACK ANUIDADE GASTOS TIT', amount: 8.62, date: '2026-10-01T15:00:00.000Z', status: 'PENDING' }),
      ...uberDays.map((d, i) => tx({ id: `u${i}`, description: 'UBER *TRIP', amount: 20 + i, date: `${d}T15:00:00.000Z`, status: 'PENDING', category: 'Taxi and ride-hailing' })),
      tx({ id: 'nv', description: 'IFOOD', amount: 64.5, date: '2026-11-05T15:00:00.000Z', status: 'PENDING' }),
    ]

    const a = runC(p, s, txs)
    const at = (m: string) => items(a.payload).filter(i => i._m === m)
    expect(at('Out/2026').map(i => i.id)).toEqual(['tg1'])
    expect(at('Nov/2026').map(i => i.id).sort()).toEqual(['i1', 'i2', 'i3', 'i4', 'i5'])
    expect(at('Dez/2026').map(i => i.id).sort()).toEqual(['pluggy:nv', 'pluggy:u4', 'pluggy:u5', 'pluggy:u6'])
    const removed = ['pluggy:o1', 'pluggy:o2', 'pluggy:o3', 'pluggy:o4', 'pluggy:tfa', 'pluggy:cb', 'pluggy:u0', 'pluggy:u1', 'pluggy:u2', 'pluggy:u3']
    expect((a.payload.deleted_ids ?? []).map(t => t.id).sort()).toEqual([...removed].sort())
    expect(a.counts).toMatchObject({ removed: 10, moved: 3, created: 1 })
    expect(a.payload.manual_months.find(m => m.month === 'Out')!.cards).toBe(59.78)
    expect(a.payload.manual_months.find(m => m.month === 'Nov')!.cards).toBe(371.25)
    for (const id of ['o1', 'tfa', 'u0']) expect(a.state.seen[id].appItemId).toBeNull()

    const b = runC(a.payload, a.state, txs)
    expect(b.counts).toEqual({ created: 0, updated: 0, moved: 0, removed: 0, skippedDuplicates: 0 })
    expect(b.payload.manual_months).toEqual(a.payload.manual_months)
    expect(b.payload.deleted_ids).toEqual(a.payload.deleted_ids)
  })
})

describe('applyPluggySync - pulos reversíveis (data inicial / PDF)', () => {
  const lagBills = [
    { id: 'b10', dueDate: '2026-10-11', billClosingDate: '2026-10-01' },
    { id: 'b11', dueDate: '2026-11-11', billClosingDate: '2026-10-30' },
  ]
  const caixa = { ...acct, closeDate: null, dueDate: '2026-10-11' }
  const runC = (p: SyncPayload, s: PluggyState, txs: PluggyTx[]) =>
    applyPluggySync(p, s, [{ account: caixa, transactions: txs, bills: lagBills, windowFrom: '2026-10-01' }], { now: NOW, cardDueDays: {} })
  const novImport: MonthItem = { id: 'i1', description: 'PADARIA', value: 33.3, category: 'cards', isPaid: false, cardId: 'card-alan', source: 'import', occurredAt: '2026-10-10T12:00:00.000Z' }
  const nov = (its: MonthItem[]) => ({ ...pay(), manual_months: [{ month: 'Nov' as const, year: 2026, revenue: 0, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0, source: 'manual' as const, items: its }] })

  it('data inicial movida para trás: compra antes pulada é criada na rodada seguinte; repetir é idempotente', () => {
    const t = tx({ id: 'old', date: '2026-11-03T15:00:00.000Z' })
    const a = runC(pay([], 'Dez'), st({ accounts: [caixa], startDate: '2026-11-05' }), [t])
    expect(a.counts.created).toBe(0)
    expect(a.state.seen.old.skip).toBe('start')
    const a2 = runC(a.payload, a.state, [t])
    expect(a2.counts).toEqual({ created: 0, updated: 0, moved: 0, removed: 0, skippedDuplicates: 0 })
    const b = runC(a2.payload, { ...a2.state, startDate: '2026-11-01' }, [t])
    expect(b.counts.created).toBe(1)
    expect(items(b.payload).map(i => i.id)).toEqual(['pluggy:old'])
    expect(b.state.seen.old.skip).toBeUndefined()
    const c = runC(b.payload, b.state, [t])
    expect(c.counts).toEqual({ created: 0, updated: 0, moved: 0, removed: 0, skippedDuplicates: 0 })
  })
  it('item removido pela data inicial volta (com id novo) quando a data é corrigida', () => {
    const t = tx({ id: 'u', date: '2026-11-03T15:00:00.000Z' })
    const a = runC(pay([], 'Dez'), st({ accounts: [caixa] }), [t])
    expect(a.counts.created).toBe(1)
    const b = runC(a.payload, { ...a.state, startDate: '2026-11-05' }, [t])
    expect(b.counts.removed).toBe(1)
    expect(b.state.seen.u.skip).toBe('start')
    const c = runC(b.payload, { ...b.state, startDate: null }, [t])
    expect(c.counts.created).toBe(1)
    expect(items(c.payload).map(i => i.id)).toEqual(['pluggy:u:2'])
    expect(runC(c.payload, c.state, [t]).counts).toEqual({ created: 0, updated: 0, moved: 0, removed: 0, skippedDuplicates: 0 })
  })
  it('pulada pelo PDF e depois com billId para mês sem importação: é criada', () => {
    const t0 = tx({ id: 'n', date: '2026-10-15T15:00:00.000Z', amount: 77 })
    const a = runC(nov([novImport]), st({ accounts: [caixa] }), [t0])
    expect(a.counts.created).toBe(0)
    expect(a.state.seen.n.skip).toBe('import')
    expect(runC(a.payload, a.state, [t0]).counts).toEqual({ created: 0, updated: 0, moved: 0, removed: 0, skippedDuplicates: 0 })
    const t1 = { ...t0, creditCardMetadata: { billId: 'b10' } }
    const b = runC(a.payload, a.state, [t1])
    expect(b.counts.created).toBe(1)
    expect(items(b.payload).find(i => i.id === 'pluggy:n')!._m).toBe('Out/2026')
    expect(runC(b.payload, b.state, [t1]).counts).toEqual({ created: 0, updated: 0, moved: 0, removed: 0, skippedDuplicates: 0 })
  })
})
