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
  matchedItemId?: string         // item manual com o qual foi casada como duplicata (casa uma vez só)
  cancelled?: boolean            // pendente cancelado: se o id reaparecer, é processado como novo
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
  startDate?: string | null      // yyyy-mm-dd: compras anteriores não entram (ausente em Gists antigos = null)
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
  startDate: string | null
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
    startDate: state?.startDate ?? null,
  }
}
