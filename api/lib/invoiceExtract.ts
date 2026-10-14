// api/lib/invoiceExtract.ts — extrai as linhas de uma fatura de cartão (PDF) via Claude.
// Server-only. Sem logs do conteúdo do PDF.
import Anthropic from '@anthropic-ai/sdk'

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })

export const LINE_KINDS = [
  'purchase', 'installment', 'fee', 'annual_fee', 'interest', 'iof', 'refund',
  'cashback', 'payment', 'previous_balance', 'adjustment', 'other',
] as const

export const INVOICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['totalAmount', 'dueDate', 'closingDate', 'issuer', 'lines'],
  properties: {
    totalAmount: nullable({ type: 'number' }),
    dueDate: nullable({ type: 'string' }),
    closingDate: nullable({ type: 'string' }),
    issuer: nullable({ type: 'string' }),
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'date', 'description', 'amount', 'direction', 'kind',
          'installmentCurrent', 'installmentTotal', 'cardLast4',
        ],
        properties: {
          date: { type: 'string' },
          description: { type: 'string' },
          amount: { type: 'number' },
          direction: { type: 'string', enum: ['debit', 'credit'] },
          kind: { type: 'string', enum: [...LINE_KINDS] },
          installmentCurrent: nullable({ type: 'integer' }),
          installmentTotal: nullable({ type: 'integer' }),
          cardLast4: nullable({ type: 'string' }),
        },
      },
    },
  },
}

export const PROMPT = `Extraia TODAS as linhas de lançamento desta fatura de cartão de crédito, na ordem em que aparecem, de todos os cartões/finais listados (inclusive cartões virtuais e adicionais).

Regras:
- Inclua linhas de saldo anterior (kind "previous_balance") e de pagamento recebido (kind "payment"); o aplicativo as ignora.
- Créditos (cashback, estorno, ajuste a crédito) têm direction "credit"; compras e cobranças têm direction "debit". O amount é SEMPRE positivo, em R$.
- Parcelas em formatos como "02 DE 02", "05 DE 12", "PARC 3/10", "06/ 12": preencha installmentCurrent e installmentTotal e mantenha a descrição SEM o trecho da parcela.
- Compras internacionais: amount é o valor em R$ cobrado (não o valor em moeda estrangeira); o IOF vai em linha própria com kind "iof".
- Anuidade: kind "annual_fee".
- NÃO inclua linhas de "Total ..." nem subtotais, nem simulações de parcelamento da fatura, nem encargos informativos ou tabelas de juros.
- totalAmount é o "valor total desta fatura". dueDate é o vencimento e closingDate o fechamento/data do documento, ambos em "YYYY-MM-DD" (null se não houver).
- A data de cada linha deve ser mantida como aparece ("DD/MM" ou "DD/MM/AAAA").
- cardLast4: final do cartão da linha, se houver.
- Não invente linhas.`

export function buildExtractionRequest(pdfBase64: string) {
  return {
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // Sem `thinking` (omitido = adaptive no Opus 5.5) e sem `temperature`.
    output_config: {
      effort: 'low' as const,
      format: { type: 'json_schema' as const, schema: INVOICE_SCHEMA },
    },
    betas: ['server-side-fallback-2026-07-01'],
    // `fallbacks` é tipado nativamente em BetaMessageCreateParams (SDK >= 0.133).
    fallbacks: 'default' as const,
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'document' as const,
            source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: pdfBase64 },
          },
          { type: 'text' as const, text: PROMPT },
        ],
      },
    ],
  }
}

export interface InvoiceLine {
  date: string
  description: string
  amount: number
  direction: 'debit' | 'credit'
  kind: string
  installmentCurrent: number | null
  installmentTotal: number | null
  cardLast4: string | null
}

export interface InvoiceExtraction {
  totalAmount: number | null
  dueDate: string | null
  closingDate: string | null
  issuer: string | null
  lines: InvoiceLine[]
}

export class InvoiceExtractError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'InvoiceExtractError'
    this.status = status
  }
}

function mapApiError(err: unknown): InvoiceExtractError {
  if (err instanceof InvoiceExtractError) return err
  if (err instanceof Anthropic.RateLimitError) {
    return new InvoiceExtractError('Muitas requisições ao serviço de IA. Tente novamente em instantes.', 429)
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new InvoiceExtractError('Chave da API de IA inválida ou sem permissão.', 503)
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new InvoiceExtractError('A leitura da fatura demorou demais. Tente novamente.', 504)
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new InvoiceExtractError('Falha de conexão com o serviço de IA. Tente novamente.', 502)
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new InvoiceExtractError('Não foi possível ler este PDF (arquivo inválido ou muito grande).', 422)
  }
  if (err instanceof Anthropic.APIError) {
    return new InvoiceExtractError('O serviço de IA está indisponível no momento. Tente novamente.', 502)
  }
  return new InvoiceExtractError('Erro inesperado ao ler a fatura.', 500)
}

function parseExtraction(text: string): InvoiceExtraction {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new InvoiceExtractError('A resposta da IA não pôde ser interpretada. Tente novamente.', 502)
  }
  const obj = data as Partial<InvoiceExtraction> | null
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.lines)) {
    throw new InvoiceExtractError('A resposta da IA veio em formato inesperado.', 502)
  }
  for (const l of obj.lines) {
    const ok =
      l && typeof l === 'object' &&
      typeof l.amount === 'number' && Number.isFinite(l.amount) && l.amount >= 0 &&
      (l.direction === 'debit' || l.direction === 'credit')
    if (!ok) throw new InvoiceExtractError('A resposta da IA contém linhas inválidas.', 502)
  }
  return obj as InvoiceExtraction
}

export async function extractInvoice(pdfBase64: string, client: Anthropic): Promise<InvoiceExtraction> {
  let message
  try {
    message = await client.beta.messages.create(buildExtractionRequest(pdfBase64))
  } catch (err) {
    throw mapApiError(err)
  }
  if (message.stop_reason === 'refusal') {
    throw new InvoiceExtractError('A IA recusou-se a processar este documento.', 422)
  }
  if (message.stop_reason === 'max_tokens') {
    throw new InvoiceExtractError('Fatura muito longa para ser lida de uma vez.', 413)
  }
  const block = message.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') {
    throw new InvoiceExtractError('A IA não retornou conteúdo. Tente novamente.', 502)
  }
  return parseExtraction(block.text)
}
