# Integração Pluggy (Open Finance) — compras de cartão automáticas

Data: 2026-11-09 · Status: aprovado em conversa, aguardando revisão do arquivo

## Objetivo

Trazer automaticamente as compras dos cartões de crédito, conectados pelo Open
Finance via **Meu Pluggy**, como lançamentos do app. Isso substitui a digitação
manual e a importação de PDF para os cartões conectados.

Fora do escopo: conta corrente, saldo bancário, investimentos e projeção de
parcelas futuras.

## Decisões tomadas com o usuário

| Tema | Decisão |
|---|---|
| Entrada | Automática: os lançamentos são criados sem passar por revisão |
| Escopo | Só cartões de crédito |
| Arquitetura | A: o servidor sincroniza 1x por dia (cron) e há um botão "Sincronizar agora" |
| Pago | Toda compra entra com `isPaid: false` e só conta nos limites depois do check |
| Início | A primeira sincronização pega só a fatura aberta de cada conta |

## Pré-requisitos (feitos pelo usuário)

1. Conectar os cartões no portal Meu Pluggy (gratuito, até 5 conexões do mesmo titular).
2. No painel da Pluggy, criar uma aplicação e copiar `PLUGGY_CLIENT_ID` e
   `PLUGGY_CLIENT_SECRET` para as variáveis de ambiente da Vercel (Production).
   O Claude nunca vê esses valores.
3. `CRON_SECRET` já existe e é usado pelo cron de `/api/summary`.

## Ajustes após conferir a API (2026-11-09)

Estes ajustes prevalecem sobre o resto do documento em caso de conflito. Fonte: docs.pluggy.ai, páginas de referência de auth, items, transactions, bills e o guia Meu Pluggy.

- **Conexão sem widget.** A conexão Meu Pluggy é criada no painel da Pluggy (Applications → app → Demo → Connect Account → MeuPluggy). Itens Meu Pluggy não podem ser atualizados manualmente: espelham o Meu Pluggy, que atualiza a cada 24 h. Por isso:
  - Não entram `react-pluggy-connect` nem a ação `connect-token`.
  - O bloco no app tem um campo "ID da conexão" (uuid copiado do painel) que chama `register-item`.
  - "Reconectar" vira instrução de refazer a conexão no painel e colar o novo ID.
  - "Sincronizar agora" só relê os dados da Pluggy; não força o banco a atualizar.
- **Auth.** `POST /auth` com `{clientId, clientSecret}` devolve `{apiKey}`, válido por 2 h. As chamadas usam o header `X-API-KEY`.
- **Item.** `GET /items/{id}` traz `status` (UPDATED, UPDATING, LOGIN_ERROR, OUTDATED, WAITING_USER_INPUT), `executionStatus`, `lastUpdatedAt`, `consentExpiresAt`, `error {code,message}` e `connector.name` ("MeuPluggy"). A autorização expirada aparece como LOGIN_ERROR com `error.code` USER_AUTHORIZATION_EXPIRED. O bloco mostra "Autorização vence em DD/MM/AAAA" quando houver `consentExpiresAt`.
- **Contas.** `GET /accounts?itemId=` devolve `{results:[...]}`. Filtrar `type === 'CREDIT'`. `number` = final do cartão. Usar `creditData.balanceCloseDate` e `creditData.balanceDueDate` (yyyy-mm-dd).
- **Transações.** `GET /v2/transactions?accountId=&dateFrom=yyyy-mm-dd&dateTo=yyyy-mm-dd` devolve `{results, next}`. A próxima página é `GET /v2/transactions` + `next`, até `next === null`. O endpoint antigo `/transactions` some em 2026-12-31 e não deve ser usado.
- **Sinal.** A documentação é contraditória sobre o sinal do `amount` em cartão. Regra: `valor = |amount|`, positivo se `type === 'DEBIT'` (compra) e negativo se `type === 'CREDIT'` (estorno, cashback ou pagamento).
- **Faturas.** `GET /bills?accountId=&page=&pageSize=` devolve `{results, totalPages}`. Cada fatura tem `id`, `dueDate` e `billClosingDate`. A transação liga-se à fatura por `creditCardMetadata.billId`, presente só em Open Finance. Parcelas vêm em `creditCardMetadata.installmentNumber` e `creditCardMetadata.totalInstallments`.
- **Categorias Pluggy (nomes exatos):**

  | Categoria Pluggy | Tag do app |
  |---|---|
  | Groceries | supermercado |
  | Eating out | alimentacao |
  | Food delivery | alimentacao |
  | Pharmacy | farmacia |
  | Taxi and ride-hailing | uber |
  | Pet supplies and vet | pets |
  | Clothing | vestuario |
  | Airport and airlines | viagem |
  | Accommodation | viagem |
  | Gyms and fitness centers | academia |
  | Gas stations | combustivel |

  `Credit card payment` é tratado como pagamento de fatura e ignorado. `category` pode vir `null`.
- **Limitação conhecida.** Se um aparelho desatualizado enviar dados logo depois de a sincronização mover ou atualizar uma compra, a versão do aparelho vence, como acontece hoje. A compra volta ao estado antigo e passa a contar como editada pelo usuário, ou seja, não é mais mexida. O app puxa os dados do servidor com frequência, então o risco é baixo.

## Arquitetura

### Servidor (Vercel, runtime Edge, como api/sync.ts)

- `api/lib/pluggyClient.ts`: cliente HTTP mínimo da API Pluggy (`https://api.pluggy.ai`).
  - `POST /auth` com clientId/secret devolve um `apiKey` válido por cerca de 2 h, cacheado na instância.
  - `POST /connect_token` (com `itemId` opcional, usado para reconectar).
  - `GET /items/{id}`: status do item.
  - `GET /accounts?itemId=`: filtra `type === 'CREDIT'`. Lê `creditData`
    (`balanceCloseDate`, `balanceDueDate`).
  - `GET /bills?accountId=`: faturas com `dueDate`.
  - Transações por conta, com paginação.
  - O fetch é injetável para testes, e o conteúdo das transações nunca vai para os logs.
  - **Primeiro passo da implementação:** conferir cada endpoint e campo
    (inclusive `creditCardMetadata.billId`, `installmentNumber`,
    `totalInstallments`, `status` PENDING/POSTED e `category`) contra a referência
    atual da Pluggy. Há relato de migração das transações para `GET /v2/transactions`
    com cursor. Ajustar este documento se algo divergir.
- `api/lib/pluggySync.ts`: lógica pura de sincronização (seção "Regras"). Recebe o
  estado atual do payload e os dados da Pluggy e devolve o payload novo e um resumo.
  Não faz I/O.
- `api/pluggy.ts`: um endpoint, com o padrão de autenticação de `import-invoice.ts`
  (mesma origem e cookie `ff_session`).
  - `POST {action:'connect-token'}`: devolve o token da janela Pluggy Connect, com o
    `itemId` atual quando for reconexão.
  - `POST {action:'register-item', itemId}`: grava o item após conectar e lista as
    contas de crédito.
  - `POST {action:'map-account', accountId, cardId|null}`: liga ou desliga uma conta
    de um cartão do app.
  - `POST {action:'sync'}`: o botão "Sincronizar agora".
  - `GET` com `Authorization: Bearer <CRON_SECRET>`: o cron diário. Sincroniza tudo.
  - Sem `PLUGGY_CLIENT_ID`/`SECRET`, devolve 503 com a mensagem "Integração não configurada".
- `vercel.json`: novo cron `0 10 * * *` (07:00 BRT) chamando `/api/pluggy`. Função Edge: sem `maxDuration`.

### Estado (no mesmo Gist do sync)

Novo campo em `SyncPayload`, **escrito só pelo servidor**:

```ts
pluggy?: {
  itemId: string
  itemStatus: string            // UPDATED | LOGIN_ERROR | OUTDATED | WAITING_USER_ACTION ...
  accounts: { id: string; name: string; last4: string | null; cardId: string | null }[]
  lastSyncAt: string | null     // ISO do último sucesso
  lastResult: { at: string; ok: boolean; created: number; updated: number; moved: number;
                removed: number; skippedDuplicates: number; error?: string } | null
  // Toda transação Pluggy já vista. Garante que nunca entra 2x e que item apagado não volta.
  seen: Record<string /* pluggyTxId */, {
    appItemId: string | null    // null = descartada (duplicata, pagamento de fatura)
    fp: string                  // impressão digital no momento da gravação: valor|descrição|AAAA-MM
    at: string
  }>
}
```

- `mergeIncoming` (`api/lib/syncMerge.ts`): o servidor mantém `current.pluggy` e
  ignora o que o cliente mandar nesse campo.
- Itens com `source: 'pluggy'` recebem a mesma proteção que os do Telegram hoje: se
  o cliente desatualizado não os conhece e não há tombstone, são preservados.
- Itens Pluggy usam `source: 'pluggy'` e `externalId: 'pluggy:<txId>'` (novo valor
  na união `source` de `MonthItem`).
- Entradas de `seen` com mais de 400 dias e sem item correspondente são podadas a cada sync.

### Cliente

- `src/pages/Cards/BankConnectionCard.tsx`: bloco "Banco conectado" na aba Cartões.
  - Sem integração configurada (503): texto curto do que configurar.
  - Sem item: botão "Conectar banco", que abre o Pluggy Connect
    (`react-pluggy-connect`, versão exata fixada) com o token de `connect-token`.
    No sucesso, chama `register-item`.
  - Com item: uma lista de contas (nome e final) com um seletor de cartão do app
    (`useCardsStore`) que chama `map-account`. Abaixo, "Última sincronização: …"
    com o resumo de `lastResult` e o botão "Sincronizar agora". Depois de sincronizar,
    o cliente faz pull do Gist.
  - Status de erro do item (LOGIN_ERROR, OUTDATED, consentimento expirado): bloco
    amarelo com o botão "Reconectar" (connect-token com `itemId`).
- O app lê `pluggy` do payload no pull, só para exibir. Não persiste o campo em store local.
- Lançamentos com `source === 'pluggy'` mostram um selo "banco", no padrão do selo
  do Telegram.

## Regras de cada transação (`pluggySync.ts`)

Valem para contas com `cardId` definido. Contas sem cartão do app são ignoradas.

1. **Mês (fatura):** o mês é o de vencimento da fatura, igual ao PDF.
   - Com `billId`: o mês de `bill.dueDate`.
   - Sem `billId`: data da compra ≤ `creditData.balanceCloseDate` vai para o mês de
     `balanceDueDate`; depois do fechamento, vai para o mês seguinte.
   - Sem `creditData`: usa o `dueDay` do cartão no app, com fechamento estimado 7
     dias antes do vencimento.
2. **Item criado:**
   - `category: 'cards'`, `isPaid: false` e o `cardId` da conta.
   - `occurredAt` = data da transação ao meio-dia. `source: 'pluggy'` e `externalId: 'pluggy:<txId>'`.
   - `description` passa por `cleanDescription` e recebe ` (NN/TT)` se houver parcela.
   - `value`: compra é positivo, crédito (estorno, cashback) é negativo.
3. **Categoria:** `guessTag(descrição)`. Se não reconhecer, usa o mapa da categoria
   Pluggy para a tag do app:
   - Groceries/Supermarkets → supermercado
   - Restaurants/Food delivery → alimentacao
   - Pharmacy → farmacia
   - Taxi/Ride-hailing → uber
   - Pets → pets
   - Clothing → vestuario
   - Travel/Airlines/Hotels → viagem
   - Gyms → academia

   O mapa fica numa tabela no código e só usa tags que existem. Se nada servir, o item fica sem tag.
4. **Ignorados** (entram em `seen` com `appItemId: null`): pagamento de fatura
   (categoria Pluggy de pagamento de cartão ou descrição de pagamento, mesmo
   critério do PDF), saldo anterior e valor zero.
5. **Duplicata de lançamento existente:** antes de criar, procura item do mesmo
   `cardId` no mesmo mês, não-Pluggy (manual, Telegram ou `import:` do PDF), com
   |valor| ≤ R$ 0,01 de diferença e `occurredAt` a até 3 dias (ou sem data). Cada
   item existente casa uma vez só. Se casar, não cria nada e grava em `seen` com
   `appItemId: null`.
6. **Já visto:** um `txId` que está em `seen` nunca é recriado, mesmo que o item tenha
   sido apagado. Se o item ainda existe, vale a regra de atualização.
7. **Atualização** (item existe, `isPaid === false` e a impressão digital atual igual a `seen.fp`):
   - Compra pendente que foi confirmada (mesmo txId): atualiza valor e descrição.
   - `billId` que apareceu com outro mês: move o item para o mês certo.
   - Um item pago ou editado pelo usuário (fp diferente) nunca é alterado.
8. **Pendente que some:** um txId pendente gravado que não volta mais na consulta
   do período é tratado de duas formas.
   - Se surge um txId novo POSTED da mesma conta, com |valor| ≤ R$ 0,01 e data a até
     3 dias: reaproveita o item, atualiza `seen` do novo txId e tira o antigo.
   - Senão, a compra é considerada cancelada: o item é removido se não estiver pago
     nem editado, e o txId antigo continua em `seen`.
9. **Janela de consulta:**
   - Primeira sync de uma conta: desde o fechamento da fatura anterior à aberta, ou
     seja, só a fatura aberta.
   - Depois disso: desde 45 dias antes da `lastSyncAt`, para pegar pendentes que
     mudaram e a atribuição de `billId`.
10. **Idempotência:** rodar a sync duas vezes seguidas sem dados novos produz 0
    criados e 0 alterados.

## Erros

| Situação | Comportamento |
|---|---|
| Env Pluggy ausente | 503, e o bloco explica o que configurar |
| Item com LOGIN_ERROR, OUTDATED ou consentimento expirado | `itemStatus` gravado, nada é apagado, bloco amarelo com "Reconectar" |
| Pluggy fora do ar, timeout ou 5xx | `lastResult.ok=false` com mensagem, `lastSyncAt` mantido, o cron tenta no dia seguinte |
| Falha em uma conta | As outras seguem e o erro da conta vai para `lastResult.error` |
| Falha ao gravar no Gist | Nada é considerado sincronizado (`seen` só persiste junto com os itens, na mesma escrita) |
| Sync concorrente (cron e botão) | A segunda chamada em menos de 60 s da primeira devolve o resultado anterior sem reprocessar |

## Testes

- `tests/pluggySync.test.ts`, com fixtures fictícias:
  - mês por `billId` e por estimativa antes e depois do fechamento;
  - criação com os campos corretos;
  - categoria por descrição e por categoria Pluggy;
  - estorno negativo e pagamento ignorado;
  - parcela no nome;
  - duplicata contra manual, Telegram e PDF;
  - txId apagado que não volta;
  - pendente confirmado (mesmo id e id novo);
  - pendente cancelado (removido, e preservado se pago ou editado);
  - mudança de mês por `billId`;
  - idempotência;
  - poda de `seen`.
- `tests/syncMerge.test.ts`: o campo `pluggy` do servidor é preservado e itens
  `source: 'pluggy'` são protegidos como os do Telegram.
- `tests/pluggyApi.test.ts`, com fetch mockado: autenticação, 503 sem env, cron com e
  sem `CRON_SECRET`, e o mapeamento de status de erro.
- Manual local: conector de teste da Pluggy (sandbox, dados fictícios) com o app rodando localmente.
- Primeira sincronização real acompanhada pelo usuário: conferir o total da fatura
  aberta do app contra o app do banco antes de confiar no cron.

## Privacidade e segurança

- O segredo da Pluggy fica só nas variáveis de ambiente da Vercel. O navegador
  recebe apenas o connect token, que é temporário.
- Os logs nunca registram descrição, valor ou ids de transação, só contagens.
- Os dados bancários ficam no mesmo Gist que já guarda os lançamentos (mesmo nível de exposição de hoje).
