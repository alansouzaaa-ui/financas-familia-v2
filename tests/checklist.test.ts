import { describe, it, expect } from 'vitest'
import { scoreOf, tierOf, checklistKindOf, DEFAULT_QUESTIONS } from '../src/lib/checklist'

const qs = [
  { id: 'q1', text: 'um' },
  { id: 'q2', text: 'dois' },
  { id: 'q3', text: 'tres' },
]

describe('scoreOf', () => {
  it('sim +1, não −1, ausente 0', () => {
    expect(scoreOf(qs, { q1: true, q2: false })).toEqual({ score: 0, answered: 2, total: 3 })
    expect(scoreOf(qs, { q1: true, q2: true, q3: true })).toEqual({ score: 3, answered: 3, total: 3 })
  })
  it('sem respostas', () => {
    expect(scoreOf(qs, undefined)).toEqual({ score: 0, answered: 0, total: 3 })
    expect(scoreOf(qs, {})).toEqual({ score: 0, answered: 0, total: 3 })
  })
  it('ignora ids órfãos', () => {
    expect(scoreOf(qs, { q1: true, zzz: true, yyy: false })).toEqual({ score: 1, answered: 1, total: 3 })
  })
})

describe('tierOf', () => {
  it('faixas', () => {
    expect(tierOf(6, 6)).toBe('robusto')
    expect(tierOf(10, 10)).toBe('robusto')
    expect(tierOf(5, 7)).toBe('bom')
    expect(tierOf(2, 4)).toBe('bom')
    expect(tierOf(1, 3)).toBe('arriscado')
    expect(tierOf(0, 2)).toBe('arriscado')
    expect(tierOf(-3, 5)).toBe('arriscado')
    expect(tierOf(0, 0)).toBe('sem-nota')
  })
})

describe('checklistKindOf', () => {
  it('mapeia tipos', () => {
    expect(checklistKindOf('acao')).toBe('acao')
    expect(checklistKindOf('fii')).toBe('fii')
    expect(checklistKindOf('etf')).toBeNull()
    expect(checklistKindOf('cripto')).toBeNull()
  })
})

describe('DEFAULT_QUESTIONS', () => {
  it('10 perguntas por tipo', () => {
    expect(DEFAULT_QUESTIONS.acao).toHaveLength(10)
    expect(DEFAULT_QUESTIONS.fii).toHaveLength(10)
  })
})

describe('nota só vale com metade das perguntas respondidas', () => {
  it('isRated e tierOf com total', async () => {
    const { isRated, tierOf } = await import('../src/lib/checklist')
    expect(isRated(4, 10)).toBe(false)
    expect(isRated(5, 10)).toBe(true)
    expect(isRated(3, 5)).toBe(true)   // ceil(5/2)=3
    expect(tierOf(1, 1, 10)).toBe('sem-nota')   // 1/10 com +1 não é "arriscado"
    expect(tierOf(5, 5, 10)).toBe('bom')
    expect(tierOf(-5, 5, 10)).toBe('arriscado')
    expect(tierOf(1, 1)).toBe('arriscado')      // sem total: comportamento antigo
  })
})
