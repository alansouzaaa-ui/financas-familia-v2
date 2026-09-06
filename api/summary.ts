// api/summary.ts — Vercel Edge Function (disparada por Vercel Cron)
export const config = { runtime: 'edge' }

import { getGistPayload } from './lib/gist'
import { buildSummary } from './lib/summary'

async function tgSend(token: string, chatId: string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

export default async function handler(req: Request): Promise<Response> {
  // Autenticação: a Vercel Cron envia "Authorization: Bearer <CRON_SECRET>"
  // quando a env CRON_SECRET está configurada. Também aceita o mesmo header
  // para disparo manual controlado.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return new Response('CRON_SECRET not configured', { status: 500 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? ''
  const chats = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)

  if (!botToken || chats.length === 0) {
    return new Response('Telegram not configured', { status: 500 })
  }

  let payload: Awaited<ReturnType<typeof getGistPayload>>
  try {
    payload = await getGistPayload()
  } catch (err) {
    console.error('[summary] getGistPayload failed:', err)
    return new Response('Gist read failed', { status: 502 })
  }

  const text = buildSummary(payload, new Date().toISOString())

  await Promise.all(chats.map(chatId => tgSend(botToken, chatId, text)))

  return new Response(JSON.stringify({ ok: true, sent: chats.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
