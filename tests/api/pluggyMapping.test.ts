import { describe, it, expect } from 'vitest'
import {
  spDate, addMonths, billMonthKey, signedValue, isIgnored, describe as describeTx,
  tagFor, fingerprint, windowStart, toYmd, type PluggyTx,
} from '../../api/_lib/pluggyMapping'

const tx = (over: Partial<PluggyTx>): PluggyTx => ({
  id: 't1', description: 'COMPRA', amount: 50, type: 'DEBIT', date: '2026-11-05T15:00:00.000Z',
  status: 'POSTED', category: null, creditCardMetadata: null, ...over,
})
const acct = { closeDate: '2026-11-03', dueDate: '2026-11-10' }

describe('pluggyMapping', () => {
  it('spDate converte para o dia em São Paulo', () => {
    expect(spDate('2026-11-06T02:00:00.000Z')).toBe('2026-11-05')
    expect(spDate('2026-11-06T04:00:00.000Z')).toBe('2026-11-06')
  })
  it('addMonths vira o ano', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2027-01', -1)).toBe('2026-12')
  })
  it('mês pela fatura (billId) vence tudo', () => {
    const bills = new Map([['b1', { id: 'b1', dueDate: '2027-01-10' }]])
    expect(billMonthKey(tx({ creditCardMetadata: { billId: 'b1' } }), bills, acct)).toBe('2027-01')
  })
  it('sem billId: até o fechamento vai para o vencimento atual, depois para o seguinte', () => {
    expect(billMonthKey(tx({ date: '2026-11-03T15:00:00.000Z' }), new Map(), acct)).toBe('2026-11')
    expect(billMonthKey(tx({ date: '2026-11-04T15:00:00.000Z' }), new Map(), acct)).toBe('2026-12')
  })
  it('sem creditData: usa dueDay do cartão com fechamento 7 dias antes', () => {
    const none = { closeDate: null, dueDate: null }
    // vence dia 10 -> fecha dia 3
    expect(billMonthKey(tx({ date: '2026-11-02T15:00:00.000Z' }), new Map(), none, 10)).toBe('2026-11')
    expect(billMonthKey(tx({ date: '2026-11-05T15:00:00.000Z' }), new Map(), none, 10)).toBe('2026-12')
  })
  it('sem nada: mês seguinte ao da compra', () => {
    expect(billMonthKey(tx({}), new Map(), { closeDate: null, dueDate: null })).toBe('2026-12')
  })
  it('signedValue pelo type, ignorando o sinal do amount', () => {
    expect(signedValue(tx({ amount: -55.9, type: 'DEBIT' }))).toBe(55.9)
    expect(signedValue(tx({ amount: 20, type: 'CREDIT' }))).toBe(-20)
  })
  it('isIgnored: pagamento de fatura, saldo anterior e zero', () => {
    expect(isIgnored(tx({ type: 'CREDIT', category: 'Credit card payment' }))).toBe(true)
    expect(isIgnored(tx({ type: 'CREDIT', description: 'PAGAMENTO RECEBIDO' }))).toBe(true)
    expect(isIgnored(tx({ description: 'SALDO ANTERIOR' }))).toBe(true)
    expect(isIgnored(tx({ amount: 0 }))).toBe(true)
    expect(isIgnored(tx({ type: 'CREDIT', description: 'ESTORNO LOJA X' }))).toBe(false)
  })
  it('describe limpa espaços e acrescenta a parcela', () => {
    expect(describeTx(tx({ description: '  LOJA   X ', creditCardMetadata: { installmentNumber: 2, totalInstallments: 10 } }))).toBe('LOJA X (02/10)')
    expect(describeTx(tx({ description: 'LOJA X' }))).toBe('LOJA X')
  })
  it('tagFor: descrição primeiro, depois categoria Pluggy', () => {
    expect(tagFor('IFOOD *PEDIDO', 'Groceries')).toBe('alimentacao')
    expect(tagFor('XPTO 123', 'Groceries')).toBe('supermercado')
    expect(tagFor('XPTO 123', 'Eating out')).toBe('alimentacao')
    expect(tagFor('XPTO 123', 'Gas stations')).toBe('combustivel')
    expect(tagFor('XPTO 123', null)).toBeUndefined()
  })
  it('windowStart sem faturas: fechamento em dia 29-31 limita ao último dia do mês anterior', () => {
    const a = { id: 'a', name: 'n', last4: null, cardId: 'c', closeDate: '2026-03-31', dueDate: '2026-04-10', syncedOnce: false }
    expect(windowStart(a, [], null)).toBe('2026-03-01') // dia seguinte a 28/02
    expect(windowStart({ ...a, closeDate: '2026-05-31' }, [], null)).toBe('2026-05-01') // dia seguinte a 30/04
  })
  it('isIgnored: estorno que menciona pagamento não é descartado; pagamento sem categoria é', () => {
    const r = tx({ type: 'CREDIT', description: 'ESTORNO PAGAMENTO LOJA X' })
    expect(isIgnored(r)).toBe(false)
    expect(signedValue(r)).toBe(-50)
    expect(isIgnored(tx({ type: 'CREDIT', description: 'PAGAMENTO RECEBIDO', category: null }))).toBe(true)
  })
  it('sem billId: usa a fatura cujo fechamento cobre a compra antes do closeDate da conta', () => {
    const bills = new Map([['b', { id: 'b', dueDate: '2026-11-10', billClosingDate: '2026-11-03' }]])
    const advanced = { closeDate: '2026-12-03', dueDate: '2026-12-10' }
    expect(billMonthKey(tx({ date: '2026-10-20T15:00:00.000Z' }), bills, advanced)).toBe('2026-11')
  })
  it('fingerprint estável', () => {
    expect(fingerprint(10, 'A', '2026-11')).toBe('10.00|A|2026-11')
  })
  it('windowStart: 1ª sync desde o fechamento da fatura anterior; depois lastSyncAt − 45 dias', () => {
    const a = { id: 'a', name: 'n', last4: null, cardId: 'c', closeDate: '2026-11-03', dueDate: '2026-11-10', syncedOnce: false }
    const bills = [{ id: 'b0', dueDate: '2026-10-10', billClosingDate: '2026-10-03' }, { id: 'b1', dueDate: '2026-11-10', billClosingDate: '2026-11-03' }]
    expect(windowStart(a, bills, null)).toBe('2026-10-04')
    expect(windowStart(a, [], null)).toBe('2026-10-04') // sem faturas: closeDate − 1 mês + 1 dia
    expect(windowStart({ ...a, syncedOnce: true }, bills, '2026-11-09T10:00:00.000Z')).toBe('2026-09-25')
  })
})

describe('datas ISO da Pluggy', () => {
  it('toYmd normaliza', () => {
    expect(toYmd(null)).toBeNull()
    expect(toYmd(undefined)).toBeNull()
    expect(toYmd('')).toBeNull()
    expect(toYmd('2026-10-03')).toBe('2026-10-03')
    expect(toYmd('2026-10-03T00:00:00.000Z')).toBe('2026-10-03')
    expect(toYmd('Oct 3, 2026 10:00:00 UTC')).toBe('2026-10-03')
    expect(toYmd('lixo')).toBeNull()
  })
  it('windowStart aceita closeDate e faturas em ISO', () => {
    const a = { id: 'x', name: 'c', last4: null, cardId: 'k', closeDate: '2026-11-03T00:00:00.000Z', dueDate: '2026-11-10T00:00:00.000Z', syncedOnce: false }
    const bills = [{ id: 'b', dueDate: '2026-10-10T00:00:00.000Z', billClosingDate: '2026-10-03T00:00:00.000Z' }]
    expect(windowStart(a, bills, null)).toBe('2026-10-04')
  })
  it('billMonthKey aceita datas ISO de fatura', () => {
    const bills = new Map([['b', { id: 'b', dueDate: '2026-10-10T00:00:00.000Z', billClosingDate: '2026-10-03T00:00:00.000Z' }]])
    expect(billMonthKey(tx({ creditCardMetadata: { billId: 'b' } }), bills, acct)).toBe('2026-10')
    expect(billMonthKey(tx({ date: '2026-09-20T15:00:00.000Z' }), bills, acct)).toBe('2026-10')
    expect(billMonthKey(tx({ date: '2026-11-02T15:00:00.000Z' }), new Map(), { closeDate: '2026-11-03T00:00:00.000Z', dueDate: '2026-11-10T00:00:00.000Z' })).toBe('2026-11')
  })
})

describe('pluggyMapping - dados reais Caixa (Meu Pluggy)', () => {
  it('pagamento de fatura com categoria diferente de "Credit card payment" é ignorado', () => {
    expect(isIgnored(tx({ type: 'CREDIT', amount: -1061.11, description: 'PGTO.BOLETO REGISTRADO', category: 'Transfers' }))).toBe(true)
    expect(isIgnored(tx({ type: 'CREDIT', amount: -1138.18, description: 'AUT. PGTO. BOLETO REGISTRADO', category: 'Other' }))).toBe(true)
  })
  it('estorno com "pagamento" no texto não é tratado como pagamento de fatura', () => {
    expect(isIgnored(tx({ type: 'CREDIT', description: 'ESTORNO PAGAMENTO LOJA', category: 'Shopping' }))).toBe(false)
  })
  it('linha de fatura anterior é ignorada', () => {
    expect(isIgnored(tx({ type: 'CREDIT', amount: 1146.8, description: 'TOTAL DA FATURA ANTERIOR' }))).toBe(true)
    expect(isIgnored(tx({ type: 'DEBIT', amount: 1146.8, description: 'TOTAL DA FATURA ANTERIOR' }))).toBe(true)
  })
  it('cashback sempre negativo, mesmo vindo como DEBIT', () => {
    expect(signedValue(tx({ type: 'DEBIT', amount: 8.62, description: 'CASHBACK ANUIDADE GASTOS TIT' }))).toBe(-8.62)
    expect(signedValue(tx({ type: 'CREDIT', amount: 8.62, description: 'CASHBACK ANUIDADE GASTOS TIT' }))).toBe(-8.62)
  })
})

describe('billMonthKey - fechamento Caixa (compras até o dia do fechamento)', () => {
  const bills = new Map([['b', { id: 'b', dueDate: '2026-11-11', billClosingDate: '2026-10-30' }]])
  const caixa = { closeDate: '2026-11-30', dueDate: '2026-11-11' }
  const at = (d: string) => billMonthKey(tx({ date: `${d}T15:00:00.000Z` }), bills, caixa)
  it('antes do fechamento -> fatura fechada (Nov)', () => { expect(at('2026-10-29')).toBe('2026-11') })
  it('no dia do fechamento -> próxima fatura (Dez)', () => { expect(at('2026-10-30')).toBe('2026-12') })
  it('depois do fechamento, sem fatura aberta -> próxima fatura (Dez)', () => {
    expect(at('2026-10-31')).toBe('2026-12')
    expect(at('2026-11-01')).toBe('2026-12')
  })
})

describe('billMonthKey - faturas atrasadas na Pluggy (fechamento estimado)', () => {
  // Pluggy só conhece até a fatura que fechou em 01/10 (vence 11/10); a de Nov (fecha 30/10) não veio.
  const bills = new Map([
    ['b10', { id: 'b10', dueDate: '2026-10-11', billClosingDate: '2026-10-01' }],
    ['b09', { id: 'b09', dueDate: '2026-09-11', billClosingDate: '2026-09-01' }],
  ])
  const caixa = { closeDate: null, dueDate: '2026-10-11' }
  const at = (d: string) => billMonthKey(tx({ date: `${d}T15:00:00.000Z` }), bills, caixa)
  it.each([
    ['2026-09-30', '2026-10'],
    ['2026-10-01', '2026-11'],
    ['2026-10-29', '2026-11'],
    ['2026-10-30', '2026-12'],
    ['2026-10-31', '2026-12'],
    ['2026-11-01', '2026-12'],
    ['2026-11-28', '2026-12'],
    ['2026-11-29', '2027-01'],
  ])('compra em %s -> fatura %s', (d, ym) => { expect(at(d)).toBe(ym) })
})
