import { useMemo, useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePortfolioValue } from '@/hooks/usePortfolioValue'
import { useNetWorthStore } from '@/stores/useNetWorthStore'
import { useDebtsStore } from '@/stores/useDebtsStore'
import { computeNetWorth, currentMonthCommitments } from '@/lib/netWorth'
import { MONTHS, MONTH_NAMES } from '@/types/finance'
import type { MonthPoint } from '@/types/finance'
import Money from '@/components/ui/Money'

interface Props {
  months: MonthPoint[]
}

/** '08/2026' → 'Ago/26' */
function refLabel(ref: string | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{4})$/.exec(ref ?? '')
  if (!m) return ref || null
  const abbr = MONTHS[Number(m[1]) - 1]
  return abbr ? `${abbr}/${m[2].slice(2)}` : ref || null
}

function fmtDayMonth(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function parseMoneyInput(raw: string): number | null {
  const t = raw.trim().replace(/[R$\s]/g, '')
  if (!t) return null
  // pt-BR: "1.234,56"; aceita também "1234.56"
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(norm)
  return Number.isFinite(n) ? n : NaN
}

function CashEditor() {
  const cash = useNetWorthStore(s => s.cash)
  const cashUpdatedAt = useNetWorthStore(s => s.cashUpdatedAt)
  const setCash = useNetWorthStore(s => s.setCash)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function start() {
    cancelled.current = false
    setDraft(cash == null ? '' : String(cash).replace('.', ','))
    setEditing(true)
  }

  function commit() {
    if (!editing) return // blur depois do Enter/Esc: já tratado
    if (cancelled.current) { setEditing(false); return }
    const v = parseMoneyInput(draft)
    if (!Number.isNaN(v)) setCash(v)
    setEditing(false)
  }

  const updated = fmtDayMonth(cashUpdatedAt)

  return (
    <div className="flex justify-between items-baseline text-[12.5px] gap-2">
      <span className="text-[var(--color-text-muted)]">
        Saldo em conta
        {updated && cash != null && (
          <span className="block text-[10px] opacity-80">atualizado em {updated}</span>
        )}
      </span>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            // Salva/cancela direto (não depende do blur acontecer)
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            else if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; setEditing(false) }
          }}
          inputMode="decimal"
          aria-label="Saldo em conta (R$)"
          placeholder="0,00"
          className="w-28 min-w-0 text-right font-mono text-[12.5px] bg-[var(--color-surface-2)] text-[var(--color-text-primary)] border border-[var(--hairline)] rounded-md px-2 py-1 focus:outline-none focus:border-[var(--color-text-muted)]"
        />
      ) : (
        <button
          type="button"
          onClick={start}
          aria-label={cash == null ? 'Informar saldo em conta' : 'Editar saldo em conta'}
          className="min-h-[28px] px-1 -mr-1 rounded-md hover:bg-[var(--color-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 cursor-pointer"
        >
          {cash == null ? (
            <span className="text-[var(--color-text-muted)] underline decoration-dotted underline-offset-2">Informar</span>
          ) : (
            <span className={cash >= 0 ? 'pos' : 'neg'}><Money value={cash} /></span>
          )}
        </button>
      )}
    </div>
  )
}

export default function NetWorthCard({ months }: Props) {
  const { current: investmentsCurrent, hasQuotes } = usePortfolioValue()
  const cash = useNetWorthStore(s => s.cash)
  const debtItems = useDebtsStore(s => s.items)
  const debtsRef = useDebtsStore(s => s.referenceMonth)

  const hasOpenDebts = useMemo(() => debtItems.some(d => !d.paid), [debtItems])
  const result = useMemo(
    () => computeNetWorth({ investmentsCurrent, cash, debts: debtItems }),
    [investmentsCurrent, cash, debtItems],
  )
  const commitments = useMemo(() => currentMonthCommitments(months, new Date()), [months])
  const ref = refLabel(debtsRef)

  return (
    <div className="card h-full flex flex-col">
      <div className="section-head label mb-3">Patrimônio Líquido</div>

      <div className={`font-semibold text-[27px] leading-none mb-1 ${result.netWorth >= 0 ? 'pos' : 'neg'}`}>
        <Money value={result.netWorth} signed />
      </div>
      <div className="text-[10.5px] text-[var(--color-text-muted)] mb-4 min-h-[14px]">
        {result.cashMissing && 'Informe o saldo em conta para um valor completo'}
      </div>

      <div className="flex flex-col gap-2.5 flex-1">
        <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.09em] font-semibold">
          Ativos
        </div>
        <div className="flex justify-between items-baseline text-[12.5px]">
          <span className="text-[var(--color-text-muted)]">
            Investimentos{!hasQuotes && ' (custo)'}
          </span>
          <span className="pos"><Money value={result.investments} /></span>
        </div>
        <CashEditor />

        <div className="border-t border-[var(--hairline)] my-1" />

        <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.09em] font-semibold">
          Dívidas
        </div>
        <div className="flex justify-between items-baseline text-[12.5px] gap-2">
          <span className="text-[var(--color-text-muted)]">
            Dívidas{ref && hasOpenDebts ? ` (Registrato ${ref})` : ''}
          </span>
          {hasOpenDebts ? (
            <span className="neg"><Money value={-result.debts} /></span>
          ) : (
            <span className="text-[var(--color-text-muted)]">—</span>
          )}
        </div>
        {!hasOpenDebts && (
          <Link
            to="/dividas"
            className="text-[11px] text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text-primary)] w-fit"
          >
            Cadastrar em Dívidas
          </Link>
        )}

        <div className="border-t border-[var(--hairline)] my-1" />

        <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.09em] font-semibold">
          Compromissos de {MONTH_NAMES[commitments.month]}
        </div>
        <div className="flex justify-between items-baseline text-[12.5px]">
          <span className="text-[var(--color-text-muted)]">Empréstimos</span>
          <span className="text-[var(--color-text-primary)]"><Money value={commitments.loans} /></span>
        </div>
        <div className="flex justify-between items-baseline text-[12.5px]">
          <span className="text-[var(--color-text-muted)]">Cartões</span>
          <span className="text-[var(--color-text-primary)]"><Money value={commitments.cards} /></span>
        </div>
        <div className="flex justify-between items-baseline text-[12.5px]">
          <span className="text-[var(--color-text-muted)]">Renegociações</span>
          <span className="text-[var(--color-text-primary)]"><Money value={commitments.renegociacoes} /></span>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-[var(--hairline)]">
        <div className="text-[10px] text-[var(--color-text-muted)]">
          Investimentos + Saldo em conta − Dívidas
        </div>
      </div>
    </div>
  )
}
