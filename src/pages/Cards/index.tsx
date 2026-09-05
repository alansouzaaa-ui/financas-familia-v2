import { useState, useMemo } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useCardsStore } from '@/stores/useCardsStore'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import { fmt } from '@/lib/formatters'
import type { MonthItem, MonthAbbr } from '@/types/finance'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import NovaDespesaModal from '@/pages/Launch/NovaDespesaModal'

const MONTHS: { value: MonthAbbr; label: string }[] = [
  { value: 'Jan', label: 'Janeiro' }, { value: 'Fev', label: 'Fevereiro' },
  { value: 'Mar', label: 'Março' },   { value: 'Abr', label: 'Abril' },
  { value: 'Mai', label: 'Maio' },    { value: 'Jun', label: 'Junho' },
  { value: 'Jul', label: 'Julho' },   { value: 'Ago', label: 'Agosto' },
  { value: 'Set', label: 'Setembro' },{ value: 'Out', label: 'Outubro' },
  { value: 'Nov', label: 'Novembro' },{ value: 'Dez', label: 'Dezembro' },
]

export default function CardsPage() {
  const allMonths = useFinanceStore(s => s.allMonths)
  const upsertItem = useFinanceStore(s => s.upsertItem)
  const removeItem = useFinanceStore(s => s.removeItem)
  const accounts = useCardsStore(s => s.accounts)
  const tags = useCategoriesStore(s => s.tags)
  const tagMap = useMemo(() => Object.fromEntries(tags.map(t => [t.id, t])), [tags])
  const addAccount = useCardsStore(s => s.addAccount)
  const renameAccount = useCardsStore(s => s.renameAccount)
  const setDueDay = useCardsStore(s => s.setDueDay)
  const deleteAccount = useCardsStore(s => s.deleteAccount)

  const now = new Date()
  const [month, setMonth] = useState<MonthAbbr>(MONTHS[now.getMonth()].value)
  const [year, setYear] = useState<number>(now.getFullYear())
  const [openId, setOpenId] = useState<string | null>(null)
  const [manage, setManage] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [modalCardId, setModalCardId] = useState('')

  const monthLabel = `${MONTHS.find(m => m.value === month)?.label}/${year}`

  // Itens de cartão da fatura selecionada, agrupados por cartão
  const { byCard, semCartao, cardItems } = useMemo(() => {
    const rec = allMonths.find(m => m.month === month && m.year === year)
    const items = (rec?.items ?? []).filter(i => i.category === 'cards')
    const byCard = new Map<string, MonthItem[]>()
    const semCartao: MonthItem[] = []
    for (const it of items) {
      if (it.cardId) {
        const arr = byCard.get(it.cardId) ?? []
        arr.push(it)
        byCard.set(it.cardId, arr)
      } else {
        semCartao.push(it)
      }
    }
    return { byCard, semCartao, cardItems: items }
  }, [allMonths, month, year])

  const totalFatura = cardItems.reduce((s, i) => s + i.value, 0)

  function shiftMonth(dir: -1 | 1) {
    const idx = MONTHS.findIndex(m => m.value === month)
    let ni = idx + dir, ny = year
    if (ni < 0) { ni = 11; ny -= 1 }
    if (ni > 11) { ni = 0; ny += 1 }
    setMonth(MONTHS[ni].value); setYear(ny)
  }

  function addCardItem(cardId: string) {
    upsertItem(year, month, {
      id: crypto.randomUUID(), description: '', value: 0,
      category: 'cards', isPaid: false, cardId,
      source: 'manual', occurredAt: new Date().toISOString(),
    })
  }
  function patchItem(it: MonthItem, patch: Partial<MonthItem>) {
    upsertItem(year, month, { ...it, ...patch })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-2">
        <h1 className="text-[20px] font-semibold">Cartões</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setManage(m => !m)}>
            {manage ? 'Concluir' : '⚙ Gerenciar'}
          </Button>
          <button
            onClick={() => { setModalCardId(''); setShowModal(true) }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[13px] font-semibold bg-[var(--color-text-primary)] text-[var(--color-surface)] hover:opacity-90 transition-opacity"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            Nova despesa
          </button>
        </div>
      </div>

      {showModal && (
        <NovaDespesaModal
          month={month}
          year={year}
          monthLabel={monthLabel}
          defaultGrupo="cards"
          defaultCardId={modalCardId}
          onClose={() => setShowModal(false)}
          onAddFormItem={(it) => upsertItem(year, month, {
            id: crypto.randomUUID(), description: it.description, value: it.value,
            category: it.category as MonthItem['category'], isPaid: it.isPaid,
            ...(it.tag ? { tag: it.tag } : {}), ...(it.recurringId ? { recurringId: it.recurringId } : {}),
          })}
        />
      )}

      {/* Seletor de fatura */}
      <div className="flex items-center justify-center gap-3 mb-5">
        <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors" aria-label="Mês anterior">‹</button>
        <span className="text-[14px] font-medium min-w-[130px] text-center">Fatura de {monthLabel}</span>
        <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors" aria-label="Próximo mês">›</button>
      </div>

      {/* Total geral */}
      <div className="rounded-[16px] p-5 mb-5 border border-[var(--color-border)]" style={{ backgroundImage: 'linear-gradient(160deg, var(--color-surface), var(--color-surface-2))' }}>
        <div className="label">Total das faturas · {monthLabel}</div>
        <div className="font-mono font-medium text-[30px] neg mt-1.5">{fmt(totalFatura)}</div>
      </div>

      {/* Gerenciar cartões */}
      {manage && (
        <Card title="Gerenciar cartões" className="mb-5">
          <div className="flex flex-col gap-3">
            {accounts.length === 0 && (
              <p className="text-[13px] text-[var(--color-text-muted)]">Nenhum cartão cadastrado ainda.</p>
            )}
            {accounts.map(a => (
              <div key={a.id} className="flex items-center gap-2 flex-wrap">
                <input
                  defaultValue={a.name}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== a.name) renameAccount(a.id, v) }}
                  className="flex-1 min-w-[140px] px-2.5 py-1.5 text-[13px] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none focus:border-[var(--color-text-primary)]"
                />
                <div className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)]">
                  vence dia
                  <input
                    type="number" min={1} max={31}
                    defaultValue={a.dueDay ?? 10}
                    onBlur={e => { const d = parseInt(e.target.value, 10); if (d >= 1 && d <= 31) setDueDay(a.id, d) }}
                    className="w-14 px-2 py-1.5 text-[13px] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none text-center focus:border-[var(--color-text-primary)]"
                  />
                </div>
                <button
                  onClick={() => { if (confirm(`Excluir o cartão "${a.name}"? Os lançamentos não são apagados, só ficam sem cartão.`)) deleteAccount(a.id) }}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-neg)] transition-colors p-1"
                  aria-label="Excluir cartão"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                </button>
              </div>
            ))}
            <div>
              <Button variant="ghost" size="sm" onClick={() => { const n = prompt('Nome do novo cartão (ex: Cartão Pai):')?.trim(); if (n) addAccount(n) }}>
                + Novo cartão
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Lista de cartões (colapsados) */}
      {totalFatura === 0 && accounts.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-[14px] text-[var(--color-text-muted)]">Nenhum cartão ainda.</p>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-1">Clique em <strong>Gerenciar</strong> para cadastrar seu primeiro cartão.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {accounts.map(a => {
            const items = byCard.get(a.id) ?? []
            const total = items.reduce((s, i) => s + i.value, 0)
            const open = openId === a.id
            return (
              <div key={a.id} className="card !p-0 overflow-hidden">
                <button
                  onClick={() => setOpenId(open ? null : a.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <span className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-[var(--color-surface-2)] text-[var(--color-text-muted)] flex-shrink-0">
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M2 8h16" stroke="currentColor" strokeWidth="1.5"/></svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium truncate">{a.name}</div>
                    <div className="text-[11.5px] text-[var(--color-text-muted)]">
                      {items.length} {items.length === 1 ? 'lançamento' : 'lançamentos'} · vence dia {a.dueDay ?? 10}
                    </div>
                  </div>
                  <span className="font-mono font-semibold text-[15px] neg">{fmt(total)}</span>
                  <span className={`text-[var(--color-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {open && (
                  <div className="border-t border-[var(--color-border)]">
                    {items.map(it => {
                      const tg = it.tag ? tagMap[it.tag] : null
                      return (
                      <div key={it.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)] last:border-0">
                        <button
                          onClick={() => patchItem(it, { isPaid: !it.isPaid })}
                          className={`w-[22px] h-[22px] rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${it.isPaid ? 'border-transparent bg-[var(--color-pos)]' : 'border-[var(--color-border)]'}`}
                          title={it.isPaid ? 'Pago — clique para pendente' : 'Pendente — clique para pago'}
                        >
                          {it.isPaid && <svg width="11" height="11" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </button>
                        <input
                          defaultValue={it.description}
                          placeholder="Descrição"
                          onBlur={e => { const v = e.target.value.trim(); if (v !== it.description) patchItem(it, { description: v.slice(0, 120) }) }}
                          className="flex-1 min-w-0 px-2.5 py-2 text-[13px] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none focus:border-[var(--color-text-primary)]"
                        />
                        <div className="relative flex-shrink-0">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--color-text-muted)] pointer-events-none">R$</span>
                          <input
                            type="number" inputMode="decimal" placeholder="0,00"
                            defaultValue={it.value || ''}
                            onBlur={e => { const v = Math.round(parseFloat(e.target.value) * 100) / 100; if (isFinite(v) && v !== it.value) patchItem(it, { value: v }) }}
                            className="w-[104px] pl-7 pr-2 py-2 text-[14px] font-mono font-semibold bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none text-right focus:border-[var(--color-text-primary)]"
                          />
                        </div>
                        <div className="relative flex-shrink-0">
                          <select
                            value={it.tag ?? ''}
                            onChange={e => patchItem(it, { tag: e.target.value || undefined })}
                            title={tg ? `Categoria: ${tg.label}` : 'Escolher categoria'}
                            className={`appearance-none h-[38px] pl-2 pr-5 text-[13px] rounded-[8px] outline-none cursor-pointer border ${tg ? 'border-transparent' : 'border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
                            style={tg ? { backgroundColor: tg.color + '26', color: tg.color } : { backgroundColor: 'var(--color-surface-2)' }}
                          >
                            <option value="">🏷️</option>
                            {tags.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
                          </select>
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-[9px] opacity-60" style={tg ? { color: tg.color } : {}}>▾</span>
                        </div>
                        <button onClick={() => removeItem(year, month, it.id)} className="text-[var(--color-text-muted)] hover:text-[var(--color-neg)] transition-colors p-1 flex-shrink-0" aria-label="Excluir">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                    )})}
                    <div className="px-4 py-2.5">
                      <Button variant="ghost" size="sm" onClick={() => addCardItem(a.id)}>+ Adicionar lançamento</Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Sem cartão */}
          {semCartao.length > 0 && (
            <div className="card !p-0 overflow-hidden">
              <button
                onClick={() => setOpenId(open => open === '__none__' ? null : '__none__')}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--color-surface-2)] transition-colors"
              >
                <span className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-[var(--color-surface-2)] text-[var(--color-text-muted)] flex-shrink-0">?</span>
                <div className="flex-1">
                  <div className="text-[14px] font-medium italic text-[var(--color-text-muted)]">Sem cartão definido</div>
                  <div className="text-[11.5px] text-[var(--color-text-muted)]">{semCartao.length} lançamentos</div>
                </div>
                <span className="font-mono font-semibold text-[15px] neg">{fmt(semCartao.reduce((s, i) => s + i.value, 0))}</span>
                <span className={`text-[var(--color-text-muted)] transition-transform ${openId === '__none__' ? 'rotate-180' : ''}`}>▾</span>
              </button>
              {openId === '__none__' && (
                <div className="border-t border-[var(--color-border)]">
                  {accounts.length > 0 && (
                    <p className="px-4 pt-3 pb-1 text-[11.5px] text-[var(--color-text-muted)]">Atribua cada lançamento a um cartão no seletor à direita.</p>
                  )}
                  {semCartao.map(it => (
                    <div key={it.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)] last:border-0 text-[13px]">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${it.isPaid ? 'bg-[var(--color-pos)]' : 'bg-[var(--color-border)]'}`} />
                      <span className="flex-1 min-w-0 truncate">{it.description}</span>
                      <span className="font-mono neg whitespace-nowrap">{fmt(it.value)}</span>
                      {accounts.length > 0 && (
                        <select
                          value=""
                          onChange={e => { if (e.target.value) patchItem(it, { cardId: e.target.value }) }}
                          className="text-[12px] px-2 py-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[7px] outline-none focus:border-[var(--color-text-primary)]"
                          title="Mover para cartão"
                        >
                          <option value="">→ cartão…</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
