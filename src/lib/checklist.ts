// Checklist de qualidade por ativo (ações e FIIs).
// Perguntas fundamentalistas sugeridas e editáveis; NÃO são o checklist oficial
// da AUVP (que não é público). Funções puras.

export type ChecklistKind = 'acao' | 'fii'
export interface ChecklistQuestion { id: string; text: string }
// questionId → sim(true)/não(false); ausente = não respondida
export type Answers = Record<string, boolean>

export const DEFAULT_QUESTIONS: Record<ChecklistKind, ChecklistQuestion[]> = {
  acao: [
    { id: 'a1', text: 'Está há mais de 5 anos na bolsa?' },
    { id: 'a2', text: 'Teve lucro em todos os últimos 5 anos?' },
    { id: 'a3', text: 'ROE acima de 10%?' },
    { id: 'a4', text: 'Dívida líquida menor que 2× o EBITDA?' },
    { id: 'a5', text: 'Receita e lucro cresceram nos últimos 5 anos?' },
    { id: 'a6', text: 'Paga dividendos com regularidade?' },
    { id: 'a7', text: 'Atua em setor perene (energia, saneamento, bancos, seguros…)?' },
    { id: 'a8', text: 'Boa governança (Novo Mercado / tag along 100%)?' },
    { id: 'a9', text: 'Não depende de decisões do governo (não é estatal)?' },
    { id: 'a10', text: 'Você entende como a empresa ganha dinheiro?' },
  ],
  fii: [
    { id: 'f1', text: 'Existe há mais de 5 anos?' },
    { id: 'f2', text: 'Patrimônio líquido acima de R$ 1 bilhão?' },
    { id: 'f3', text: 'Liquidez diária acima de R$ 1 milhão?' },
    { id: 'f4', text: 'P/VP entre 0,9 e 1,05?' },
    { id: 'f5', text: 'Vacância abaixo de 10% (tijolo) / carteira high grade (papel)?' },
    { id: 'f6', text: 'Portfólio diversificado (vários imóveis ou ativos)?' },
    { id: 'f7', text: 'Nenhum inquilino/devedor acima de 20% da receita?' },
    { id: 'f8', text: 'Dividendos estáveis nos últimos 12 meses?' },
    { id: 'f9', text: 'Gestora reconhecida e transparente?' },
    { id: 'f10', text: 'Imóveis/ativos de boa qualidade e localização?' },
  ],
}

export type Tier = 'robusto' | 'bom' | 'arriscado' | 'sem-nota'

export const TIER_LABELS: Record<Tier, string> = {
  robusto: 'Robusto',
  bom: 'Bom',
  arriscado: 'Arriscado',
  'sem-nota': 'Sem nota',
}

export function scoreOf(
  questions: ChecklistQuestion[],
  answers: Answers | undefined
): { score: number; answered: number; total: number } {
  let score = 0
  let answered = 0
  if (answers) {
    for (const q of questions) {
      const v = answers[q.id]
      if (v === true) { score += 1; answered++ }
      else if (v === false) { score -= 1; answered++ }
    }
  }
  return { score, answered, total: questions.length }
}

// A nota só "vale" (pirâmide e aporte) com pelo menos metade das perguntas
// respondidas — 1/10 respondida com +1 não é um ativo "arriscado", é não avaliado.
export function isRated(answered: number, total: number): boolean {
  return total > 0 && answered >= Math.ceil(total / 2)
}

export function tierOf(score: number, answered: number, total?: number): Tier {
  if (answered === 0) return 'sem-nota'
  if (total !== undefined && !isRated(answered, total)) return 'sem-nota'
  if (score >= 6) return 'robusto'
  if (score >= 2) return 'bom'
  return 'arriscado'
}

export function checklistKindOf(assetType: string): ChecklistKind | null {
  if (assetType === 'acao') return 'acao'
  if (assetType === 'fii') return 'fii'
  return null
}
