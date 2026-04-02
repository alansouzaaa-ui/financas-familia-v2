import type { MonthPoint } from '@/types/finance'

export function exportToCSV(months: MonthPoint[], filename = 'financas-familia.csv') {
  const header = ['Ano', 'Mês', 'Receitas', 'Custos Fixos', 'Empréstimos', 'Cartões', 'Total Despesas', 'Balanço']
  const rows = months.map(m => [
    m.year,
    m.month,
    m.revenue.toFixed(2),
    m.fixedCosts.toFixed(2),
    m.loans.toFixed(2),
    m.cards.toFixed(2),
    m.totalExpenses.toFixed(2),
    m.balance.toFixed(2),
  ])

  const csv = [header, ...rows].map(r => r.join(';')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
