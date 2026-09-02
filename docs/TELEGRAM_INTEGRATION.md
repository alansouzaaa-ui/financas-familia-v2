# Telegram Integration Documentation

## Overview

This application includes a secured Telegram bot integration that enables recording financial transactions directly from Telegram. The integration uses:

- **Message Parsing**: Natural language transaction parsing (e.g., "mercado 150,00" → expense of R$ 150)
- **Category Classification**: Automatic category detection via keywords
- **Confirmation Flow**: Two-step verification with inline keyboard prompts
- **Secure Signing**: HMAC-SHA256 signed tokens to prevent tampering
- **Idempotency**: Duplicate transaction prevention via external IDs

## Environment Variables

The following 9 environment variables are **required** for Telegram integration:

| Variable | Purpose | Example |
|----------|---------|---------|
| `GITHUB_GIST_TOKEN` | GitHub Personal Access Token for Gist API authentication | `ghp_xxxxxxxxxxxxxxxxxxxx` |
| `GITHUB_GIST_ID` | GitHub Gist ID where financial data is persisted | `abc123def456` |
| `ANTHROPIC_API_KEY` | Anthropic API key (reserved for future AI features) | `sk-ant-xxxxxxxxxxxxxxxxx` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | `123456789:ABCDefGHIjklmnoPQRstuvwxyz1234567` |
| `TELEGRAM_WEBHOOK_SECRET` | Random secret for webhook signature verification | `your-random-32-char-secret-here` |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Comma-separated chat IDs authorized to use the bot | `123456789,987654321` |
| `APP_USER` | Dashboard login username | `alan` |
| `APP_PASS` | Dashboard login password (strong, at least 12 chars) | `MyStr0ngP@ssw0rd!` |
| `AUTH_SECRET` | Secret for signing session cookies (long random string) | `your-long-random-secret-for-cookie-signing` |

### Secret Generation

For `TELEGRAM_WEBHOOK_SECRET` and `AUTH_SECRET`, use a cryptographically secure random value:

**PowerShell**:
```powershell
[System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((New-Guid).ToString() + (New-Guid).ToString()))
```

**Linux/macOS**:
```bash
openssl rand -base64 32
```

## Creating a Telegram Bot

1. **Open Telegram** and search for `@BotFather`
2. **Send** `/newbot`
3. **Choose a bot name** (e.g., "Finanças Familia Bot")
4. **Choose a unique username** (e.g., "financa_familia_bot")
5. **Copy the token** — this is your `TELEGRAM_BOT_TOKEN`
   - Example: `123456789:ABCDefGHIjklmnoPQRstuvwxyz1234567`
6. **Get your Chat ID**:
   - Send any message to your new bot
   - Visit: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
   - Find your `chat.id` in the response
   - This is your `TELEGRAM_ALLOWED_CHAT_IDS`

## Webhook Registration (Post-Deploy)

After deploying to Vercel, register the webhook endpoint:

```powershell
$token = Read-Host "Bot token"
$secret = Read-Host "Webhook secret"
$url = "https://financas-familia-v2.vercel.app/api/telegram"

Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" `
  -Method Post -ContentType "application/json" `
  -Body "{`"url`":`"$url`",`"secret_token`":`"$secret`"}"
```

This command:
- Takes your bot token and webhook secret as secure input (not visible on screen)
- Registers the webhook URL with Telegram
- Sets the secret token for request validation

## Authentication Flow

### Dashboard Login

1. **Open** `https://financas-familia-v2.vercel.app/`
2. **Enter credentials**:
   - Username: `APP_USER` environment variable
   - Password: `APP_PASS` environment variable
3. **Submit** → POST to `/api/auth/login`
4. **Receive** `ff_session` cookie (HMAC-SHA256 signed, httpOnly, secure)
5. **Access** protected routes with cookie automatically included

### Session Validation

- Sessions are validated via HMAC-SHA256 signature in `/api/lib/auth.ts`
- Cookie expires after browser session (no explicit TTL)
- POST `/api/auth/session` returns `{ authenticated: true/false }`
- POST `/api/auth/logout` clears the session

## Accepted Message Formats

Telegram transactions use natural language parsing. Send a message with:
- **Description** (any words) + **Amount** (number with optional comma/dot decimals)

### Valid Examples

- `mercado 150,00` → "mercado" for R$ 150.00
- `salario 5000` → "salario" for R$ 5,000.00
- `cartao 89.90` → "cartao" for R$ 89.90
- `aluguel 1500` → "aluguel" for R$ 1,500.00

### Invalid Examples (rejected with error message)

- `150` — no description
- `mercado` — no amount
- `xyz abc def` — no valid number
- `mercado 1000000.01` — exceeds limit (max R$ 1,000,000)

## Category Classification

The bot automatically detects the transaction category based on keywords in your description. The first matching keyword wins:

| Keywords | Category | Dashboard Label |
|----------|----------|-----------------|
| `receita`, `salario` | revenue | Receita |
| `cartao` | cards | Cartões |
| `emprestimo` | loans | Empréstimos |
| `fixo` | fixedCosts | Fixos |
| (none match) | variableCosts | Variáveis |

### Category Examples

- `salario 5000` → **Receita** (matches "salario")
- `cartao 150` → **Cartões** (matches "cartao")
- `emprestimo 2000` → **Empréstimos** (matches "emprestimo")
- `aluguel fixo 1500` → **Fixos** (matches "fixo")
- `mercado 89.90` → **Variáveis** (no keyword match)

## Confirmation Flow

### Step 1: Send Message

User sends: `mercado 150,00`

### Step 2: Bot Shows Preview

Bot responds with:

```
💰 *mercado* — R$ 150,00
Categoria: Variáveis

Confirmar este lançamento?
`<HMAC-signed-token>`
```

Two buttons appear:
- **✅ Confirmar** — Confirm and record transaction
- **❌ Cancelar** — Discard transaction

### Step 3: User Taps Confirm

- Bot validates the embedded HMAC signature
- Bot writes transaction to GitHub Gist
- Bot updates message: `✅ Registrado: mercado — R$ 150,00`
- Transaction appears in dashboard on next page load

### Step 4: Dashboard Sync

- Transactions are persisted in GitHub Gist (manual_months)
- Dashboard syncs via POST `/api/sync` → reads Gist payload
- Manual transactions marked as `source: 'telegram'` and `isPaid: true`

## Security Model

### Webhook Authentication

- **Header Check**: `X-Telegram-Bot-Api-Secret-Token` must match `TELEGRAM_WEBHOOK_SECRET`
- **Timing-Safe Comparison**: Uses HMAC-SHA256 constant-time comparison (prevents timing side-channel leaks)
- **Rate Limiting**: Telegram delivers at most one update per request

### Transaction Signing

- **Payload Signing**: Compact transaction data (description, value, category, etc.) is signed with HMAC-SHA256
- **Token Embedding**: Signature is embedded in the bot message (backtick code span)
- **Verification on Confirm**: Bot re-verifies signature before writing to Gist
- **Idempotency**: External ID (`telegram:<chatId>:<updateId>`) prevents duplicates

### Session Cookies

- **Signed Cookies**: `ff_session` contains username + timestamp, signed with `AUTH_SECRET`
- **httpOnly Flag**: Cookie not accessible to JavaScript (prevents XSS theft)
- **Secure Flag**: Cookie only sent over HTTPS in production
- **No Explicit Expiry**: Sessions last for browser session (cleared on browser close)

## Deployment Checklist

- [ ] Set all 9 environment variables in Vercel dashboard
- [ ] Generate strong values for `TELEGRAM_WEBHOOK_SECRET` and `AUTH_SECRET`
- [ ] Create bot via @BotFather and copy token
- [ ] Deploy to Vercel (branch → production)
- [ ] Run webhook registration script (post-deploy, one-time)
- [ ] Test: Send `mercado 185,40` from Telegram
- [ ] Tap **Confirmar** in Telegram
- [ ] Verify transaction appears in dashboard

## Troubleshooting

### "Não entendi. Tente: `mercado 150,00`"

The message couldn't be parsed. Check:
- Is there a valid number (amount) in the message?
- Is the format roughly `<description> <amount>`?
- Does the amount fall within 0.01 to 1,000,000?

### "⚠️ Token inválido ou expirado"

The embedded signature failed validation. This means:
- The webhook secret was changed after the message was sent
- The message text was edited (breaking the signature)
- Network corruption occurred (rare)

**Solution**: Send the transaction again.

### "⚠️ Já registrado"

Transaction already recorded (idempotent duplicate). The same message and chat ID were already confirmed.

**Solution**: Send a different message if you want another transaction.

### Webhook not receiving updates

1. Check that the token and webhook secret are exactly correct (no spaces)
2. Verify Telegram can reach your endpoint:
   ```powershell
   Invoke-RestMethod "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
   ```
3. If `last_error_date` exists, check the error message
4. Re-register the webhook with the correct secret

### Dashboard shows no transactions after confirming

- Check that GitHub Gist token is valid (Settings → Developer Settings → Personal Access Tokens)
- Verify Gist ID is correct
- Check browser console for sync errors
- Try manual refresh (F5)

## Architecture Notes

- **Parsing**: `api/lib/telegram.ts` — Transaction extraction and category detection
- **Webhook Handler**: `api/telegram.ts` — Telegram update processing, signing, and persistence
- **Auth**: `api/lib/auth.ts` — HMAC-SHA256 session cookie management
- **Persistence**: `api/lib/gist.ts` — GitHub Gist read/write via PAT
- **Dashboard**: `src/` — React app with sync service integration

All secrets are server-side only (never exposed to browser). Webhook signatures are verified before any processing.
