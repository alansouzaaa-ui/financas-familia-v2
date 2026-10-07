// Taxas do Banco Central (SGS, JSON público), usado por /api/rates.
// Nunca lança: cada série é independente e falha → null.
//
// Séries (verificadas com curl):
//  - 432   Selic meta (% a.a.)           → ultimos/1
//  - 13522 IPCA acumulado 12m (%)        → ultimos/1
//  - 226   TR (% ao período)             → ultimos/1
//  - 195   Rendimento poupança (% a.m.)  → ultimos/1
//  - 4389  CDI anualizado (% a.a.)       → ultimos/1 devolve "Bad request";
//          funciona com dataInicial/dataFinal (últimos ~15 dias), pegamos o último.
//  Fallback do CDI: se faltar, usa Selic - 0,10 (cdiEstimated: true).

export interface BcbRates {
  selic: number | null
  cdi: number | null
  ipca12m: number | null
  tr: number | null
  poupancaMonthly: number | null
  refDate: string | null
  cdiEstimated?: boolean
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

const BASE = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const TIMEOUT_MS = 3000 // por tentativa

export function parseBcbValue(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return isFinite(n) ? n : null
}

/** "dd/MM/yyyy" → "yyyy-MM-dd" */
function isoDate(d: unknown): string | null {
  const m = typeof d === 'string' ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d) : null
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function brDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
}

// O SGS do BCB é intermitente (algumas requisições simplesmente não respondem):
// 3 tentativas curtas por série (3s cada, no máx. ~9s) reduzem muito os nulls.
async function lastOf(url: string, fetchImpl: FetchLike): Promise<{ value: number; date: string | null } | null> {
  for (let k = 0; k < 3; k++) {
    const r = await lastOnce(url, fetchImpl)
    if (r) return r
  }
  return null
}

async function lastOnce(url: string, fetchImpl: FetchLike): Promise<{ value: number; date: string | null } | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const r = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal })
      if (!r.ok) return null
      const j: unknown = await r.json()
      if (!Array.isArray(j) || j.length === 0) return null
      const last = j[j.length - 1] as { valor?: unknown; data?: unknown }
      const value = parseBcbValue(last?.valor)
      if (value === null) return null
      return { value, date: isoDate(last?.data) }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

export async function fetchBcbRates(fetchImpl: FetchLike = (u, i) => fetch(u, i), now: Date = new Date()): Promise<BcbRates> {
  const last = (s: number) => `${BASE}.${s}/dados/ultimos/1?formato=json`
  const cdiUrl = `${BASE}.4389/dados?formato=json&dataInicial=${brDate(new Date(now.getTime() - 15 * 86400000))}&dataFinal=${brDate(now)}`

  const [selic, ipca, tr, poup, cdi] = await Promise.all([
    lastOf(last(432), fetchImpl),
    lastOf(last(13522), fetchImpl),
    lastOf(last(226), fetchImpl),
    lastOf(last(195), fetchImpl),
    lastOf(cdiUrl, fetchImpl),
  ])

  const out: BcbRates = {
    selic: selic?.value ?? null,
    cdi: cdi?.value ?? null,
    ipca12m: ipca?.value ?? null,
    tr: tr?.value ?? null,
    poupancaMonthly: poup?.value ?? null,
    refDate: cdi?.date ?? selic?.date ?? poup?.date ?? ipca?.date ?? tr?.date ?? null,
  }
  if (out.cdi === null && out.selic !== null) {
    out.cdi = Math.round((out.selic - 0.1) * 100) / 100
    out.cdiEstimated = true
  }
  return out
}
