import { fetchBcbRates } from './lib/bcbRates'

export const config = { runtime: 'edge' }

// Taxas oficiais (Selic, CDI, IPCA, TR, poupança) do Banco Central. Nunca lança:
// séries indisponíveis vêm como null e o app usa os valores padrão.
export default async function handler(): Promise<Response> {
  const rates = await fetchBcbRates()
  return new Response(JSON.stringify({ ...rates, updatedAt: new Date().toISOString() }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=21600',
    },
  })
}
