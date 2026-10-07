import { useState, useMemo } from 'react'
import { useDebtsStore } from '@/stores/useDebtsStore'
import { fmt, fmtFull } from '@/lib/formatters'
import type { DebtItem, DebtModality, DebtStatus } from '@/types/debt'
import { MODALITY_LABELS, MODALITY_EMOJI, MODALITY_COLORS, STATUS_LABELS, DEFAULT_MONTHLY_RATE } from '@/types/debt'
import { useJourneyStore } from '@/stores/useJourneyStore'
import { useJourneyPlan } from '@/hooks/useJourneyPlan'
import { addMonthsLabel, type PayoffStrategy, type PayoffScope } from '@/lib/journey'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'

type View = 'banco' | 'modalidade'

const MODALITY_OPTIONS = (Object.keys(MODALITY_LABELS) as DebtModality[]).map(m => ({ value: m, label: MODALITY_LABELS[m] }))
const STATUS_OPTIONS: { value: DebtStatus; label: string }[] = [
  { value: 'em_dia', label: 'Em dia' },
  { value: 'vencida', label: 'Vencida' },
]

interface FormState { bank: string; modality: DebtModality; detail: string; status: DebtStatus; value: string; rate: string }
const EMPTY: FormState = { bank: '', modality: 'cartao', detail: '', status: 'em_dia', value: '', rate: '' }

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <div className="label mb-1.5">{label}</div>
      <div className="flex rounded-xl border border-[var(--color-border)] overflow-hidden">
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 px-3 py-2 text-[12px] font-medium transition-colors ${value === o.value ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const STRATEGY_OPTIONS: { value: PayoffStrategy; label: string }[] = [
  { value: 'avalanche', label: 'Avalanche — maior juros primeiro' },
  { value: 'snowball', label: 'Bola de neve — menor saldo primeiro' },
]
const SCOPE_OPTIONS: { value: PayoffScope; label: string }[] = [
  { value: 'vencidas', label: 'Só vencidas' },
  { value: 'todas', label: 'Todas em aberto' },
]

function PayoffPlanCard() {
  const { strategy, scope, budgetOverride, setStrategy, setScope, setBudgetOverride } = useJourneyStore()
  const p = useJourneyPlan()
  const { plan, altPlan, now } = p
  const diff = altPlan.feasible && plan.feasible ? altPlan.totalInterest - plan.totalInterest : 0

  return (
    <div className="card mb-5">
      <p className="section-head label">Estratégia</p>
      <h2 className="serif text-[clamp(18px,2.6vw,22px)] tracking-[-0.01em] mt-1">Plano de quitação</h2>

      <div className="grid gap-4 mt-4 sm:grid-cols-2">
        <div>
          <Segmented label="Estratégia" value={strategy} options={STRATEGY_OPTIONS} onChange={setStrategy} />
          <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5">
            {strategy === 'avalanche'
              ? 'Ataca primeiro a dívida com maior taxa: paga menos juros no total.'
              : 'Quita primeiro o menor saldo: vitórias rápidas e menos contas para controlar.'}
          </p>
        </div>
        <div>
          <Segmented label="Incluir" value={scope} options={SCOPE_OPTIONS} onChange={setScope} />
          {scope === 'todas' && (
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5">
              As parcelas das dívidas em dia já estão nas suas despesas — incluí-las aqui considera pagamento extra.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 max-w-[320px]">
        <Input
          label="Quanto posso pagar por mês (R$)"
          type="number"
          min="0"
          step="50"
          placeholder={`sobra média: ${p.surplus.avg < 0 ? '−' : ''}${fmtFull(p.surplus.avg)}`}
          value={budgetOverride ?? ''}
          onChange={e => {
            const v = e.target.value
            if (v === '') setBudgetOverride(null)
            else setBudgetOverride(Number(v.replace(',', '.')) || 0)
          }}
        />
        {budgetOverride !== null && (
          <button type="button" onClick={() => setBudgetOverride(null)} className="text-[12px] mt-1.5 font-medium" style={{ color: 'var(--color-primary)' }}>
            usar sobra média
          </button>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-[var(--hairline)]">
        {plan.lines.length === 0 ? (
          <p className="text-[13px] text-[var(--color-text-primary)]">Nenhuma dívida no plano 🎉</p>
        ) : p.budget <= 0 ? (
          <p className="text-[13px] neg">
            {p.surplus.avg < 0
              ? `Sua sobra média dos últimos meses foi negativa (−${fmtFull(p.surplus.avg)}/mês). Informe acima quanto consegue destinar por mês às dívidas para ver o plano.`
              : 'Informe acima quanto consegue destinar por mês às dívidas para ver o plano.'}
          </p>
        ) : !plan.feasible ? (
          <p className="text-[13px] neg">
            Com {fmtFull(p.budget)}/mês os juros ({fmtFull(plan.firstMonthInterest)}/mês) crescem mais rápido que o pagamento.
          </p>
        ) : (
          <>
            <div className="serif text-[clamp(20px,3.4vw,26px)] tracking-[-0.01em] text-[var(--color-text-primary)]">
              Livre das dívidas em {plan.months} {plan.months === 1 ? 'mês' : 'meses'}{' '}
              <span className="text-[14px] text-[var(--color-text-muted)]">({addMonthsLabel(now, plan.months)})</span>
            </div>
            <div className="text-[12px] text-[var(--color-text-muted)] mt-1">
              Juros no período: <span className="font-mono text-[var(--color-text-primary)]">{fmtFull(plan.totalInterest)}</span> · Total pago:{' '}
              <span className="font-mono text-[var(--color-text-primary)]">{fmtFull(plan.totalPaid)}</span>
            </div>
            {diff > 0.01 && (
              <div className="text-[12px] pos mt-1.5 font-medium">Esta estratégia economiza {fmtFull(diff)} em juros vs. a outra</div>
            )}
            {diff < -0.01 && (
              <div className="text-[12px] text-[var(--color-text-muted)] mt-1.5">A outra estratégia pagaria {fmtFull(-diff)} a menos em juros</div>
            )}
          </>
        )}
      </div>

      {plan.lines.length > 0 && (
        <div className="mt-5">
          <div className="section-head label mb-2">Ordem de pagamento</div>
          <div className="flex flex-col divide-y divide-[var(--hairline)]">
            {plan.lines.map((l, i) => (
              <div key={l.id} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                <span className="font-mono text-[12px] text-[var(--color-text-muted)] w-5 flex-shrink-0 pt-0.5">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-[var(--color-text-primary)] truncate">{l.label}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)] flex flex-wrap items-center gap-x-1.5">
                    <span className="font-mono">{fmtFull(l.balance)}</span>
                    <span>·</span>
                    <span className="font-mono">{l.monthlyRate}% a.m.</span>
                    {l.estimatedRate && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">estimado</span>
                    )}
                  </div>
                </div>
                <span className="text-[12px] text-[var(--color-text-muted)] text-right flex-shrink-0">
                  {l.payoffMonth > 0 ? `quitada em ${addMonthsLabel(now, l.payoffMonth)}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-[var(--color-text-muted)] mt-4 pt-3 border-t border-[var(--hairline)]">
        Juros estimados por modalidade quando não informados (edite a dívida para colocar a taxa real). Simulação com juros compostos mensais; valores aproximados.
      </p>
    </div>
  )
}

function StatusChip({ status }: { status: DebtStatus }) {
  const vencida = status === 'vencida'
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{
        background: `color-mix(in srgb, ${vencida ? 'var(--color-neg)' : 'var(--color-pos)'} 13%, transparent)`,
        color: vencida ? 'var(--color-neg)' : 'var(--color-pos)',
      }}
    >
      {vencida ? '⚠︎' : '✓'} {STATUS_LABELS[status]}
    </span>
  )
}

export default function DebtsPage() {
  const { items, referenceMonth, addDebt, updateDebt, removeDebt } = useDebtsStore()
  const [view, setView] = useState<View>('banco')
  const [manage, setManage] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)

  const totals = useMemo(() => {
    let emDia = 0, vencida = 0, quitado = 0
    const banks = new Set<string>()
    for (const it of items) {
      banks.add(it.bank)
      if (it.paid) { quitado += it.value; continue }   // pagas ficam fora do montante
      if (it.status === 'vencida') vencida += it.value; else emDia += it.value
    }
    return {
      emDia, vencida, quitado,
      total: emDia + vencida,
      bankCount: banks.size,
      opCount: items.filter(i => !i.paid).length,
    }
  }, [items])

  // Agrupamento por banco ou por modalidade
  const groups = useMemo(() => {
    const map = new Map<string, DebtItem[]>()
    for (const it of items) {
      const key = view === 'banco' ? it.bank : it.modality
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    return [...map.entries()]
      .map(([key, list]) => {
        const open = list.filter(i => !i.paid)
        const emDia = open.filter(i => i.status === 'em_dia').reduce((s, i) => s + i.value, 0)
        const vencida = open.filter(i => i.status === 'vencida').reduce((s, i) => s + i.value, 0)
        // pagas vão para o fim; dentro de cada grupo, maior valor primeiro
        const sorted = list.slice().sort((a, b) => (a.paid === b.paid ? b.value - a.value : a.paid ? 1 : -1))
        return { key, list: sorted, emDia, vencida, total: emDia + vencida, allPaid: open.length === 0 }
      })
      .sort((a, b) => b.total - a.total)
  }, [items, view])

  const bankNames = useMemo(() => [...new Set(items.map(i => i.bank))].sort(), [items])

  function startAdd() {
    setEditingId(null)
    setForm(EMPTY)
    setManage(true)
  }
  function startEdit(it: DebtItem) {
    setEditingId(it.id)
    setForm({ bank: it.bank, modality: it.modality, detail: it.detail, status: it.status, value: String(it.value), rate: it.monthlyRate != null ? String(it.monthlyRate) : '' })
    setManage(true)
  }
  function submit(e: React.FormEvent) {
    e.preventDefault()
    const bank = form.bank.trim()
    const value = Math.round(Number(form.value.replace(',', '.')) * 100) / 100
    if (!bank || !isFinite(value) || value <= 0) return
    const rate = Number(form.rate.replace(',', '.'))
    const monthlyRate = form.rate.trim() !== '' && Number.isFinite(rate) && rate > 0 ? rate : undefined
    const data = { bank, modality: form.modality, detail: form.detail.trim() || MODALITY_LABELS[form.modality], status: form.status, value, monthlyRate }
    if (editingId) updateDebt(editingId, data)
    else addDebt(data)
    setForm(EMPTY)
    setEditingId(null)
  }

  const groupLabel = (key: string) => view === 'modalidade' ? MODALITY_LABELS[key as DebtModality] : key
  const groupEmoji = (key: string) => view === 'modalidade' ? MODALITY_EMOJI[key as DebtModality] : '🏛️'
  const groupColor = (key: string) => view === 'modalidade' ? MODALITY_COLORS[key as DebtModality] : 'var(--color-primary)'

  return (
    <div>
      <PageHeader
        eyebrow="SCR · Banco Central"
        title="Dívidas"
        subtitle={`Tudo que você deve, por banco e modalidade. Referência ${referenceMonth}.`}
      >
        <div className="flex items-center gap-1 bg-[var(--color-surface-2)] rounded-full p-0.5">
          <button onClick={() => setView('banco')} className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${view === 'banco' ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)]'}`}>Por banco</button>
          <button onClick={() => setView('modalidade')} className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${view === 'modalidade' ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)]'}`}>Por modalidade</button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => (manage ? setManage(false) : startAdd())}>
          {manage ? 'Concluir' : '+ Dívida'}
        </Button>
      </PageHeader>

      {/* Resumo */}
      <div
        className="grid grid-cols-2 lg:grid-cols-4 gap-px mb-5 overflow-hidden border border-[var(--color-border)]"
        style={{ borderRadius: 'var(--r-card)', background: 'var(--color-border)', boxShadow: 'var(--shadow-card)' }}
      >
        <div className="bg-[var(--color-surface)] p-4">
          <div className="label">Dívida em aberto</div>
          <div className="font-mono font-semibold text-[22px] leading-none tracking-[-0.01em] mt-2.5 neg">{fmt(totals.total)}</div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1.5">{totals.bankCount} bancos · {totals.opCount} em aberto</div>
        </div>
        <div className="bg-[var(--color-surface)] p-4">
          <div className="label">Em dia</div>
          <div className="font-mono font-semibold text-[22px] leading-none tracking-[-0.01em] mt-2.5 pos">{fmt(totals.emDia)}</div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1.5">contratos em dia</div>
        </div>
        <div className="bg-[var(--color-surface)] p-4">
          <div className="label">Vencida</div>
          <div className="font-mono font-semibold text-[22px] leading-none tracking-[-0.01em] mt-2.5 neg">{fmt(totals.vencida)}</div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1.5">{totals.total > 0 ? `${Math.round((totals.vencida / totals.total) * 100)}% do aberto` : '—'}</div>
        </div>
        <div className="bg-[var(--color-surface)] p-4">
          <div className="label" style={{ color: 'var(--color-pos)' }}>Quitado</div>
          <div className="font-mono font-semibold text-[22px] leading-none tracking-[-0.01em] mt-2.5 pos">{fmt(totals.quitado)}</div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1.5">
            {totals.quitado + totals.total > 0 ? `${Math.round((totals.quitado / (totals.quitado + totals.total)) * 100)}% da dívida` : 'nada quitado ainda'}
          </div>
        </div>
      </div>
      {totals.vencida > 0 && (
        <p className="text-[12px] text-[var(--color-text-muted)] -mt-2 mb-5 flex items-center gap-1.5">
          <span className="neg">⚠︎</span> Priorize quitar as <span className="neg font-medium">vencidas</span> — juros e negativação correm sobre elas.
        </p>
      )}

      <PayoffPlanCard />

      {/* Form de gestão */}
      {manage && (
        <Card title={editingId ? 'Editar dívida' : 'Adicionar dívida'} className="mb-5">
          <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
            <div className="col-span-2 sm:col-span-1">
              <Input label="Banco" list="ff-debt-banks" placeholder="Banco…" value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} required />
              <datalist id="ff-debt-banks">{bankNames.map(b => <option key={b} value={b} />)}</datalist>
            </div>
            <Select label="Modalidade" options={MODALITY_OPTIONS} value={form.modality} onChange={e => setForm(f => ({ ...f, modality: e.target.value as DebtModality }))} />
            <Select label="Situação" options={STATUS_OPTIONS} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as DebtStatus }))} />
            <Input label="Detalhe (opcional)" placeholder="Cartão de crédito…" value={form.detail} onChange={e => setForm(f => ({ ...f, detail: e.target.value }))} />
            <Input label="Valor (R$)" type="number" min="0" step="0.01" placeholder="0,00" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} required />
            <Input label="Juros % a.m. (opcional)" type="number" min="0" step="0.1" placeholder={`estimado ${DEFAULT_MONTHLY_RATE[form.modality]}%`} value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} />
            <div className="flex gap-2">
              <Button type="submit" size="sm">{editingId ? 'Salvar' : 'Adicionar'}</Button>
              {editingId && <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingId(null); setForm(EMPTY) }}>Cancelar</Button>}
            </div>
          </form>
        </Card>
      )}

      {items.length === 0 ? (
        <Card>
          <EmptyState message="Nenhuma dívida cadastrada" hint="Adicione manualmente ou importe do seu relatório SCR." onAction={{ label: '+ Adicionar dívida', onClick: startAdd }} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map(g => (
            <div key={g.key} className="card">
              {/* Cabeçalho do grupo */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[15px] flex-shrink-0" style={{ background: `color-mix(in srgb, ${groupColor(g.key)} 14%, transparent)` }}>{groupEmoji(g.key)}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px] text-[var(--color-text-primary)] truncate">{groupLabel(g.key)}</div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">{g.list.length} {g.list.length === 1 ? 'operação' : 'operações'}</div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {g.allPaid ? (
                    <div className="font-semibold text-[14px] pos">✓ Quitado</div>
                  ) : (
                    <>
                      <div className="font-mono font-semibold text-[15px] neg">{fmt(g.total)}</div>
                      <div className="flex items-center gap-1.5 justify-end mt-0.5 text-[10px]">
                        {g.emDia > 0 && <span className="pos">✓ {fmt(g.emDia)}</span>}
                        {g.vencida > 0 && <span className="neg">⚠︎ {fmt(g.vencida)}</span>}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Linhas */}
              <div className="flex flex-col divide-y divide-[var(--hairline)]">
                {g.list.map(it => (
                  <div key={it.id} className={`flex items-center gap-2 py-2 first:pt-0 last:pb-0 ${it.paid ? 'opacity-60' : ''}`}>
                    <button
                      onClick={() => updateDebt(it.id, { paid: !it.paid })}
                      title={it.paid ? 'Marcar como não paga' : 'Marcar como paga (sai do montante)'}
                      className={`w-[20px] h-[20px] rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${it.paid ? 'border-transparent' : 'border-[var(--color-border)] hover:border-[var(--color-pos)]'}`}
                      style={it.paid ? { background: 'var(--color-pos)' } : {}}
                      aria-label={it.paid ? 'Marcar como não paga' : 'Marcar como paga'}
                    >
                      {it.paid && <svg width="11" height="11" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </button>
                    <span className="flex-shrink-0 text-[13px]" title={MODALITY_LABELS[it.modality]}>{view === 'banco' ? MODALITY_EMOJI[it.modality] : ''}</span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[13px] text-[var(--color-text-primary)] truncate ${it.paid ? 'line-through' : ''}`}>{view === 'banco' ? it.detail : it.bank}</div>
                      {view === 'modalidade' && <div className="text-[11px] text-[var(--color-text-muted)] truncate">{it.detail}</div>}
                    </div>
                    {it.paid ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: 'color-mix(in srgb, var(--color-pos) 13%, transparent)', color: 'var(--color-pos)' }}>✓ Paga</span>
                    ) : (
                      <StatusChip status={it.status} />
                    )}
                    <span className={`font-mono text-[13px] font-medium flex-shrink-0 w-[92px] text-right ${it.paid ? 'text-[var(--color-text-muted)] line-through' : 'neg'}`}>{fmt(it.value)}</span>
                    {manage && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button onClick={() => startEdit(it)} title="Editar" className="w-7 h-7 flex items-center justify-center rounded-[7px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]">
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5l2 2L5 11l-2.5.5L3 9l6.5-6.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                        </button>
                        <button onClick={() => removeDebt(it.id)} title="Excluir" className="w-7 h-7 flex items-center justify-center rounded-[7px] text-[var(--color-text-muted)] hover:text-[var(--color-neg)] hover:bg-[var(--color-surface-2)]">
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 4h8M5.5 4V3h3v1M4 4l.5 7h5L10 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-[var(--color-text-muted)] mt-5 pt-3 border-t border-[var(--hairline)] max-w-[70ch]">
        Dados do relatório SCR (Registrato / Banco Central), referência {referenceMonth}. O SCR não é atualizado em tempo real — ao quitar ou renegociar, o valor muda no relatório do mês seguinte. Edite aqui conforme atualizar.
      </p>
    </div>
  )
}
