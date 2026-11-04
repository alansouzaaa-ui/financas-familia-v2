import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useOperationsStore } from '@/stores/useOperationsStore'
import {
  heldOn, isManualPosition, isValidISODate, manualBalance, manualBalanceDelta, openingFor,
  previewOperation, validateOperationChange,
} from '@/lib/operations'
import {
  isFutureDate, registerOperation, todayISO, updateOperation, type OperationFields,
} from '@/lib/investmentActions'
import { fetchTesouroPuOnDate, type TesouroTitle } from '@/lib/tesouroService'
import { MARKET_TYPES, type EnrichedPosition } from '@/lib/portfolio'
import { fmtDateBR, fmtFull, fmtQuantity, fmtSignedFull, fmtSignedPct, unitLabel } from '@/lib/formatters'
import { parseDecimal, roundTo, toInputString } from '@/lib/moneyInput'
import type { InvestmentOperation, OperationType } from '@/types/investment'
import ModalShell from './ModalShell'
import { BTN_GHOST, BTN_PRIMARY } from './modalStyles'

export type OperationMode = 'buy' | 'sell' | 'deposit' | 'withdraw'

interface Props {
  position: EnrichedPosition
  mode: OperationMode
  /** Operação existente a editar (inclusive a abertura). */
  editing?: InvestmentOperation
  tesouroTitles: TesouroTitle[]
  onClose: () => void
  onDone: (result: { text: string; undoId?: string }) => void
}

const INPUT_BASE = 'w-full h-11 sm:h-10 px-3 text-[16px] sm:text-[14px] bg-[var(--color-surface-2)] border rounded-[10px] outline-none transition-colors text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 disabled:opacity-60'
const CHIP = 'h-10 sm:h-8 px-3 rounded-full text-[12px] font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] aria-pressed:bg-[var(--color-primary-tint)] aria-pressed:text-[var(--color-primary)] aria-pressed:border-[var(--color-primary)] disabled:opacity-40 disabled:pointer-events-none transition-colors'

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string | null; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {error
        ? <p id={`${id}-msg`} className="text-[11.5px] neg" role="alert">{error}</p>
        : hint ? <p id={`${id}-msg`} className="text-[11.5px] text-[var(--color-text-muted)]">{hint}</p> : null}
    </div>
  )
}

const TITLE: Record<OperationType, string> = {
  buy: 'Comprar mais', sell: 'Vender', deposit: 'Aportar', withdraw: 'Resgatar', opening: 'Editar abertura',
}
const EDIT_TITLE: Record<OperationType, string> = {
  buy: 'Editar compra', sell: 'Editar venda', deposit: 'Editar aporte', withdraw: 'Editar resgate', opening: 'Editar abertura',
}

export default function OperationModal({ position, mode, editing, tesouroTitles, onClose, onDone }: Props) {
  const uid = useId()
  const allOps = useOperationsStore(s => s.operations)
  const posOps = useMemo(() => allOps.filter(o => o.positionId === position.id), [allOps, position.id])
  // Posição sem livro (cliente antigo): a abertura implícita sai do cache, como em registerOperation.
  const ledger = useMemo(() => {
    const base = posOps.length ? posOps : [openingFor(position, position.id)]
    return editing ? base.filter(o => o.id !== editing.id) : base
  }, [posOps, position, editing])

  const manual = isManualPosition(position)
  const kind: OperationType = editing ? editing.type : mode
  const byAmount = manual && kind !== 'opening'          // aporte/resgate
  const openingManual = manual && kind === 'opening'      // valor depositado da abertura
  const tesouro = position.assetType === 'tesouro' && !manual
  const isSell = kind === 'sell'
  const isWithdraw = kind === 'withdraw'
  const today = todayISO()
  const balance = manual ? manualBalance(position) : 0
  const titulo = tesouro ? tesouroTitles.find(t => t.name === position.ticker) : undefined

  // ── estado dos campos (texto digitado) ────────────────────────────────────
  const [date, setDate] = useState(editing ? (editing.dateUnknown ? '' : editing.date) : today)
  const [qty, setQty] = useState(editing?.quantity != null && !openingManual ? toInputString(editing.quantity) : '')
  const initialQuotePrice = !editing && MARKET_TYPES.has(position.assetType) && position.quote && position.quote.regularMarketPrice > 0
    ? toInputString(roundTo(position.quote.regularMarketPrice, position.assetType === 'cripto' ? 8 : 2)) : ''
  const [price, setPrice] = useState(
    editing?.price != null && !tesouro && !openingManual ? toInputString(editing.price) : initialQuotePrice)
  const [pricePrefilled, setPricePrefilled] = useState(initialQuotePrice !== '')
  const [amount, setAmount] = useState(() => {
    if (!editing) return ''
    if (openingManual) return toInputString(editing.price ?? 0)
    if (editing.amount != null) return toInputString(editing.amount)
    if (tesouro && editing.quantity != null && editing.price != null) return toInputString(roundTo(editing.quantity * editing.price, 2))
    return ''
  })
  const [pu, setPu] = useState(tesouro && editing?.price != null ? toInputString(editing.price) : '')
  const [fees, setFees] = useState(editing?.fees ? toInputString(editing.fees) : '')
  const [showFees, setShowFees] = useState(!!editing?.fees)
  const [note, setNote] = useState(editing?.note ?? '')
  const [sellAll, setSellAll] = useState(false)
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [formError, setFormError] = useState<string | null>(null)
  const touch = (f: string) => setTouched(prev => (prev.has(f) ? prev : new Set(prev).add(f)))

  const [puLoading, setPuLoading] = useState(false)
  const [puInfo, setPuInfo] = useState<string | null>(null)
  const [puError, setPuError] = useState<string | null>(null)
  const lastPuDate = useRef<string>(editing?.date ?? '')
  const firstRef = useRef<HTMLInputElement>(null)

  // Tesouro: PU do título na data (editável). Não sobrescreve a edição de uma operação existente
  // enquanto a data não mudar.
  useEffect(() => {
    if (!tesouro || !titulo?.maturity || !isValidISODate(date) || date > today) return
    if (date === lastPuDate.current) return
    lastPuDate.current = date
    let cancelled = false
    let finished = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPuLoading(true)
    setPuError(null)
    const timer = setTimeout(() => {
      fetchTesouroPuOnDate(titulo.tipo, titulo.maturity!, date).then(res => {
        if (cancelled) return
        finished = true
        setPuLoading(false)
        if (res) {
          setPu(toInputString(res.pu))
          setPuInfo(`PU em ${fmtDateBR(res.date)}`)
        } else if (date === today && titulo.pu > 0) {
          setPu(toInputString(titulo.pu))
          setPuInfo('PU atual do título')
        } else {
          setPuInfo(null)
          setPuError('Não encontrei o PU nessa data. Informe o PU manualmente.')
        }
      })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
      if (!finished) lastPuDate.current = ''
    }
  }, [tesouro, titulo, date, today])

  // ── valores derivados ─────────────────────────────────────────────────────
  const dateEff = date || (editing?.dateUnknown ? editing.date : '')
  const dateErr = !date && editing?.dateUnknown ? null
    : !isValidISODate(date) ? 'Informe uma data válida.'
    : isFutureDate(date) ? 'A data não pode ser no futuro.' : null
  const held = !isSell || !isValidISODate(dateEff) ? 0 : heldOn(ledger, dateEff)
  const unit = (n: number) => unitLabel(position.assetType, n)

  const feesN = fees.trim() === '' ? 0 : parseDecimal(fees)
  const puN = parseDecimal(pu)
  const amountShown = tesouro && sellAll && puN && puN > 0 ? toInputString(roundTo(held * puN, 2)) : amount
  const amountN = parseDecimal(amountShown)
  const qtyTyped = parseDecimal(qty)
  const priceTyped = parseDecimal(price)

  // Quantidade e preço finais por modo
  const { qtyF, priceF } = ((): { qtyF: number | null; priceF: number | null } => {
    if (tesouro) {
      const untouched = !!editing && editing.quantity != null && !touched.has('amount') && !touched.has('pu')
      if (untouched) return { qtyF: editing.quantity ?? null, priceF: editing.price ?? null }
      if (isSell && sellAll && puN && puN > 0) return { qtyF: held, priceF: roundTo(puN, 2) }
      if (amountN && amountN > 0 && puN && puN > 0) return { qtyF: roundTo(amountN / puN, 2), priceF: roundTo(puN, 2) }
      return { qtyF: null, priceF: null }
    }
    if (!byAmount && !openingManual) {
      const dec = position.assetType === 'cripto' ? 8 : 3
      return { qtyF: qtyTyped != null ? roundTo(qtyTyped, dec) : null, priceF: priceTyped }
    }
    return { qtyF: null, priceF: null }
  })()

  const errors: Record<string, string | null> = {}
  errors.date = dateErr
  if (byAmount || openingManual) {
    if (amountN == null || amountN <= 0) errors.amount = openingManual ? 'Informe o valor depositado.' : 'Informe o valor em reais.'
    else if (isWithdraw && amountN > balance + 0.005) errors.amount = `O resgate não pode passar do saldo atual (${fmtFull(balance)}).`
    else if (isWithdraw && editing?.balanceBefore != null && amountN > editing.balanceBefore + 0.005) errors.amount = `O resgate não pode passar do saldo que havia na data (${fmtFull(editing.balanceBefore)}).`
  } else if (tesouro) {
    if (amountN == null || amountN <= 0) errors.amount = 'Informe o valor em reais.'
    if (puN == null || puN <= 0) errors.pu = 'Informe o PU do título.'
    if (qtyF != null && qtyF <= 0) errors.amount = 'O valor é pequeno demais para 0,01 título.'
    if (isSell && qtyF != null && qtyF > held + 1e-6) errors.amount = `Você tem ${fmtQuantity(held)} ${unit(held)} nesta data (${fmtFull(held * (puN ?? 0))}).`
  } else {
    if (qtyF == null || qtyF <= 0) errors.qty = 'Informe uma quantidade maior que zero.'
    else if (isSell && qtyF > held + 1e-6) errors.qty = `Você tem ${fmtQuantity(held)} ${unit(held)} nesta data.`
    if (priceF == null) errors.price = 'Informe o preço unitário.'
  }
  if (feesN == null) errors.fees = 'Taxas inválidas. Use um valor como 4,90.'
  if (note.length > 200) errors.note = 'Use até 200 caracteres.'

  const hasFieldErrors = Object.values(errors).some(Boolean)

  const candidate = ((): InvestmentOperation | null => {
    if (hasFieldErrors || !isValidISODate(dateEff)) return null
    const trimmed = note.trim()
    const base: InvestmentOperation = {
      id: editing?.id ?? '__draft__',
      positionId: position.id,
      type: kind,
      date: dateEff,
      ...(editing?.dateUnknown && !date ? { dateUnknown: true } : {}),
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      ...(feesN && feesN > 0 ? { fees: feesN } : {}),
      ...(trimmed ? { note: trimmed } : {}),
    }
    if (byAmount) {
      return { ...base, amount: amountN!, ...(isWithdraw ? { balanceBefore: editing?.balanceBefore ?? Math.round(balance * 100) / 100 } : {}) }
    }
    if (openingManual) return { ...base, quantity: editing?.quantity ?? 1, price: amountN! }
    return { ...base, quantity: qtyF!, price: priceF! }
  })()

  const validationError = ((): string | null => {
    if (!candidate) return null
    const base = posOps.length ? posOps : [openingFor(position, position.id)]
    return validateOperationChange(base, editing ? { kind: 'update', op: candidate } : { kind: 'add', op: candidate })
  })()

  const preview = candidate && !validationError ? previewOperation(ledger, candidate) : null

  const valid = !!candidate && !validationError

  const show = (f: string, value: string) => touched.has(f) || value.trim() !== ''
  const err = (f: string, value: string) => (show(f, value) ? errors[f] ?? null : null)

  // ── texto do botão ────────────────────────────────────────────────────────
  let primary = editing ? 'Salvar alterações' : TITLE[kind]
  if (!editing) {
    if (kind === 'buy') primary = valid && qtyF ? `Registrar compra de ${fmtQuantity(qtyF)} ${unit(qtyF)}` : 'Registrar compra'
    else if (kind === 'sell') primary = valid && qtyF ? `Registrar venda de ${fmtQuantity(qtyF)} ${unit(qtyF)}` : 'Registrar venda'
    else if (kind === 'deposit') primary = valid && amountN ? `Registrar aporte de ${fmtFull(amountN)}` : 'Registrar aporte'
    else if (kind === 'withdraw') primary = valid && amountN ? `Registrar resgate de ${fmtFull(amountN)}` : 'Registrar resgate'
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || !candidate) { setTouched(new Set(['date', 'qty', 'price', 'amount', 'pu', 'fees'])); return }
    const fields: OperationFields = {
      date: candidate.date,
      ...(candidate.quantity !== undefined ? { quantity: candidate.quantity } : {}),
      ...(candidate.price !== undefined ? { price: candidate.price } : {}),
      ...(candidate.amount !== undefined ? { amount: candidate.amount } : {}),
      fees: candidate.fees,
      note: candidate.note,
    }
    if (editing) {
      const res = updateOperation(editing.id, fields)
      if (!res.ok) { setFormError(res.error); return }
      onDone({ text: 'Operação atualizada.' })
      return
    }
    const res = registerOperation(position.id, { type: mode, ...fields })
    if (!res.ok) { setFormError(res.error); return }
    const op = res.value
    const tk = position.ticker
    const text = kind === 'buy' ? `Compra de ${fmtQuantity(op.quantity ?? 0)} ${tk} registrada`
      : kind === 'sell' ? `Venda de ${fmtQuantity(op.quantity ?? 0)} ${tk} registrada`
      : kind === 'deposit' ? `Aporte de ${fmtFull(op.amount ?? 0)} em ${tk} registrado`
      : `Resgate de ${fmtFull(op.amount ?? 0)} em ${tk} registrado`
    onDone({ text, undoId: op.id })
  }

  const ids = { date: `${uid}-date`, qty: `${uid}-qty`, price: `${uid}-price`, amount: `${uid}-amount`, pu: `${uid}-pu`, fees: `${uid}-fees`, note: `${uid}-note` }
  const fieldProps = (id: string, bad: boolean, msgShown: boolean) => ({
    id,
    'aria-invalid': bad || undefined,
    'aria-describedby': msgShown ? `${id}-msg` : undefined,
  })
  const border = (bad: boolean) => (bad ? 'border-[var(--color-neg)]' : 'border-[var(--color-border)]')

  // ── prévia ao vivo ────────────────────────────────────────────────────────
  const signedClass = (n: number) => (n > 0.005 ? 'pos' : n < -0.005 ? 'neg' : 'text-[var(--color-text-muted)]')
  let previewNode: ReactNode = <span className="text-[var(--color-text-muted)]">
    {byAmount || openingManual ? 'Informe a data e o valor para ver o efeito no saldo.' : 'Informe quantidade e preço para ver o efeito na posição.'}
  </span>
  if (validationError) {
    previewNode = <span className="neg" role="alert">{validationError}</span>
  } else if (preview && candidate) {
    const { after, realized, soldCost } = preview
    const pctV = soldCost > 0 ? (realized / soldCost) * 100 : 0
    const gainWord = realized >= 0 ? 'Lucro' : 'Prejuízo'
    const realizedNode = (
      <span className={`font-semibold ${signedClass(realized)}`}>{fmtSignedFull(realized)}{soldCost > 0 ? ` (${fmtSignedPct(pctV)})` : ''}</span>
    )
    if (kind === 'buy' || kind === 'opening') {
      previewNode = openingManual
        ? <>Depositado: <b className="font-semibold">{fmtFull(amountN ?? 0)}</b></>
        : <>Novo preço médio <b className="font-semibold">{fmtFull(after.avgPrice)}</b> · total {fmtQuantity(after.quantity)} {unit(after.quantity)}</>
    } else if (kind === 'sell') {
      previewNode = after.closed
        ? <>A posição será encerrada · resultado {realizedNode}</>
        : <>{gainWord} estimado {realizedNode} · restam {fmtQuantity(after.quantity)} {unit(after.quantity)}</>
    } else if (kind === 'deposit') {
      previewNode = <>Novo saldo <b className="font-semibold">{fmtFull(balance + manualBalanceDelta(editing, candidate))}</b></>
    } else if (kind === 'withdraw') {
      const newBal = balance + manualBalanceDelta(editing, candidate)
      previewNode = after.closed
        ? <>A posição será encerrada · resultado {realizedNode}</>
        : <>{gainWord} estimado no resgate {realizedNode} · novo saldo <b className="font-semibold">{fmtFull(newBal)}</b></>
    }
  }

  const subtitle = (
    <span className="truncate block">
      <span className="font-mono text-[var(--color-text-primary)] font-medium">{position.ticker}</span>
      {manual ? ` · saldo atual ${fmtFull(balance)}` : ` · ${fmtQuantity(position.quantity)} ${unit(position.quantity)} · preço médio ${fmtFull(position.avgPrice)}`}
    </span>
  )

  const todayQuote = !editing && !tesouro && !manual && MARKET_TYPES.has(position.assetType) && position.quote
  const priceHint = pricePrefilled && price === initialQuotePrice && initialQuotePrice !== '' && date === today
    ? (isSell ? 'cotação de agora, ajuste para o preço que você recebeu' : 'cotação de agora, ajuste para o preço que você pagou') : null

  return (
    <ModalShell
      title={editing ? EDIT_TITLE[kind] : TITLE[kind]}
      subtitle={subtitle}
      onClose={onClose}
      initialFocusRef={firstRef}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={BTN_GHOST}>Cancelar</button>
          <button type="submit" form={`${uid}-form`} disabled={!valid} className={BTN_PRIMARY}>{primary}</button>
        </div>
      }
    >
      <form id={`${uid}-form`} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field id={ids.date} label="Data" error={dateErr} hint={editing?.dateUnknown && !date ? 'Data desconhecida. Informe a data da compra, se souber.' : undefined}>
          <input
            {...fieldProps(ids.date, !!dateErr, !!dateErr || !!(editing?.dateUnknown && !date))}
            type="date"
            max={today}
            value={date}
            onChange={e => { setDate(e.target.value); setFormError(null) }}
            className={`${INPUT_BASE} ${border(!!dateErr)}`}
          />
        </Field>

        {isSell && !tesouro && (
          <div className="flex flex-wrap items-center justify-between gap-2 -mt-1">
            <p className="text-[13px] text-[var(--color-text-primary)]" aria-live="polite">
              Você tem <b className="font-semibold">{fmtQuantity(held)} {unit(held)}</b> nesta data
            </p>
            <button
              type="button"
              className={CHIP}
              disabled={held <= 0}
              aria-pressed={qtyTyped != null && Math.abs(qtyTyped - held) < 1e-6}
              onClick={() => { setQty(toInputString(held)); touch('qty'); setFormError(null) }}
            >
              Vender tudo
            </button>
          </div>
        )}
        {isSell && tesouro && (
          <div className="flex flex-wrap items-center justify-between gap-2 -mt-1">
            <p className="text-[13px] text-[var(--color-text-primary)]" aria-live="polite">
              Você tem <b className="font-semibold">{fmtQuantity(held)} {unit(held)}</b> nesta data
            </p>
            <button type="button" className={CHIP} disabled={held <= 0} aria-pressed={sellAll}
              onClick={() => { setSellAll(true); touch('amount'); setFormError(null) }}>
              Vender tudo
            </button>
          </div>
        )}
        {isWithdraw && (
          <div className="flex flex-wrap items-center justify-between gap-2 -mt-1">
            <p className="text-[13px] text-[var(--color-text-primary)]">
              Saldo atual <b className="font-semibold">{fmtFull(balance)}</b>
            </p>
            <button type="button" className={CHIP} disabled={balance <= 0}
              aria-pressed={amountN != null && Math.abs(amountN - balance) < 0.005}
              onClick={() => { setAmount(toInputString(balance, 2)); touch('amount'); setFormError(null) }}>
              Resgatar tudo
            </button>
          </div>
        )}

        {byAmount || openingManual ? (
          <Field id={ids.amount} label={openingManual ? 'Valor depositado (R$)' : 'Valor (R$)'} error={err('amount', amount)}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-mono text-[var(--color-text-muted)]" aria-hidden="true">R$</span>
              <input
                {...fieldProps(ids.amount, !!err('amount', amount), !!err('amount', amount))}
                ref={firstRef}
                type="text" inputMode="decimal" autoComplete="off" placeholder="0,00"
                value={amount}
                onChange={e => { setAmount(e.target.value); setFormError(null) }}
                onBlur={() => touch('amount')}
                className={`${INPUT_BASE} pl-10 font-mono ${border(!!err('amount', amount))}`}
              />
            </div>
          </Field>
        ) : tesouro ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field id={ids.amount} label="Valor (R$)" error={err('amount', amountShown)}>
                <input
                  {...fieldProps(ids.amount, !!err('amount', amountShown), !!err('amount', amountShown))}
                  ref={firstRef}
                  type="text" inputMode="decimal" autoComplete="off" placeholder="1.000,00"
                  value={amountShown}
                  onChange={e => { setAmount(e.target.value); setSellAll(false); touch('amount'); setFormError(null) }}
                  onBlur={() => touch('amount')}
                  className={`${INPUT_BASE} font-mono ${border(!!err('amount', amountShown))}`}
                />
              </Field>
              <Field id={ids.pu} label={puLoading ? 'PU (buscando…)' : 'PU na data (R$)'} error={err('pu', pu)}>
                <input
                  {...fieldProps(ids.pu, !!err('pu', pu), !!err('pu', pu))}
                  type="text" inputMode="decimal" autoComplete="off" placeholder="automático"
                  value={pu}
                  onChange={e => { setPu(e.target.value); touch('pu'); setFormError(null) }}
                  onBlur={() => touch('pu')}
                  className={`${INPUT_BASE} font-mono ${border(!!err('pu', pu))}`}
                />
              </Field>
            </div>
            <p className="text-[12px] -mt-2" aria-live="polite">
              {puLoading ? <span className="text-[var(--color-text-muted)]">Buscando o PU do título nessa data…</span>
                : puError ? <span className="neg">{puError}</span>
                : qtyF != null && qtyF > 0 && priceF != null ? (
                  <span className="text-[var(--color-text-muted)]">
                    {puInfo ? `${puInfo}: ` : 'PU informado: '}<span className="font-mono text-[var(--color-text-primary)]">{fmtFull(priceF)}</span>
                    {' · '}≈ <span className="font-mono text-[var(--color-text-primary)]">{fmtQuantity(qtyF)}</span> {unit(qtyF)}
                  </span>
                ) : null}
            </p>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field id={ids.qty} label="Quantidade" error={err('qty', qty)}>
              <input
                {...fieldProps(ids.qty, !!err('qty', qty), !!err('qty', qty))}
                ref={firstRef}
                type="text" inputMode="decimal" autoComplete="off" placeholder="10"
                value={qty}
                onChange={e => { setQty(e.target.value); setFormError(null) }}
                onBlur={() => touch('qty')}
                className={`${INPUT_BASE} font-mono ${border(!!err('qty', qty))}`}
              />
            </Field>
            <Field id={ids.price} label="Preço unitário (R$)" error={err('price', price)}>
              <input
                {...fieldProps(ids.price, !!err('price', price), !!err('price', price) || !!priceHint)}
                type="text" inputMode="decimal" autoComplete="off" placeholder="35,00"
                value={price}
                onChange={e => { setPrice(e.target.value); setPricePrefilled(false); setFormError(null) }}
                onBlur={() => touch('price')}
                className={`${INPUT_BASE} font-mono ${border(!!err('price', price))}`}
              />
            </Field>
          </div>
        )}
        {priceHint && !tesouro && !byAmount && (
          <p id={`${ids.price}-msg`} className="text-[11.5px] text-[var(--color-text-muted)] -mt-2">Preço: {priceHint}.</p>
        )}
        {todayQuote && !priceHint && date === today && price.trim() === '' && (
          <button
            type="button"
            className="self-start text-[12px] underline underline-offset-2 text-[var(--color-primary)] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded min-h-10 sm:min-h-0 -mt-2"
            onClick={() => { setPrice(initialQuotePrice || toInputString(roundTo(position.quote!.regularMarketPrice, 2))); setPricePrefilled(true) }}
          >
            Usar a cotação de agora ({fmtFull(position.quote!.regularMarketPrice)})
          </button>
        )}

        {!byAmount && !openingManual && (
          showFees ? (
            <Field id={ids.fees} label="Taxas (R$, opcional)" error={err('fees', fees)} hint={isSell ? 'Corretagem e emolumentos são descontados do resultado da venda.' : 'Corretagem e emolumentos entram no preço médio.'}>
              <input
                {...fieldProps(ids.fees, !!err('fees', fees), true)}
                type="text" inputMode="decimal" autoComplete="off" placeholder="0,00"
                value={fees}
                onChange={e => { setFees(e.target.value); setFormError(null) }}
                onBlur={() => touch('fees')}
                className={`${INPUT_BASE} font-mono ${border(!!err('fees', fees))}`}
              />
            </Field>
          ) : (
            <button
              type="button"
              onClick={() => setShowFees(true)}
              className="self-start text-[13px] font-medium text-[var(--color-primary)] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded min-h-10 sm:min-h-0 -my-1"
            >
              + taxas
            </button>
          )
        )}

        <Field id={ids.note} label="Anotação (opcional)" error={errors.note}>
          <input
            {...fieldProps(ids.note, !!errors.note, !!errors.note)}
            type="text" maxLength={220} autoComplete="off" placeholder="Ex.: aporte do mês, rebalanceamento"
            value={note}
            onChange={e => setNote(e.target.value)}
            className={`${INPUT_BASE} ${border(!!errors.note)}`}
          />
        </Field>

        <div className="rounded-[10px] bg-[var(--color-surface-2)] px-3 py-2.5 text-[13px] text-[var(--color-text-primary)] min-h-[44px] flex items-center" aria-live="polite">
          <div>{previewNode}</div>
        </div>
        {formError && <p className="text-[12.5px] neg" role="alert">{formError}</p>}
      </form>
    </ModalShell>
  )
}
