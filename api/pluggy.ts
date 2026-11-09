// /api/pluggy: integração Pluggy (cartões via Meu Pluggy).
//   POST {action:'status'|'register-item'|'map-account'|'sync'} (sessão do app)
//   GET  com Authorization: Bearer <CRON_SECRET> (cron diário)
// Runtime Edge (como api/sync.ts). Nunca loga credenciais nem dados de transação.
import { verifySession } from './lib/auth'
import { getGistPayload, setGistPayload } from './lib/gist'
import { createPluggyClient, PluggyError } from './lib/pluggyClient'
import { mapAccount, readStatus, registerItem, runSync, type Deps } from './lib/pluggyRun'
import { toStatusView } from '../src/lib/pluggyState'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') return handleCron(req)
  if (req.method === 'POST') return handlePost(req)
  return fail('method not allowed', 405)
}

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
const fail = (error: string, status: number) => reply({ ok: false, error }, status)

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
  try { return new URL(origin).host === host } catch { return false }
}

function makeDeps(): Deps | null {
  const clientId = process.env.PLUGGY_CLIENT_ID
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return {
    client: createPluggyClient({ clientId, clientSecret }),
    load: () => getGistPayload(),
    save: p => setGistPayload(p),
    now: () => new Date(),
  }
}

function errorStatus(err: unknown): { msg: string; status: number } {
  if (err instanceof PluggyError) {
    if (err.status === 401 || err.status === 403) return { msg: 'Credenciais da Pluggy inválidas. Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET na Vercel.', status: 503 }
    if (err.status === 404) return { msg: 'Conexão não encontrada na Pluggy. Confira o ID copiado do painel.', status: 404 }
    return { msg: 'A Pluggy está indisponível no momento. Tente novamente.', status: 502 }
  }
  if (err instanceof Error && /inválido|não encontrad|Nenhuma conexão/.test(err.message)) return { msg: err.message, status: 400 }
  return { msg: 'Erro inesperado na integração com o banco.', status: 500 }
}

async function handleCron(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return fail('CRON_SECRET not configured', 500)
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) return fail('unauthorized', 401)
  const deps = makeDeps()
  if (!deps) return reply({ ok: true, skipped: 'not-configured' })
  try {
    const current = await deps.load()
    if (!current?.pluggy) return reply({ ok: true, skipped: 'no-item' })
    const status = await runSync(deps)
    console.log('[pluggy] cron', JSON.stringify({ ok: status.lastResult?.ok, created: status.lastResult?.created, updated: status.lastResult?.updated, moved: status.lastResult?.moved, removed: status.lastResult?.removed }))
    return reply({ ok: true })
  } catch (err) {
    const { msg, status } = errorStatus(err)
    console.error('[pluggy] cron failed', status)
    return fail(msg, status)
  }
}

async function handlePost(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) return fail('forbidden', 403)
  if (!(await isAuthorized(req))) return fail('unauthorized', 401)

  let body: { action?: unknown; itemId?: unknown; accountId?: unknown; cardId?: unknown }
  try { body = await req.json() } catch { return fail('Corpo da requisição inválido.', 400) }

  const deps = makeDeps()
  if (!deps) {
    if (body.action === 'status') return reply({ ok: true, status: toStatusView(undefined, false) })
    return fail('Integração com o banco não configurada: faltam PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET na Vercel.', 503)
  }

  try {
    switch (body.action) {
      case 'status':
        return reply({ ok: true, status: await readStatus(deps) })
      case 'register-item':
        if (typeof body.itemId !== 'string') return fail('itemId é obrigatório.', 400)
        return reply({ ok: true, status: await registerItem(deps, body.itemId) })
      case 'map-account':
        if (typeof body.accountId !== 'string') return fail('accountId é obrigatório.', 400)
        if (body.cardId !== null && typeof body.cardId !== 'string') return fail('cardId inválido.', 400)
        return reply({ ok: true, status: await mapAccount(deps, body.accountId, body.cardId as string | null) })
      case 'sync':
        return reply({ ok: true, status: await runSync(deps) })
      default:
        return fail('Ação desconhecida.', 400)
    }
  } catch (err) {
    const { msg, status } = errorStatus(err)
    return fail(msg, status)
  }
}
