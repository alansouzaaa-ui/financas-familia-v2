import { useState } from 'react'
import { guessTag } from '@/lib/autoTag'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import { useCardsStore } from '@/stores/useCardsStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import type { MonthAbbr, MonthItem } from '@/types/finance'
import RepeatMonthsModal, { type RepeatTemplate } from '@/components/recurring/RepeatMonthsModal'

type Grupo = 'variableCosts' | 'fixedCosts' | 'loans' | 'renegociacoes' | 'cards' | 'revenue'

const GRUPOS: { id: Grupo; label: string; color: string }[] = [
  { id: 'variableCosts', label: 'Variável',    color: '#8B5CF6' },
  { id: 'fixedCosts',    label: 'Fixo',        color: '#378ADD' },
  { id: 'loans',         label: 'Empréstimo',  color: '#EF9F27' },
  { id: 'renegociacoes', label: 'Renegociação', color: '#0E7C86' },
  { id: 'cards',         label: 'Cartão',      color: '#D85A30' },
  { id: 'revenue',       label: 'Receita',     color: '#1D9E75' },
]

interface Props {
  month: MonthAbbr
  year: number
  monthLabel: string
  onClose: () => void
  // Adiciona um item NÃO-cartão ao formulário do mês atual (evita conflito com o auto-save)
  onAddFormItem: (item: { id?: string; description: string; value: number; category: string; isPaid: boolean; tag?: string; recurringId?: string; occurredAt?: string }) => void
  // Liga um item já adicionado (pelo id) a uma série recém-criada em "Repetir em outros meses…"
  onLinkFormItem?: (itemId: string, ruleId: string) => void
  // Mensagem curta de confirmação (toast) da página que abriu o modal
  onNotify?: (msg: string) => void
  defaultGrupo?: Grupo
  defaultCardId?: string
}

export default function NovaDespesaModal({ month, year, monthLabel, onClose, onAddFormItem, onLinkFormItem, onNotify, defaultGrupo, defaultCardId }: Props) {
  const tags = useCategoriesStore(s => s.tags)
  const cardAccounts = useCardsStore(s => s.accounts)
  const upsertItem = useFinanceStore(s => s.upsertItem)

  const [value, setValue] = useState('')
  const [description, setDescription] = useState('')
  const [grupo, setGrupo] = useState<Grupo>(defaultGrupo ?? 'variableCosts')
  const [cardId, setCardId] = useState(defaultCardId ?? '')
  const [tag, setTag] = useState('')
  const [tagTouched, setTagTouched] = useState(false)
  const [autoTagged, setAutoTagged] = useState(false)
  const [isPaid, setIsPaid] = useState(false)
  // Depois de salvar com "repetir", o modal de meses assume (o lançamento original vira a âncora)
  const [repeating, setRepeating] = useState<{ itemId: string; template: RepeatTemplate } | null>(null)
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))

  // Auto-categoriza pela descrição enquanto o usuário digita, até que ele
  // escolha uma categoria manualmente (aí paramos de sobrescrever).
  function onDescriptionChange(v: string) {
    setDescription(v)
    if (!tagTouched && !isRevenue) {
      const guess = guessTag(v)
      setTag(guess ?? '')
      setAutoTagged(!!guess)
    }
  }

  const isRevenue = grupo === 'revenue'
  const valNum = Math.round((parseFloat(value.replace(',', '.')) || 0) * 100) / 100
  const canSave = valNum > 0 && description.trim().length >= 1

  // Decisão de UX: a repetição é uma ação secundária que reaproveita o RepeatMonthsModal
  // (em vez de embutir a grade aqui), mantendo este modal simples. Salva primeiro e abre a grade.
  function save(thenRepeat = false) {
    if (!canSave) return
    const desc = description.trim().slice(0, 120)
    const occurredAt = new Date(data + 'T12:00:00').toISOString()
    // Se ficou sem categoria, tenta adivinhar pela descrição no ato de salvar
    const finalTag = (tag || (!isRevenue ? guessTag(desc) : undefined)) || undefined
    const itemId = crypto.randomUUID()

    if (grupo === 'cards') {
      // Cartão: grava direto no mês (a aba Cartões/Reports leem daí)
      const item: MonthItem = {
        id: itemId, description: desc, value: valNum, category: 'cards',
        isPaid, occurredAt, ...(cardId ? { cardId } : {}), ...(finalTag ? { tag: finalTag } : {}),
      }
      upsertItem(year, month, item)
    } else {
      // Demais grupos: entra no formulário do mês (auto-save cuida da gravação)
      onAddFormItem({ id: itemId, description: desc, value: valNum, category: grupo, isPaid, tag: finalTag, occurredAt })
    }

    if (thenRepeat) {
      setRepeating({
        itemId,
        template: { description: desc, value: valNum, category: grupo, ...(finalTag ? { tag: finalTag } : {}), ...(grupo === 'cards' && cardId ? { cardId } : {}) },
      })
      return
    }
    onClose()
  }

  function linkItem(ruleId: string) {
    if (!repeating) return
    if (grupo === 'cards') {
      const it = useFinanceStore.getState().allMonths.find(m => m.year === year && m.month === month)?.items?.find(i => i.id === repeating.itemId)
      if (it) upsertItem(year, month, { ...it, recurringId: ruleId })
    } else {
      onLinkFormItem?.(repeating.itemId, ruleId)
    }
  }

  if (repeating) {
    return (
      <RepeatMonthsModal
        template={repeating.template}
        anchor={{ year, month }}
        onClose={onClose}
        onApplied={msg => onNotify?.(msg)}
        onLinked={linkItem}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-[440px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[17px] font-semibold">Nova {isRevenue ? 'receita' : 'despesa'}</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] p-1" aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          {/* Valor */}
          <div>
            <label className="label block mb-1.5">Valor</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[20px] font-mono text-[var(--color-text-muted)]">R$</span>
              <input
                autoFocus type="text" inputMode="decimal" placeholder="0,00"
                value={value} onChange={e => setValue(e.target.value)}
                className="w-full pl-14 pr-4 py-3 text-[26px] font-mono font-semibold bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[12px] outline-none focus:border-[var(--color-text-primary)]"
                style={{ color: isRevenue ? 'var(--color-pos)' : 'var(--color-neg)' }}
              />
            </div>
          </div>

          {/* Grupo (pills) */}
          <div>
            <label className="label block mb-1.5">Tipo</label>
            <div className="flex flex-wrap gap-2">
              {GRUPOS.map(g => (
                <button key={g.id} onClick={() => setGrupo(g.id)}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${grupo === g.id ? 'text-white border-transparent' : 'text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text-primary)]'}`}
                  style={grupo === g.id ? { backgroundColor: g.color } : {}}
                >{g.label}</button>
              ))}
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="label block mb-1.5">Descrição</label>
            <input
              type="text" placeholder="Ex: Mercado, Uber, Aluguel…"
              value={description} onChange={e => onDescriptionChange(e.target.value)}
              className="w-full px-3 py-2.5 text-[14px] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[10px] outline-none focus:border-[var(--color-text-primary)]"
            />
          </div>

          {/* Data do lançamento */}
          <div>
            <label className="label block mb-1.5">Data</label>
            <input
              type="date" value={data} onChange={e => setData(e.target.value)}
              className="w-full px-3 py-2.5 text-[14px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[10px] outline-none focus:border-[var(--color-text-primary)]"
            />
          </div>

          {/* Cartão (só se grupo cartão) */}
          {grupo === 'cards' && (
            <div>
              <label className="label block mb-1.5">Cartão</label>
              <select value={cardId} onChange={e => setCardId(e.target.value)}
                className="w-full px-3 py-2.5 text-[14px] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[10px] outline-none focus:border-[var(--color-text-primary)]">
                <option value="">Sem cartão específico</option>
                {cardAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          {/* Categoria */}
          <div>
            <label className="label mb-1.5 flex items-center gap-1.5">
              Categoria
              {autoTagged && tag && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--color-chart-blue)] bg-[var(--color-chart-blue)]/[0.12] px-1.5 py-0.5 rounded-full normal-case tracking-normal">
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M5 1l1 2.5L8.5 4 6.5 6 7 9 5 7.5 3 9l.5-3L1.5 4 4 3.5 5 1z" fill="currentColor"/></svg>
                  automática
                </span>
              )}
            </label>
            <select
              value={tag}
              onChange={e => { setTag(e.target.value); setTagTouched(true); setAutoTagged(false) }}
              className="w-full px-3 py-2.5 text-[14px] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[10px] outline-none focus:border-[var(--color-text-primary)]">
              <option value="">Sem categoria</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
            </select>
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-2.5">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-2 text-[14px]">
                {isRevenue ? 'Já recebida' : 'Já paga'}
                {isPaid && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-pos)] bg-[var(--color-pos)]/[0.13] px-2 py-0.5 rounded-full">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {isRevenue ? 'Recebido' : 'Pago'}
                  </span>
                )}
              </span>
              <button type="button" onClick={() => setIsPaid(p => !p)}
                className={`w-11 h-6 rounded-full transition-colors relative ${isPaid ? 'bg-[var(--color-pos)]' : 'bg-[var(--color-surface-3)]'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${isPaid ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </label>
          </div>

          {/* Repetir em outros meses: salva e abre a grade de meses */}
          <button
            type="button"
            onClick={() => save(true)}
            disabled={!canSave}
            className="flex items-center justify-center gap-2 -mb-1 py-2 rounded-[10px] text-[13px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-tint)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 7V6a2 2 0 012-2h7M10 2l2 2-2 2M13 9v1a2 2 0 01-2 2H4M6 14l-2-2 2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Salvar e repetir em outros meses…
          </button>

          {/* Ações */}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-[10px] text-[14px] font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
              Cancelar
            </button>
            <button onClick={() => save()} disabled={!canSave}
              className="flex-1 py-2.5 rounded-[10px] text-[14px] font-semibold bg-[var(--color-primary)] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
              Salvar em {monthLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
