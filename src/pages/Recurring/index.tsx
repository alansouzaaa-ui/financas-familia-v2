import { useState } from 'react'
import { useRecurringStore } from '@/stores/useRecurringStore'
import { fmt } from '@/lib/formatters'
import { CATEGORY_LABELS } from '@/types/finance'
import Money from '@/components/ui/Money'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'

const CAT_OPTIONS = [
  { value: 'revenue',    label: 'Receitas' },
  { value: 'fixedCosts', label: 'Custos Fixos' },
  { value: 'loans',      label: 'Empréstimos' },
  { value: 'cards',      label: 'Cartões' },
]

const CAT_VARIANT: Record<string, 'green' | 'blue' | 'amber' | 'red'> = {
  revenue: 'green', fixedCosts: 'blue', loans: 'amber', cards: 'red',
}

export default function RecurringPage() {
  const { items, addItem, toggleActive, deleteItem } = useRecurringStore()
  const [description, setDescription] = useState('')
  const [value, setValue] = useState('')
  const [category, setCategory] = useState('fixedCosts')

  function handleAdd() {
    if (!description.trim() || !value || isNaN(Number(value))) return
    addItem({
      description: description.trim(),
      value: Number(value),
      category: category as 'revenue' | 'fixedCosts' | 'loans' | 'cards',
      isActive: true,
    })
    setDescription('')
    setValue('')
  }

  const activeItems = items.filter(i => i.isActive)
  const totalRevenue = activeItems.filter(i => i.category === 'revenue').reduce((s, i) => s + i.value, 0)
  const totalExpenses = activeItems.filter(i => i.category !== 'revenue').reduce((s, i) => s + i.value, 0)

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-[21px] font-semibold tracking-[-0.01em]">Itens Recorrentes</h1>
        <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5 max-w-[60ch]">
          Itens que se repetem todo mês. Ao abrir um mês novo, eles são preenchidos automaticamente.
        </p>
      </header>

      {/* Add form */}
      <Card title="Novo item recorrente" className="mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              label="Descrição"
              placeholder="ex: Financiamento AP"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className="w-36">
            <Input
              label="Valor (R$)"
              type="number"
              placeholder="0,00"
              value={value}
              onChange={e => setValue(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Select
              label="Categoria"
              options={CAT_OPTIONS}
              value={category}
              onChange={e => setCategory(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdd}>Adicionar</Button>
          </div>
        </div>
      </Card>

      {/* Summary */}
      {activeItems.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="card text-center">
            <div className="label mb-2">Receitas ativas</div>
            <div className="font-semibold text-[17px] pos"><Money value={totalRevenue} /></div>
          </div>
          <div className="card text-center">
            <div className="label mb-2">Despesas ativas</div>
            <div className="font-semibold text-[17px] text-[var(--color-text-primary)]"><Money value={totalExpenses} /></div>
          </div>
          <div className="card text-center">
            <div className="label mb-2">Balanço recorrente</div>
            <div className={`font-semibold text-[17px] ${totalRevenue - totalExpenses >= 0 ? 'pos' : 'neg'}`}>
              <Money value={totalRevenue - totalExpenses} signed />
            </div>
          </div>
        </div>
      )}

      {/* Items list */}
      <Card>
        {items.length === 0 ? (
          <EmptyState message="Nenhum item recorrente" hint="Adicione itens como financiamento, salário, assinaturas..." />
        ) : (
          <div className="flex flex-col divide-y divide-[var(--color-border)]">
            {items.map(item => (
              <div key={item.id} className={`flex items-center gap-3 py-3 first:pt-0 last:pb-0 transition-opacity ${item.isActive ? 'opacity-100' : 'opacity-40'}`}>
                <button
                  onClick={() => toggleActive(item.id)}
                  className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    item.isActive ? 'bg-[var(--color-pos)] border-[var(--color-pos)]' : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[13px] truncate">{item.description}</div>
                  <Badge variant={CAT_VARIANT[item.category]} size="sm">{CATEGORY_LABELS[item.category]}</Badge>
                </div>
                <div className="font-mono font-semibold text-[13px]">{fmt(item.value)}</div>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-neg)] transition-colors p-1"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 4h10M5 4V3h4v1M6 6v5M8 6v5M3 4l.5 8h7l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
