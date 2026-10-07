import type { AssetType } from '@/types/investment'

// ─── "Onde aportar este mês" ────────────────────────────────────────────────
// Funções puras. Nunca vende: só distribui o aporte nas classes abaixo do alvo
// e, dentro de cada classe, "enche" primeiro os ativos menores (water-fill).

export type AllocClass = 'rendafixa' | 'acoes' | 'fiis' | 'etfs' | 'cripto' | 'outros'

export const ALLOC_CLASS_LABELS: Record<AllocClass, string> = {
  rendafixa: 'Renda Fixa',
  acoes: 'Ações',
  fiis: 'FIIs',
  etfs: 'ETFs',
  cripto: 'Cripto',
  outros: 'Outros',
}

export const ALLOC_CLASS_COLORS: Record<AllocClass, string> = {
  rendafixa: '#8B5CF6',
  acoes: '#1D9E75',
  fiis: '#378ADD',
  etfs: '#EF9F27',
  cripto: '#F59E0B',
  outros: '#94A3B8',
}

export const ALLOC_CLASSES: AllocClass[] = ['rendafixa', 'acoes', 'fiis', 'etfs', 'cripto', 'outros']

export const DEFAULT_TARGETS: Record<AllocClass, number> = {
  rendafixa: 40,
  acoes: 25,
  fiis: 20,
  etfs: 10,
  cripto: 5,
  outros: 0,
}

export function classOf(t: AssetType): AllocClass {
  switch (t) {
    case 'tesouro':
    case 'renda_fixa':
    case 'poupanca':
      return 'rendafixa'
    case 'acao':
      return 'acoes'
    case 'fii':
      return 'fiis'
    case 'etf':
      return 'etfs'
    case 'cripto':
      return 'cripto'
    default:
      return 'outros'
  }
}

export interface AporteAsset {
  id: string
  ticker: string
  value: number
  price: number | null
}

export interface AssetSuggestion {
  id: string
  ticker: string
  amount: number
  shares: number | null
  price: number | null
}

export interface ClassResult {
  cls: AllocClass
  current: number
  currentPct: number
  targetPct: number
  targetValue: number
  gap: number
  amount: number
  assets: AssetSuggestion[]
}

export interface AporteResult {
  totalCurrent: number
  totalAfter: number
  classes: ClassResult[]
  allocated: number
  leftover: number
}

// Quanto somar a cada valor para nivelar os menores primeiro (Σ retorno = amount).
export function waterFill(values: number[], amount: number): number[] {
  const n = values.length
  if (n === 0) return []
  if (!(amount > 0)) return values.map(() => 0)
  const sorted = [...values].sort((a, b) => a - b)
  let level = sorted[0] + amount
  let sum = 0
  for (let k = 0; k < n; k++) {
    sum += sorted[k]
    // nível se só os k+1 menores forem preenchidos
    const L = (amount + sum) / (k + 1)
    const next = k + 1 < n ? sorted[k + 1] : Infinity
    if (L <= next) {
      level = L
      break
    }
  }
  return values.map((v) => Math.max(0, level - v))
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function computeAporte(
  assets: { id: string; ticker: string; assetType: AssetType; value: number; price: number | null }[],
  targets: Record<AllocClass, number>,
  aporte: number
): AporteResult {
  const A = aporte > 0 ? aporte : 0

  const byClass = {} as Record<AllocClass, AporteAsset[]>
  for (const c of ALLOC_CLASSES) byClass[c] = []
  for (const a of assets) {
    byClass[classOf(a.assetType)].push({ id: a.id, ticker: a.ticker, value: a.value, price: a.price })
  }

  const current = {} as Record<AllocClass, number>
  for (const c of ALLOC_CLASSES) current[c] = byClass[c].reduce((x, a) => x + a.value, 0)
  const totalCurrent = ALLOC_CLASSES.reduce((s, c) => s + current[c], 0)
  const totalAfter = totalCurrent + A

  const rawSum = ALLOC_CLASSES.reduce((s, c) => s + Math.max(0, targets[c] || 0), 0)
  const targetPct = {} as Record<AllocClass, number>
  for (const c of ALLOC_CLASSES) {
    targetPct[c] = rawSum > 0 ? (Math.max(0, targets[c] || 0) / rawSum) * 100 : 0
  }

  const gap = {} as Record<AllocClass, number>
  const targetValue = {} as Record<AllocClass, number>
  for (const c of ALLOC_CLASSES) {
    targetValue[c] = (totalAfter * targetPct[c]) / 100
    gap[c] = targetValue[c] - current[c]
  }

  // aporte entre classes: proporcional aos gaps positivos
  const amounts = {} as Record<AllocClass, number>
  for (const c of ALLOC_CLASSES) amounts[c] = 0
  const posGapSum = ALLOC_CLASSES.reduce((s, c) => s + Math.max(0, gap[c]), 0)
  if (A > 0 && posGapSum > 0) {
    for (const c of ALLOC_CLASSES) {
      amounts[c] = gap[c] > 0 ? round2((A * gap[c]) / posGapSum) : 0
    }
    const diff = round2(A - ALLOC_CLASSES.reduce((s, c) => s + amounts[c], 0))
    if (diff !== 0) {
      let best = ALLOC_CLASSES[0]
      for (const c of ALLOC_CLASSES) if (amounts[c] > amounts[best]) best = c
      amounts[best] = round2(amounts[best] + diff)
    }
  }

  const classes: ClassResult[] = ALLOC_CLASSES.map((cls) => {
    const list = byClass[cls]
    const amount = amounts[cls]
    let suggestions: AssetSuggestion[] = []
    if (amount > 0 && list.length > 0) {
      const slices = waterFill(list.map((a) => a.value), amount)
      suggestions = list
        .map((a, i) => {
          const slice = slices[i]
          let shares: number | null = null
          if (a.price != null && a.price > 0) {
            shares =
              cls === 'cripto'
                ? Math.floor((slice / a.price) * 10000 + 1e-9) / 10000
                : Math.floor(slice / a.price + 1e-9)
          }
          return { id: a.id, ticker: a.ticker, amount: round2(slice), shares, price: a.price, raw: slice }
        })
        .filter((s) => s.raw > 0)
        .sort((x, y) => y.amount - x.amount)
        .map((s) => ({ id: s.id, ticker: s.ticker, amount: s.amount, shares: s.shares, price: s.price }))
    }
    return {
      cls,
      current: current[cls],
      currentPct: totalCurrent > 0 ? (current[cls] / totalCurrent) * 100 : 0,
      targetPct: targetPct[cls],
      targetValue: targetValue[cls],
      gap: gap[cls],
      amount,
      assets: suggestions,
    }
  })

  const allocated = round2(classes.reduce((s, c) => s + c.amount, 0))
  return { totalCurrent, totalAfter, classes, allocated, leftover: round2(A - allocated) }
}

// Sanitiza metas vindas de fonte externa (sync): valores inválidos caem no padrão.
export function sanitizeTargets(input: unknown): Record<AllocClass, number> {
  const out = { ...DEFAULT_TARGETS }
  if (!input || typeof input !== 'object') return out
  const obj = input as Record<string, unknown>
  for (const cls of ALLOC_CLASSES) {
    const v = obj[cls]
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[cls] = Math.max(0, Math.min(Math.round(v), 100))
    }
  }
  return out
}
