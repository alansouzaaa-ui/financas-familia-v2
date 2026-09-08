export interface TesouroTitle {
  name: string        // ex: "Tesouro Selic 2029"
  pu: number          // preço unitário atual (resgate) em BRL
  buyPu: number | null
  sellRate: number | null
  maturity: string | null
}

// Busca a lista de títulos do Tesouro com o PU atual (via proxy /api/tesouro).
// Nunca lança: em falha retorna lista vazia (a UI degrada para valor de custo).
export async function fetchTesouroTitles(): Promise<TesouroTitle[]> {
  try {
    const res = await fetch('/api/tesouro')
    if (!res.ok) return []
    const json = await res.json() as { titles?: TesouroTitle[] }
    return Array.isArray(json.titles) ? json.titles : []
  } catch {
    return []
  }
}
