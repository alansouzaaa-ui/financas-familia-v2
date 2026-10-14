import { describe, it, expect } from 'vitest'
import {
  buildDrafts,
  cleanDescription,
  draftsToItems,
  importExternalId,
  inferYear,
  reconcile,
  type Extraction,
  type ExtractedLine,
} from '../src/lib/invoiceImport'
import type { MonthItem } from '../src/types/finance'

function line(
  date: string,
  description: string,
  amount: number,
  o: Partial<ExtractedLine> = {},
): ExtractedLine {
  return {
    date,
    description,
    amount,
    direction: 'debit',
    kind: 'purchase',
    installmentCurrent: null,
    installmentTotal: null,
    cardLast4: null,
    ...o,
  }
}

// Fixture anonimizada (Cartões Caixa, vencimento 2026-10-11, total 1061,11)
const fixture: Extraction = {
  totalAmount: 1061.11,
  dueDate: '2026-10-11',
  closingDate: null,
  issuer: 'Cartões Caixa',
  lines: [
    line('01/09', 'SALDO FATURA ANTERIOR', 998.16, { kind: 'previous_balance' }),
    line('08/09', 'PAGAMENTO RECEBIDO', 998.16, { kind: 'payment', direction: 'credit' }),
    line('08/09', 'AJUSTE CRED PARC S/ JUROS', 0.01, { kind: 'adjustment', direction: 'credit' }),
    line('01/10', 'CASHBACK', 8.62, { kind: 'cashback', direction: 'credit' }),
    line('01/10', 'ANUIDADE DIFERENCIADA TIT', 17.25, { kind: 'annual_fee', installmentCurrent: 6, installmentTotal: 12 }),
    line('05/09', 'ZEHFAS BURGUER', 136.0, { cardLast4: '8806' }),
    line('05/09', '60421202Cristina', 17.98, { cardLast4: '8806' }),
    line('05/09', 'DL *UberRides', 8.95, { cardLast4: '8806' }),
    line('05/09', 'DL*UberRides', 10.96, { cardLast4: '8806' }),
    line('05/09', 'DL *UberRides', 9.95, { cardLast4: '8806' }),
    line('05/09', 'ASAAS *Boxzero CT 2', 99.0, { cardLast4: '8806' }),
    line('06/09', 'DL*UberRides', 7.94, { cardLast4: '8806' }),
    line('06/09', '60421202Cristina', 22.87, { cardLast4: '8806' }),
    line('06/09', 'GIASSI SUPERMERCADOS', 263.68, { cardLast4: '8806' }),
    line('06/09', 'USIMED DE TUBARAO', 142.42, { cardLast4: '8806' }),
    line('06/09', 'DL*UberRides', 6.94, { cardLast4: '8806' }),
    line('07/09', '60421202Cristina', 8.49, { cardLast4: '8806' }),
    line('07/09', '60421202Cristina', 13.99, { cardLast4: '8806' }),
    line('07/09', '60421202Cristina', 19.89, { cardLast4: '8806' }),
    line('07/09', '60421202Cristina', 30.46, { cardLast4: '8806' }),
    line('07/09', '60421202Cristina', 8.97, { cardLast4: '8806' }),
    line('08/09', 'DL*UberRides', 16.93, { cardLast4: '8806' }),
    line('08/09', '60421202Cristina', 11.48, { cardLast4: '8806' }),
    line('08/09', '60421202Cristina', 3.49, { cardLast4: '8806' }),
    line('08/09', 'DL *UberRides', 15.95, { cardLast4: '8806' }),
    line('07/08', 'PAGUE MENOS', 59.78, { kind: 'installment', installmentCurrent: 2, installmentTotal: 2, cardLast4: '8806' }),
    line('05/09', 'DL*GOOGLE Google', 9.99, { cardLast4: '0153' }),
    line('06/09', 'IFD*CIA LATINO AMERICA', 43.99, { cardLast4: '0153' }),
    line('07/09', 'EBN*SPOTIFY', 40.9, { cardLast4: '0153' }),
    line('04/05', 'AMAZON PRIME BR', 13.9, { kind: 'installment', installmentCurrent: 5, installmentTotal: 12, cardLast4: '0153' }),
    line('06/09', 'RAILWAY', 26.66, { cardLast4: '0153' }),
    line('06/09', 'IOF COMPRA INTERNACIONAL', 0.93, { kind: 'iof', cardLast4: '0153' }),
  ],
}

const CARD = 'card-1'
const MONTH = '2026-10'

describe('inferYear', () => {
  it('usa o ano do vencimento e recua quando o mês do lançamento é maior', () => {
    expect(inferYear('05/09', '2026-10-11', 2026)).toBe('2026-09-05')
    expect(inferYear('04/05', '2026-10-11', 2026)).toBe('2026-05-04')
    expect(inferYear('15/12', '2027-01-10', 2027)).toBe('2026-12-15')
  })
  it('aceita DD/MM/AAAA e usa fallbackYear sem vencimento', () => {
    expect(inferYear('03/02/2025', '2026-10-11', 2026)).toBe('2025-02-03')
    expect(inferYear('03/02', null, 2024)).toBe('2024-02-03')
  })
})

describe('cleanDescription', () => {
  it('colapsa espaços sem mudar a caixa', () => {
    expect(cleanDescription('  DL   *UberRides ')).toBe('DL *UberRides')
  })
})

describe('buildDrafts / reconcile', () => {
  const drafts = buildDrafts(fixture, { cardId: CARD, fallbackYear: 2026, existing: [] })

  it('fecha com o total da fatura', () => {
    const r = reconcile(drafts, fixture.totalAmount)
    expect(r.sum).toBe(1061.11)
    expect(r.diff).toBe(0)
    expect(r.ok).toBe(true)
  })

  it('ignora pagamento e saldo anterior', () => {
    const prev = drafts.find(d => d.kind === 'previous_balance')!
    const pay = drafts.find(d => d.kind === 'payment')!
    for (const d of [prev, pay]) {
      expect(d.status).toBe('ignored')
      expect(d.include).toBe(false)
    }
    expect(pay.reason).toBe('Pagamento da fatura')
    expect(prev.reason).toBe('Saldo anterior')
  })

  it('crédito fica negativo e sem tag', () => {
    const cb = drafts.find(d => d.kind === 'cashback')!
    expect(cb.value).toBe(-8.62)
    expect(cb.tag).toBeUndefined()
    expect(cb.include).toBe(true)
  })

  it('inclui a parcela na descrição e infere o ano', () => {
    const pm = drafts.find(d => d.description.startsWith('PAGUE MENOS'))!
    expect(pm.description).toBe('PAGUE MENOS (02/02)')
    expect(pm.date).toBe('2026-08-07')
    const amz = drafts.find(d => d.description.startsWith('AMAZON PRIME'))!
    expect(amz.description).toBe('AMAZON PRIME BR (05/12)')
    expect(amz.date).toBe('2026-05-04')
    expect(drafts.find(d => d.description.startsWith('ZEHFAS'))!.date).toBe('2026-09-05')
  })

  it('sugere tag para débitos', () => {
    expect(drafts.find(d => d.description === 'DL*UberRides')!.tag).toBe('uber')
  })

  it('keys são únicas', () => {
    expect(new Set(drafts.map(d => d.key)).size).toBe(drafts.length)
  })

  it('valor zero é ignorado', () => {
    const d = buildDrafts(
      { ...fixture, lines: [line('01/09', 'ZERO', 0)] },
      { cardId: CARD, fallbackYear: 2026, existing: [] },
    )
    expect(d[0].status).toBe('ignored')
    expect(d[0].reason).toBe('Valor zero')
  })

  it('reconcile sinaliza divergência e total ausente', () => {
    expect(reconcile(drafts, 1000).ok).toBe(false)
    expect(reconcile(drafts, null).ok).toBe(false)
  })
})

describe('duplicatas', () => {
  it('marca como duplicate um lançamento manual parecido', () => {
    const manual: MonthItem = {
      id: 'm1',
      description: 'Mercado Giassi',
      value: 263.68,
      category: 'cards',
      isPaid: false,
      cardId: CARD,
      occurredAt: new Date(2026, 8, 6, 12).toISOString(),
      source: 'manual',
    }
    const drafts = buildDrafts(fixture, { cardId: CARD, fallbackYear: 2026, existing: [manual] })
    const g = drafts.find(d => d.description.startsWith('GIASSI'))!
    expect(g.status).toBe('duplicate')
    expect(g.include).toBe(false)
    expect(g.reason).toContain('Mercado Giassi')
    expect(drafts.filter(d => d.status === 'duplicate')).toHaveLength(1)
  })

  it('reimportar marca tudo como already-imported', () => {
    const first = buildDrafts(fixture, { cardId: CARD, fallbackYear: 2026, existing: [] })
    const items = draftsToItems(first, CARD, MONTH)
    const again = buildDrafts(fixture, { cardId: CARD, fallbackYear: 2026, existing: items })
    const active = again.filter(d => d.status !== 'ignored')
    expect(active.length).toBe(items.length)
    expect(active.every(d => d.status === 'already-imported' && !d.include)).toBe(true)
  })
})

describe('draftsToItems', () => {
  const drafts = buildDrafts(fixture, { cardId: CARD, fallbackYear: 2026, existing: [] })
  const items = draftsToItems(drafts, CARD, MONTH)

  it('cria itens de cartão apenas para linhas incluídas', () => {
    expect(items).toHaveLength(drafts.filter(d => d.include).length)
    for (const it of items) {
      expect(it.category).toBe('cards')
      expect(it.isPaid).toBe(false)
      expect(it.cardId).toBe(CARD)
      expect(it.source).toBe('import')
      expect(it.externalId).toMatch(/^import:card-1:2026-10:[0-9a-f]{8}$/)
    }
    expect(new Set(items.map(i => i.id)).size).toBe(items.length)
  })

  it('inclui duplicata marcada pelo usuário', () => {
    const manual: MonthItem = {
      id: 'm1', description: 'x', value: 263.68, category: 'cards', isPaid: false, cardId: CARD,
    }
    const d2 = buildDrafts(fixture, { cardId: CARD, fallbackYear: 2026, existing: [manual] })
    const g = d2.find(d => d.status === 'duplicate')!
    expect(draftsToItems(d2, CARD, MONTH).some(i => i.value === 263.68)).toBe(false)
    g.include = true
    expect(draftsToItems(d2, CARD, MONTH).some(i => i.value === 263.68)).toBe(true)
  })

  it('importExternalId é determinístico', () => {
    const l = { date: '2026-09-05', description: 'Foo  Bar', value: 10, installment: null }
    expect(importExternalId('c', '2026-10', l)).toBe(importExternalId('c', '2026-10', { ...l, description: 'foo bar' }))
    expect(importExternalId('c', '2026-10', l)).not.toBe(importExternalId('c', '2026-10', { ...l, value: 10.01 }))
  })
})
