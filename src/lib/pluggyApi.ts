import type { PluggyStatusView } from './pluggyState'

type Action = 'status' | 'register-item' | 'map-account' | 'sync' | 'set-start-date'

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
