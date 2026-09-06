// Auto-categorização por descrição: adivinha a tag de gasto (id de EXPENSE_TAGS)
// a partir de palavras-chave. Usado no lançamento manual e no bot do Telegram.
// Fonte única — importado tanto pelo front quanto pela Edge Function.

// Ordem importa: a primeira regra que casa vence. Regras mais específicas
// (restaurante, combustível) vêm antes das genéricas (moradia/serviços).
const RULES: { tag: string; kw: string[] }[] = [
  { tag: 'combustivel',   kw: ['posto', 'gasolina', 'etanol', 'alcool', 'diesel', 'combustivel', 'shell', 'ipiranga', 'petrobras', 'br mania'] },
  { tag: 'restaurante',   kw: ['ifood', 'restaurante', 'lanche', 'lanchonete', 'pizza', 'burger', 'hamburg', 'mcdonald', 'bk ', 'subway', 'padaria', 'cafe', 'bar ', 'boteco', 'rappi', 'churrasc', 'sushi', 'espeto'] },
  { tag: 'supermercado',  kw: ['mercado', 'supermerc', 'atacad', 'atacadao', 'carrefour', 'assai', 'big ', 'extra', 'hortifruti', 'sacolao', 'comper', 'zaffari', 'nacional', 'compras do mes'] },
  { tag: 'transporte',    kw: ['uber', '99 ', '99app', 'taxi', 'onibus', 'metro', 'brt', 'passagem', 'pedagio', 'estacionamento', 'zona azul', 'bilhete'] },
  { tag: 'farmacia',      kw: ['farmacia', 'drogaria', 'drogas', 'remedio', 'panvel', 'pacheco', 'raia', 'drogasil', 'droga raia'] },
  { tag: 'saude',         kw: ['hospital', 'clinica', 'medico', 'consulta', 'exame', 'dentista', 'laboratorio', 'fisio', 'psico', 'terapia', 'plano de saude', 'unimed'] },
  { tag: 'academia',      kw: ['academia', 'smartfit', 'smart fit', 'crossfit', 'personal', 'pilates', 'gym'] },
  { tag: 'assinaturas',   kw: ['netflix', 'spotify', 'prime', 'disney', 'hbo', 'max ', 'globoplay', 'globo play', 'youtube', 'crunchyroll', 'apple', 'icloud', 'google one', 'assinatura', 'deezer', 'paramount', 'chatgpt', 'openai'] },
  { tag: 'viagem',        kw: ['hotel', 'pousada', 'airbnb', 'viagem', 'latam', 'gol ', 'azul ', 'booking', 'decolar', 'resort', 'passagem aerea'] },
  { tag: 'educacao',      kw: ['escola', 'faculdade', 'curso', 'mensalidade', 'livro', 'udemy', 'alura', 'ingles', 'material escolar', 'apostila'] },
  { tag: 'vestuario',     kw: ['roupa', 'calcado', 'tenis', 'sapato', 'renner', 'riachuelo', 'zara', 'c&a', 'cea ', 'hering', 'shein', 'vestuario'] },
  { tag: 'pets',          kw: ['pet', 'veterinar', 'racao', 'petshop', 'pet shop', 'cachorro', 'gato'] },
  { tag: 'lazer',         kw: ['cinema', 'show', 'ingresso', 'parque', 'jogo', 'game', 'steam', 'playstation', 'xbox', 'balada', 'teatro'] },
  { tag: 'servicos',      kw: ['conserto', 'manutencao', 'encanador', 'eletricista', 'pintor', 'faxina', 'diarista', 'chaveiro', 'lavagem', 'lava rapido'] },
  { tag: 'impostos',      kw: ['imposto', 'iptu', 'ipva', 'tarifa', 'darf', ' das ', 'licenciamento', 'multa', 'cartorio'] },
  { tag: 'presentes',     kw: ['presente', 'gift', 'aniversario'] },
  { tag: 'moradia',       kw: ['aluguel', 'condominio', 'luz', 'energia', 'agua', 'gas ', 'internet', 'wifi', 'celular', 'telefone', 'vivo', 'claro', 'tim ', 'net ', 'oi fibra', 'iptu'] },
  { tag: 'salario',       kw: ['salario', 'ordenado', 'holerite', 'pagamento salario'] },
  { tag: 'investimentos', kw: ['aporte', 'tesouro', 'cdb', 'acao ', 'fii', 'investimento', 'renda fixa', 'corretora'] },
]

function normalize(text: string): string {
  return ' ' + text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + ' '
}

/** Retorna o id da tag adivinhada, ou undefined se nada casar. */
export function guessTag(description: string): string | undefined {
  if (!description) return undefined
  const n = normalize(description)
  for (const rule of RULES) {
    for (const kw of rule.kw) {
      if (n.includes(kw)) return rule.tag
    }
  }
  return undefined
}
