import { describe, it, expect } from 'vitest'
import { parseDecimal, roundTo, toInputString } from '../src/lib/moneyInput'

describe('parseDecimal', () => {
  it('accepts pt-BR and dot-decimal forms', () => {
    expect(parseDecimal('1.234,56')).toBe(1234.56)
    expect(parseDecimal('1234,56')).toBe(1234.56)
    expect(parseDecimal('1234.56')).toBe(1234.56)
    expect(parseDecimal('0,5')).toBe(0.5)
    expect(parseDecimal('R$ 12,30')).toBe(12.3)
    expect(parseDecimal('1.234.567')).toBe(1234567)
    expect(parseDecimal(' 10 ')).toBe(10)
  })
  it('rejects empty, negative and malformed text', () => {
    for (const bad of ['', '  ', 'abc', '-5', '1,2,3', '12a']) expect(parseDecimal(bad)).toBeNull()
  })
})

describe('toInputString / roundTo', () => {
  it('formats with comma and trims float noise', () => {
    expect(toInputString(12.5)).toBe('12,5')
    expect(toInputString(0.1 + 0.2)).toBe('0,3')
    expect(toInputString(84)).toBe('84')
    expect(roundTo(1.005 * 100, 2)).toBeCloseTo(100.5, 5)
  })
})
