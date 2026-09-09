import { describe, it, expect } from 'vitest'
import { guessTag } from '../src/lib/autoTag'

describe('guessTag', () => {
  it('classifica descrições comuns', () => {
    expect(guessTag('ifood almoço')).toBe('restaurante')
    expect(guessTag('mercado da semana')).toBe('supermercado')
    expect(guessTag('posto shell')).toBe('combustivel')
    expect(guessTag('Netflix')).toBe('assinaturas')
    expect(guessTag('farmacia droga raia')).toBe('farmacia')
    expect(guessTag('academia smartfit')).toBe('academia')
  })

  it('ignora acentuação e caixa', () => {
    expect(guessTag('FARMÁCIA')).toBe('farmacia')
    expect(guessTag('Combustível diesel')).toBe('combustivel')
  })

  it('manda Uber para a categoria Uber (não transporte)', () => {
    expect(guessTag('Uber cartão alan')).toBe('uber')
    expect(guessTag('DL UBERRIDES')).toBe('uber')
    expect(guessTag('uber para o trabalho')).toBe('uber')
    // 99 e táxi seguem em transporte
    expect(guessTag('99app centro')).toBe('transporte')
    expect(guessTag('taxi rodoviaria')).toBe('transporte')
  })

  it('separa "Mercadinho Condominio" na categoria dedicada (não cai em supermercado)', () => {
    expect(guessTag('Mercadinho Condominio')).toBe('mercado_condominio')
    expect(guessTag('mercado do condominio 45')).toBe('mercado_condominio')
    // garante que não é confundido com supermercado nem moradia (condomínio)
    expect(guessTag('mercado semana')).toBe('supermercado')
  })

  it('retorna undefined quando nada casa', () => {
    expect(guessTag('xyz coisa aleatoria')).toBeUndefined()
    expect(guessTag('')).toBeUndefined()
  })
})
