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
