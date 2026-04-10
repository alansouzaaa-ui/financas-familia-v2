import { useState, useCallback } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useRecurringStore } from '@/stores/useRecurringStore'
import { fmt, fmtSigned } from '@/lib/formatters'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/types/finance'
import type { MonthAbbr, MonthItem } from '@/types/finance'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'

const MONTHS_LIST: { value: string; label: string }[] = [
  { value: 'Jan', label: 'Janeiro' }, { value: 'Fev', label: 'Fevereiro' },
  { value: 'Mar', label: 'Março' },   { value: 'Abr', label: 'Abril' },
  { value: 'Mai', label: 'Maio' },    { value: 'Jun', label: 'Junho' },
  { value: 'Jul', label: 'Julho' },   { value: 'Ago', label: 'Agosto' },
  { value: 'Set', label: 'Setembro' },{ value: 'Out', label: 'Outubro' },
  { value: 'Nov', label: 'Novembro' },{ value: 'Dez', label: 'Dezembro' },
]

const YEAR_OPTIONS = [2023, 2024, 2025, 2026, 2027].map(y => ({ value: String(y), label: String(y) }))

const CATEGORIES = ['revenue', 'fixedCosts', 'variableCosts', 'loans', 'cards'] as const
type Category = typeof CATEGORIES[number]

const CATEGORY_ACCENT: Record<Category, string> = {
  revenue:       '#1D9E75',
  fixedCosts:    '#378ADD',
  variableCosts: '#8B5CF6',
  loans:         '#EF9F27',
  cards:         '#D85A30',
}

interface FormItem {
  id: string
  description: string
  value: string
  category: string
  isPaid: boolean
}

function makeItem(category: string, isPaid = false): FormItem {
  return { id: crypto.randomUUID(), description: '', value: '', category, isPaid }
}

export default function LaunchPage() {
  const { allMonths, addMonth } = useFinanceStore()
  const { items: recurring } = useRecurringStore()

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState<string>('Jan')
  const [selectedYear, setSelectedYear] = useState<string>(String(now.getFullYear()))
  const [formItems, setFormItems] = useState<FormItem[]>([
    makeItem('revenue', true),
    makeItem('fixedCosts', false),
  ])
  const [saved, setSaved] = useState(false)

  function loadMonthIntoForm(month: string, year: string) {
    const existing = allMonths.find(m => m.month === month && m.year === parseInt(year))
    if (existing?.items && existing.items.length > 0) {
      setFormItems(
        existing.items.map(i => ({
          id: i.id,
          description: i.description,
          value: String(i.value),
          category: i.category,
          isPaid: i.isPaid,
        }))
      )
    } else {
      setFormItems([makeItem('revenue', true), makeItem('fixedCosts', false)])
    }
  }

  const updateItem = useCallback((id: string, field: keyof FormItem, val: string | boolean) => {
    setFormItems(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i))
  }, [])

  const removeItem = useCallback((id: string) => {
    setFormItems(prev => prev.filter(i => i.id !== id))
  }, [])

  const addItem = useCallback((category: string) => {
    setFormItems(prev => [...prev, makeItem(category, category === 'revenue')])
  }, [])

  function applyRecurring() {
    const active = recurring.filter(r => r.isActive)
    const newItems: FormItem[] = active.map(r => ({
      id: crypto.randomUUID(),
      description: r.description,
      value: String(r.value),
      category: r.category,
      isPaid: r.category === 'revenue',
    }))
    setFormItems(prev => [...prev, ...newItems])
  }

  function copyPreviousMonth() {
    const mIdx = MONTHS_LIST.findIndex(m => m.value === selectedMonth)
    const year = parseInt(selectedYear)
    const prevMonth = mIdx === 0 ? 'Dez' : MONTHS_LIST[mIdx - 1].value
    const prevYear  = mIdx === 0 ? year - 1 : year
    const prev = allMonths.find(m => m.month === prevMonth && m.year === prevYear)
    if (!prev?.items) return
    setFormItems(prev.items.map(i => ({
      id: crypto.randomUUID(),
      description: i.description,
      value: String(i.value),
      category: i.category,
      isPaid: i.category === 'revenue',
    })))
  }

  function handleSave() {
    if (saved) return

    const validItems: MonthItem[] = formItems
      .filter(i => {
        const v = parseFloat(i.value)
        return i.description.trim().length >= 1 &&
               i.description.trim().length <= 120 &&
               isFinite(v) && v > 0
      })
      .map(i => ({
        id: i.id,
        description: i.description.trim().slice(0, 120),
        value: Math.round(parseFloat(i.value) * 100) / 100,
        category: i.category as MonthItem['category'],
        isPaid: i.isPaid,
      }))

    const year = parseInt(selectedYear)
    if (!isFinite(year) || year < 2000 || year > 2100) return

    const revenue       = validItems.filter(i => i.category === 'revenue').reduce((s, i) => s + i.value, 0)
    const fixedCosts    = validItems.filter(i => i.category === 'fixedCosts').reduce((s, i) => s + i.value, 0)
    const variableCosts = validItems.filter(i => i.category === 'variableCosts').reduce((s, i) => s + i.value, 0)
    const loans         = validItems.filter(i => i.category === 'loans').reduce((s, i) => s + i.value, 0)
    const cards         = validItems.filter(i => i.category === 'cards').reduce((s, i) => s + i.value, 0)

    addMonth({
      month: selectedMonth as MonthAbbr,
      year,
      revenue, fixedCosts, variableCosts, loans, cards,
      source: 'manual',
      items: validItems,
    })

    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // Live totals per category
  const catTotals: Record<string, number> = {}
  for (const cat of CATEGORIES) catTotals[cat] = 0
  for (const i of formItems) {
    const v = parseFloat(i.value) || 0
    if (i.category in catTotals) catTotals[i.category] += v
  }
  const totalExpenses = catTotals.fixedCosts + catTotals.variableCosts + catTotals.loans + catTotals.cards
  const balance = catTotals.revenue - totalExpenses
  const consolidatedRev = formItems.filter(i => i.category === 'revenue' && i.isPaid).reduce((s, i) => s + (parseFloat(i.value) || 0), 0)
  const consolidatedExp = formItems.filter(i => i.category !== 'revenue' && i.isPaid).reduce((s, i) => s + (parseFloat(i.value) || 0), 0)
  const consolidatedBalance = consolidatedRev - consolidatedExp

  const manualMonths = allMonths.filter(m => m.source === 'manual').slice().reverse()

  return (
    <div>
      <h1 className="text-[20px] font-semibold mb-5">Lançar Mês</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Form */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Month/Year selector */}
          <Card>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <Select label="Mês" options={MONTHS_LIST} value={selectedMonth}
                  onChange={e => { setSelectedMonth(e.target.value); loadMonthIntoForm(e.target.value, selectedYear) }} />
              </div>
              <div className="w-24">
                <Select label="Ano" options={YEAR_OPTIONS} value={selectedYear}
                  onChange={e => { setSelectedYear(e.target.value); loadMonthIntoForm(selectedMonth, e.target.value) }} />
              </div>
              <div className="flex items-end gap-2">
                <Button variant="ghost" size="sm" onClick={copyPreviousMonth}>⏮ Copiar anterior</Button>
                {recurring.filter(r => r.isActive).length > 0 && (
                  <Button variant="ghost" size="sm" onClick={applyRecurring}>↻ Recorrentes</Button>
                )}
              </div>
            </div>
          </Card>

          {/* Category blocks */}
          {CATEGORIES.map(cat => {
            const items = formItems.filter(i => i.category === cat)
            const blockTotal = catTotals[cat]
            const accent = CATEGORY_ACCENT[cat]
            const isRevenue = cat === 'revenue'

            return (
              <div key={cat} className="card rounded-2xl overflow-hidden">
                {/* Block header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: accent }}
                    />
                    <span className="label">{CATEGORY_LABELS[cat]}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => addItem(cat)}>+ Adicionar</Button>
                </div>

                {/* Items */}
                <div className="px-4">
                  {items.length === 0 ? (
                    <div className="text-[12px] text-[var(--color-text-muted)] py-2 pb-3">
                      Nenhum item. Clique em + Adicionar.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 pb-3">
                      {items.map(item => (
                        <div key={item.id} className="flex items-center gap-2">
                          {/* Paid toggle */}
                          <button
                            onClick={() => updateItem(item.id, 'isPaid', !item.isPaid)}
                            className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                              item.isPaid
                                ? 'border-transparent'
                                : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                            }`}
                            style={item.isPaid ? { backgroundColor: accent } : {}}
                            title={item.isPaid ? 'Marcar como pendente' : 'Marcar como pago'}
                          >
                            {item.isPaid && (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </button>
                          {/* Description */}
                          <input
                            type="text"
                            placeholder="Descrição"
                            value={item.description}
                            onChange={e => updateItem(item.id, 'description', e.target.value)}
                            className="flex-1 min-w-0 px-2.5 py-1.5 text-[13px] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none focus:border-[var(--color-text-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
                          />
                          {/* Value */}
                          <input
                            type="number"
                            placeholder="0,00"
                            value={item.value}
                            onChange={e => updateItem(item.id, 'value', e.target.value)}
                            className="w-28 px-2.5 py-1.5 text-[13px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none focus:border-[var(--color-text-primary)] text-right text-[var(--color-text-primary)]"
                          />
                          <button
                            onClick={() => removeItem(item.id)}
                            className="text-[var(--color-text-muted)] hover:text-[var(--color-neg)] transition-colors p-1 flex-shrink-0"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Block total footer */}
                {blockTotal > 0 && (
                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <span className="text-[12px] text-[var(--color-text-muted)]">Total</span>
                    <span
                      className="text-[13px] font-mono font-semibold"
                      style={{ color: accent }}
                    >
                      {isRevenue ? '+' : '-'}{fmt(blockTotal)}
                    </span>
                  </div>
                )}
              </div>
            )
          })}

          <Button size="lg" onClick={handleSave} className="w-full justify-center">
            {saved ? '✓ Salvo!' : `Salvar ${selectedMonth}/${selectedYear}`}
          </Button>
        </div>

        {/* Summary sidebar */}
        <div className="flex flex-col gap-3">
          <Card title="Resumo ao vivo">
            <div className="flex flex-col gap-2 text-[13px]">
              {CATEGORIES.map(cat => {
                const isRev = cat === 'revenue'
                return (
                  <div key={cat} className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                      <span className="text-[var(--color-text-muted)]">{CATEGORY_LABELS[cat]}</span>
                    </div>
                    <span className={`font-mono font-medium ${isRev ? 'pos' : 'neg'}`}>
                      {fmt(catTotals[cat])}
                    </span>
                  </div>
                )
              })}
              <div className="border-t border-[var(--color-border)] pt-2 mt-1 flex flex-col gap-1">
                <div className="flex justify-between font-semibold">
                  <span>Balanço projetado</span>
                  <span className={`font-mono ${balance >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(balance)}</span>
                </div>
                <div className="flex justify-between text-[12px] text-[var(--color-text-muted)]">
                  <span>Consolidado (pagos)</span>
                  <span className={`font-mono ${consolidatedBalance >= 0 ? 'pos' : 'neg'}`}>
                    {fmtSigned(consolidatedBalance)}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Launched months list */}
          <Card title="Meses lançados">
            {manualMonths.length === 0 ? (
              <div className="text-[12px] text-[var(--color-text-muted)]">Nenhum mês lançado ainda.</div>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--color-border)]">
                {manualMonths.slice(0, 8).map(m => {
                  const isEditing = m.month === selectedMonth && m.year === parseInt(selectedYear)
                  return (
                    <div key={`${m.year}-${m.month}`} className={`py-2.5 first:pt-0 last:pb-0 ${isEditing ? 'opacity-60' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-[13px]">{m.month}/{m.year}</span>
                          {isEditing && (
                            <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded">editando</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-[12px] font-semibold ${m.balance >= 0 ? 'pos' : 'neg'}`}>
                            {fmtSigned(m.balance)}
                          </span>
                          {!isEditing && (
                            <button
                              onClick={() => {
                                setSelectedMonth(m.month)
                                setSelectedYear(String(m.year))
                                loadMonthIntoForm(m.month, String(m.year))
                              }}
                              className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] hover:border-[var(--color-text-primary)] rounded-[6px] px-2 py-0.5 transition-colors"
                            >
                              Editar
                            </button>
                          )}
                        </div>
                      </div>
                      {m.items && (
                        <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                          {m.items.filter(i => i.isPaid).length}/{m.items.length} itens pagos
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
