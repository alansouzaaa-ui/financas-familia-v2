import { useState, useCallback } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useRecurringStore } from '@/stores/useRecurringStore'
import { fmt, fmtSigned } from '@/lib/formatters'
import { CATEGORY_LABELS } from '@/types/finance'
import type { MonthAbbr, MonthItem } from '@/types/finance'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'

const MONTHS_LIST: { value: string; label: string }[] = [
  { value: 'Jan', label: 'Janeiro' }, { value: 'Fev', label: 'Fevereiro' },
  { value: 'Mar', label: 'Março' },   { value: 'Abr', label: 'Abril' },
  { value: 'Mai', label: 'Maio' },    { value: 'Jun', label: 'Junho' },
  { value: 'Jul', label: 'Julho' },   { value: 'Ago', label: 'Agosto' },
  { value: 'Set', label: 'Setembro' },{ value: 'Out', label: 'Outubro' },
  { value: 'Nov', label: 'Novembro' },{ value: 'Dez', label: 'Dezembro' },
]

const YEAR_OPTIONS = [2023, 2024, 2025, 2026, 2027].map(y => ({ value: String(y), label: String(y) }))
const CAT_OPTIONS = [
  { value: 'revenue',    label: 'Receitas' },
  { value: 'fixedCosts', label: 'Custos Fixos' },
  { value: 'loans',      label: 'Empréstimos' },
  { value: 'cards',      label: 'Cartões' },
]

interface FormItem {
  id: string
  description: string
  value: string
  category: string
  isPaid: boolean
}

function makeItem(category = 'revenue', isPaid = false): FormItem {
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
    const existing = allMonths.find(
      m => m.month === month && m.year === parseInt(year)
    )
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
    const isPaid = category === 'revenue'
    setFormItems(prev => [...prev, makeItem(category, isPaid)])
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
    let prevMonth = selectedMonth
    let prevYear = year
    if (mIdx === 0) { prevMonth = 'Dez'; prevYear = year - 1 }
    else prevMonth = MONTHS_LIST[mIdx - 1].value

    const prev = allMonths.find(m => m.month === prevMonth && m.year === prevYear)
    if (!prev || !prev.items) return

    const copied: FormItem[] = prev.items.map(i => ({
      id: crypto.randomUUID(),
      description: i.description,
      value: String(i.value),
      category: i.category,
      isPaid: i.category === 'revenue',
    }))
    setFormItems(copied)
  }

  function handleSave() {
    if (saved) return // previne double submit

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

    const revenue    = validItems.filter(i => i.category === 'revenue').reduce((s, i) => s + i.value, 0)
    const fixedCosts = validItems.filter(i => i.category === 'fixedCosts').reduce((s, i) => s + i.value, 0)
    const loans      = validItems.filter(i => i.category === 'loans').reduce((s, i) => s + i.value, 0)
    const cards      = validItems.filter(i => i.category === 'cards').reduce((s, i) => s + i.value, 0)

    addMonth({
      month: selectedMonth as MonthAbbr,
      year,
      revenue, fixedCosts, loans, cards,
      source: 'manual',
      items: validItems,
    })

    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // Live totals
  const getTotals = () => {
    const groups = { revenue: 0, fixedCosts: 0, loans: 0, cards: 0 }
    for (const i of formItems) {
      const v = parseFloat(i.value) || 0
      if (i.category in groups) groups[i.category as keyof typeof groups] += v
    }
    const expenses = groups.fixedCosts + groups.loans + groups.cards
    const balance = groups.revenue - expenses
    const consolidatedRev = formItems.filter(i => i.category === 'revenue' && i.isPaid).reduce((s, i) => s + (parseFloat(i.value) || 0), 0)
    const consolidatedExp = formItems.filter(i => i.category !== 'revenue' && i.isPaid).reduce((s, i) => s + (parseFloat(i.value) || 0), 0)
    return { ...groups, expenses, balance, consolidatedBalance: consolidatedRev - consolidatedExp }
  }

  const totals = getTotals()
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
                <Select label="Mês" options={MONTHS_LIST} value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); loadMonthIntoForm(e.target.value, selectedYear) }} />
              </div>
              <div className="w-24">
                <Select label="Ano" options={YEAR_OPTIONS} value={selectedYear} onChange={e => { setSelectedYear(e.target.value); loadMonthIntoForm(selectedMonth, e.target.value) }} />
              </div>
              <div className="flex items-end gap-2">
                <Button variant="ghost" size="sm" onClick={copyPreviousMonth}>
                  ⏮ Copiar anterior
                </Button>
                {recurring.filter(r => r.isActive).length > 0 && (
                  <Button variant="ghost" size="sm" onClick={applyRecurring}>
                    ↻ Recorrentes
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Items by category */}
          {(['revenue', 'fixedCosts', 'loans', 'cards'] as const).map(cat => {
            const items = formItems.filter(i => i.category === cat)
            return (
              <Card key={cat}>
                <div className="flex items-center justify-between mb-3">
                  <div className="label">{CATEGORY_LABELS[cat]}</div>
                  <Button variant="ghost" size="sm" onClick={() => addItem(cat)}>+ Adicionar</Button>
                </div>
                {items.length === 0 ? (
                  <div className="text-[12px] text-[#6B6860] py-2">Nenhum item. Clique em + Adicionar.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {items.map(item => (
                      <div key={item.id} className="flex items-center gap-2">
                        {/* Paid toggle */}
                        <button
                          onClick={() => updateItem(item.id, 'isPaid', !item.isPaid)}
                          className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                            item.isPaid ? 'bg-[#0F6E56] border-[#0F6E56]' : 'border-[#E8E6E0] bg-white'
                          }`}
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
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-[13px] bg-[#F7F6F3] border border-[#E8E6E0] rounded-[8px] outline-none focus:border-[#1A1917]"
                        />
                        {/* Value */}
                        <input
                          type="number"
                          placeholder="0,00"
                          value={item.value}
                          onChange={e => updateItem(item.id, 'value', e.target.value)}
                          className="w-28 px-2.5 py-1.5 text-[13px] font-mono bg-[#F7F6F3] border border-[#E8E6E0] rounded-[8px] outline-none focus:border-[#1A1917] text-right"
                        />
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-[#6B6860] hover:text-[#993C1D] transition-colors p-1"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
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
              {[
                { label: 'Receitas',      value: totals.revenue,    cls: 'pos' },
                { label: 'Custos Fixos',  value: totals.fixedCosts, cls: 'neg' },
                { label: 'Empréstimos',   value: totals.loans,      cls: 'neg' },
                { label: 'Cartões',       value: totals.cards,      cls: 'neg' },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-[#6B6860]">{item.label}</span>
                  <span className={`font-mono font-medium ${item.cls}`}>{fmt(item.value)}</span>
                </div>
              ))}
              <div className="border-t border-[#E8E6E0] pt-2 mt-1">
                <div className="flex justify-between font-semibold">
                  <span>Balanço projetado</span>
                  <span className={`font-mono ${totals.balance >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(totals.balance)}</span>
                </div>
                <div className="flex justify-between text-[12px] text-[#6B6860] mt-1">
                  <span>Consolidado (pagos)</span>
                  <span className={`font-mono ${totals.consolidatedBalance >= 0 ? 'pos' : 'neg'}`}>
                    {fmtSigned(totals.consolidatedBalance)}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Launched months list */}
          <Card title="Meses lançados">
            {manualMonths.length === 0 ? (
              <div className="text-[12px] text-[#6B6860]">Nenhum mês lançado ainda.</div>
            ) : (
              <div className="flex flex-col divide-y divide-[#E8E6E0]">
                {manualMonths.slice(0, 8).map(m => {
                  const isEditing = m.month === selectedMonth && m.year === parseInt(selectedYear)
                  return (
                    <div key={`${m.year}-${m.month}`} className={`py-2.5 first:pt-0 last:pb-0 ${isEditing ? 'opacity-60' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-[13px]">{m.month}/{m.year}</span>
                          {isEditing && (
                            <span className="text-[10px] text-[#6B6860] bg-[#F7F6F3] px-1.5 py-0.5 rounded">editando</span>
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
                              className="text-[11px] text-[#6B6860] hover:text-[#1A1917] border border-[#E8E6E0] hover:border-[#1A1917] rounded-[6px] px-2 py-0.5 transition-colors"
                            >
                              Editar
                            </button>
                          )}
                        </div>
                      </div>
                      {m.items && (
                        <div className="text-[11px] text-[#6B6860] mt-0.5">
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
