import { useMemo, useState } from 'react'
import { useRecurringStore } from '@/stores/useRecurringStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useCardsStore } from '@/stores/useCardsStore'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import { fmt } from '@/lib/formatters'
import { CATEGORY_LABELS, MONTHS, type RecurringItem } from '@/types/finance'
import { addMonths, firstYm, lastYm, parseYm, seriesIndex, ym, ymLabel } from '@/lib/recurringSeries'
import Money from '@/components/ui/Money'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/hooks/useToast'
import RepeatMonthsModal from '@/components/recurring/RepeatMonthsModal'

const CAT_VARIANT: Record<string, 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'gray'> = {
  revenue: 'green', fixedCosts: 'blue', variableCosts: 'purple', loans: 'amber', cards: 'red', renegociacoes: 'gray',
}

type Pending = { id: string; kind: 'end' | 'delete' } | null

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function RecurringPage() {
  const items = useRecurringStore(s => s.items)
  const upsertRule = useRecurringStore(s => s.upsertRule)
  const deleteRule = useRecurringStore(s => s.deleteItem)
  const allMonths = useFinanceStore(s => s.allMonths)
  const removeItem = useFinanceStore(s => s.removeItem)
  const cardAccounts = useCardsStore(s => s.accounts)
  const tags = useCategoriesStore(s => s.tags)
  const tagMap = useMemo(() => Object.fromEntries(tags.map(t => [t.id, t])), [tags])

  const index = useMemo(() => seriesIndex(allMonths), [allMonths])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const { toast, show, clear } = useToast()

  const now = new Date()
  const nowYm = ym(now.getFullYear(), MONTHS[now.getMonth()])

  const sorted = useMemo(
    () => [...items].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.description.localeCompare(b.description, 'pt-BR')),
    [items],
  )
  const editing = editingId ? items.find(i => i.id === editingId) : undefined

  function endSeries(rule: RecurringItem, removeFuture: boolean) {
    upsertRule({ ...rule, isActive: false })
    let removed = 0
    if (removeFuture) {
      for (const [k, e] of index.get(rule.id) ?? []) {
        if (k > nowYm && !e.isPaid) {
          const { year, month } = parseYm(k)
          removeItem(year, month, e.itemId)
          removed += 1
        }
      }
    }
    setPending(null)
    show(removed > 0
      ? `${rule.description}: encerrada · ${plural(removed, 'mês futuro removido', 'meses futuros removidos')}`
      : `${rule.description}: encerrada`)
  }

  function reactivate(rule: RecurringItem) {
    upsertRule({ ...rule, isActive: true })
    show(`${rule.description}: ativa de novo`)
  }

  function remove(rule: RecurringItem) {
    deleteRule(rule.id)
    setPending(null)
    show(`${rule.description}: série excluída (os lançamentos já feitos continuam)`)
  }

  // Totais por mês, só das séries ativas
  const active = items.filter(i => i.isActive)
  const totalRevenue = active.filter(i => i.category === 'revenue').reduce((s, i) => s + i.value, 0)
  const totalExpenses = active.filter(i => i.category !== 'revenue').reduce((s, i) => s + i.value, 0)

  return (
    <div>
      <PageHeader
        eyebrow="Séries"
        title="Lançamentos que se repetem"
        subtitle="Você escolhe em quais meses cada lançamento aparece. Nada é lançado sozinho."
      />

      {active.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="card text-center">
            <div className="label mb-2">Receitas / mês</div>
            <div className="font-semibold text-[15px] sm:text-[17px] pos"><Money value={totalRevenue} /></div>
          </div>
          <div className="card text-center">
            <div className="label mb-2">Despesas / mês</div>
            <div className="font-semibold text-[15px] sm:text-[17px] text-[var(--color-text-primary)]"><Money value={totalExpenses} /></div>
          </div>
          <div className="card text-center">
            <div className="label mb-2">Balanço</div>
            <div className={`font-semibold text-[15px] sm:text-[17px] ${totalRevenue - totalExpenses >= 0 ? 'pos' : 'neg'}`}>
              <Money value={totalRevenue - totalExpenses} signed />
            </div>
          </div>
        </div>
      )}

      <Card>
        {items.length === 0 ? (
          <EmptyState
            message="Nenhuma série ainda"
            hint="Para criar uma, abra o menu ⋯ de um lançamento na tela Lançar e escolha “Repetir em outros meses…”."
            action={{ label: 'Ir para Lançar', to: '/lancar' }}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--color-border)]">
            {sorted.map(rule => {
              const st = index.get(rule.id)
              const count = st?.size ?? 0
              const first = st ? firstYm(st) : undefined
              const last = st ? lastYm(st) : undefined
              const tag = rule.tag ? tagMap[rule.tag] : undefined
              const card = rule.cardId ? cardAccounts.find(a => a.id === rule.cardId) : undefined
              const futureUnpaid = [...(st ?? [])].filter(([k, e]) => k > nowYm && !e.isPaid).length
              const isPending = pending?.id === rule.id
              return (
                <li key={rule.id} className={`py-3.5 first:pt-0 last:pb-0 ${rule.isActive ? '' : 'opacity-75'}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-[14px] truncate max-w-full">{rule.description}</span>
                        {!rule.isActive && <Badge variant="gray" size="sm">Encerrada</Badge>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <Badge variant={CAT_VARIANT[rule.category] ?? 'gray'} size="sm">{CATEGORY_LABELS[rule.category]}</Badge>
                        {tag && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: tag.color + '26', color: tag.color }}>
                            {tag.emoji} {tag.label}
                          </span>
                        )}
                        {card && <span className="text-[11px] text-[var(--color-text-muted)]">{card.name}</span>}
                      </div>
                      <div className="text-[12px] text-[var(--color-text-muted)] mt-1.5">
                        {count > 0 && first && last ? (
                          <>
                            <span className="font-mono">{ymLabel(first)} → {ymLabel(last)}</span>
                            {' · '}{plural(count, 'mês', 'meses')}
                            {last <= addMonths(nowYm, 1) && rule.isActive && <span className="text-[var(--color-neg)]"> · acabando</span>}
                          </>
                        ) : (
                          'Nenhum mês lançado ainda'
                        )}
                      </div>
                    </div>
                    <div className="font-mono font-semibold text-[14px] whitespace-nowrap">{fmt(rule.value)}<span className="text-[11px] font-normal text-[var(--color-text-muted)]"> /mês</span></div>
                  </div>

                  {/* Ações */}
                  {!isPending ? (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        onClick={() => setEditingId(rule.id)}
                        className="h-8 px-3 rounded-full text-[12px] font-semibold border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-tint)] transition-colors"
                      >
                        Editar meses
                      </button>
                      {rule.isActive ? (
                        <button
                          onClick={() => setPending({ id: rule.id, kind: 'end' })}
                          className="h-8 px-3 rounded-full text-[12px] font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)] transition-colors"
                        >
                          Encerrar
                        </button>
                      ) : (
                        <button
                          onClick={() => reactivate(rule)}
                          className="h-8 px-3 rounded-full text-[12px] font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)] transition-colors"
                        >
                          Reativar
                        </button>
                      )}
                      <button
                        onClick={() => setPending({ id: rule.id, kind: 'delete' })}
                        aria-label={`Excluir série ${rule.description}`}
                        title="Excluir série"
                        className="h-8 w-8 flex items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-neg)] hover:bg-[var(--color-neg)]/10 transition-colors ml-auto"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 4h10M5 4V3h4v1M6 6v5M8 6v5M3 4l.5 8h7l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-[12px] bg-[var(--color-surface-2)] px-3 py-3" role="group" aria-label="Confirmação">
                      {pending?.kind === 'end' ? (
                        <>
                          <p className="text-[13px] text-[var(--color-text-primary)]">
                            Encerrar “{rule.description}”?{' '}
                            <span className="text-[var(--color-text-muted)]">
                              {futureUnpaid > 0
                                ? `Há ${plural(futureUnpaid, 'mês futuro ainda não pago', 'meses futuros ainda não pagos')}.`
                                : 'Não há meses futuros a remover.'}
                            </span>
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2.5">
                            {futureUnpaid > 0 && (
                              <button
                                onClick={() => endSeries(rule, true)}
                                className="h-8 px-3 rounded-full text-[12px] font-semibold bg-[var(--color-neg)] text-[var(--color-bg)] hover:opacity-90 transition-opacity"
                              >
                                Encerrar e remover meses futuros
                              </button>
                            )}
                            <button
                              onClick={() => endSeries(rule, false)}
                              className="h-8 px-3 rounded-full text-[12px] font-semibold border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)] transition-colors"
                            >
                              {futureUnpaid > 0 ? 'Só encerrar' : 'Encerrar'}
                            </button>
                            <button onClick={() => setPending(null)} className="h-8 px-3 rounded-full text-[12px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                              Cancelar
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-[13px] text-[var(--color-text-primary)]">
                            Excluir a série “{rule.description}”?{' '}
                            <span className="text-[var(--color-text-muted)]">Os lançamentos já feitos nos meses continuam.</span>
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2.5">
                            <button
                              onClick={() => remove(rule)}
                              className="h-8 px-3 rounded-full text-[12px] font-semibold bg-[var(--color-neg)] text-[var(--color-bg)] hover:opacity-90 transition-opacity"
                            >
                              Excluir série
                            </button>
                            <button onClick={() => setPending(null)} className="h-8 px-3 rounded-full text-[12px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                              Cancelar
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {editing && (
        <RepeatMonthsModal
          template={{
            description: editing.description, value: editing.value, category: editing.category,
            tag: editing.tag, cardId: editing.cardId,
          }}
          ruleId={editing.id}
          onClose={() => setEditingId(null)}
          onApplied={show}
        />
      )}

      <Toast toast={toast} onClose={clear} />
    </div>
  )
}
