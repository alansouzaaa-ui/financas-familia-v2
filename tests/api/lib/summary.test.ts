import { describe, it, expect } from 'vitest'
import { buildSummary } from '../../../api/lib/summary'
import type { SyncPayload } from '../../../src/lib/syncService'

const NOW = '2026-09-15T12:00:00.000Z' // Set/2026 em SP

function payloadWith(items: SyncPayload['manual_months'][number]['items']): SyncPayload {
  const record = {
    month: 'Set' as const, year: 2026,
    revenue: 0, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0,
    source: 'manual' as const, items,
  }
  for (const it of items ?? []) record[it.category] += it.value
  return { manual_months: [record], goals: [], recurring_items: [], investment_positions: [] } as SyncPayload
}

describe('buildSummary', () => {
  it('convida a lançar quando não há dados do mês', () => {
    const text = buildSummary(null, NOW)
    expect(text).toContain('Resumo de Setembro')
    expect(text).toContain('Ainda não há lançamentos')
  })

  it('resume receitas, despesas, resultado e falta pagar', () => {
    const payload = payloadWith([
      { id: '1', description: 'salario', value: 5000, category: 'revenue', isPaid: true },
      { id: '2', description: 'mercado', value: 800, category: 'variableCosts', isPaid: true, tag: 'supermercado' },
      { id: '3', description: 'cartão', value: 1200, category: 'cards', isPaid: false },
    ])
    const text = buildSummary(payload, NOW)
    expect(text).toContain('Receitas: R$ 5.000')
    expect(text).toContain('Despesas: R$ 2.000')
    expect(text).toContain('Resultado: +R$ 3.000')
    expect(text).toContain('Falta pagar: R$ 1.200 (1 em aberto)')
  })

  it('avisa vencimento de cartão nos próximos 5 dias', () => {
    const payload = payloadWith([
      { id: '4', description: 'compra', value: 450, category: 'cards', isPaid: false, cardId: 'c1' },
    ])
    payload.card_accounts = [{ id: 'c1', name: 'Havan', dueDay: 18 }] // dia 15 → vence em 3 dias
    const text = buildSummary(payload, NOW)
    expect(text).toContain('Havan vence em 3 dias (dia 18)')
    expect(text).toContain('R$ 450')
  })
})
