// Entrada numérica digitada pelo usuário: "1.234,56", "1234,56" ou "1234.56".

/**
 * Converte texto em número ≥ 0. Com vírgula, os pontos são milhar ("1.234,56");
 * sem vírgula, um único ponto é decimal ("1234.56") e vários são milhar ("1.234.567").
 * Devolve null para vazio ou texto inválido.
 */
export function parseDecimal(input: string): number | null {
  let t = input.trim().replace(/\s/g, '').replace(/^R\$/i, '')
  if (!t || !/^[0-9.,]+$/.test(t)) return null
  if (t.includes(',')) {
    if (t.split(',').length > 2) return null
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (t.split('.').length > 2) {
    t = t.replace(/\./g, '')
  }
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Número como texto de campo (vírgula decimal, sem milhar): 12.5 → "12,5". */
export function toInputString(n: number, maxDecimals = 8): string {
  if (!Number.isFinite(n)) return ''
  return String(Math.round(n * 10 ** maxDecimals) / 10 ** maxDecimals).replace('.', ',')
}

export function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}
