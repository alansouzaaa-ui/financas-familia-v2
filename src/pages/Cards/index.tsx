import { useState, useMemo } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useCardsStore } from '@/stores/useCardsStore'
import { fmt } from '@/lib/formatters'
import type { MonthItem, MonthAbbr } from '@/types/finance'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

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
  const accounts = useCardsStore(s => s.accounts)
  const addAccount = useCardsStore(s => s.addAccount)
  const renameAccount = useCardsStore(s => s.renameAccount)
  const setDueDay = useCardsStore(s => s.setDueDay)
  const deleteAccount = useCardsStore(s => s.deleteAccount)

  const now = new Date()
  const [month, setMonth] = useState<MonthAbbr>(MONTHS[now.getMonth()].value)
  const [year, setYear] = useState<number>(now.getFullYear())
  const [openId, setOpenId] = useState<string | null>(null)
  const [manage, setManage] = useState(false)

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

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[20px] font-semibold">Cartões</h1>
        <Button variant="ghost" size="sm" onClick={() => setManage(m => !m)}>
          {manage ? 'Concluir' : '⚙ Gerenciar'}
        </Button>
      </div>

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
                    {items.length === 0 ? (
                      <p className="px-4 py-4 text-[13px] text-[var(--color-text-muted)]">Nenhum lançamento nesta fatura.</p>
                    ) : (
                      items.map(it => (
                        <div key={it.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--color-border)] last:border-0 text-[13px]">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${it.isPaid ? 'bg-[var(--color-pos)]' : 'bg-[var(--color-border)]'}`} title={it.isPaid ? 'Pago' : 'Pendente'} />
                          <span className="flex-1 min-w-0 truncate">{it.description}</span>
                          <span className="font-mono neg">{fmt(it.value)}</span>
                        </div>
                      ))
                    )}
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
                  {semCartao.map(it => (
                    <div key={it.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--color-border)] last:border-0 text-[13px]">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${it.isPaid ? 'bg-[var(--color-pos)]' : 'bg-[var(--color-border)]'}`} />
                      <span className="flex-1 min-w-0 truncate">{it.description}</span>
                      <span className="font-mono neg">{fmt(it.value)}</span>
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
