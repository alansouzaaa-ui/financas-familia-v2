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
