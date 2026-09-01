# Telegram Integration

This document explains how to set up and use the secured Telegram bot integration for the financial dashboard.

## Environment Variables

The following 9 environment variables must be configured for Telegram integration to work:

1. **GITHUB_GIST_TOKEN**: GitHub personal access token (with gist scope) for storing encrypted financial data
2. **GITHUB_GIST_ID**: GitHub Gist ID where the financial payload is stored
3. **ANTHROPIC_API_KEY**: Anthropic API key for Claude AI features in the dashboard
4. **TELEGRAM_BOT_TOKEN**: Bot token obtained from BotFather (used to send/receive messages)
5. **TELEGRAM_WEBHOOK_SECRET**: Secret token used to verify webhook requests from Telegram (prevents unauthorized access)
6. **TELEGRAM_ALLOWED_CHAT_IDS**: Comma-separated list of Telegram chat IDs allowed to send transactions
7. **APP_USER**: Basic auth username for dashboard login
8. **APP_PASS**: Basic auth password for dashboard login
9. **AUTH_SECRET**: Secret key for signing and verifying JWT tokens in webhook callbacks

## Creating a Telegram Bot

1. Open Telegram and search for **BotFather** (@BotFather)
2. Send the command `/newbot`
3. Choose a bot name (e.g., "Finanças Familia Bot")
4. Choose a username (must end in "bot", e.g., "financas_familia_bot")
5. BotFather will provide a token in the format: `123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg`
6. Copy this token and save it as `TELEGRAM_BOT_TOKEN`

## Registering the Webhook

After deploying the application to Vercel, register the webhook using this PowerShell command:

```powershell
$token = Read-Host "Bot token"
$secret = Read-Host "Webhook secret"  
$url = Read-Host "Vercel URL (e.g. https://financas-familia-v2.vercel.app)"
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" -Method Post -Body @{ 
  url="$url/api/telegram"
  secret_token=$secret 
}
```

This approach keeps sensitive tokens out of your shell history. The webhook will be active immediately after registration.

## Supported Message Formats

The bot accepts simple text messages in the format:

```
<description> <value>
```

The last number in the message is treated as the transaction value. The description is everything before it.

### Examples

```
mercado 150,00       → Market: R$ 150.00 (variable costs)
salario 5000         → Salary: R$ 5,000.00 (revenue)
cartao 200           → Credit card: R$ 200.00 (cards)
emprestimo 1500,50   → Loan: R$ 1,500.50 (loans)
aluguel 1200         → Rent: R$ 1,200.00 (fixed costs)
```

## Category Keyword Mapping

The bot automatically categorizes transactions based on keywords in the description. Keywords are case-insensitive and ignore accents.

| Category | Key | Portuguese Label | Keywords |
|----------|-----|-----------------|----------|
| Revenue | `r` | Receita | receita, salario |
| Fixed Costs | `f` | Fixos | fixo |
| Loans | `l` | Empréstimos | emprestimo |
| Cards | `k` | Cartões | cartao |
| Variable Costs | `v` | Variáveis | (default) |

If no keyword matches, the transaction is categorized as **Variable Costs**.

## Login Flow

The dashboard uses secured authentication with Telegram synchronization:

1. **First Visit**: Navigate to the dashboard
   - GET `/api/auth/session` returns `{ authenticated: false }`
   - Login page is displayed

2. **Login**: Submit credentials
   - POST `/api/auth/login` with username and password
   - HTTP-only cookie is set with the auth token
   - User is redirected to the dashboard

3. **Authenticated Access**: 
   - All subsequent requests include the auth cookie
   - GET `/api/auth/session` returns `{ authenticated: true }`
   - Telegram transactions automatically sync to the dashboard

4. **Manual Transactions**: 
   - Create expenses manually via the dashboard UI
   - Sync to GitHub Gist is automatic

5. **Telegram Sync**:
   - Send a message to the bot: `mercado 185,40`
   - Bot confirms the transaction with category and amount
   - Tap the "Confirmar" button to finalize
   - Transaction appears in the dashboard within seconds

## Security Considerations

- **Webhook Authentication**: Every incoming webhook is verified using a constant-time HMAC-SHA256 comparison against `TELEGRAM_WEBHOOK_SECRET`
- **Token Signing**: Transaction confirmations use signed JWT tokens embedded in the Telegram message, preventing token tampering
- **Idempotency**: Duplicate transactions are silently ignored (same external ID)
- **Chat Filtering**: Only allowed chat IDs (from `TELEGRAM_ALLOWED_CHAT_IDS`) can create transactions
- **Timezone Handling**: Transactions are timestamped in São Paulo timezone (America/Sao_Paulo) for accurate monthly reconciliation

## Troubleshooting

### Bot doesn't respond
- Verify `TELEGRAM_BOT_TOKEN` is correct and active
- Ensure `TELEGRAM_ALLOWED_CHAT_IDS` includes your chat ID (send `/start` to the bot to see your chat ID)
- Check that the webhook is registered (use `getWebhookInfo` to verify)

### "Não entendi" message
- Ensure your message contains a number (e.g., `mercado 150,00`)
- Use commas or periods for decimals (both are accepted)
- The value must be between R$ 0.01 and R$ 1,000,000.00

### Transaction not appearing in dashboard
- Verify the "Confirmar" button was tapped
- Check that you're logged in to the dashboard
- Wait 5-10 seconds for the sync to complete

### "Já registrado" warning
- The same transaction was confirmed twice (idempotency check)
- This is safe—it's not recorded again

