# Integração Telegram e autenticação de servidor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proteger a sincronização com uma sessão de servidor e permitir lançamentos confirmados pelo Telegram no mesmo Gist do dashboard.

**Architecture:** Rotas Vercel compartilham `api/lib/auth.ts` para cookies HMAC e `api/lib/gist.ts` para leitura/gravação do Gist. O frontend troca sua senha embutida por `POST /api/auth/login`; o webhook do Telegram valida cabeçalho e chat, envia uma prévia assinada e insere o lançamento somente no callback de confirmação.

**Tech Stack:** TypeScript, Vercel Edge Functions, Web Crypto, React 19, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-telegram-integration-design.md`

## Global Constraints

- Todos os segredos são variáveis de servidor, sem prefixo `VITE_`.
- `ff_session` é HttpOnly, Secure, SameSite=Strict, Path=/ e expira em sete dias.
- `TELEGRAM_WEBHOOK_SECRET` é comparado com o cabeçalho `X-Telegram-Bot-Api-Secret-Token`.
- Somente `TELEGRAM_ALLOWED_CHAT_IDS` pode criar lançamentos pelo bot.
- `externalId` tem formato `telegram:<chatId>:<updateId>` e nunca pode duplicar um item.
- O MVP aceita somente mensagem de texto e confirmação/cancelamento; sem IA, áudio, OCR ou múltiplas contas.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `api/lib/auth.ts` | Assinar, verificar e serializar a sessão HttpOnly e payloads de callback. |
| `api/lib/gist.ts` | Ler e gravar o payload de sincronização no arquivo `financas-sync.json`. |
| `api/lib/telegram.ts` | Interpretar texto de lançamento, criar callback assinado e aplicar item idempotente ao payload. |
| `api/auth/login.ts` | Validar o usuário único e emitir `ff_session`. |
| `api/auth/session.ts` | Informar se existe sessão válida ao bootstrap do React. |
| `api/auth/logout.ts` | Expirar `ff_session`. |
| `api/sync.ts` | Exigir sessão para GET e POST; delegar Gist ao módulo compartilhado. |
| `api/telegram.ts` | Validar webhook, responder prévia e processar confirmação/cancelamento. |
| `src/pages/Login/index.tsx` | Usar a API de sessão, mantendo o bloqueio local de tentativas apenas como UX. |
| `src/lib/syncService.ts` | Tratar HTTP 401 como sessão expirada. |
| `src/App.tsx` | Verificar a sessão assíncrona antes de exibir o shell. |
| `tests/**/*.test.ts` | Cobrir unidades puras e handlers com fetch simulado. |

### Task 1: Instalar e configurar a base de testes

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.test.ts`

**Interfaces:**
- Produces: comando `npm test` que executa `tests/**/*.test.ts` no ambiente Node.

- [ ] **Step 1: Adicionar o teste de descoberta de suíte**

Crie `tests/setup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('test runner', () => {
  it('runs the project test suite', () => {
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 2: Executar para confirmar que falha por falta de runner**

Run: `npm test -- --run tests/setup.test.ts`

Expected: FAIL porque o script `test` não existe.

- [ ] **Step 3: Instalar Vitest e criar configuração**

Run: `npm install -D vitest`

Adicione ao `package.json`:

```json
"test": "vitest"
```

Crie `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
```

- [ ] **Step 4: Executar para confirmar a suíte verde**

Run: `npm test -- --run tests/setup.test.ts`

Expected: PASS, 1 teste aprovado.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.test.ts
git commit -m "test: add Vitest test runner"
```

### Task 2: Criar sessões assinadas em cookie

**Files:**
- Create: `api/lib/auth.ts`
- Create: `tests/api/lib/auth.test.ts`

**Interfaces:**
- Produces: `createSession(secret, now): Promise<string>`, `verifySession(cookie, secret, now): Promise<boolean>`, `getSessionCookie(token, now): string`, `signPayload<T>(value, secret): Promise<string>`, `verifyPayload<T>(token, secret): Promise<T | null>`.

- [ ] **Step 1: Escrever testes de sessão**

```ts
import { describe, expect, it } from 'vitest'
import { createSession, verifySession } from '../../../api/lib/auth'

describe('session signatures', () => {
  it('accepts a session before its seven-day expiry', async () => {
    const now = 1_700_000_000_000
    const token = await createSession('secret', now)
    await expect(verifySession(token, 'secret', now + 6 * 86_400_000)).resolves.toBe(true)
  })

  it('rejects a tampered or expired session', async () => {
    const now = 1_700_000_000_000
    const token = await createSession('secret', now)
    await expect(verifySession(`${token}x`, 'secret', now)).resolves.toBe(false)
    await expect(verifySession(token, 'secret', now + 7 * 86_400_000)).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- --run tests/api/lib/auth.test.ts`

Expected: FAIL porque `api/lib/auth.ts` não existe.

- [ ] **Step 3: Implementar helpers Web Crypto**

Use `crypto.subtle.importKey`, `crypto.subtle.sign` e `crypto.subtle.verify` com HMAC SHA-256. O payload da sessão é `{ exp: number }`, serializado em base64url como `payload.signature`; a expiração é `now + 7 * 24 * 60 * 60 * 1000`. `getSessionCookie` deve conter `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`.

- [ ] **Step 4: Executar para confirmar sucesso**

Run: `npm test -- --run tests/api/lib/auth.test.ts`

Expected: PASS, 2 testes aprovados.

- [ ] **Step 5: Commit**

```bash
git add api/lib/auth.ts tests/api/lib/auth.test.ts
git commit -m "feat: add signed server sessions"
```

### Task 3: Centralizar acesso ao Gist

**Files:**
- Create: `api/lib/gist.ts`
- Create: `tests/api/lib/gist.test.ts`
- Modify: `api/sync.ts`

**Interfaces:**
- Produces: `getGistPayload(fetchImpl): Promise<SyncPayload | null>` e `setGistPayload(payload, fetchImpl): Promise<void>`.
- Consumes: `SyncPayload` de `src/lib/syncService.ts` somente como type import; `GITHUB_GIST_TOKEN`, `GITHUB_GIST_ID` de `process.env`.

- [ ] **Step 1: Escrever teste de leitura e gravação**

```ts
it('reads financas-sync.json and patches the same file', async () => {
  const calls: RequestInit[] = []
  const fetchImpl = async (_url: string, init?: RequestInit) => {
    calls.push(init ?? {})
    return new Response(JSON.stringify({ files: { 'financas-sync.json': { content: 'null' } } }), { status: 200 })
  }
  await expect(getGistPayload(fetchImpl)).resolves.toBeNull()
  expect(calls[0]?.headers).toMatchObject({ Authorization: 'Bearer token' })
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- --run tests/api/lib/gist.test.ts`

Expected: FAIL porque o módulo não existe.

- [ ] **Step 3: Implementar serviço**

Defina a constante `GIST_FILE = 'financas-sync.json'`. Lance erro quando as variáveis estiverem ausentes, quando o GET/PATCH não responder `ok` ou quando o arquivo não existir. O PATCH envia `{ files: { 'financas-sync.json': { content: JSON.stringify(payload) } } }`.

- [ ] **Step 4: Migrar `api/sync.ts` para o serviço**

Remova `gistGet` e `gistSet` locais. Preserve respostas `pull_failed` e `push_failed`; a proteção de sessão entra na Task 4.

- [ ] **Step 5: Executar para confirmar sucesso**

Run: `npm test -- --run tests/api/lib/gist.test.ts`

Expected: PASS, leitura de `null`, headers e PATCH validados.

- [ ] **Step 6: Commit**

```bash
git add api/lib/gist.ts api/sync.ts tests/api/lib/gist.test.ts
git commit -m "refactor: share Gist persistence service"
```

### Task 4: Proteger login, sessão e sincronização

**Files:**
- Create: `api/auth/login.ts`
- Create: `api/auth/session.ts`
- Create: `api/auth/logout.ts`
- Modify: `api/sync.ts`
- Modify: `src/pages/Login/index.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/syncService.ts`
- Create: `tests/api/auth.test.ts`
- Create: `tests/api/sync.test.ts`

**Interfaces:**
- Produces: `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout`; sync requer `ff_session` válido.
- Consumes: helpers da Task 2 e Gist da Task 3.

- [ ] **Step 1: Escrever testes de autenticação**

```ts
it('sets a session cookie for the configured user', async () => {
  process.env.APP_USER = 'alan'
  process.env.APP_PASS = 'senha'
  process.env.AUTH_SECRET = 'secret'
  const res = await login(new Request('https://app/api/auth/login', {
    method: 'POST', body: JSON.stringify({ user: 'alan', pass: 'senha' }),
  }))
  expect(res.status).toBe(200)
  expect(res.headers.get('set-cookie')).toContain('ff_session=')
})

it('returns 401 when sync has no valid session', async () => {
  const res = await sync(new Request('https://app/api/sync', { method: 'GET' }))
  expect(res.status).toBe(401)
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- --run tests/api/auth.test.ts tests/api/sync.test.ts`

Expected: FAIL porque os handlers não existem ou ainda permitem acesso sem cookie.

- [ ] **Step 3: Implementar os handlers**

`login.ts` aceita apenas JSON com `user` e `pass` strings, compara com `APP_USER` e `APP_PASS`, retorna 400 para corpo inválido, 401 para credenciais inválidas e `Set-Cookie` em sucesso. `session.ts` retorna `{ authenticated: boolean }`; `logout.ts` emite `ff_session=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/`.

`api/sync.ts` aceita CORS somente do `Origin` igual ao `Host` da requisição e exige sessão válida tanto no GET como no POST; opções retorna os cabeçalhos restritos. Acessos inválidos retornam `{ error: 'unauthorized' }` e HTTP 401.

- [ ] **Step 4: Migrar o React para a sessão de servidor**

Troque `isAuthenticated` por uma verificação assíncrona de `/api/auth/session`. Em `handleSubmit`, faça `fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ user, pass }) })`; só chame `onLogin()` quando `res.ok`. `clearSession` deve fazer `POST /api/auth/logout`; `App.tsx` deve exibir estado de carregamento até terminar a consulta da sessão. Em `syncService.ts`, preserve `credentials: 'same-origin'` e exponha `unauthorized` para o shell fazer logout.

- [ ] **Step 5: Executar para confirmar sucesso**

Run: `npm test -- --run tests/api/auth.test.ts tests/api/sync.test.ts`

Expected: PASS, login, sessão ausente e sync bloqueado cobertos.

- [ ] **Step 6: Commit**

```bash
git add api/auth api/sync.ts src/pages/Login/index.tsx src/App.tsx src/lib/syncService.ts tests/api/auth.test.ts tests/api/sync.test.ts
git commit -m "feat: protect dashboard sync with server session"
```

### Task 5: Criar parser e idempotência dos lançamentos Telegram

**Files:**
- Create: `api/lib/telegram.ts`
- Create: `tests/api/lib/telegram.test.ts`

**Interfaces:**
- Produces: `parseTransaction(text): ParsedTransaction | null`, `appendTelegramTransaction(payload, transaction): { payload: SyncPayload; inserted: boolean }`.
- `ParsedTransaction` contém `description`, `value`, `category`, `occurredAt`, `externalId`, `chatId` e `updateId`.

- [ ] **Step 1: Escrever testes do parser e dedupe**

```ts
it('parses a Brazilian decimal expense as variable cost', () => {
  expect(parseTransaction('mercado 185,40')).toMatchObject({
    description: 'mercado', value: 185.4, category: 'variableCosts',
  })
})

it('does not insert an external id twice', () => {
  const once = appendTelegramTransaction(emptyPayload, transaction)
  const twice = appendTelegramTransaction(once.payload, transaction)
  expect(once.inserted).toBe(true)
  expect(twice.inserted).toBe(false)
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- --run tests/api/lib/telegram.test.ts`

Expected: FAIL porque `api/lib/telegram.ts` não existe.

- [ ] **Step 3: Implementar regras puras**

Normalize texto para minúsculas sem diacríticos. Extraia a última quantia com regex `/\d+(?:[.,]\d{1,2})?/g`; rejeite valor ausente, zero ou maior que 1.000.000. Mapeie palavras-chave: receita/salario para `revenue`, cartao para `cards`, emprestimo para `loans`, fixo para `fixedCosts`, caso contrário `variableCosts`.

Ao inserir, localize o mês por data São Paulo, crie `MonthRecord` manual se estiver ausente, adicione `MonthItem` com `isPaid: true`, `source: 'telegram'`, `occurredAt` e `externalId`, e recalcule os totais numéricos do mês a partir de `items`.

- [ ] **Step 4: Executar para confirmar sucesso**

Run: `npm test -- --run tests/api/lib/telegram.test.ts`

Expected: PASS, parsing de decimal, categoria, criação de mês e dedupe cobertos.

- [ ] **Step 5: Commit**

```bash
git add api/lib/telegram.ts tests/api/lib/telegram.test.ts
git commit -m "feat: parse and deduplicate Telegram transactions"
```

### Task 6: Implementar webhook e confirmação por botão

**Files:**
- Create: `api/telegram.ts`
- Create: `tests/api/telegram.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: helpers das Tasks 2, 3 e 5.
- Produces: `POST /api/telegram` com respostas HTTP 200, 401 ou 400; chamadas Telegram `sendMessage` e `answerCallbackQuery`.

- [ ] **Step 1: Escrever testes do handler**

```ts
it('rejects a webhook with an invalid secret', async () => {
  const res = await telegram(new Request('https://app/api/telegram', {
    method: 'POST', body: JSON.stringify({ update_id: 1 }),
  }))
  expect(res.status).toBe(401)
})

it('sends a confirmation preview for an allowed chat', async () => {
  const res = await telegram(requestForText('mercado 185,40', '123'))
  expect(res.status).toBe(200)
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/sendMessage'), expect.any(Object),
  )
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- --run tests/api/telegram.test.ts`

Expected: FAIL porque o handler não existe.

- [ ] **Step 3: Implementar o webhook**

Aceite `message` e `callback_query` em `Update`. Valide o cabeçalho usando comparação constante e rejeite chat não permitido com HTTP 200 sem responder detalhes. Para texto válido, assine o payload de confirmação com `signPayload` e envie `sendMessage` com teclado inline `Confirmar`/`Cancelar`; o `callback_data` deve caber em 64 bytes, então use `{ action, updateId, chatId, value, category, description }` compactado em base64url e assinado.

Para callback, chame `answerCallbackQuery` sempre. Em cancelamento, edite a mensagem para `Lançamento cancelado.`. Em confirmação, valide a assinatura, leia o Gist, chame `appendTelegramTransaction`, grave somente quando `inserted` for verdadeiro e edite a prévia com o resultado. Retorne HTTP 200 também nas reentregas já deduplicadas.

- [ ] **Step 4: Atualizar exemplo de variáveis**

Mantenha as variáveis Telegram existentes e acrescente:

```text
APP_USER=alan
APP_PASS=defina-uma-senha-forte
AUTH_SECRET=gere-um-segredo-longo-e-aleatorio
```

- [ ] **Step 5: Executar para confirmar sucesso**

Run: `npm test -- --run tests/api/telegram.test.ts`

Expected: PASS, segredo, chat permitido, confirmação, cancelamento e dedupe cobertos.

- [ ] **Step 6: Commit**

```bash
git add api/telegram.ts api/lib/telegram.ts .env.example tests/api/telegram.test.ts
git commit -m "feat: add confirmed Telegram expense webhook"
```

### Task 7: Verificação integrada e ativação

**Files:**
- Modify: `README.md`
- Create: `docs/TELEGRAM_INTEGRATION.md`

**Interfaces:**
- Produces: instruções de variáveis, deploy e comando de `setWebhook` sem expor tokens.

- [ ] **Step 1: Atualizar instruções de operação**

Documente as sete variáveis de ambiente, o fluxo de login único, os formatos aceitos e o comando PowerShell que usa `Read-Host` para configurar o webhook após o deploy.

- [ ] **Step 2: Executar todos os testes**

Run: `npm test -- --run`

Expected: PASS, sem testes falhando.

- [ ] **Step 3: Executar qualidade e build**

Run: `npm run lint && npm run build`

Expected: exit code 0.

- [ ] **Step 4: Verificação manual na Vercel**

Após deploy, abra `/api/auth/session` sem cookie e confirme `authenticated: false`. Faça login pelo dashboard, crie uma despesa manual e confirme a sincronização. Configure o webhook, envie `mercado 185,40`, toque em **Confirmar**, atualize o dashboard e confirme um único item de R$ 185,40 em custos variáveis.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/TELEGRAM_INTEGRATION.md
git commit -m "docs: explain secured Telegram integration"
```
