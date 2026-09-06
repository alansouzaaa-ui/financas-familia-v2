import { describe, it, expect } from 'vitest'
import { guessTag } from '../src/lib/autoTag'

describe('guessTag', () => {
  it('classifica descrições comuns', () => {
    expect(guessTag('ifood almoço')).toBe('restaurante')
    expect(guessTag('mercado da semana')).toBe('supermercado')
    expect(guessTag('uber para o trabalho')).toBe('transporte')
    expect(guessTag('posto shell')).toBe('combustivel')
    expect(guessTag('Netflix')).toBe('assinaturas')
    expect(guessTag('farmacia droga raia')).toBe('farmacia')
    expect(guessTag('academia smartfit')).toBe('academia')
  })

  it('ignora acentuação e caixa', () => {
    expect(guessTag('FARMÁCIA')).toBe('farmacia')
    expect(guessTag('Combustível diesel')).toBe('combustivel')
  })

  it('retorna undefined quando nada casa', () => {
    expect(guessTag('xyz coisa aleatoria')).toBeUndefined()
    expect(guessTag('')).toBeUndefined()
  })
})
