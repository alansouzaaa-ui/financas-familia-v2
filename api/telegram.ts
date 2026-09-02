// api/telegram.ts — Vercel Edge Function
export const config = { runtime: 'edge' }

import { signPayload, verifyPayload } from './lib/auth'
import { getGistPayload, setGistPayload } from './lib/gist'
import { parseTransaction, appendTelegramTransaction } from './lib/telegram'
import type { ParsedTransaction } from './lib/telegram'

// ---- Types ----------------------------------------------------------------

interface TelegramMessage {
  message_id: number
  chat: { id: number }
  text?: string
}

interface TelegramCallbackQuery {
  id: string
  from: { id: number }
  message?: TelegramMessage
  data?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

interface CompactPayload {
  d: string   // description
  v: number   // value
  c: string   // category first letter: r/f/l/k/v
  id: string  // externalId
  at: string  // occurredAt ISO
}

// ---- Constants ------------------------------------------------------------

const CATEGORY_FROM_KEY: Record<string, ParsedTransaction['category']> = {
  r: 'revenue',
  f: 'fixedCosts',
  l: 'loans',
  k: 'cards',
  v: 'variableCosts',
}

const CATEGORY_TO_KEY: Record<ParsedTransaction['category'], string> = {
  revenue: 'r',
  fixedCosts: 'f',
  loans: 'l',
  cards: 'k',
  variableCosts: 'v',
}

const CATEGORY_LABELS: Record<ParsedTransaction['category'], string> = {
  revenue: 'Receita',
  fixedCosts: 'Fixos',
  loans: 'Empréstimos',
  cards: 'Cartões',
  variableCosts: 'Variáveis',
}

// ---- Helpers --------------------------------------------------------------

const enc = new TextEncoder()

/**
 * Constant-time string comparison via HMAC-SHA256 so secret length/content
 * is not leaked through timing side-channels.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false
  const [ka, kb] = await Promise.all([
    crypto.subtle.importKey('raw', enc.encode(a), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    crypto.subtle.importKey('raw', enc.encode(b), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  ])
  const msg = enc.encode('webhook-secret-compare')
  const [sa, sb] = await Promise.all([
    crypto.subtle.sign('HMAC', ka, msg),
    crypto.subtle.sign('HMAC', kb, msg),
  ])
  const va = new Uint8Array(sa)
  const vb = new Uint8Array(sb)
  // Both buffers are the same length (SHA-256 → 32 bytes), so the loop is constant-time.
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

async function tgPost(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function fmtBRL(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ---- Main handler ---------------------------------------------------------

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Bot-Api-Secret-Token',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // ---- Authenticate webhook ----
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? ''
  const incoming = req.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? ''
  if (!(await timingSafeEqual(incoming, webhookSecret))) {
    return new Response('Unauthorized', { status: 401 })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? ''
  const authSecret = process.env.AUTH_SECRET ?? ''
  const allowedChats = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  let update: TelegramUpdate
  try {
    update = (await req.json()) as TelegramUpdate
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  // ---- Text message ----
  if (update.message) {
    const msg = update.message
    const chatId = String(msg.chat.id)

    // Silently drop disallowed chats (200, no detail)
    if (!allowedChats.includes(chatId)) {
      return new Response('OK', { status: 200 })
    }

    const text = msg.text ?? ''
    const parsed = parseTransaction(text, chatId, msg.message_id)

    if (!parsed) {
      await tgPost(botToken, 'sendMessage', {
        chat_id: msg.chat.id,
        text: 'Não entendi. Tente: `mercado 150,00`',
        parse_mode: 'Markdown',
      })
      return new Response('OK', { status: 200 })
    }

    // Sign compact payload — avoids 64-byte callback_data limit by embedding
    // the token in the message text itself (backtick code span at the bottom).
    const compact: CompactPayload = {
      d: parsed.description,
      v: parsed.value,
      c: CATEGORY_TO_KEY[parsed.category] ?? 'v',
      id: parsed.externalId,
      at: parsed.occurredAt,
    }
    const token = await signPayload(compact, authSecret)

    const label = CATEGORY_LABELS[parsed.category]
    // Plain text — no parse_mode so user description cannot inject Markdown
    const messageText =
      `💰 ${parsed.description} — R$ ${fmtBRL(parsed.value)}\n` +
      `Categoria: ${label}\n\n` +
      `Confirmar este lançamento?\n` +
      token

    await tgPost(botToken, 'sendMessage', {
      chat_id: msg.chat.id,
      text: messageText,
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Confirmar', callback_data: '{"a":"c"}' },
          { text: '❌ Cancelar',  callback_data: '{"a":"x"}' },
        ]],
      },
    })

    return new Response('OK', { status: 200 })
  }

  // ---- Callback query ----
  if (update.callback_query) {
    const cb = update.callback_query

    // Silently drop callbacks from disallowed senders (same pattern as message handler)
    const fromId = String(cb.from.id)
    if (!allowedChats.includes(fromId)) {
      return new Response('OK', { status: 200 })
    }

    const msgChatId = cb.message?.chat.id
    const msgId = cb.message?.message_id

    // Always answer callback — even on error paths below
    await tgPost(botToken, 'answerCallbackQuery', { callback_query_id: cb.id })

    // Guard: Telegram may deliver a callback_query without a message (e.g. inline mode)
    if (!msgChatId) {
      return new Response('OK', { status: 200 })
    }

    let action: { a: string }
    try {
      action = JSON.parse(cb.data ?? '{}') as { a: string }
    } catch {
      return new Response('OK', { status: 200 })
    }

    if (action.a === 'x') {
      await tgPost(botToken, 'editMessageText', {
        chat_id: msgChatId,
        message_id: msgId,
        text: '❌ Lançamento cancelado.',
      })
      return new Response('OK', { status: 200 })
    }

    if (action.a === 'c') {
      // Extract token from the last line of the message (sent as plain text)
      const msgText = cb.message?.text ?? ''
      const lines = msgText.split('\n')
      const lastLine = lines[lines.length - 1].trim()
      const rawToken = lastLine || null

      if (!rawToken) {
        await tgPost(botToken, 'editMessageText', {
          chat_id: msgChatId,
          message_id: msgId,
          text: '⚠️ Token inválido ou expirado.',
        })
        return new Response('OK', { status: 200 })
      }

      const compact = await verifyPayload<CompactPayload>(rawToken, authSecret)

      if (!compact) {
        await tgPost(botToken, 'editMessageText', {
          chat_id: msgChatId,
          message_id: msgId,
          text: '⚠️ Token inválido ou expirado.',
        })
        return new Response('OK', { status: 200 })
      }

      const category = CATEGORY_FROM_KEY[compact.c] ?? 'variableCosts'
      const [, chatId, updateIdStr] = compact.id.split(':')
      const transaction: ParsedTransaction = {
        description: compact.d,
        value: compact.v,
        category,
        occurredAt: compact.at,
        externalId: compact.id,
        chatId: chatId ?? String(cb.from.id),
        updateId: parseInt(updateIdStr ?? '0', 10),
      }

      let raw: Awaited<ReturnType<typeof getGistPayload>>
      try {
        raw = await getGistPayload()
      } catch (err) {
        console.error('[telegram] getGistPayload failed:', err)
        await tgPost(botToken, 'editMessageText', {
          chat_id: msgChatId,
          message_id: msgId,
          text: '⚠️ Erro ao salvar. Tente novamente.',
        })
        return new Response('OK', { status: 200 })
      }

      const gistPayload = raw ?? {
        manual_months: [],
        goals: [],
        recurring_items: [],
        investment_positions: [],
      }

      const { payload: updated, inserted } = appendTelegramTransaction(gistPayload, transaction)

      if (!inserted) {
        // Idempotent — already recorded
        await tgPost(botToken, 'editMessageText', {
          chat_id: msgChatId,
          message_id: msgId,
          text: '⚠️ Já registrado.',
        })
        return new Response('OK', { status: 200 })
      }

      try {
        await setGistPayload(updated)
      } catch (err) {
        console.error('[telegram] setGistPayload failed:', err)
        await tgPost(botToken, 'editMessageText', {
          chat_id: msgChatId,
          message_id: msgId,
          text: '⚠️ Erro ao salvar. Tente novamente.',
        })
        return new Response('OK', { status: 200 })
      }

      await tgPost(botToken, 'editMessageText', {
        chat_id: msgChatId,
        message_id: msgId,
        text: `✅ Registrado: ${transaction.description} — R$ ${fmtBRL(transaction.value)}`,
      })

      return new Response('OK', { status: 200 })
    }
  }

  return new Response('OK', { status: 200 })
}
