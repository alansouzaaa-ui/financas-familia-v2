import { fetchBcbRates } from './lib/bcbRates'

// gru1 (São Paulo): a API do BCB recusa/derruba requisições vindas de fora do
// Brasil — na região padrão (EUA) todas as séries voltavam null.
export const config = { runtime: 'edge', regions: ['gru1'] }

// Taxas oficiais (Selic, CDI, IPCA, TR, poupança) do Banco Central. Nunca lança:
// séries indisponíveis vêm como null e o app usa o BCB direto ou valores padrão.
export default async function handler(): Promise<Response> {
  const rates = await fetchBcbRates()
  // Só cacheia resposta útil — uma falha não pode ficar 6h presa na CDN.
  const ok = rates.selic != null
  return new Response(JSON.stringify({ ...rates, updatedAt: new Date().toISOString() }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': ok ? 'public, max-age=3600, s-maxage=21600' : 'no-store',
    },
  })
}
