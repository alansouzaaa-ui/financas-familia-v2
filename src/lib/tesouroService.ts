export interface TesouroTitle {
  name: string        // ex: "Tesouro Selic 2029"
  tipo: string        // Tipo Titulo bruto (ex: "Tesouro Selic")
  pu: number          // preço unitário atual (resgate) em BRL
  buyPu: number | null
  sellRate: number | null
  maturity: string | null   // vencimento bruto "DD/MM/YYYY"
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

export interface TesouroPuOnDate { pu: number; date: string }

// PU de um título (tipo + vencimento) na data da compra (ou pregão anterior mais
// próximo), via /api/tesouro-pu. Nunca lança: em falha retorna null.
export async function fetchTesouroPuOnDate(
  tipo: string,
  venc: string,
  dataISO: string,
): Promise<TesouroPuOnDate | null> {
  try {
    const qs = new URLSearchParams({ tipo, venc, data: dataISO }).toString()
    const res = await fetch(`/api/tesouro-pu?${qs}`)
    if (!res.ok) return null
    const j = await res.json() as { pu?: number | null; date?: string }
    if (typeof j.pu === 'number' && isFinite(j.pu) && j.pu > 0) {
      return { pu: j.pu, date: j.date ?? dataISO }
    }
    return null
  } catch {
    return null
  }
}
