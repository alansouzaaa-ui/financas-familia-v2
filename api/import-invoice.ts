// POST /api/import-invoice  { pdfBase64 } -> { ok: true, extraction } | { ok: false, error }
//
// Runtime: Node.js (NÃO Edge) — o SDK da Anthropic e PDFs de até 3 MB pedem Node, e a
// leitura por IA pode levar dezenas de segundos. Assinatura Web (Request -> Response)
// via export nomeado `POST` (suportado pelo runtime Node da Vercel para api/*.ts fora do Next).
// Duração: `config.maxDuration` + `vercel.json` "functions" (redundância deliberada).
// Nunca loga o conteúdo do PDF.
import Anthropic from '@anthropic-ai/sdk'
import { verifySession } from './lib/auth.js'
import { extractInvoice, InvoiceExtractError } from './lib/invoiceExtract.js'

export const config = { maxDuration: 60 }

const MAX_BYTES = 3 * 1024 * 1024 // corpo da Vercel ~4,5 MB; base64 +33%

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function fail(error: string, status: number): Response {
  return reply({ ok: false, error }, status)
}

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k.trim() === name) return rest.join('=').trim()
  }
  return null
}

async function isAuthorized(req: Request): Promise<boolean> {
  const secret = process.env.AUTH_SECRET ?? ''
  const token = getCookieValue(req.headers.get('cookie'), 'ff_session')
  if (!token || !secret) return false
  return verifySession(token, secret, Date.now())
}

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')
  if (!origin || !host) return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) return fail('forbidden', 403)
  if (!(await isAuthorized(req))) return fail('unauthorized', 401)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fail('Leitura de fatura indisponível: ANTHROPIC_API_KEY não configurada no servidor.', 503)

  let body: { pdfBase64?: unknown }
  try {
    body = (await req.json()) as { pdfBase64?: unknown }
  } catch {
    return fail('Corpo da requisição inválido.', 400)
  }
  const raw = typeof body?.pdfBase64 === 'string' ? body.pdfBase64.trim() : ''
  if (!raw) return fail('pdfBase64 é obrigatório.', 400)
  const pdfBase64 = raw.replace(/^data:application\/pdf;base64,/i, '')

  // Tamanho decodificado aproximado antes de qualquer decodificação completa.
  const padding = pdfBase64.endsWith('==') ? 2 : pdfBase64.endsWith('=') ? 1 : 0
  const approxBytes = Math.floor((pdfBase64.length * 3) / 4) - padding
  if (approxBytes > MAX_BYTES) return fail('PDF muito grande (máximo 3 MB).', 413)

  const head = Buffer.from(pdfBase64.slice(0, 16), 'base64').toString('latin1')
  if (!head.startsWith('%PDF')) return fail('O arquivo enviado não é um PDF.', 400)

  try {
    const client = new Anthropic({ apiKey, timeout: 55_000, maxRetries: 0 })
    const extraction = await extractInvoice(pdfBase64, client)
    return reply({ ok: true, extraction })
  } catch (err) {
    if (err instanceof InvoiceExtractError) return fail(err.message, err.status)
    return fail('Erro inesperado ao ler a fatura.', 500)
  }
}
