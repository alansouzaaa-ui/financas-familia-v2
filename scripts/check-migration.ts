// Uso: npx tsx scripts/check-migration.ts <caminho-para-positions.json>
// Lê um array JSON de posições (arquivo FORA do repositório), roda migratePositions
// e confere que quantidade e custo total foram preservados. Só leitura: não grava nada.
import { readFileSync } from 'node:fs'
import { applyOperationsToPositions, migratePositions, planConsolidation, replayOperations } from '../src/lib/operations'
import type { InvestmentPosition } from '../src/types/investment'

const file = process.argv[2]
if (!file) {
  console.error('Uso: npx tsx scripts/check-migration.ts <caminho-para-positions.json>')
  process.exit(2)
}

let raw: unknown
try {
  raw = JSON.parse(readFileSync(file, 'utf8'))
} catch (e) {
  console.error(`Não foi possível ler o JSON: ${(e as Error).message}`)
  process.exit(2)
}
// Aceita um array puro ou um payload completo ({ investment_positions: [...] }).
const list = Array.isArray(raw) ? raw : (raw as { investment_positions?: unknown })?.investment_positions
if (!Array.isArray(list)) {
  console.error('O arquivo deve conter um array de posições (ou um payload com investment_positions).')
  process.exit(2)
}
const positions = list as InvestmentPosition[]

const TOL = 0.01
const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qty = (n: number) => String(Math.round(n * 1e8) / 1e8)
const cost = (p: { quantity: number; avgPrice: number }) => p.quantity * p.avgPrice

const result = migratePositions(positions, [])
const { groups } = planConsolidation(positions)
const oldById = new Map(positions.map(p => [p.id, p]))
const absorbed = new Map(groups.map(g => [g.keptId, g.rows.map(r => r.id)]))

let mismatches = 0
const fail = (msg: string) => { mismatches++; console.log(`  !! ${msg}`) }

console.log(`Posições antes: ${positions.length} | depois: ${result.positions.length} | linhas absorvidas: ${result.merged}`)
console.log(`Operações de abertura criadas: ${result.operations.length}`)
console.log('')
console.log('Por posição (antes -> depois):')
for (const np of result.positions) {
  const ids = absorbed.get(np.id) ?? [np.id]
  const olds = ids.map(id => oldById.get(id)!)
  const oq = olds.reduce((s, p) => s + p.quantity, 0)
  const oc = olds.reduce((s, p) => s + cost(p), 0)
  const nc = cost(np)
  console.log(`- ${np.ticker} [${np.id}] ${ids.length > 1 ? `(${ids.length} linhas)` : ''}`)
  console.log(`    quantidade: ${qty(oq)} -> ${qty(np.quantity)} | custo: ${brl(oc)} -> ${brl(nc)}`)
  if (ids.length === 1) {
    const o = olds[0]
    if (JSON.stringify(o) !== JSON.stringify(np)) fail('posição de linha única mudou')
  } else {
    if (Math.abs(oq - np.quantity) > TOL) fail(`quantidade total divergiu em ${qty(np.quantity - oq)}`)
    if (Math.abs(oc - nc) > TOL) fail(`custo total divergiu em R$ ${brl(nc - oc)}`)
  }
  // O replay das operações geradas precisa reproduzir o cache da posição.
  const rep = replayOperations(result.operations.filter(o => o.positionId === np.id))
  if (!rep.valid) fail('replay das operações inválido')
  else if (Math.abs(rep.quantity - np.quantity) > TOL || Math.abs(rep.avgPrice - np.avgPrice) > 1e-6 * Math.max(1, np.avgPrice)) {
    fail(`replay (${qty(rep.quantity)} @ ${rep.avgPrice}) difere do cache (${qty(np.quantity)} @ ${np.avgPrice})`)
  }
}

const sq = (ps: InvestmentPosition[]) => ps.reduce((s, p) => s + p.quantity, 0)
const sc = (ps: InvestmentPosition[]) => ps.reduce((s, p) => s + cost(p), 0)
console.log('')
console.log(`Totais antes : quantidade ${qty(sq(positions))} | custo R$ ${brl(sc(positions))}`)
console.log(`Totais depois: quantidade ${qty(sq(result.positions))} | custo R$ ${brl(sc(result.positions))}`)
if (Math.abs(sc(positions) - sc(result.positions)) > TOL) fail('custo total geral divergiu')
// A quantidade só é somável entre linhas do mesmo ativo; o total geral é informativo.

console.log('')
console.log(`Grupos de consolidação: ${groups.length}`)
for (const g of groups) {
  console.log(`- ${g.ticker}${g.broker ? ` @ ${g.broker}` : ''}${g.purpose ? ` / ${g.purpose}` : ''}: ${g.rows.length} linhas -> mantém ${g.keptId}`)
  console.log(`    quantidade ${qty(g.totalQuantity)} | custo R$ ${brl(g.totalCost)} | preço médio ${g.avgPrice}`)
  for (const r of g.rows) console.log(`      ${r.id}: ${qty(r.quantity)} @ ${r.avgPrice} (${r.buyDate || 'sem data'})`)
}

const unknown = result.operations.filter(o => o.dateUnknown)
if (unknown.length) console.log(`\nAberturas com data desconhecida (2000-01-01): ${unknown.map(o => o.id).join(', ')}`)

const again = migratePositions(result.positions, result.operations)
const idem = JSON.stringify(again.positions) === JSON.stringify(result.positions)
  && JSON.stringify(again.operations) === JSON.stringify(result.operations)
  && applyOperationsToPositions(result.positions, result.operations) === result.positions
console.log(`\nIdempotência (2ª execução não muda nada): ${idem ? 'OK' : 'FALHOU'}`)
if (!idem) mismatches++

console.log(mismatches ? `\nRESULTADO: ${mismatches} divergência(s)` : '\nRESULTADO: OK, nenhuma divergência')
process.exit(mismatches ? 1 : 0)
