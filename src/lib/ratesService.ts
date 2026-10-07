import { fetchBcbRates } from '../../api/lib/bcbRates'
import type { BcbRates } from '../../api/lib/bcbRates'

export interface Rates {
  selic: number
  cdi: number
  ipca12m: number
  tr: number
  poupancaMonthly: number
  source: 'bcb' | 'padrão'
  cdiEstimated?: boolean
  refDate?: string | null
}

// Valores de referência de out/2026, usados só se a API falhar.
export const DEFAULT_RATES: Rates = {
  selic: 13.75,
  cdi: 13.65,
  ipca12m: 4.22,
  tr: 0.16,
  poupancaMonthly: 0.66,
  source: 'padrão',
}

function merge(r: Partial<BcbRates> | null): Rates {
  if (!r || typeof r.selic !== 'number' || !isFinite(r.selic)) return { ...DEFAULT_RATES }
  const pick = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d)
  return {
    selic: r.selic,
    cdi: pick(r.cdi, DEFAULT_RATES.cdi),
    ipca12m: pick(r.ipca12m, DEFAULT_RATES.ipca12m),
    tr: pick(r.tr, DEFAULT_RATES.tr),
    poupancaMonthly: pick(r.poupancaMonthly, DEFAULT_RATES.poupancaMonthly),
    source: 'bcb',
    cdiEstimated: r.cdiEstimated,
    refDate: r.refDate ?? null,
  }
}

// Ordem: 1) BCB direto do navegador — o firewall do BCB bloqueia IPs de
// datacenter (a Edge Function da Vercel recebe tudo null, mesmo em gru1), mas
// libera CORS e a rede do usuário; 2) /api/rates; 3) valores de referência.
export async function fetchRates(): Promise<Rates> {
  try {
    const direct = await fetchBcbRates()
    if (typeof direct.selic === 'number') return merge(direct)
  } catch { /* tenta o proxy */ }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    try {
      const r = await fetch('/api/rates', { signal: ctrl.signal })
      if (r.ok) {
        const j = (await r.json()) as BcbRates
        if (j && typeof j.selic === 'number') return merge(j)
      }
    } finally {
      clearTimeout(timer)
    }
  } catch { /* cai nos valores de referência */ }
  return { ...DEFAULT_RATES }
}
