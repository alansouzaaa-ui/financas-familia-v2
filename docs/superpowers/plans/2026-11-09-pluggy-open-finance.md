# Integração Pluggy (cartões via Meu Pluggy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar automaticamente (cron diário + botão) as compras dos cartões conectados no Meu Pluggy como lançamentos `cards` não pagos do app.

**Architecture:** Lógica pura em `api/lib/pluggyMapping.ts` (transação → lançamento) e `api/lib/pluggySync.ts` (aplica no payload do Gist). Um cliente HTTP mínimo fica em `api/lib/pluggyClient.ts` e o endpoint `api/pluggy.ts` orquestra tudo (cron e ações do app). O estado da integração mora em `SyncPayload.pluggy`, escrito só pelo servidor e preservado por `mergeIncoming`. No front entra o bloco `BankConnectionCard` na aba Cartões.

**Tech Stack:** TypeScript, Vercel Functions **Edge** (`export const config = { runtime: 'edge' }` + `export default handler`, igual a `api/sync.ts`/`api/telegram.ts`), Vitest, React 19 + Zustand, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-09-pluggy-open-finance-design.md`. Leia a seção **"Ajustes após conferir a API"**: ela prevalece sobre o resto da spec.

## Global Constraints

- Envs: `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` (já cadastradas pelo usuário) e `CRON_SECRET` (já existe). **Nunca** logar nem imprimir valores de env, nem descrição, valor ou id de transação: só contagens.
- Base da API: `https://api.pluggy.ai`, header `X-API-KEY`, apiKey vinda de `POST /auth` e válida por 2 h.
- Transações **só** via `GET /v2/transactions` (o `/transactions` é removido em 2026-12-31).
- Valor: `|amount|`, positivo se `type === 'DEBIT'` e negativo se `type === 'CREDIT'`.
- Itens Pluggy usam `id = externalId = 'pluggy:<txId>'`, `source: 'pluggy'`, `category: 'cards'` e `isPaid: false`.
- Mês da fatura em `MonthRecord` (`month: MonthAbbr`, `year`). Totais do mês sempre recalculados com `totalsFromItems` (`src/lib/monthTotals.ts`).
- `api/pluggy.ts` roda em **Edge** (como `api/sync.ts`, `api/telegram.ts`, `api/summary.ts`). Por isso os imports relativos ficam **sem** `.js` (`'./lib/gist'`, `'../../src/lib/...'`). NÃO usar o runtime Node: ele exige `.js` em toda a cadeia de imports de `src/`, e isso quebra. Edge precisa começar a responder em até 25 s. A sync faz poucas chamadas HTTP e cabe nesse limite. Só use APIs Web (fetch, URL), nada de `Buffer`/`fs`.
- Testes: `npx vitest run`. Tipos: `npx tsc -b --noEmit`. Lint: `npx eslint src api`.
- NÃO commitar `src/App.tsx` com `TEMP-DESIGN-BYPASS` (`grep -c BYPASS src/App.tsx` deve dar 0 antes de cada commit).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Não dar push** (publicação só com autorização do usuário).

---

### Task 1: Tipos compartilhados e proteção no merge do sync

**Files:**
- Create: `src/lib/pluggyState.ts`
- Modify: `src/types/finance.ts` (união `source` de `MonthItem`)
- Modify: `src/lib/syncService.ts` (`SyncPayload.pluggy`)
- Modify: `api/lib/syncMerge.ts`
- Test: `tests/api/syncMergePluggy.test.ts`

**Interfaces:**
- Produces: tipos `PluggyState`, `PluggyAccountLink`, `PluggySeen`, `PluggyLastResult`, `PluggyStatusView` e a função `toStatusView(state: PluggyState | undefined, configured: boolean): PluggyStatusView`, todos em `src/lib/pluggyState.ts`. Também `isServerItem(i: MonthItem): boolean`, exportada de `api/lib/syncMerge.ts`.

- [ ] **Step 1: Criar `src/lib/pluggyState.ts`**

```ts
// Estado da integração Pluggy guardado no Gist (SyncPayload.pluggy). Escrito só pelo servidor.
export interface PluggyAccountLink {
  id: string
  name: string
  last4: string | null
  cardId: string | null          // cartão do app (CardAccount.id); null = não sincroniza
  closeDate: string | null       // creditData.balanceCloseDate (yyyy-mm-dd)
  dueDate: string | null         // creditData.balanceDueDate (yyyy-mm-dd)
  syncedOnce: boolean            // primeira sync feita (define a janela inicial)
}

export interface PluggySeen {
  appItemId: string | null       // null = descartada (duplicata, pagamento, zero, cancelada)
  fp: string                     // impressão digital gravada: valor|descrição|AAAA-MM
  at: string                     // ISO de quando foi vista pela 1ª vez
  accountId: string
  value: number
  date: string                   // yyyy-mm-dd (data da compra, fuso SP)
  pending: boolean
}

export interface PluggyLastResult {
  at: string
  ok: boolean
  created: number
  updated: number
  moved: number
  removed: number
  skippedDuplicates: number
  error?: string
}

export interface PluggyState {
  itemId: string
  itemStatus: string
  itemError: string | null       // error.code do item, se houver
  consentExpiresAt: string | null
  accounts: PluggyAccountLink[]
  lastSyncAt: string | null
  lastResult: PluggyLastResult | null
  seen: Record<string, PluggySeen>
}

/** O que o app recebe (sem `seen`). */
export interface PluggyStatusView {
  configured: boolean
  connected: boolean
  itemStatus: string | null
  itemError: string | null
  consentExpiresAt: string | null
  accounts: { id: string; name: string; last4: string | null; cardId: string | null }[]
  lastSyncAt: string | null
  lastResult: PluggyLastResult | null
}

export function toStatusView(state: PluggyState | undefined, configured: boolean): PluggyStatusView {
  return {
    configured,
    connected: !!state?.itemId,
    itemStatus: state?.itemStatus ?? null,
    itemError: state?.itemError ?? null,
    consentExpiresAt: state?.consentExpiresAt ?? null,
    accounts: (state?.accounts ?? []).map(a => ({ id: a.id, name: a.name, last4: a.last4, cardId: a.cardId })),
    lastSyncAt: state?.lastSyncAt ?? null,
    lastResult: state?.lastResult ?? null,
  }
}
```

- [ ] **Step 2: Tipos existentes**

Em `src/types/finance.ts`, no `MonthItem`, troque
`source?: 'manual' | 'telegram' | 'import'`
por `source?: 'manual' | 'telegram' | 'import' | 'pluggy'`.

Em `src/lib/syncService.ts`, adicione `import type { PluggyState } from './pluggyState'` e, dentro de `SyncPayload`, antes de `updated_at?`, inclua:

```ts
  /** Integração Pluggy — escrito só pelo servidor (api/pluggy.ts); clientes não enviam. */
  pluggy?: PluggyState
```

Verifique com `grep -n "pluggy" src/lib/syncService.ts` que o push do cliente (`pushSync`) não monta esse campo. Ele não deve montar.

- [ ] **Step 3: Escrever o teste que falha em `tests/api/syncMergePluggy.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { mergeIncoming, isServerItem } from '../../api/lib/syncMerge'
import type { SyncPayload } from '../../src/lib/syncService'
import type { MonthItem } from '../../src/types/finance'

const item = (over: Partial<MonthItem>): MonthItem => ({
  id: 'x', description: 'd', value: 10, category: 'cards', isPaid: false, ...over,
})
const base = (items: MonthItem[], extra: Partial<SyncPayload> = {}): SyncPayload => ({
  manual_months: [{ month: 'Nov', year: 2026, revenue: 0, fixedCosts: 0, loans: 0, cards: 0, source: 'manual', items }],
  goals: [], recurring_items: [], investment_positions: [], ...extra,
})
const state = { itemId: 'it', itemStatus: 'UPDATED', itemError: null, consentExpiresAt: null, accounts: [], lastSyncAt: null, lastResult: null, seen: {} }

describe('mergeIncoming + pluggy', () => {
  it('isServerItem reconhece telegram e pluggy', () => {
    expect(isServerItem(item({ source: 'pluggy', id: 'pluggy:1' }))).toBe(true)
    expect(isServerItem(item({ id: 'telegram:1:2' }))).toBe(true)
    expect(isServerItem(item({ source: 'manual' }))).toBe(false)
  })
  it('preserva pluggy do servidor e ignora o do cliente', () => {
    const current = base([], { pluggy: state })
    const incoming = base([], { pluggy: { ...state, itemId: 'HACK' } })
    expect(mergeIncoming(current, incoming).payload.pluggy?.itemId).toBe('it')
    expect(mergeIncoming(current, base([])).payload.pluggy?.itemId).toBe('it')
  })
  it('sem pluggy no servidor, não aceita do cliente', () => {
    expect(mergeIncoming(base([]), base([], { pluggy: state })).payload.pluggy).toBeUndefined()
  })
  it('item pluggy que o cliente desconhece é preservado', () => {
    const p = item({ id: 'pluggy:abc', externalId: 'pluggy:abc', source: 'pluggy' })
    const out = mergeIncoming(base([p]), base([]))
    expect(out.payload.manual_months[0].items?.some(i => i.id === 'pluggy:abc')).toBe(true)
  })
  it('item pluggy tombstonado não volta', () => {
    const p = item({ id: 'pluggy:abc', externalId: 'pluggy:abc', source: 'pluggy' })
    const out = mergeIncoming(base([p]), base([], { deleted_ids: [{ id: 'pluggy:abc', at: new Date().toISOString() }] }))
    expect(out.payload.manual_months[0].items?.some(i => i.id === 'pluggy:abc')).toBe(false)
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run tests/api/syncMergePluggy.test.ts`
Expected: FAIL (`isServerItem` não exportado; `pluggy` do cliente vence).

- [ ] **Step 5: Implementar em `api/lib/syncMerge.ts`**

Logo abaixo de `isTelegramItem`, adicione:

```ts
/** Item gravado pelo servidor (Telegram ou Pluggy): preservado se o cliente desatualizado não o conhece. */
export function isServerItem(i: MonthItem): boolean {
  return isTelegramItem(i)
    || i.source === 'pluggy'
    || (typeof i.externalId === 'string' && i.externalId.startsWith('pluggy:'))
}
```

Em `mergeIncoming`:
- Troque `if (!isTelegramItem(item)) continue` por `if (!isServerItem(item)) continue`.
- Troque a linha `const base: SyncPayload = { ...incoming, deleted_ids: tombstones }` por:

```ts
  // `pluggy` é do servidor: o cliente nunca sobrescreve (nem cria).
  const { pluggy: _ignored, ...incomingRest } = incoming
  void _ignored
  const base: SyncPayload = {
    ...incomingRest,
    deleted_ids: tombstones,
    ...(current?.pluggy ? { pluggy: current.pluggy } : {}),
  }
```

- [ ] **Step 6: Rodar os testes**

Run: `npx vitest run tests/api/syncMergePluggy.test.ts tests/tombstones.test.ts && npx vitest run`
Expected: tudo PASS (os testes existentes do merge do Telegram continuam passando).

- [ ] **Step 7: Commit**

```bash
git add src/lib/pluggyState.ts src/types/finance.ts src/lib/syncService.ts api/lib/syncMerge.ts tests/api/syncMergePluggy.test.ts
git commit -m "feat(pluggy): tipos do estado e proteção no merge do sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Mapeamento puro (transação Pluggy → dados do lançamento)

**Files:**
- Create: `api/lib/pluggyMapping.ts`
- Test: `tests/api/pluggyMapping.test.ts`

**Interfaces:**
- Consumes: `guessTag` (`src/lib/autoTag.ts`), `cleanDescription` (`src/lib/invoiceImport.ts`), `PluggyAccountLink` (Task 1).
- Produces:
  - `type PluggyTx = { id: string; description: string; amount: number; type: 'DEBIT' | 'CREDIT'; date: string; status: 'PENDING' | 'POSTED'; category: string | null; creditCardMetadata?: { billId?: string | null; installmentNumber?: number | null; totalInstallments?: number | null } | null }`
  - `type PluggyBill = { id: string; dueDate: string; billClosingDate?: string | null }`
  - `spDate(iso: string): string` (yyyy-mm-dd no fuso de São Paulo, UTC−3)
  - `addMonths(ym: string, n: number): string` (ym = 'YYYY-MM')
  - `billMonthKey(tx: PluggyTx, bills: Map<string, PluggyBill>, acct: Pick<PluggyAccountLink, 'closeDate' | 'dueDate'>, cardDueDay?: number): string` ('YYYY-MM')
  - `signedValue(tx: PluggyTx): number`
  - `isIgnored(tx: PluggyTx): boolean` (pagamento de fatura, saldo anterior ou valor zero)
  - `describe(tx: PluggyTx): string`
  - `tagFor(description: string, category: string | null): string | undefined`
  - `fingerprint(value: number, description: string, monthKey: string): string`
  - `windowStart(acct: PluggyAccountLink, bills: PluggyBill[], lastSyncAt: string | null): string` (yyyy-mm-dd)

- [ ] **Step 1: Escrever o teste que falha em `tests/api/pluggyMapping.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  spDate, addMonths, billMonthKey, signedValue, isIgnored, describe as describeTx,
  tagFor, fingerprint, windowStart, type PluggyTx,
} from '../../api/lib/pluggyMapping'

const tx = (over: Partial<PluggyTx>): PluggyTx => ({
  id: 't1', description: 'COMPRA', amount: 50, type: 'DEBIT', date: '2026-11-05T15:00:00.000Z',
  status: 'POSTED', category: null, creditCardMetadata: null, ...over,
})
const acct = { closeDate: '2026-11-03', dueDate: '2026-11-10' }

describe('pluggyMapping', () => {
  it('spDate converte para o dia em São Paulo', () => {
    expect(spDate('2026-11-06T02:00:00.000Z')).toBe('2026-11-05')
    expect(spDate('2026-11-06T04:00:00.000Z')).toBe('2026-11-06')
  })
  it('addMonths vira o ano', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2027-01', -1)).toBe('2026-12')
  })
  it('mês pela fatura (billId) vence tudo', () => {
    const bills = new Map([['b1', { id: 'b1', dueDate: '2027-01-10' }]])
    expect(billMonthKey(tx({ creditCardMetadata: { billId: 'b1' } }), bills, acct)).toBe('2027-01')
  })
  it('sem billId: até o fechamento vai para o vencimento atual, depois para o seguinte', () => {
    expect(billMonthKey(tx({ date: '2026-11-03T15:00:00.000Z' }), new Map(), acct)).toBe('2026-11')
    expect(billMonthKey(tx({ date: '2026-11-04T15:00:00.000Z' }), new Map(), acct)).toBe('2026-12')
  })
  it('sem creditData: usa dueDay do cartão com fechamento 7 dias antes', () => {
    const none = { closeDate: null, dueDate: null }
    // vence dia 10 -> fecha dia 3
    expect(billMonthKey(tx({ date: '2026-11-02T15:00:00.000Z' }), new Map(), none, 10)).toBe('2026-11')
    expect(billMonthKey(tx({ date: '2026-11-05T15:00:00.000Z' }), new Map(), none, 10)).toBe('2026-12')
  })
  it('sem nada: mês seguinte ao da compra', () => {
    expect(billMonthKey(tx({}), new Map(), { closeDate: null, dueDate: null })).toBe('2026-12')
  })
  it('signedValue pelo type, ignorando o sinal do amount', () => {
    expect(signedValue(tx({ amount: -55.9, type: 'DEBIT' }))).toBe(55.9)
    expect(signedValue(tx({ amount: 20, type: 'CREDIT' }))).toBe(-20)
  })
  it('isIgnored: pagamento de fatura, saldo anterior e zero', () => {
    expect(isIgnored(tx({ type: 'CREDIT', category: 'Credit card payment' }))).toBe(true)
    expect(isIgnored(tx({ type: 'CREDIT', description: 'PAGAMENTO RECEBIDO' }))).toBe(true)
    expect(isIgnored(tx({ description: 'SALDO ANTERIOR' }))).toBe(true)
    expect(isIgnored(tx({ amount: 0 }))).toBe(true)
    expect(isIgnored(tx({ type: 'CREDIT', description: 'ESTORNO LOJA X' }))).toBe(false)
  })
  it('describe limpa espaços e acrescenta a parcela', () => {
    expect(describeTx(tx({ description: '  LOJA   X ', creditCardMetadata: { installmentNumber: 2, totalInstallments: 10 } }))).toBe('LOJA X (02/10)')
    expect(describeTx(tx({ description: 'LOJA X' }))).toBe('LOJA X')
  })
  it('tagFor: descrição primeiro, depois categoria Pluggy', () => {
    expect(tagFor('IFOOD *PEDIDO', 'Groceries')).toBe('alimentacao')
    expect(tagFor('XPTO 123', 'Groceries')).toBe('supermercado')
    expect(tagFor('XPTO 123', 'Eating out')).toBe('alimentacao')
    expect(tagFor('XPTO 123', 'Gas stations')).toBe('combustivel')
    expect(tagFor('XPTO 123', null)).toBeUndefined()
  })
  it('fingerprint estável', () => {
    expect(fingerprint(10, 'A', '2026-11')).toBe('10.00|A|2026-11')
  })
  it('windowStart: 1ª sync desde o fechamento da fatura anterior; depois lastSyncAt − 45 dias', () => {
    const a = { id: 'a', name: 'n', last4: null, cardId: 'c', closeDate: '2026-11-03', dueDate: '2026-11-10', syncedOnce: false }
    const bills = [{ id: 'b0', dueDate: '2026-10-10', billClosingDate: '2026-10-03' }, { id: 'b1', dueDate: '2026-11-10', billClosingDate: '2026-11-03' }]
    expect(windowStart(a, bills, null)).toBe('2026-10-04')
    expect(windowStart(a, [], null)).toBe('2026-10-04') // sem faturas: closeDate − 1 mês + 1 dia
    expect(windowStart({ ...a, syncedOnce: true }, bills, '2026-11-09T10:00:00.000Z')).toBe('2026-09-25')
  })
})
```

Nota sobre o primeiro `windowStart`: a fatura aberta vence em 2026-12 e fecha em 2026-12-03. A fatura anterior à aberta é a que fechou em 2026-11-03. Mas como `acct.closeDate` (2026-11-03) já é o fechamento corrente informado pelo banco, a janela começa no dia seguinte ao fechamento anterior a ele, ou seja, 2026-10-04. Assim a janela cobre a fatura que fechou e vence agora (ainda não paga) e a fatura aberta.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/api/pluggyMapping.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `api/lib/pluggyMapping.ts`**

```ts
// Transação Pluggy (cartão) -> dados de um lançamento do app. Lib pura, sem I/O.
import { guessTag } from '../../src/lib/autoTag'
import { cleanDescription } from '../../src/lib/invoiceImport'
import type { PluggyAccountLink } from '../../src/lib/pluggyState'

export interface PluggyTx {
  id: string
  description: string
  amount: number
  type: 'DEBIT' | 'CREDIT'
  date: string
  status: 'PENDING' | 'POSTED'
  category: string | null
  creditCardMetadata?: { billId?: string | null; installmentNumber?: number | null; totalInstallments?: number | null } | null
}

export interface PluggyBill { id: string; dueDate: string; billClosingDate?: string | null }

const cents = (n: number) => Math.round(n * 100) / 100
const pad2 = (n: number) => String(n).padStart(2, '0')

export function spDate(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso.slice(0, 10)
  return new Date(t - 3 * 3600_000).toISOString().slice(0, 10)
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`
}

function addDays(ymd: string, n: number): string {
  const t = Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

export function billMonthKey(
  tx: PluggyTx,
  bills: Map<string, PluggyBill>,
  acct: Pick<PluggyAccountLink, 'closeDate' | 'dueDate'>,
  cardDueDay?: number,
): string {
  const billId = tx.creditCardMetadata?.billId
  const bill = billId ? bills.get(billId) : undefined
  if (bill?.dueDate) return bill.dueDate.slice(0, 7)

  const d = spDate(tx.date)
  if (acct.closeDate && acct.dueDate) {
    const due = acct.dueDate.slice(0, 7)
    return d <= acct.closeDate ? due : addMonths(due, 1)
  }
  if (cardDueDay && cardDueDay >= 1 && cardDueDay <= 31) {
    for (let k = 0; k <= 2; k++) {
      const ym = addMonths(d.slice(0, 7), k)
      const dueDay = Math.min(cardDueDay, 28)
      const close = addDays(`${ym}-${pad2(dueDay)}`, -7)
      if (d <= close) return ym
    }
  }
  return addMonths(d.slice(0, 7), 1)
}

export function signedValue(tx: PluggyTx): number {
  const v = cents(Math.abs(tx.amount))
  return tx.type === 'CREDIT' ? -v : v
}

const PAYMENT_RE = /\b(pagamento|pgto)\b/i
const PREV_BALANCE_RE = /saldo\s+anterior/i

export function isIgnored(tx: PluggyTx): boolean {
  if (cents(Math.abs(tx.amount)) === 0) return true
  if (PREV_BALANCE_RE.test(tx.description)) return true
  if (tx.type === 'CREDIT' && (tx.category === 'Credit card payment' || PAYMENT_RE.test(tx.description))) return true
  return false
}

export function describe(tx: PluggyTx): string {
  const base = cleanDescription(tx.description)
  const n = tx.creditCardMetadata?.installmentNumber
  const t = tx.creditCardMetadata?.totalInstallments
  return n && t && t > 1 ? `${base} (${pad2(n)}/${pad2(t)})` : base
}

// Categoria Pluggy (nome exato, en) -> tag do app. Só tags existentes em EXPENSE_TAGS.
const CATEGORY_TAG: Record<string, string> = {
  'Groceries': 'supermercado',
  'Eating out': 'alimentacao',
  'Food delivery': 'alimentacao',
  'Pharmacy': 'farmacia',
  'Taxi and ride-hailing': 'uber',
  'Pet supplies and vet': 'pets',
  'Clothing': 'vestuario',
  'Airport and airlines': 'viagem',
  'Accommodation': 'viagem',
  'Gyms and fitness centers': 'academia',
  'Gas stations': 'combustivel',
}

export function tagFor(description: string, category: string | null): string | undefined {
  return guessTag(description) ?? (category ? CATEGORY_TAG[category] : undefined)
}

export function fingerprint(value: number, description: string, monthKey: string): string {
  return `${value.toFixed(2)}|${description}|${monthKey}`
}

export function windowStart(acct: PluggyAccountLink, bills: PluggyBill[], lastSyncAt: string | null): string {
  if (acct.syncedOnce && lastSyncAt) return addDays(spDate(lastSyncAt), -45)
  // 1ª sync: do dia seguinte ao fechamento anterior ao fechamento corrente.
  const closes = bills.map(b => b.billClosingDate).filter((c): c is string => !!c).sort()
  if (acct.closeDate) {
    const prev = closes.filter(c => c < acct.closeDate!).pop()
    const prevClose = prev ?? `${addMonths(acct.closeDate.slice(0, 7), -1)}${acct.closeDate.slice(7)}`
    return addDays(prevClose, 1)
  }
  const lastClose = closes.pop()
  if (lastClose) return addDays(lastClose, 1)
  return addDays(new Date().toISOString().slice(0, 10), -40)
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run tests/api/pluggyMapping.test.ts`
Expected: PASS. Se `tagFor('IFOOD *PEDIDO', …)` falhar, confira em `src/lib/autoTag.ts` qual palavra-chave cobre ifood e ajuste **o teste** para uma descrição que `guessTag` reconheça. Não mude o `autoTag`.

- [ ] **Step 5: Commit**

```bash
git add api/lib/pluggyMapping.ts tests/api/pluggyMapping.test.ts
git commit -m "feat(pluggy): mapeamento de transação de cartão para lançamento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Aplicação no payload (criar, atualizar, mover, cancelar, duplicadas)

**Files:**
- Create: `api/lib/pluggySync.ts`
- Test: `tests/api/pluggySync.test.ts`

**Interfaces:**
- Consumes: tudo de `api/lib/pluggyMapping.ts` (Task 2), `PluggyState`/`PluggySeen`/`PluggyAccountLink` (Task 1), `totalsFromItems` (`src/lib/monthTotals.ts`), `MONTHS` e `MonthAbbr` (`src/types/finance.ts`).
- Produces:
  - `interface AccountFetch { account: PluggyAccountLink; transactions: PluggyTx[]; bills: PluggyBill[]; windowFrom: string }`
  - `interface SyncCounts { created: number; updated: number; moved: number; removed: number; skippedDuplicates: number }`
  - `applyPluggySync(payload: SyncPayload, state: PluggyState, fetched: AccountFetch[], opts: { now: Date; cardDueDays: Record<string, number | undefined> }): { payload: SyncPayload; state: PluggyState; counts: SyncCounts }`
    - Não muta as entradas.
    - Devolve o `state` com `seen` atualizado, `seen` podado e `syncedOnce = true` nas contas processadas.
    - **Não** define `lastSyncAt`/`lastResult`: isso fica no orquestrador, na Task 5.

- [ ] **Step 1: Escrever o teste que falha em `tests/api/pluggySync.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { applyPluggySync, type AccountFetch } from '../../api/lib/pluggySync'
import type { SyncPayload } from '../../src/lib/syncService'
import type { PluggyState } from '../../src/lib/pluggyState'
import type { PluggyTx } from '../../api/lib/pluggyMapping'
import type { MonthItem } from '../../src/types/finance'

const NOW = new Date('2026-11-09T10:00:00.000Z')
const acct = { id: 'acc1', name: 'Caixa', last4: '1234', cardId: 'card-alan', closeDate: '2026-11-03', dueDate: '2026-11-10', syncedOnce: true }
const st = (over: Partial<PluggyState> = {}): PluggyState => ({
  itemId: 'it', itemStatus: 'UPDATED', itemError: null, consentExpiresAt: null,
  accounts: [acct], lastSyncAt: null, lastResult: null, seen: {}, ...over,
})
const pay = (items: MonthItem[] = [], month: 'Nov' | 'Dez' = 'Dez'): SyncPayload => ({
  manual_months: [{ month, year: 2026, revenue: 0, fixedCosts: 0, loans: 0, cards: 0, source: 'manual', items }],
  goals: [], recurring_items: [], investment_positions: [],
})
const tx = (over: Partial<PluggyTx>): PluggyTx => ({
  id: 't1', description: 'MERCADO BOM', amount: 100, type: 'DEBIT', date: '2026-11-05T15:00:00.000Z',
  status: 'POSTED', category: null, creditCardMetadata: null, ...over,
})
const fetch1 = (txs: PluggyTx[], bills = []): AccountFetch[] => [{ account: acct, transactions: txs, bills, windowFrom: '2026-10-04' }]
const run = (p: SyncPayload, s: PluggyState, f: AccountFetch[]) => applyPluggySync(p, s, f, { now: NOW, cardDueDays: {} })
const items = (p: SyncPayload) => p.manual_months.flatMap(m => (m.items ?? []).map(i => ({ ...i, _m: `${m.month}/${m.year}` })))

describe('applyPluggySync', () => {
  it('cria item com os campos corretos no mês da fatura e recalcula o total', () => {
    const out = run(pay([], 'Nov'), st(), fetch1([tx({})]))
    const it = items(out.payload).find(i => i.id === 'pluggy:t1')!
    expect(it).toMatchObject({ externalId: 'pluggy:t1', source: 'pluggy', category: 'cards', isPaid: false, cardId: 'card-alan', value: 100, description: 'MERCADO BOM', tag: 'supermercado', _m: 'Dez/2026' })
    expect(out.payload.manual_months.find(m => m.month === 'Dez')!.cards).toBe(100)
    expect(out.counts.created).toBe(1)
    expect(out.state.seen.t1).toMatchObject({ appItemId: 'pluggy:t1', accountId: 'acc1', pending: false })
  })
  it('é idempotente', () => {
    const a = run(pay(), st(), fetch1([tx({})]))
    const b = run(a.payload, a.state, fetch1([tx({})]))
    expect(b.counts).toEqual({ created: 0, updated: 0, moved: 0, removed: 0, skippedDuplicates: 0 })
    expect(items(b.payload).filter(i => i.id === 'pluggy:t1')).toHaveLength(1)
  })
  it('ignora pagamento de fatura e registra como visto', () => {
    const out = run(pay(), st(), fetch1([tx({ id: 'p', type: 'CREDIT', category: 'Credit card payment' })]))
    expect(items(out.payload)).toHaveLength(0)
    expect(out.state.seen.p.appItemId).toBeNull()
  })
  it('estorno entra negativo', () => {
    const out = run(pay(), st(), fetch1([tx({ id: 'r', type: 'CREDIT', description: 'ESTORNO LOJA' })]))
    expect(items(out.payload)[0].value).toBe(-100)
  })
  it('não duplica lançamento manual do mesmo cartão (±R$0,01, até 3 dias)', () => {
    const manual: MonthItem = { id: 'm1', description: 'mercado', value: 100.01, category: 'cards', isPaid: false, cardId: 'card-alan', occurredAt: '2026-11-03T12:00:00.000Z' }
    const out = run(pay([manual]), st(), fetch1([tx({})]))
    expect(items(out.payload).map(i => i.id)).toEqual(['m1'])
    expect(out.counts.skippedDuplicates).toBe(1)
    expect(out.state.seen.t1.appItemId).toBeNull()
  })
  it('não casa com item de outro cartão nem do PDF de outro valor', () => {
    const other: MonthItem = { id: 'm2', description: 'x', value: 100, category: 'cards', isPaid: false, cardId: 'card-pai' }
    const out = run(pay([other]), st(), fetch1([tx({})]))
    expect(out.counts.created).toBe(1)
  })
  it('item apagado pelo usuário não volta', () => {
    const a = run(pay(), st(), fetch1([tx({})]))
    const deleted = { ...a.payload, manual_months: a.payload.manual_months.map(m => ({ ...m, items: [] })) }
    const b = run(deleted, a.state, fetch1([tx({})]))
    expect(items(b.payload)).toHaveLength(0)
    expect(b.counts.created).toBe(0)
  })
  it('pendente confirmado com o mesmo id atualiza valor', () => {
    const a = run(pay(), st(), fetch1([tx({ status: 'PENDING', amount: 90 })]))
    const b = run(a.payload, a.state, fetch1([tx({ status: 'POSTED', amount: 100 })]))
    expect(items(b.payload).find(i => i.id === 'pluggy:t1')!.value).toBe(100)
    expect(b.counts.updated).toBe(1)
    expect(b.state.seen.t1.pending).toBe(false)
  })
  it('pendente que vira POSTED com id novo reaproveita o item', () => {
    const a = run(pay(), st(), fetch1([tx({ id: 'pend', status: 'PENDING' })]))
    const b = run(a.payload, a.state, fetch1([tx({ id: 'post', status: 'POSTED', date: '2026-11-06T15:00:00.000Z' })]))
    expect(items(b.payload)).toHaveLength(1)
    expect(b.state.seen.post.appItemId).toBe('pluggy:pend')
    expect(b.state.seen.pend.appItemId).toBeNull()
  })
  it('pendente cancelado é removido se não pago nem editado', () => {
    const a = run(pay(), st(), fetch1([tx({ id: 'pend', status: 'PENDING' })]))
    const b = run(a.payload, a.state, fetch1([]))
    expect(items(b.payload)).toHaveLength(0)
    expect(b.counts.removed).toBe(1)
  })
  it('pendente cancelado é preservado se pago ou editado', () => {
    const a = run(pay(), st(), fetch1([tx({ id: 'pend', status: 'PENDING' })]))
    const paid = { ...a.payload, manual_months: a.payload.manual_months.map(m => ({ ...m, items: (m.items ?? []).map(i => ({ ...i, isPaid: true })) })) }
    expect(items(run(paid, a.state, fetch1([])).payload)).toHaveLength(1)
    const edited = { ...a.payload, manual_months: a.payload.manual_months.map(m => ({ ...m, items: (m.items ?? []).map(i => ({ ...i, description: 'Mercado do mês' })) })) }
    expect(items(run(edited, a.state, fetch1([])).payload)).toHaveLength(1)
  })
  it('billId que aparece move o item de mês', () => {
    const a = run(pay(), st(), fetch1([tx({})]))                 // estimado: Dez/2026
    const bills = [{ id: 'b', dueDate: '2027-01-10' }]
    const b = run(a.payload, a.state, fetch1([tx({ creditCardMetadata: { billId: 'b' } })], bills as never))
    expect(items(b.payload).find(i => i.id === 'pluggy:t1')!._m).toBe('Jan/2027')
    expect(b.counts.moved).toBe(1)
  })
  it('conta sem cardId é ignorada', () => {
    const out = applyPluggySync(pay(), st({ accounts: [{ ...acct, cardId: null }] }), [{ account: { ...acct, cardId: null }, transactions: [tx({})], bills: [], windowFrom: '2026-10-04' }], { now: NOW, cardDueDays: {} })
    expect(items(out.payload)).toHaveLength(0)
  })
  it('poda seen com mais de 400 dias e sem item', () => {
    const old = { appItemId: null, fp: 'x', at: '2025-01-01T00:00:00.000Z', accountId: 'acc1', value: 1, date: '2025-01-01', pending: false }
    const out = run(pay(), st({ seen: { velho: old } }), fetch1([]))
    expect(out.state.seen.velho).toBeUndefined()
  })
  it('marca syncedOnce nas contas processadas', () => {
    const out = run(pay(), st({ accounts: [{ ...acct, syncedOnce: false }] }), [{ account: { ...acct, syncedOnce: false }, transactions: [], bills: [], windowFrom: '2026-10-04' }])
    expect(out.state.accounts[0].syncedOnce).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/api/pluggySync.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `api/lib/pluggySync.ts`**

```ts
// Aplica as transações Pluggy no payload do Gist. Lib pura, sem I/O e sem mutar entradas.
import type { SyncPayload } from '../../src/lib/syncService'
import type { PluggyAccountLink, PluggySeen, PluggyState } from '../../src/lib/pluggyState'
import { MONTHS, type MonthAbbr, type MonthItem, type MonthRecord } from '../../src/types/finance'
import { totalsFromItems } from '../../src/lib/monthTotals'
import {
  billMonthKey, describe, fingerprint, isIgnored, signedValue, spDate, tagFor,
  type PluggyBill, type PluggyTx,
} from './pluggyMapping'

export interface AccountFetch { account: PluggyAccountLink; transactions: PluggyTx[]; bills: PluggyBill[]; windowFrom: string }
export interface SyncCounts { created: number; updated: number; moved: number; removed: number; skippedDuplicates: number }

const SEEN_TTL_DAYS = 400
const keyOf = (m: Pick<MonthRecord, 'month' | 'year'>) => `${m.year}-${String(MONTHS.indexOf(m.month) + 1).padStart(2, '0')}`
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000

export function applyPluggySync(
  payload: SyncPayload,
  state: PluggyState,
  fetched: AccountFetch[],
  opts: { now: Date; cardDueDays: Record<string, number | undefined> },
): { payload: SyncPayload; state: PluggyState; counts: SyncCounts } {
  const months: MonthRecord[] = JSON.parse(JSON.stringify(payload.manual_months ?? []))
  const seen: Record<string, PluggySeen> = JSON.parse(JSON.stringify(state.seen ?? {}))
  const counts: SyncCounts = { created: 0, updated: 0, moved: 0, removed: 0, skippedDuplicates: 0 }
  const touched = new Set<MonthRecord>()
  const nowIso = opts.now.toISOString()

  const monthFor = (ym: string): MonthRecord => {
    const [y, m] = ym.split('-').map(Number)
    const abbr = MONTHS[m - 1] as MonthAbbr
    let rec = months.find(r => r.year === y && r.month === abbr)
    if (!rec) {
      rec = { month: abbr, year: y, revenue: 0, fixedCosts: 0, loans: 0, cards: 0, variableCosts: 0, source: 'manual', items: [] }
      months.push(rec)
    }
    rec.items ??= []
    return rec
  }
  const find = (id: string): { rec: MonthRecord; idx: number } | null => {
    for (const rec of months) {
      const idx = (rec.items ?? []).findIndex(i => i.id === id)
      if (idx >= 0) return { rec, idx }
    }
    return null
  }
  const fpOf = (rec: MonthRecord, it: MonthItem) => fingerprint(it.value, it.description, keyOf(rec))
  const untouched = (loc: { rec: MonthRecord; idx: number }, entry: PluggySeen) =>
    !loc.rec.items![loc.idx].isPaid && fpOf(loc.rec, loc.rec.items![loc.idx]) === entry.fp

  /** Atualiza valor/descrição/mês de um item intocado. Devolve o novo fp. */
  const reconcileItem = (loc: { rec: MonthRecord; idx: number }, value: number, desc: string, ym: string): string => {
    const it = loc.rec.items![loc.idx]
    const changed = it.value !== value || it.description !== desc
    const updated: MonthItem = { ...it, value, description: desc }
    if (keyOf(loc.rec) !== ym) {
      loc.rec.items!.splice(loc.idx, 1)
      touched.add(loc.rec)
      const dest = monthFor(ym)
      dest.items!.push(updated)
      touched.add(dest)
      counts.moved++
    } else if (changed) {
      loc.rec.items![loc.idx] = updated
      touched.add(loc.rec)
      counts.updated++
    }
    return fingerprint(value, desc, ym)
  }

  const processedAccounts = new Set<string>()
  for (const { account, transactions, bills, windowFrom } of fetched) {
    if (!account.cardId) continue
    processedAccounts.add(account.id)
    const billMap = new Map(bills.map(b => [b.id, b]))
    const fetchedIds = new Set(transactions.map(t => t.id))
    const reusedPending = new Set<string>()
    const usedManual = new Set<string>()
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

    for (const tx of sorted) {
      const date = spDate(tx.date)
      const ym = billMonthKey(tx, billMap, account, opts.cardDueDays[account.cardId])
      const value = signedValue(tx)
      const desc = describe(tx)
      const pending = tx.status === 'PENDING'
      const known = seen[tx.id]

      if (known) {
        if (known.appItemId) {
          const loc = find(known.appItemId)
          if (loc && untouched(loc, known)) known.fp = reconcileItem(loc, value, desc, ym)
        }
        known.pending = pending
        known.value = value
        continue
      }

      const entry: PluggySeen = { appItemId: null, fp: '', at: nowIso, accountId: account.id, value, date, pending }
      if (isIgnored(tx)) { seen[tx.id] = entry; continue }

      // Pendente antigo que sumiu e reaparece com id novo.
      const replaced = Object.entries(seen).find(([id, e]) =>
        e.pending && e.accountId === account.id && e.appItemId && !fetchedIds.has(id) && !reusedPending.has(id) &&
        Math.abs(e.value - value) <= 0.01 && dayDiff(e.date, date) <= 3)
      if (replaced) {
        const [oldId, oldEntry] = replaced
        reusedPending.add(oldId)
        const loc = find(oldEntry.appItemId!)
        entry.appItemId = oldEntry.appItemId
        entry.fp = loc && untouched(loc, oldEntry) ? reconcileItem(loc, value, desc, ym) : oldEntry.fp
        seen[oldId] = { ...oldEntry, appItemId: null, pending: false }
        seen[tx.id] = entry
        continue
      }

      // Duplicata de lançamento não-Pluggy do mesmo cartão no mesmo mês.
      const target = monthFor(ym)
      const dup = target.items!.find(it =>
        !usedManual.has(it.id) && it.cardId === account.cardId && it.source !== 'pluggy' &&
        !(it.externalId ?? '').startsWith('pluggy:') &&
        Math.abs(it.value - value) <= 0.01 &&
        (!it.occurredAt || dayDiff(spDate(it.occurredAt), date) <= 3))
      if (dup) {
        usedManual.add(dup.id)
        counts.skippedDuplicates++
        seen[tx.id] = entry
        continue
      }

      const id = `pluggy:${tx.id}`
      const tag = value > 0 ? tagFor(desc, tx.category) : undefined
      target.items!.push({
        id, externalId: id, source: 'pluggy', description: desc, value, category: 'cards',
        isPaid: false, cardId: account.cardId, occurredAt: `${date}T15:00:00.000Z`,
        ...(tag ? { tag } : {}),
      })
      touched.add(target)
      counts.created++
      entry.appItemId = id
      entry.fp = fingerprint(value, desc, ym)
      seen[tx.id] = entry
    }

    // Pendentes que sumiram na janela consultada -> cancelados.
    for (const [id, e] of Object.entries(seen)) {
      if (e.accountId !== account.id || !e.pending || fetchedIds.has(id) || reusedPending.has(id)) continue
      if (e.date < windowFrom) continue
      if (e.appItemId) {
        const loc = find(e.appItemId)
        if (loc && untouched(loc, e)) {
          loc.rec.items!.splice(loc.idx, 1)
          touched.add(loc.rec)
          counts.removed++
        }
      }
      seen[id] = { ...e, appItemId: null, pending: false }
    }
  }

  // Poda: mais de 400 dias e sem item correspondente.
  const cutoff = opts.now.getTime() - SEEN_TTL_DAYS * 86_400_000
  for (const [id, e] of Object.entries(seen)) {
    if (Date.parse(e.at) < cutoff && (!e.appItemId || !find(e.appItemId))) delete seen[id]
  }

  for (const rec of touched) Object.assign(rec, totalsFromItems(rec.items ?? []))

  return {
    payload: { ...payload, manual_months: months },
    state: {
      ...state,
      seen,
      accounts: state.accounts.map(a => (processedAccounts.has(a.id) ? { ...a, syncedOnce: true } : a)),
    },
    counts,
  }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run tests/api/pluggySync.test.ts`
Expected: PASS.
- Se `MonthRecord` exigir campos que o objeto criado em `monthFor` não tem, copie exatamente o formato usado em `appendTelegramTransaction` (`api/lib/telegram.ts`, em torno da linha 123).
- Se `MONTHS` não estiver exportado de `src/types/finance.ts`, use o mesmo import que `src/lib/budget.ts` usa.

- [ ] **Step 5: Rodar a suíte inteira e os tipos**

Run: `npx vitest run && npx tsc -b --noEmit`
Expected: PASS, sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add api/lib/pluggySync.ts tests/api/pluggySync.test.ts
git commit -m "feat(pluggy): aplica transações no payload (criar, atualizar, mover, cancelar, duplicadas)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cliente HTTP da Pluggy

**Files:**
- Create: `api/lib/pluggyClient.ts`
- Test: `tests/api/pluggyClient.test.ts`

**Interfaces:**
- Consumes: `PluggyTx`, `PluggyBill` (Task 2).
- Produces: `class PluggyError extends Error { status: number }` e `createPluggyClient(creds: { clientId: string; clientSecret: string }, fetchImpl?: typeof fetch)`, que devolve um objeto com:
  - `getItem(id: string): Promise<PluggyItem>`
  - `getCreditAccounts(itemId: string): Promise<PluggyAccount[]>`
  - `getBills(accountId: string): Promise<PluggyBill[]>`
  - `getTransactions(accountId: string, dateFrom: string, dateTo: string): Promise<PluggyTx[]>`

  Os tipos auxiliares exportados são:
  - `PluggyItem = { id: string; status: string; executionStatus?: string; consentExpiresAt?: string | null; error?: { code?: string; message?: string } | null; connector?: { name?: string } }`
  - `PluggyAccount = { id: string; type: string; name: string; number?: string | null; creditData?: { balanceCloseDate?: string | null; balanceDueDate?: string | null } | null }`

- [ ] **Step 1: Escrever o teste que falha em `tests/api/pluggyClient.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { createPluggyClient, PluggyError } from '../../api/lib/pluggyClient'

function mockFetch(routes: Record<string, unknown>, calls: string[] = []) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    calls.push(`${init?.method ?? 'GET'} ${u.replace('https://api.pluggy.ai', '')}`)
    const key = Object.keys(routes).find(k => u.replace('https://api.pluggy.ai', '').startsWith(k))
    if (!key) return new Response('{}', { status: 404 })
    const body = routes[key]
    if (body instanceof Response) return body
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
}
const creds = { clientId: 'id', clientSecret: 'sec' }

describe('pluggyClient', () => {
  it('autentica uma vez e envia X-API-KEY', async () => {
    const f = mockFetch({ '/auth': { apiKey: 'K' }, '/items/it': { id: 'it', status: 'UPDATED' } })
    const c = createPluggyClient(creds, f)
    await c.getItem('it'); await c.getItem('it')
    const calls = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
    expect(calls.filter(([u]) => u.endsWith('/auth'))).toHaveLength(1)
    expect((calls[1][1].headers as Record<string, string>)['X-API-KEY']).toBe('K')
  })
  it('filtra só contas CREDIT', async () => {
    const f = mockFetch({ '/auth': { apiKey: 'K' }, '/accounts': { results: [{ id: 'a', type: 'BANK', name: 'cc' }, { id: 'b', type: 'CREDIT', name: 'cartão', number: '1234' }] } })
    expect((await createPluggyClient(creds, f).getCreditAccounts('it')).map(a => a.id)).toEqual(['b'])
  })
  it('pagina /v2/transactions pelo next', async () => {
    const calls: string[] = []
    let n = 0
    const f = vi.fn(async (url: string) => {
      const u = String(url).replace('https://api.pluggy.ai', '')
      calls.push(u)
      if (u === '/auth') return new Response(JSON.stringify({ apiKey: 'K' }))
      n++
      return new Response(JSON.stringify(n === 1
        ? { results: [{ id: 't1' }], next: '?accountId=a&after=CUR' }
        : { results: [{ id: 't2' }], next: null }))
    }) as unknown as typeof fetch
    const txs = await createPluggyClient(creds, f).getTransactions('a', '2026-10-04', '2026-11-10')
    expect(txs.map(t => t.id)).toEqual(['t1', 't2'])
    expect(calls[1]).toBe('/v2/transactions?accountId=a&dateFrom=2026-10-04&dateTo=2026-11-10')
    expect(calls[2]).toBe('/v2/transactions?accountId=a&after=CUR')
  })
  it('pagina /bills por page/totalPages', async () => {
    const f = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.endsWith('/auth')) return new Response(JSON.stringify({ apiKey: 'K' }))
      const page = Number(new URL(u).searchParams.get('page'))
      return new Response(JSON.stringify({ page, totalPages: 2, results: [{ id: `b${page}`, dueDate: '2026-11-10' }] }))
    }) as unknown as typeof fetch
    expect((await createPluggyClient(creds, f).getBills('a')).map(b => b.id)).toEqual(['b1', 'b2'])
  })
  it('erro de auth vira PluggyError 401 sem vazar segredo', async () => {
    const f = mockFetch({ '/auth': new Response(JSON.stringify({ message: 'bad' }), { status: 401 }) })
    await expect(createPluggyClient(creds, f).getItem('it')).rejects.toMatchObject({ name: 'PluggyError', status: 401 })
    await expect(createPluggyClient(creds, f).getItem('it')).rejects.not.toThrow(/sec/)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/api/pluggyClient.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `api/lib/pluggyClient.ts`**

```ts
// Cliente mínimo da API Pluggy. Server-only. Nunca loga credenciais nem dados de transação.
import type { PluggyBill, PluggyTx } from './pluggyMapping'

const BASE = 'https://api.pluggy.ai'

export class PluggyError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'PluggyError'
    this.status = status
  }
}

export interface PluggyItem {
  id: string
  status: string
  executionStatus?: string
  consentExpiresAt?: string | null
  error?: { code?: string; message?: string } | null
  connector?: { name?: string }
}
export interface PluggyAccount {
  id: string
  type: string
  name: string
  number?: string | null
  creditData?: { balanceCloseDate?: string | null; balanceDueDate?: string | null } | null
}

export function createPluggyClient(
  creds: { clientId: string; clientSecret: string },
  fetchImpl: typeof fetch = fetch,
) {
  let apiKey: string | null = null
  let apiKeyAt = 0

  async function auth(): Promise<string> {
    if (apiKey && Date.now() - apiKeyAt < 100 * 60_000) return apiKey
    const res = await fetchImpl(`${BASE}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: creds.clientId, clientSecret: creds.clientSecret }),
    })
    if (!res.ok) throw new PluggyError(res.status === 401 ? 'Credenciais da Pluggy inválidas.' : 'Falha ao autenticar na Pluggy.', res.status)
    const data = (await res.json()) as { apiKey?: string }
    if (!data.apiKey) throw new PluggyError('Resposta de autenticação da Pluggy sem apiKey.', 502)
    apiKey = data.apiKey
    apiKeyAt = Date.now()
    return apiKey
  }

  async function get<T>(path: string): Promise<T> {
    const key = await auth()
    const res = await fetchImpl(`${BASE}${path}`, { headers: { 'X-API-KEY': key } })
    if (!res.ok) throw new PluggyError(`Pluggy respondeu ${res.status}.`, res.status)
    return (await res.json()) as T
  }

  return {
    getItem: (id: string) => get<PluggyItem>(`/items/${encodeURIComponent(id)}`),

    async getCreditAccounts(itemId: string): Promise<PluggyAccount[]> {
      const data = await get<{ results?: PluggyAccount[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`)
      return (data.results ?? []).filter(a => a.type === 'CREDIT')
    },

    async getBills(accountId: string): Promise<PluggyBill[]> {
      const out: PluggyBill[] = []
      for (let page = 1; page <= 20; page++) {
        const data = await get<{ results?: PluggyBill[]; totalPages?: number }>(
          `/bills?accountId=${encodeURIComponent(accountId)}&page=${page}&pageSize=500`)
        out.push(...(data.results ?? []))
        if (!data.totalPages || page >= data.totalPages) break
      }
      return out
    },

    async getTransactions(accountId: string, dateFrom: string, dateTo: string): Promise<PluggyTx[]> {
      const out: PluggyTx[] = []
      let path: string | null =
        `/v2/transactions?accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}&dateTo=${dateTo}`
      for (let i = 0; path && i < 50; i++) {
        const data: { results?: PluggyTx[]; next?: string | null } = await get(path)
        out.push(...(data.results ?? []))
        path = data.next ? `/v2/transactions${data.next}` : null
      }
      return out
    },
  }
}

export type PluggyClient = ReturnType<typeof createPluggyClient>
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run tests/api/pluggyClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/lib/pluggyClient.ts tests/api/pluggyClient.test.ts
git commit -m "feat(pluggy): cliente HTTP (auth, item, contas, faturas, transações v2)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Endpoint `/api/pluggy` (ações do app e cron diário)

**Files:**
- Create: `api/lib/pluggyRun.ts` (orquestração testável, com dependências injetadas)
- Create: `api/pluggy.ts` (endpoint fino)
- Modify: `vercel.json` (cron)
- Test: `tests/api/pluggyRun.test.ts`

**Interfaces:**
- Consumes: `createPluggyClient`, `PluggyClient`, `PluggyError` (Task 4); `applyPluggySync`, `AccountFetch` (Task 3); `windowStart`, `spDate` (Task 2); `toStatusView`, `PluggyState`, `PluggyStatusView` (Task 1); `getGistPayload`, `setGistPayload` (`api/lib/gist.ts`).
- Produces:
  - `type Deps = { client: PluggyClient; load: () => Promise<SyncPayload | null>; save: (p: SyncPayload) => Promise<void>; now: () => Date }`
  - `registerItem(deps, itemId: string): Promise<PluggyStatusView>`
  - `mapAccount(deps, accountId: string, cardId: string | null): Promise<PluggyStatusView>`
  - `runSync(deps): Promise<PluggyStatusView>`
  - `readStatus(deps): Promise<PluggyStatusView>`
  - HTTP:
    - `POST /api/pluggy` com `{action: 'status' | 'register-item' | 'map-account' | 'sync', ...}` devolve `{ ok: true, status: PluggyStatusView }` ou `{ ok: false, error }`.
    - `GET /api/pluggy` com `Authorization: Bearer <CRON_SECRET>` roda `runSync`.

- [ ] **Step 1: Escrever o teste que falha em `tests/api/pluggyRun.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { registerItem, mapAccount, runSync, readStatus, type Deps } from '../../api/lib/pluggyRun'
import type { SyncPayload } from '../../src/lib/syncService'

const NOW = new Date('2026-11-09T10:00:00.000Z')
const empty = (): SyncPayload => ({ manual_months: [], goals: [], recurring_items: [], investment_positions: [], card_accounts: [{ id: 'card-alan', name: 'Alan', dueDay: 10 }] })

function makeDeps(over: Partial<Deps['client']> = {}, initial: SyncPayload = empty()) {
  let stored: SyncPayload = initial
  const client = {
    getItem: vi.fn(async () => ({ id: 'it', status: 'UPDATED', consentExpiresAt: '2027-11-01T00:00:00.000Z', connector: { name: 'MeuPluggy' } })),
    getCreditAccounts: vi.fn(async () => [{ id: 'acc1', type: 'CREDIT', name: 'Caixa Visa', number: '1234', creditData: { balanceCloseDate: '2026-11-03', balanceDueDate: '2026-11-10' } }]),
    getBills: vi.fn(async () => []),
    getTransactions: vi.fn(async () => [{ id: 't1', description: 'MERCADO BOM', amount: 100, type: 'DEBIT', date: '2026-11-05T15:00:00.000Z', status: 'POSTED', category: null }]),
    ...over,
  }
  const deps: Deps = {
    client: client as unknown as Deps['client'],
    load: async () => stored,
    save: vi.fn(async (p: SyncPayload) => { stored = p }),
    now: () => NOW,
  }
  return { deps, client, get: () => stored }
}

describe('pluggyRun', () => {
  it('registerItem valida uuid', async () => {
    const { deps } = makeDeps()
    await expect(registerItem(deps, 'nao-e-uuid')).rejects.toThrow(/ID da conexão/)
  })
  it('registerItem grava item e contas sem cartão', async () => {
    const { deps, get } = makeDeps()
    const v = await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    expect(v.connected).toBe(true)
    expect(v.accounts).toEqual([{ id: 'acc1', name: 'Caixa Visa', last4: '1234', cardId: null }])
    expect(get().pluggy?.itemId).toBe('11111111-2222-3333-4444-555555555555')
  })
  it('mapAccount liga a conta e rejeita cartão inexistente', async () => {
    const { deps } = makeDeps()
    await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    await expect(mapAccount(deps, 'acc1', 'nao-existe')).rejects.toThrow(/Cartão/)
    expect((await mapAccount(deps, 'acc1', 'card-alan')).accounts[0].cardId).toBe('card-alan')
  })
  it('runSync cria lançamentos só de conta ligada e grava lastResult', async () => {
    const { deps, client, get } = makeDeps()
    await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    let v = await runSync(deps)
    expect(client.getTransactions).not.toHaveBeenCalled()
    expect(v.lastResult?.created).toBe(0)
    await mapAccount(deps, 'acc1', 'card-alan')
    // força passar do guard de 60 s
    get().pluggy!.lastResult = { ...get().pluggy!.lastResult!, at: '2026-11-09T09:00:00.000Z' }
    v = await runSync(deps)
    expect(v.lastResult).toMatchObject({ ok: true, created: 1 })
    expect(v.lastSyncAt).toBe(NOW.toISOString())
    expect(client.getTransactions).toHaveBeenCalledWith('acc1', '2026-10-04', '2026-11-10')
  })
  it('runSync em < 60 s devolve o resultado anterior sem chamar a Pluggy', async () => {
    const { deps, client } = makeDeps()
    await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    await runSync(deps)
    client.getItem.mockClear()
    await runSync(deps)
    expect(client.getItem).not.toHaveBeenCalled()
  })
  it('falha na Pluggy grava ok=false e mantém lastSyncAt', async () => {
    const { deps, get } = makeDeps({ getCreditAccounts: vi.fn(async () => { throw new Error('boom') }) })
    await registerItem(deps, '11111111-2222-3333-4444-555555555555').catch(() => {})
    get().pluggy = { itemId: 'it', itemStatus: 'UPDATED', itemError: null, consentExpiresAt: null, accounts: [], lastSyncAt: '2026-11-08T10:00:00.000Z', lastResult: null, seen: {} }
    const v = await runSync(deps)
    expect(v.lastResult?.ok).toBe(false)
    expect(v.lastSyncAt).toBe('2026-11-08T10:00:00.000Z')
  })
  it('status de erro do item é exposto', async () => {
    const { deps } = makeDeps({ getItem: vi.fn(async () => ({ id: 'it', status: 'LOGIN_ERROR', error: { code: 'USER_AUTHORIZATION_EXPIRED' } })) })
    await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    const v = await readStatus(deps)
    expect(v).toMatchObject({ itemStatus: 'LOGIN_ERROR', itemError: 'USER_AUTHORIZATION_EXPIRED' })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/api/pluggyRun.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `api/lib/pluggyRun.ts`**

```ts
// Orquestração da integração Pluggy (testável: dependências injetadas). Sem logs de dados.
import type { SyncPayload } from '../../src/lib/syncService'
import { toStatusView, type PluggyAccountLink, type PluggyState, type PluggyStatusView } from '../../src/lib/pluggyState'
import type { PluggyClient } from './pluggyClient'
import { applyPluggySync, type AccountFetch } from './pluggySync'
import { spDate, windowStart } from './pluggyMapping'

export interface Deps {
  client: PluggyClient
  load: () => Promise<SyncPayload | null>
  save: (p: SyncPayload) => Promise<void>
  now: () => Date
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GUARD_MS = 60_000
const emptyPayload = (): SyncPayload => ({ manual_months: [], goals: [], recurring_items: [], investment_positions: [] })

async function refreshAccounts(client: PluggyClient, itemId: string, prev: PluggyAccountLink[]): Promise<PluggyAccountLink[]> {
  const accounts = await client.getCreditAccounts(itemId)
  return accounts.map(a => {
    const old = prev.find(p => p.id === a.id)
    return {
      id: a.id,
      name: a.name,
      last4: a.number ? String(a.number).slice(-4) : null,
      cardId: old?.cardId ?? null,
      closeDate: a.creditData?.balanceCloseDate ?? null,
      dueDate: a.creditData?.balanceDueDate ?? null,
      syncedOnce: old?.syncedOnce ?? false,
    }
  })
}

function itemFields(item: Awaited<ReturnType<PluggyClient['getItem']>>) {
  return {
    itemStatus: item.status,
    itemError: item.error?.code ?? null,
    consentExpiresAt: item.consentExpiresAt ?? null,
  }
}

export async function readStatus(deps: Deps): Promise<PluggyStatusView> {
  return toStatusView((await deps.load())?.pluggy, true)
}

export async function registerItem(deps: Deps, itemId: string): Promise<PluggyStatusView> {
  const id = itemId.trim()
  if (!UUID_RE.test(id)) throw new Error('ID da conexão inválido: copie o ID do item no painel da Pluggy.')
  const item = await deps.client.getItem(id)
  const current = (await deps.load()) ?? emptyPayload()
  const prev = current.pluggy
  const accounts = await refreshAccounts(deps.client, id, prev?.accounts ?? [])
  const state: PluggyState = {
    itemId: id,
    ...itemFields(item),
    accounts,
    lastSyncAt: prev?.lastSyncAt ?? null,
    lastResult: prev?.lastResult ?? null,
    seen: prev?.seen ?? {},
  }
  const fresh = (await deps.load()) ?? emptyPayload()
  await deps.save({ ...fresh, pluggy: state })
  return toStatusView(state, true)
}

export async function mapAccount(deps: Deps, accountId: string, cardId: string | null): Promise<PluggyStatusView> {
  const current = (await deps.load()) ?? emptyPayload()
  const state = current.pluggy
  if (!state) throw new Error('Nenhuma conexão registrada.')
  if (!state.accounts.some(a => a.id === accountId)) throw new Error('Conta não encontrada na conexão.')
  if (cardId && !(current.card_accounts ?? []).some(c => c.id === cardId)) throw new Error('Cartão do app não encontrado.')
  const next: PluggyState = { ...state, accounts: state.accounts.map(a => (a.id === accountId ? { ...a, cardId } : a)) }
  await deps.save({ ...current, pluggy: next })
  return toStatusView(next, true)
}

export async function runSync(deps: Deps): Promise<PluggyStatusView> {
  const now = deps.now()
  const before = (await deps.load())?.pluggy
  if (!before) throw new Error('Nenhuma conexão registrada.')
  if (before.lastResult && now.getTime() - Date.parse(before.lastResult.at) < GUARD_MS) {
    return toStatusView(before, true)
  }

  let itemPart: Partial<PluggyState> = {}
  let accounts = before.accounts
  const fetched: AccountFetch[] = []
  const errors: string[] = []
  try {
    itemPart = itemFields(await deps.client.getItem(before.itemId))
    accounts = await refreshAccounts(deps.client, before.itemId, before.accounts)
    const dateTo = spDate(new Date(now.getTime() + 86_400_000).toISOString())
    for (const acc of accounts) {
      if (!acc.cardId) continue
      try {
        const bills = await deps.client.getBills(acc.id)
        const windowFrom = windowStart(acc, bills, before.lastSyncAt)
        const transactions = await deps.client.getTransactions(acc.id, windowFrom, dateTo)
        fetched.push({ account: acc, transactions, bills, windowFrom })
      } catch {
        errors.push(`Falha ao ler ${acc.name}.`)
      }
    }
  } catch {
    errors.push('Não foi possível falar com a Pluggy. Nova tentativa amanhã.')
  }

  // Relê o Gist logo antes de gravar para não pisar em push recente do app.
  const fresh = (await deps.load()) ?? emptyPayload()
  const base: PluggyState = { ...(fresh.pluggy ?? before), ...itemPart, accounts }
  const cardDueDays = Object.fromEntries((fresh.card_accounts ?? []).map(c => [c.id, c.dueDay]))
  const applied = applyPluggySync(fresh, base, fetched, { now, cardDueDays })
  // lastSyncAt só avança se ao menos uma conta foi lida (ou não havia erro algum).
  const advanced = fetched.length > 0 || errors.length === 0
  const state: PluggyState = {
    ...applied.state,
    lastSyncAt: advanced ? now.toISOString() : before.lastSyncAt,
    lastResult: { at: now.toISOString(), ok: errors.length === 0, ...applied.counts, ...(errors.length ? { error: errors.join(' ') } : {}) },
  }
  await deps.save({ ...applied.payload, pluggy: state })
  return toStatusView(state, true)
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run tests/api/pluggyRun.test.ts`
Expected: PASS. Se o teste "falha na Pluggy…" falhar porque `registerItem` gravou `seen` diferente, ajuste só o setup do teste (ele sobrescreve `pluggy` à mão). A regra que importa é: `lastSyncAt` só avança se pelo menos uma conta foi lida.

- [ ] **Step 5: Implementar `api/pluggy.ts`**

```ts
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
```

Confira se `api/lib/auth.ts` exporta `verifySession` com essa assinatura. É o mesmo uso de `api/import-invoice.ts`. `api/sync.ts`, que é Edge, já importa de `./lib/auth`, então ele funciona em Edge.

- [ ] **Step 6: `vercel.json`**

Leia o arquivo inteiro antes de editar. Em `"crons"`, acrescente depois do item de `/api/summary`:

```json
    {
      "path": "/api/pluggy",
      "schedule": "0 10 * * *"
    }
```

Não mexa em `"functions"`, porque a função é Edge. Valide o JSON com `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"`.

- [ ] **Step 7: Suíte, tipos e lint**

Run: `npx vitest run && npx tsc -b --noEmit && npx eslint api src`
Expected: PASS, 0 erros. Os warnings de `exhaustive-deps` já existentes são aceitos.

- [ ] **Step 8: Commit**

```bash
git add api/lib/pluggyRun.ts api/pluggy.ts vercel.json tests/api/pluggyRun.test.ts
git commit -m "feat(pluggy): endpoint /api/pluggy (edge) e cron diário de sincronização

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Bloco "Banco conectado" na aba Cartões e pull forçado

**Files:**
- Create: `src/lib/pluggyApi.ts`
- Create: `src/pages/Cards/BankConnectionCard.tsx`
- Modify: `src/pages/Cards/index.tsx` (renderizar o bloco no topo da lista de cartões)
- Modify: `src/hooks/useSyncManager.ts` (ouvir o evento `ff:force-pull`)
- Modify: `src/components/metrics/CategoryReportBlock.tsx:165` (chip "Banco")
- Test: `tests/pluggyApi.test.ts`

**Interfaces:**
- Consumes: `PluggyStatusView` (Task 1); contrato HTTP de `/api/pluggy` (Task 5); `useCardsStore` (`accounts: CardAccount[]`).
- Produces:
  - `pluggyCall(action: 'status'): Promise<PluggyStatusView>`
  - `pluggyCall(action: 'register-item', body: { itemId: string })`
  - `pluggyCall(action: 'map-account', body: { accountId: string; cardId: string | null })`
  - `pluggyCall(action: 'sync')`

  As três últimas também devolvem `Promise<PluggyStatusView>`. Erro: lança `Error(mensagem do servidor)`.
  - Evento DOM `window.dispatchEvent(new Event('ff:force-pull'))`.

- [ ] **Step 1: Escrever o teste que falha em `tests/pluggyApi.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { pluggyCall } from '../src/lib/pluggyApi'

afterEach(() => vi.unstubAllGlobals())

describe('pluggyCall', () => {
  it('envia action e devolve status', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, status: { configured: true, connected: false } })))
    vi.stubGlobal('fetch', f)
    const s = await pluggyCall('status')
    expect(s.configured).toBe(true)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/pluggy')
    expect(JSON.parse(String(init.body))).toEqual({ action: 'status' })
    expect(init.credentials).toBe('same-origin')
  })
  it('lança a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'ID da conexão inválido' }), { status: 400 })))
    await expect(pluggyCall('register-item', { itemId: 'x' })).rejects.toThrow('ID da conexão inválido')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/pluggyApi.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `src/lib/pluggyApi.ts`**

```ts
import type { PluggyStatusView } from './pluggyState'

type Action = 'status' | 'register-item' | 'map-account' | 'sync'

export async function pluggyCall(action: Action, body: Record<string, unknown> = {}): Promise<PluggyStatusView> {
  const res = await fetch('/api/pluggy', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  let data: { ok?: boolean; status?: PluggyStatusView; error?: string } = {}
  try { data = await res.json() } catch { /* corpo vazio */ }
  if (!res.ok || !data.ok || !data.status) throw new Error(data.error ?? 'Falha ao falar com o servidor.')
  return data.status
}
```

- [ ] **Step 4: Rodar o teste**

Run: `npx vitest run tests/pluggyApi.test.ts`
Expected: PASS.

- [ ] **Step 5: Pull forçado em `src/hooks/useSyncManager.ts`**

Leia o hook e localize a função que faz o pull (a mesma usada no `onFocus`, perto da linha 290). No mesmo `useEffect` onde os listeners de `focus`/`visibilitychange` são registrados, adicione:

```ts
    const onForcePull = () => { lastPullAt.current = 0; onFocus() }
    window.addEventListener('ff:force-pull', onForcePull)
```

No cleanup, adicione `window.removeEventListener('ff:force-pull', onForcePull)`. Se `onFocus` respeitar o `REFRESH_AFTER_MS` por `lastPullAt`, zerar `lastPullAt.current` força o pull. Se o hook usar outro nome para o controle de tempo, use o equivalente: o objetivo é que o evento sempre dispare um pull.

- [ ] **Step 6: Criar `src/pages/Cards/BankConnectionCard.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useCardsStore } from '@/stores/useCardsStore'
import { pluggyCall } from '@/lib/pluggyApi'
import type { PluggyStatusView } from '@/lib/pluggyState'

const ERROR_STATUSES = new Set(['LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_INPUT'])
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
const btn = 'inline-flex items-center min-h-[40px] px-3 rounded-[10px] text-[13px] font-semibold'

export default function BankConnectionCard() {
  const cards = useCardsStore(s => s.accounts)
  const [status, setStatus] = useState<PluggyStatusView | null>(null)
  const [itemId, setItemId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    pluggyCall('status').then(setStatus).catch(e => setError(e.message))
  }, [])

  const run = async (label: string, fn: () => Promise<PluggyStatusView>, pull = false) => {
    setBusy(label); setError(null)
    try {
      setStatus(await fn())
      if (pull) window.dispatchEvent(new Event('ff:force-pull'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setBusy(null)
    }
  }

  if (!status) {
    return (
      <div className="card mb-4">
        <p className="section-head label">Banco conectado</p>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-2">{error ?? 'Carregando…'}</p>
      </div>
    )
  }

  const r = status.lastResult
  const needsReconnect = status.itemStatus !== null && ERROR_STATUSES.has(status.itemStatus)

  return (
    <div className="card mb-4 min-w-0">
      <p className="section-head label">Banco conectado</p>
      <h2 className="serif text-[18px] mt-1">Open Finance (Meu Pluggy)</h2>

      {!status.configured ? (
        <p className="text-[13px] text-[var(--color-text-muted)] mt-3">
          Integração não configurada. Cadastre PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nas variáveis da Vercel e publique de novo.
        </p>
      ) : !status.connected ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[13px] text-[var(--color-text-muted)]">
            No painel da Pluggy, abra sua aplicação, vá em Demo › Connect Account, escolha MeuPluggy e autorize. Depois copie o ID do item e cole aqui.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={itemId}
              onChange={e => setItemId(e.target.value)}
              placeholder="ID da conexão"
              aria-label="ID da conexão"
              className="flex-1 min-w-[220px] min-h-[40px] px-3 rounded-[10px] bg-[var(--color-surface-2)] text-[13px] font-mono"
            />
            <button type="button" disabled={!itemId.trim() || !!busy} className={`${btn} bg-[var(--color-primary)] text-white disabled:opacity-50`}
              onClick={() => run('register', () => pluggyCall('register-item', { itemId: itemId.trim() }))}>
              {busy === 'register' ? 'Conectando…' : 'Conectar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {needsReconnect && (
            <div className="text-[12.5px] rounded-[10px] p-3" style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
              A autorização com o banco precisa ser refeita{status.itemError === 'USER_AUTHORIZATION_EXPIRED' ? ' (expirou)' : ''}. Refaça a conexão MeuPluggy no painel da Pluggy e cole o novo ID abaixo. Nada foi apagado.
              <div className="flex flex-wrap gap-2 mt-2">
                <input value={itemId} onChange={e => setItemId(e.target.value)} placeholder="Novo ID da conexão" aria-label="Novo ID da conexão"
                  className="flex-1 min-w-[200px] min-h-[40px] px-3 rounded-[10px] bg-[var(--color-surface-2)] text-[13px] font-mono" />
                <button type="button" disabled={!itemId.trim() || !!busy} className={`${btn} bg-[var(--color-primary)] text-white disabled:opacity-50`}
                  onClick={() => run('register', () => pluggyCall('register-item', { itemId: itemId.trim() }))}>Reconectar</button>
              </div>
            </div>
          )}

          {status.accounts.length === 0 ? (
            <p className="text-[13px] text-[var(--color-text-muted)]">Nenhum cartão de crédito nesta conexão.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {status.accounts.map(a => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] min-w-0">
                    {a.name}{a.last4 ? <span className="text-[var(--color-text-muted)] font-mono"> •••• {a.last4}</span> : null}
                  </span>
                  <select
                    aria-label={`Cartão do app para ${a.name}`}
                    value={a.cardId ?? ''}
                    disabled={!!busy}
                    onChange={e => run(`map:${a.id}`, () => pluggyCall('map-account', { accountId: a.id, cardId: e.target.value || null }))}
                    className="min-h-[40px] px-2 rounded-[10px] bg-[var(--color-surface-2)] text-[13px]"
                  >
                    <option value="">Não sincronizar</option>
                    {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          )}

          <div className="text-[12px] text-[var(--color-text-muted)]">
            {status.lastSyncAt ? <>Última sincronização: {fmtDateTime(status.lastSyncAt)}</> : 'Ainda não sincronizado.'}
            {r && r.ok && <> · {r.created} {r.created === 1 ? 'compra nova' : 'compras novas'}{r.updated + r.moved > 0 ? `, ${r.updated + r.moved} atualizada(s)` : ''}{r.removed > 0 ? `, ${r.removed} cancelada(s)` : ''}{r.skippedDuplicates > 0 ? `, ${r.skippedDuplicates} já lançada(s)` : ''}</>}
            {r && !r.ok && <span className="neg"> · {r.error ?? 'Falhou.'}</span>}
            {status.consentExpiresAt && <> · Autorização vence em {fmtDate(status.consentExpiresAt)}</>}
          </div>

          <div>
            <button type="button" disabled={!!busy || !status.accounts.some(a => a.cardId)}
              className={`${btn} border border-[var(--color-border)] disabled:opacity-50`}
              onClick={() => run('sync', () => pluggyCall('sync'), true)}>
              {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar agora'}
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="neg text-[12px] mt-2">{error}</p>}
    </div>
  )
}
```

Se `card`, `section-head`, `label`, `serif`, `neg` ou as variáveis CSS usadas não existirem, copie as classes usadas no topo de `src/components/metrics/CategoryLimitsCard.tsx`, que já são as do design system.

- [ ] **Step 7: Renderizar na aba Cartões**

Em `src/pages/Cards/index.tsx`, importe `BankConnectionCard from './BankConnectionCard'` e renderize `<BankConnectionCard />` logo abaixo do `PageHeader`, antes da lista de cartões. Leia o arquivo para achar o ponto exato e não altere mais nada.

- [ ] **Step 8: Chip "Banco"**

Em `src/components/metrics/CategoryReportBlock.tsx`, logo após a linha `if (e.item.source === 'telegram') chips.push('Telegram')`, adicione:

```ts
    if (e.item.source === 'pluggy') chips.push('Banco')
```

Em seguida rode `grep -rn "source === 'telegram'" src` e, em cada outro lugar que mostre o selo do Telegram em lançamentos, adicione o equivalente para `'pluggy'` com o texto "Banco".

- [ ] **Step 9: Suíte, tipos e lint**

Run: `npx vitest run && npx tsc -b --noEmit && npx eslint src api`
Expected: PASS, 0 erros.

- [ ] **Step 10: Commit**

```bash
git add src/lib/pluggyApi.ts src/pages/Cards/BankConnectionCard.tsx src/pages/Cards/index.tsx src/hooks/useSyncManager.ts src/components/metrics/CategoryReportBlock.tsx tests/pluggyApi.test.ts
git commit -m "feat(pluggy): bloco Banco conectado na aba Cartões

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verificação local e primeira sincronização real (coordenada pelo Opus, não pelo subagente)

**Files:** nenhum código novo, a não ser que a verificação encontre bugs.

- [ ] **Step 1: UI local.**
  - Aplique o bypass temporário de login em `src/App.tsx` (ver `TEMP-DESIGN-BYPASS`) e inicie o dev server com `preview_start financas-familia-v2`.
  - Sem `/api` local, o bloco mostra o erro de conexão.
  - Mocke `window.fetch` para `/api/pluggy` no navegador com três `PluggyStatusView` fictícios: não configurado, conectado com 2 contas, e LOGIN_ERROR.
  - Confira layout em 375 px e em desktop, os textos e o seletor de cartões.
  - Reverta o bypass: `grep -c BYPASS src/App.tsx` deve dar 0.
- [ ] **Step 2: Mostrar ao usuário e só publicar com "pode publicar".**
- [ ] **Step 3: Pós-publicação, com o usuário.**
  - O usuário cria a conexão MeuPluggy no painel da Pluggy, cola o ID no app, liga cada conta a um cartão e clica "Sincronizar agora".
  - Conferir, só leitura, a soma das compras da fatura aberta no app contra o app do banco.
  - Se bater, o cron diário fica valendo.
  - Se não bater, investigar com `systematic-debugging` antes de qualquer correção.
- [ ] **Step 4: Atualizar a nota do projeto no Segundo Cérebro.**
