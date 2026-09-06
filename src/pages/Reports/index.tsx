import { useState } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import PeriodSegment from '@/components/filters/PeriodSegment'
import CategoryReportBlock from '@/components/metrics/CategoryReportBlock'

export default function ReportsPage() {
  const { periodFilter, setPeriodFilter, filteredMonths } = useFinanceStore()
  const months = filteredMonths()

  const tags = useCategoriesStore(s => s.tags)
  const addTag = useCategoriesStore(s => s.addTag)
  const updateTag = useCategoriesStore(s => s.updateTag)
  const deleteTag = useCategoriesStore(s => s.deleteTag)

  const [manage, setManage] = useState(false)

  return (
    <div>
      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[21px] font-semibold tracking-[-0.01em]">Relatórios</h1>
          <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">Para onde vai o dinheiro, por categoria de gasto.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <PeriodSegment filter={periodFilter} onChange={setPeriodFilter} />
          <Button variant="ghost" size="sm" onClick={() => setManage(m => !m)}>
            {manage ? 'Concluir' : '⚙ Categorias'}
          </Button>
        </div>
      </header>

      {/* Gerenciar categorias */}
      {manage && (
        <Card title="Gerenciar categorias" className="mb-5">
          <div className="flex flex-col gap-2.5">
            {tags.map(t => (
              <div key={t.id} className="flex items-center gap-2">
                <input
                  defaultValue={t.emoji}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.emoji) updateTag(t.id, { emoji: v.slice(0, 4) }) }}
                  className="w-11 text-[16px] text-center px-1 py-1.5 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none focus:border-[var(--color-text-primary)]"
                  title="Emoji"
                />
                <input
                  defaultValue={t.label}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.label) updateTag(t.id, { label: v.slice(0, 30) }) }}
                  className="flex-1 min-w-0 text-[13px] px-2.5 py-1.5 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none focus:border-[var(--color-text-primary)]"
                />
                <input
                  type="color"
                  defaultValue={t.color}
                  onBlur={e => { if (e.target.value !== t.color) updateTag(t.id, { color: e.target.value }) }}
                  className="w-9 h-9 rounded-[8px] bg-transparent border border-[var(--color-border)] cursor-pointer p-0.5"
                  title="Cor"
                />
                <button
                  onClick={() => { if (confirm(`Excluir a categoria "${t.label}"? Os lançamentos ficam sem categoria.`)) deleteTag(t.id) }}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-neg)] transition-colors p-1"
                  aria-label="Excluir categoria"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                </button>
              </div>
            ))}
            <div className="pt-1">
              <Button variant="ghost" size="sm" onClick={() => { const n = prompt('Nome da nova categoria (ex: Beleza):')?.trim(); if (n) addTag(n, '🏷️', '#9CA3AF') }}>
                + Nova categoria
              </Button>
              <p className="text-[11.5px] text-[var(--color-text-muted)] mt-1.5">
                Após criar, ajuste o emoji e a cor. As categorias sincronizam entre seus dispositivos.
              </p>
            </div>
          </div>
        </Card>
      )}

      <CategoryReportBlock months={months} />
    </div>
  )
}
