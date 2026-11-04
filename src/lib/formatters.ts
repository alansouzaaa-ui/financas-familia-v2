import type { AssetType } from '../types/investment'

export function fmt(value: number): string {
  return 'R$ ' + Math.abs(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

export function fmtFull(value: number): string {
  return 'R$ ' + Math.abs(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function fmtSigned(value: number): string {
  const sign = value >= 0 ? '+ ' : '- '
  return sign + fmt(value)
}

// Sem símbolo R$ — para tabelas densas onde a moeda fica implícita no cabeçalho.
export function fmtNum(value: number): string {
  return Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function fmtNumSigned(value: number): string {
  const sign = value < -0.005 ? '−' : value > 0.005 ? '+' : ''
  return sign + fmtNum(value)
}

export function fmtPct(value: number, decimals = 0): string {
  return value.toFixed(decimals) + '%'
}

export function fmtK(value: number): string {
  if (Math.abs(value) >= 1000) {
    return 'R$ ' + (value / 1000).toFixed(0) + 'k'
  }
  return fmt(value)
}

export function monthLabel(month: string, year: number): string {
  return `${month}/${String(year).slice(2)}`
}

export function toMonthKey(year: number, month: string): string {
  return `${year}-${month}`
}

export function parseMonthKey(key: string): { year: number; month: string } {
  const [year, month] = key.split('-')
  return { year: Number(year), month }
}

/** Com sinal explícito (não depende só de cor): "+R$ 1.234,56", "−R$ 10,00", "R$ 0,00". */
export function fmtSignedFull(value: number): string {
  const sign = value > 0.005 ? '+' : value < -0.005 ? '−' : ''
  return sign + fmtFull(value)
}

/** "+3,1%", "−0,5%" (vírgula decimal, sinal explícito). */
export function fmtSignedPct(value: number, decimals = 1): string {
  const sign = value > 0.0005 ? '+' : value < -0.0005 ? '−' : ''
  return sign + Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + '%'
}

/** Quantidade sem zeros à direita, até 8 casas: 84 → "84", 0.5 → "0,5". */
export function fmtQuantity(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 8 })
}

/** "2025-10-30" → "30/10/2025" (qualquer outra coisa volta como veio). */
export function fmtDateBR(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso
}

/** Rótulo da unidade (singular/plural) conforme o tipo do ativo: ações, cotas, unidades. */
export function unitLabel(type: AssetType, qty: number): string {
  const one = qty === 1
  if (type === 'acao') return one ? 'ação' : 'ações'
  if (type === 'cripto') return one ? 'unidade' : 'unidades'
  return one ? 'cota' : 'cotas'
}
