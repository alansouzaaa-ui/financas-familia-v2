// Cliente mínimo da API Pluggy. Server-only. Nunca loga credenciais nem dados de transação.
import type { PluggyBill, PluggyTx } from './pluggyMapping'

const BASE = 'https://api.pluggy.ai'
const MAX_TX_PAGES = 50
const MAX_BILL_PAGES = 20

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
      for (let page = 1; page <= MAX_BILL_PAGES; page++) {
        const data = await get<{ results?: PluggyBill[]; totalPages?: number }>(
          `/bills?accountId=${encodeURIComponent(accountId)}&page=${page}&pageSize=500`)
        out.push(...(data.results ?? []))
        if (!data.totalPages || page >= data.totalPages) return out
      }
      throw new PluggyError('Lista de faturas da Pluggy incompleta.', 502)
    },

    async getTransactions(accountId: string, dateFrom: string, dateTo: string): Promise<PluggyTx[]> {
      const out: PluggyTx[] = []
      let path: string | null =
        `/v2/transactions?accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}&dateTo=${dateTo}`
      for (let i = 0; path && i < MAX_TX_PAGES; i++) {
        const data: { results?: PluggyTx[]; next?: string | null } = await get(path)
        out.push(...(data.results ?? []))
        path = data.next ? `/v2/transactions${data.next}` : null
      }
      // Lista parcial faria pendentes parecerem cancelados: melhor falhar a conta.
      if (path) throw new PluggyError('Lista de transações da Pluggy incompleta.', 502)
      return out
    },
  }
}

export type PluggyClient = ReturnType<typeof createPluggyClient>
