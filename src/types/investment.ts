export type AssetType = 'acao' | 'fii' | 'etf' | 'tesouro' | 'renda_fixa' | 'poupanca' | 'cripto' | 'outro'

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  acao: 'Ação',
  fii: 'FII',
  etf: 'ETF',
  tesouro: 'Tesouro Direto',
  renda_fixa: 'Renda Fixa',
  poupanca: 'Poupança',
  cripto: 'Cripto',
  outro: 'Outro',
}

export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  acao: '#1D9E75',
  fii: '#378ADD',
  etf: '#EF9F27',
  tesouro: '#0EA5E9',
  renda_fixa: '#8B5CF6',
  poupanca: '#CA8A04',
  cripto: '#F59E0B',
  outro: '#94A3B8',
}

export interface InvestmentPosition {
  id: string
  ticker: string
  quantity: number
  avgPrice: number     // preço médio de compra (BRL)
  buyDate: string      // YYYY-MM-DD
  assetType: AssetType
  notes?: string
  manualValue?: number // saldo atual informado à mão (ex: poupança, sem cotação)
  broker?: string      // banco / corretora onde o investimento está custodiado
}

// Principais bancos e corretoras (BR) para o seletor — o usuário pode digitar
// um fora da lista (datalist), então não é exaustivo.
export const INVESTMENT_BROKERS: string[] = [
  'XP Investimentos',
  'Rico',
  'Clear',
  'BTG Pactual',
  'NuInvest (Nubank)',
  'Inter',
  'C6 Bank',
  'Itaú',
  'Bradesco',
  'Santander',
  'Banco do Brasil',
  'Caixa',
  'Ágora',
  'Genial',
  'Órama',
  'Toro',
  'Warren',
  'Modalmais',
  'Guide',
  'Avenue',
  'Nomad',
  'PagBank',
  'Mercado Pago',
  'Safra',
  'Sicredi',
  'Sicoob',
  'Binance',
  'Mercado Bitcoin',
]

export interface BrapiQuote {
  symbol: string
  shortName: string
  longName: string
  currency: string
  regularMarketPrice: number
  regularMarketChange: number
  regularMarketChangePercent: number
  regularMarketPreviousClose: number
}

export interface EnrichedPosition extends InvestmentPosition {
  quote: BrapiQuote | null
  totalInvested: number
  currentValue: number
  pnl: number
  pnlPercent: number
}
