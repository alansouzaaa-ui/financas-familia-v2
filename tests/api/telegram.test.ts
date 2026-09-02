import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { signPayload } from '../../api/lib/auth.ts'

// ---- Module mocks (hoisted before any import of the handler) ----

vi.mock('../../api/lib/gist.ts', () => ({
  getGistPayload: vi.fn().mockResolvedValue({
    manual_months: [],
    goals: [],
    recurring_items: [],
    investment_positions: [],
  }),
  setGistPayload: vi.fn().mockResolvedValue(undefined),
}))

// ---- Helpers ---------------------------------------------------------------

const WEBHOOK_SECRET = 'test-webhook-secret'
const AUTH_SECRET = 'test-auth-secret'
const BOT_TOKEN = 'test-bot-token'
const ALLOWED_CHAT = '123456789'

function buildRequest(body: unknown, secret: string = WEBHOOK_SECRET): Request {
  return new Request('https://app/api/telegram', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': secret,
    },
    body: JSON.stringify(body),
  })
}

function textUpdate(text: string, chatId: string = ALLOWED_CHAT, messageId = 42) {
  return {
    update_id: 1,
    message: {
      message_id: messageId,
      chat: { id: parseInt(chatId, 10) },
      text,
    },
  }
}

function callbackUpdate(data: string, msgText: string, msgId = 42, chatId = ALLOWED_CHAT) {
  return {
    update_id: 2,
    callback_query: {
      id: 'cb-id-001',
      from: { id: parseInt(chatId, 10) },
      message: {
        message_id: msgId,
        chat: { id: parseInt(chatId, 10) },
        text: msgText,
      },
      data,
    },
  }
}

// ---- Setup -----------------------------------------------------------------

beforeEach(() => {
  process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET
  process.env.AUTH_SECRET = AUTH_SECRET
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN
  process.env.TELEGRAM_ALLOWED_CHAT_IDS = ALLOWED_CHAT

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// ---- Tests -----------------------------------------------------------------

describe('POST /api/telegram — secret validation', () => {
  it('rejects a request with no secret header → 401', async () => {
    const { default: telegram } = await import('../../api/telegram.ts')
    const req = new Request('https://app/api/telegram', {
      method: 'POST',
      body: JSON.stringify({ update_id: 1 }),
      headers: { 'Content-Type': 'application/json' },
      // No X-Telegram-Bot-Api-Secret-Token header
    })
    const res = await telegram(req)
    expect(res.status).toBe(401)
  })

  it('rejects a request with wrong secret → 401', async () => {
    const { default: telegram } = await import('../../api/telegram.ts')
    const res = await telegram(buildRequest({ update_id: 1 }, 'wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('accepts a request with correct secret → 200', async () => {
    const { default: telegram } = await import('../../api/telegram.ts')
    const res = await telegram(buildRequest(textUpdate('mercado 50,00')))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/telegram — chat allowlist', () => {
  it('silently ignores messages from disallowed chats → 200, no sendMessage', async () => {
    const { default: telegram } = await import('../../api/telegram.ts')
    const res = await telegram(buildRequest(textUpdate('mercado 50,00', '999999999')))
    expect(res.status).toBe(200)
    const fetchMock = vi.mocked(fetch)
    const calls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(calls.every(u => !u.includes('sendMessage'))).toBe(true)
  })

  it('processes messages from allowed chats and calls sendMessage', async () => {
    const { default: telegram } = await import('../../api/telegram.ts')
    const res = await telegram(buildRequest(textUpdate('mercado 185,40', ALLOWED_CHAT)))
    expect(res.status).toBe(200)
    const fetchMock = vi.mocked(fetch)
    const calls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(calls.some(u => u.includes('/sendMessage'))).toBe(true)
  })
})

describe('POST /api/telegram — text message parsing', () => {
  it('sends help message when text cannot be parsed', async () => {
    const { default: telegram } = await import('../../api/telegram.ts')
    const res = await telegram(buildRequest(textUpdate('hello', ALLOWED_CHAT)))
    expect(res.status).toBe(200)
    const fetchMock = vi.mocked(fetch)
    const sendCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/sendMessage'))
    expect(sendCall).toBeDefined()
    const body = JSON.parse(sendCall![1]!.body as string) as { text: string }
    expect(body.text).toContain('Não entendi')
  })

  it('sends confirmation preview with inline keyboard for valid text', async () => {
    const { default: telegram } = await import('../../api/telegram.ts')
    const res = await telegram(buildRequest(textUpdate('supermercado 247,90', ALLOWED_CHAT)))
    expect(res.status).toBe(200)
    const fetchMock = vi.mocked(fetch)
    const sendCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/sendMessage'))
    expect(sendCall).toBeDefined()
    const body = JSON.parse(sendCall![1]!.body as string) as {
      reply_markup: { inline_keyboard: { text: string; callback_data: string }[][] }
    }
    const buttons = body.reply_markup.inline_keyboard[0]
    expect(buttons.some(b => b.text.includes('Confirmar'))).toBe(true)
    expect(buttons.some(b => b.text.includes('Cancelar'))).toBe(true)
  })

  it('callback_data for confirm fits within 64 bytes', async () => {
    const { default: telegram } = await import('../../api/telegram.ts')
    await telegram(buildRequest(textUpdate('supermercado 247,90', ALLOWED_CHAT)))
    const fetchMock = vi.mocked(fetch)
    const sendCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/sendMessage'))!
    const body = JSON.parse(sendCall[1]!.body as string) as {
      reply_markup: { inline_keyboard: { callback_data: string }[][] }
    }
    for (const btn of body.reply_markup.inline_keyboard[0]) {
      expect(new TextEncoder().encode(btn.callback_data).length).toBeLessThanOrEqual(64)
    }
  })
})

describe('POST /api/telegram — callback sender allowlist', () => {
  it('silently ignores callback_query from disallowed sender → 200, no editMessageText', async () => {
    const { default: telegram } = await import('../../api/telegram.ts')
    // Build a callback from an unauthorized from.id (not in ALLOWED_CHAT)
    const update = {
      update_id: 3,
      callback_query: {
        id: 'cb-disallowed',
        from: { id: 888888888 }, // not in allowedChats
        message: {
          message_id: 10,
          chat: { id: parseInt(ALLOWED_CHAT, 10) },
          text: 'some preview `token`',
        },
        data: '{"a":"c"}',
      },
    }
    const res = await telegram(buildRequest(update))
    expect(res.status).toBe(200)
    const fetchMock = vi.mocked(fetch)
    const calls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(calls.every(u => !u.includes('editMessageText'))).toBe(true)
  })
})

describe('POST /api/telegram — callback cancel', () => {
  it('answers callback and edits message on cancel', async () => {
    const { default: telegram } = await import('../../api/telegram.ts')
    const update = callbackUpdate('{"a":"x"}', 'some preview text `token`')
    const res = await telegram(buildRequest(update))
    expect(res.status).toBe(200)
    const fetchMock = vi.mocked(fetch)
    const calls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(calls.some(u => u.includes('/answerCallbackQuery'))).toBe(true)
    expect(calls.some(u => u.includes('/editMessageText'))).toBe(true)
    const editCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/editMessageText'))!
    const body = JSON.parse(editCall[1]!.body as string) as { text: string }
    expect(body.text).toContain('cancelado')
  })
})

describe('POST /api/telegram — callback confirm', () => {
  it('answers callback, reads+writes Gist and edits message on valid confirm', async () => {
    // Build a real signed token so verifyPayload succeeds
    const compact = {
      d: 'mercado',
      v: 150.0,
      c: 'v',
      id: `telegram:${ALLOWED_CHAT}:42`,
      at: new Date().toISOString(),
    }
    const token = await signPayload(compact, AUTH_SECRET)
    const msgText = `💰 mercado — R$ 150,00\nCategoria: Variáveis\n\nConfirmar este lançamento?\n${token}`

    const { default: telegram } = await import('../../api/telegram.ts')
    const { getGistPayload, setGistPayload } = await import('../../api/lib/gist.ts')

    const update = callbackUpdate('{"a":"c"}', msgText, 42, ALLOWED_CHAT)
    const res = await telegram(buildRequest(update))
    expect(res.status).toBe(200)

    const fetchMock = vi.mocked(fetch)
    const calls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(calls.some(u => u.includes('/answerCallbackQuery'))).toBe(true)
    expect(calls.some(u => u.includes('/editMessageText'))).toBe(true)

    expect(vi.mocked(getGistPayload)).toHaveBeenCalled()
    expect(vi.mocked(setGistPayload)).toHaveBeenCalled()

    const editCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/editMessageText'))!
    const body = JSON.parse(editCall[1]!.body as string) as { text: string }
    expect(body.text).toContain('✅ Registrado')
  })

  it('returns 200 and edits to "Já registrado" on duplicate confirm (idempotent)', async () => {
    const { getGistPayload } = await import('../../api/lib/gist.ts')
    const existingExternalId = `telegram:${ALLOWED_CHAT}:99`

    // Gist already contains the transaction
    vi.mocked(getGistPayload).mockResolvedValueOnce({
      manual_months: [{
        month: 'Set',
        year: 2026,
        revenue: 0,
        fixedCosts: 0,
        loans: 0,
        cards: 0,
        variableCosts: 200,
        source: 'manual',
        items: [{
          id: existingExternalId,
          description: 'mercado',
          value: 200,
          category: 'variableCosts',
          isPaid: true,
          source: 'telegram',
          occurredAt: new Date().toISOString(),
          externalId: existingExternalId,
        }],
      }],
      goals: [],
      recurring_items: [],
      investment_positions: [],
    } as Parameters<typeof getGistPayload>[0] extends undefined ? never : Awaited<ReturnType<typeof getGistPayload>>)

    const compact = {
      d: 'mercado',
      v: 200,
      c: 'v',
      id: existingExternalId,
      at: new Date().toISOString(),
    }
    const token = await signPayload(compact, AUTH_SECRET)
    const msgText = `💰 mercado — R$ 200,00\nCategoria: Variáveis\n\nConfirmar este lançamento?\n${token}`

    const { default: telegram } = await import('../../api/telegram.ts')
    const update = callbackUpdate('{"a":"c"}', msgText, 99, ALLOWED_CHAT)
    const res = await telegram(buildRequest(update))
    expect(res.status).toBe(200)

    const fetchMock = vi.mocked(fetch)
    const editCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/editMessageText'))!
    const body = JSON.parse(editCall[1]!.body as string) as { text: string }
    expect(body.text).toContain('Já registrado')
  })

  it('edits to invalid token message when signature is bad', async () => {
    const badToken = 'this.is.invalid'
    const msgText = `some message\n${badToken}`

    const { default: telegram } = await import('../../api/telegram.ts')
    const update = callbackUpdate('{"a":"c"}', msgText, 11, ALLOWED_CHAT)
    const res = await telegram(buildRequest(update))
    expect(res.status).toBe(200)

    const fetchMock = vi.mocked(fetch)
    const editCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/editMessageText'))!
    const body = JSON.parse(editCall[1]!.body as string) as { text: string }
    expect(body.text).toContain('Token inválido')
  })
})
