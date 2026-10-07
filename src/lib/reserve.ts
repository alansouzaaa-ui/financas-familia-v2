import type { AssetType, ReservePillar } from '../types/investment'

export const RESERVE_PILLAR_LABELS: Record<ReservePillar, string> = {
  imediato: 'Acesso imediato',
  selic: 'Tesouro Selic',
  rendafixa: 'Renda fixa líquida',
}

// normaliza para casar "Reserva de emergência", "reserva", "emergencia" etc.
export function isReservePurpose(purpose?: string): boolean {
  if (!purpose) return false
  const n = purpose.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return n.includes('reserva') || n.includes('emergenc')
}

// Detecta o pilar quando não foi escolhido à mão, a partir do tipo do ativo.
function inferPillar(assetType: AssetType): ReservePillar | null {
  switch (assetType) {
    case 'tesouro':
      return 'selic'
    case 'etf':
    case 'renda_fixa':
      return 'rendafixa'
    case 'poupanca':
    case 'outro':
      return 'imediato'
    default:
      return null // ação/FII/cripto não compõem a reserva
  }
}

interface ReservePos {
  ticker?: string
  broker?: string
  purpose?: string
  assetType: AssetType
  reservePillar?: ReservePillar
  currentValue: number
}

export interface ReserveAsset {
  ticker: string
  broker?: string
  value: number
}

// Pilar efetivo de uma posição: o escolhido à mão, senão o inferido pelo tipo.
export function pillarOf(p: { assetType: AssetType; reservePillar?: ReservePillar }): ReservePillar | null {
  return p.reservePillar ?? inferPillar(p.assetType)
}

// Soma o valor atual das posições-reserva, no total, por pilar e lista os ativos.
export function reserveBreakdown(positions: ReservePos[]): {
  total: number
  byPillar: Record<ReservePillar, number>
  assets: Record<ReservePillar, ReserveAsset[]>
} {
  const byPillar: Record<ReservePillar, number> = { imediato: 0, selic: 0, rendafixa: 0 }
  const assets: Record<ReservePillar, ReserveAsset[]> = { imediato: [], selic: [], rendafixa: [] }
  let total = 0
  for (const p of positions) {
    if (!isReservePurpose(p.purpose)) continue
    total += p.currentValue
    const pillar = pillarOf(p)
    if (pillar) {
      byPillar[pillar] += p.currentValue
      assets[pillar].push({ ticker: p.ticker ?? '—', broker: p.broker, value: p.currentValue })
    }
  }
  for (const k of Object.keys(assets) as ReservePillar[]) assets[k].sort((a, b) => b.value - a.value)
  return { total, byPillar, assets }
}
