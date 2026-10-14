import { describe, it, expect, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import {
  INVOICE_SCHEMA,
  buildExtractionRequest,
  extractInvoice,
  InvoiceExtractError,
} from '../../../api/lib/invoiceExtract'

function fakeClient(result: unknown | (() => unknown)) {
  const create = vi.fn(async () => (typeof result === 'function' ? (result as () => unknown)() : result))
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, create }
}

const validExtraction = {
  totalAmount: 100,
  dueDate: '2026-10-11',
  closingDate: null,
  issuer: 'Banco',
  lines: [
    {
      date: '05/09',
      description: 'LOJA',
      amount: 100,
      direction: 'debit',
      kind: 'purchase',
      installmentCurrent: null,
      installmentTotal: null,
      cardLast4: null,
    },
  ],
}

const okMessage = (text: string) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] })

function collectObjects(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) node.forEach(n => collectObjects(n, out))
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (o.type === 'object') out.push(o)
    Object.values(o).forEach(v => collectObjects(v, out))
  }
  return out
}

describe('buildExtractionRequest', () => {
  const req = buildExtractionRequest('QUJD')

  it('usa modelo, limites e opções esperados', () => {
    expect(req.model).toBe('claude-opus-5-5')
    expect(req.max_tokens).toBe(16000)
    expect(req.output_config.effort).toBe('low')
    expect(req.output_config.format.type).toBe('json_schema')
    expect(req.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(req.fallbacks).toBe('default')
    expect('thinking' in req).toBe(false)
    expect('temperature' in req).toBe(false)
  })

  it('coloca o documento antes do texto', () => {
    const content = req.messages[0].content
    expect(content[0].type).toBe('document')
    expect(content[1].type).toBe('text')
    expect(content[0]).toMatchObject({ source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD' } })
  })

  it('schema: todos os objetos fechados e com required completo', () => {
    const objects = collectObjects(INVOICE_SCHEMA)
    expect(objects.length).toBeGreaterThanOrEqual(2)
    for (const o of objects) {
      expect(o.additionalProperties).toBe(false)
      expect([...(o.required as string[])].sort()).toEqual(Object.keys(o.properties as object).sort())
    }
  })
})

describe('extractInvoice', () => {
  it('retorna a extração em caso de sucesso', async () => {
    const { client, create } = fakeClient(okMessage(JSON.stringify(validExtraction)))
    const r = await extractInvoice('QUJD', client)
    expect(r.lines).toHaveLength(1)
    expect(r.totalAmount).toBe(100)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('refusal vira erro amigável', async () => {
    const { client } = fakeClient({ stop_reason: 'refusal', content: [] })
    await expect(extractInvoice('QUJD', client)).rejects.toThrow(/recusou/i)
  })

  it('max_tokens vira "fatura muito longa"', async () => {
    const { client } = fakeClient({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{' }] })
    await expect(extractInvoice('QUJD', client)).rejects.toThrow(/muito longa/i)
  })

  it('JSON inválido gera erro', async () => {
    const { client } = fakeClient(okMessage('não é json'))
    await expect(extractInvoice('QUJD', client)).rejects.toBeInstanceOf(InvoiceExtractError)
  })

  it('forma inválida (amount negativo) gera erro', async () => {
    const bad = { ...validExtraction, lines: [{ ...validExtraction.lines[0], amount: -1 }] }
    const { client } = fakeClient(okMessage(JSON.stringify(bad)))
    await expect(extractInvoice('QUJD', client)).rejects.toThrow(/inválidas/i)
  })

  it('erro desconhecido do cliente vira InvoiceExtractError', async () => {
    const { client } = fakeClient(() => {
      throw new Error('boom')
    })
    await expect(extractInvoice('QUJD', client)).rejects.toBeInstanceOf(InvoiceExtractError)
  })
})
