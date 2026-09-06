import type { SyncPayload } from '../../src/lib/syncService'
import type { MonthAbbr } from '../../src/types/finance'

const MONTH_ABBRS: MonthAbbr[] = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// Rótulos amigáveis de tag/grupo (evita depender de EXPENSE_TAGS no Edge)
const TAG_LABELS: Record<string, string> = {
  moradia: 'Moradia', supermercado: 'Supermercado', alimentacao: 'Alimentação', restaurante: 'Restaurante',
  transporte: 'Transporte', combustivel: 'Combustível', saude: 'Saúde', farmacia: 'Farmácia', academia: 'Academia',
  lazer: 'Lazer', viagem: 'Viagem', educacao: 'Educação', vestuario: 'Vestuário', assinaturas: 'Assinaturas',
  servicos: 'Serviços', impostos: 'Impostos', pets: 'Pets', presentes: 'Presentes', salario: 'Salário',
  investimentos: 'Investimentos', outros: 'Outros',
}
const GROUP_LABELS: Record<string, string> = {
  fixedCosts: 'Custos fixos', variableCosts: 'Custos variáveis', cards: 'Cartões', loans: 'Empréstimos',
}

function brl(v: number): string {
  return 'R$ ' + Math.round(Math.abs(v)).toLocaleString('pt-BR')
}
function brlSigned(v: number): string {
  return (v < 0 ? '−' : '+') + brl(v)
}

function spTzParts(nowISO: string): { monthIdx: number; year: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric' })
  const parts = fmt.formatToParts(new Date(nowISO))
  const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value, 10)
  return { monthIdx: get('month') - 1, year: get('year'), day: get('day') }
}

/**
 * Monta o texto do resumo do mês corrente a partir do payload do Gist.
 * Texto puro (sem Markdown) para não sofrer injeção da descrição.
 */
export function buildSummary(payload: SyncPayload | null, nowISO: string): string {
  const { monthIdx, year, day } = spTzParts(nowISO)
  const monthAbbr = MONTH_ABBRS[monthIdx]
  const monthName = MONTH_NAMES[monthIdx]

  const record = payload?.manual_months?.find(m => m.month === monthAbbr && m.year === year) ?? null
  const items = record?.items ?? []

  if (!record || (record.revenue === 0 && (record.items?.length ?? 0) === 0)) {
    return `📊 Resumo de ${monthName}\n\nAinda não há lançamentos neste mês.\nMande uma despesa aqui (ex: "mercado 150") ou lance no app.`
  }

  const expenses = record.fixedCosts + record.loans + record.cards + record.variableCosts
  const balance = record.revenue - expenses
  const faltaPagar = items.filter(i => i.category !== 'revenue' && !i.isPaid).reduce((s, i) => s + i.value, 0)
  const pendentes = items.filter(i => i.category !== 'revenue' && !i.isPaid).length
  const faltaReceber = items.filter(i => i.category === 'revenue' && !i.isPaid).reduce((s, i) => s + i.value, 0)

  // Maior gasto: por tag se houver, senão por grupo contábil
  let topLabel: string | null = null
  let topValue = 0
  const byTag = new Map<string, number>()
  for (const it of items) {
    if (it.category === 'revenue') continue
    if (it.tag) byTag.set(it.tag, (byTag.get(it.tag) ?? 0) + it.value)
  }
  if (byTag.size > 0) {
    for (const [tag, v] of byTag) if (v > topValue) { topValue = v; topLabel = TAG_LABELS[tag] ?? tag }
  } else {
    const groups: [string, number][] = [
      ['fixedCosts', record.fixedCosts], ['variableCosts', record.variableCosts],
      ['cards', record.cards], ['loans', record.loans],
    ]
    for (const [g, v] of groups) if (v > topValue) { topValue = v; topLabel = GROUP_LABELS[g] }
  }

  const lines: string[] = [`📊 Resumo de ${monthName}`, '']
  lines.push(`💵 Receitas: ${brl(record.revenue)}`)
  lines.push(`💳 Despesas: ${brl(expenses)}`)
  lines.push(`📈 Resultado: ${brlSigned(balance)}`)
  if (faltaPagar > 0.005) lines.push('', `⏳ Falta pagar: ${brl(faltaPagar)} (${pendentes} em aberto)`)
  if (faltaReceber > 0.005) lines.push(`📥 Falta receber: ${brl(faltaReceber)}`)
  if (topLabel && topValue > 0.005) lines.push(`🏷️ Maior gasto: ${topLabel} — ${brl(topValue)}`)

  // Vencimento de cartão nos próximos 5 dias
  const dueSoon: string[] = []
  for (const acc of payload?.card_accounts ?? []) {
    if (!acc.dueDay) continue
    const daysUntil = acc.dueDay - day
    if (daysUntil >= 0 && daysUntil <= 5) {
      const fatura = items.filter(i => i.category === 'cards' && i.cardId === acc.id).reduce((s, i) => s + i.value, 0)
      const quando = daysUntil === 0 ? 'hoje' : daysUntil === 1 ? 'amanhã' : `em ${daysUntil} dias`
      dueSoon.push(`🔔 ${acc.name} vence ${quando} (dia ${acc.dueDay})${fatura > 0.005 ? ` — ${brl(fatura)}` : ''}`)
    }
  }
  if (dueSoon.length) lines.push('', ...dueSoon)

  return lines.join('\n')
}
