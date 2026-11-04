import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useInvestmentStore } from '@/stores/useInvestmentStore'
import { useOperationsStore } from '@/stores/useOperationsStore'
import {
  isManualPosition, manualBalance, operationAmount, operationResults, removalBlockReason, replayOperations,
  sortOperations, totalBought, UNKNOWN_DATE,
} from '@/lib/operations'
import { deletePosition, removeOperation } from '@/lib/investmentActions'
import { fmtDateBR, fmtFull, fmtQuantity, fmtSignedFull, fmtSignedPct } from '@/lib/formatters'
import type { InvestmentOperation, OperationType } from '@/types/investment'
import ModalShell from './ModalShell'
import { BTN_DANGER, BTN_GHOST } from './modalStyles'

interface Props {
  positionId: string
  onClose: () => void
  onEditOperation: (op: InvestmentOperation) => void
  onToast: (text: string) => void
}

const LABEL: Record<OperationType, string> = {
  opening: 'Abertura', buy: 'Compra', sell: 'Venda', deposit: 'Aporte', withdraw: 'Resgate',
}
const LABEL_LOWER: Record<OperationType, string> = {
  opening: 'a abertura', buy: 'a compra', sell: 'a venda', deposit: 'o aporte', withdraw: 'o resgate',
}

const DELETED: Record<OperationType, string> = {
  opening: 'Abertura apagada', buy: 'Compra apagada', sell: 'Venda apagada', deposit: 'Aporte apagado', withdraw: 'Resgate apagado',
}

const ROW_BTN = 'h-10 sm:h-8 px-3 rounded-[8px] text-[12.5px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] transition-colors'

function TypeIcon({ type }: { type: OperationType }) {
  const inflow = type === 'buy' || type === 'deposit' || type === 'opening'
  return (
    <span
      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${inflow ? 'bg-[var(--color-primary-tint)] text-[var(--color-primary)]' : 'bg-[var(--color-surface-2)] text-[var(--color-text-primary)]'}`}
      aria-hidden="true"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        {type === 'opening' && <path d="M3.5 12V2.5h6L8.5 5l1 2.5h-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />}
        {(type === 'buy' || type === 'deposit') && <path d="M7 2.5v8M3.5 7L7 10.5 10.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
        {(type === 'sell' || type === 'withdraw') && <path d="M7 11.5v-8M3.5 7L7 3.5 10.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </span>
  )
}

export default function HistoryModal({ positionId, onClose, onEditOperation, onToast }: Props) {
  const positions = useInvestmentStore(s => s.positions)
  const closedPositions = useOperationsStore(s => s.closedPositions)
  const allOps = useOperationsStore(s => s.operations)

  const open = positions.find(p => p.id === positionId)
  const closedEntry = closedPositions.find(c => c.position.id === positionId)
  const pos = open ?? closedEntry?.position
  const isClosed = !open && !!closedEntry

  const ops = useMemo(() => allOps.filter(o => o.positionId === positionId), [allOps, positionId])
  const sorted = useMemo(() => sortOperations(ops).reverse(), [ops])
  const results = useMemo(() => operationResults(ops), [ops])
  const replay = useMemo(() => replayOperations(ops), [ops])

  const [confirm, setConfirm] = useState<{ id: string; whole: boolean } | null>(null)
  const [blocked, setBlocked] = useState<{ id: string; msg: string } | null>(null)
  const [confirmPosition, setConfirmPosition] = useState(false)

  // Posição apagada (ex.: por outro dispositivo) enquanto o histórico está aberto.
  const gone = !pos
  useEffect(() => { if (gone) onClose() }, [gone, onClose])
  if (!pos) return null

  const manual = isManualPosition(pos)
  const realized = isClosed && closedEntry ? closedEntry.realizedGain : replay.realizedGain
  const bought = totalBought(ops)
  const realizedPct = bought > 0 ? (realized / bought) * 100 : 0
  const realizedClass = realized > 0.005 ? 'pos' : realized < -0.005 ? 'neg' : 'text-[var(--color-text-primary)]'

  // Posição juntada na migração: cada abertura foi uma compra de verdade.
  const openingCount = ops.filter(o => o.type === 'opening').length
  const shownType = (op: InvestmentOperation): OperationType =>
    op.type === 'opening' && openingCount > 1 ? 'buy' : op.type

  function askDelete(op: InvestmentOperation) {
    setBlocked(null)
    if (op.type === 'opening' && ops.length === 1) { setConfirm({ id: op.id, whole: true }); return }
    const reason = removalBlockReason(allOps, op.id)
    if (reason) { setBlocked({ id: op.id, msg: reason }); setConfirm(null); return }
    setConfirm({ id: op.id, whole: false })
  }

  function doDelete(op: InvestmentOperation, whole: boolean) {
    if (whole) {
      deletePosition(positionId)
      onToast(`Posição ${pos!.ticker} excluída`)
      onClose()
      return
    }
    const res = removeOperation(op.id)
    if (!res.ok) { setBlocked({ id: op.id, msg: res.error }); setConfirm(null); return }
    setConfirm(null)
    onToast(DELETED[shownType(op)])
  }

  function renderLine(op: InvestmentOperation): ReactNode {
    if (op.type === 'deposit' || op.type === 'withdraw') return <span className="font-mono">{fmtFull(operationAmount(op))}</span>
    if (manual && op.type === 'opening') return <span>Depositado <span className="font-mono">{fmtFull(op.price ?? 0)}</span></span>
    return (
      <span className="font-mono">
        {fmtQuantity(op.quantity ?? 0)} × {fmtFull(op.price ?? 0)} = {fmtFull(operationAmount(op))}
      </span>
    )
  }

  const stat = (label: string, value: ReactNode, cls = '') => (
    <div className="min-w-0">
      <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-[13px] font-semibold font-mono truncate ${cls || 'text-[var(--color-text-primary)]'}`}>{value}</div>
    </div>
  )

  const footer = (
    <div className="flex flex-col gap-3">
      {ops.length > 0 && replay.valid && (
        <div className={`grid gap-3 ${isClosed ? 'grid-cols-2' : manual ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
          {isClosed ? (
            <>
              {stat('Encerrada em', closedEntry!.closedAt === UNKNOWN_DATE ? 'data desconhecida' : fmtDateBR(closedEntry!.closedAt))}
              {stat('Resultado', `${fmtSignedFull(realized)}${bought > 0 ? ` (${fmtSignedPct(realizedPct)})` : ''}`, realizedClass)}
            </>
          ) : manual ? (
            <>
              {stat('Saldo atual', fmtFull(manualBalance(pos)))}
              {stat('Investido', fmtFull(replay.cost))}
              {stat('Realizado', fmtSignedFull(realized), realizedClass)}
            </>
          ) : (
            <>
              {stat('Quantidade', fmtQuantity(replay.quantity))}
              {stat('Preço médio', fmtFull(replay.avgPrice))}
              {stat('Investido', fmtFull(replay.cost))}
              {stat('Realizado', fmtSignedFull(realized), realizedClass)}
            </>
          )}
        </div>
      )}
      {isClosed && (
        confirmPosition ? (
          <div className="flex flex-col gap-2" role="alert">
            <p className="text-[12.5px] text-[var(--color-text-primary)]">Excluir {pos.ticker} e as {ops.length} operações dela? Não dá para desfazer.</p>
            <div className="flex gap-2">
              <button type="button" className={BTN_GHOST} onClick={() => setConfirmPosition(false)}>Cancelar</button>
              <button type="button" className={BTN_DANGER} onClick={() => { deletePosition(positionId); onToast(`Posição ${pos.ticker} excluída`); onClose() }}>Excluir posição</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmPosition(true)}
            className="self-start h-10 sm:h-8 px-2 -ml-2 rounded-[8px] text-[12.5px] font-medium text-[var(--color-neg)] hover:bg-[var(--color-neg)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-neg)] transition-colors"
          >
            Excluir posição
          </button>
        )
      )}
    </div>
  )

  return (
    <ModalShell
      title={`Histórico · ${pos.ticker}`}
      subtitle={isClosed
        ? 'Posição encerrada'
        : `${ops.length} ${ops.length === 1 ? 'operação' : 'operações'}`}
      onClose={onClose}
      maxWidth={520}
      footer={footer}
    >
      {ops.length === 0 ? (
        <p className="text-[13px] text-[var(--color-text-muted)]">
          Esta posição ainda não tem histórico. Ao registrar uma compra, venda ou aporte, o saldo atual
          ({fmtQuantity(pos.quantity)} × {fmtFull(pos.avgPrice)}) vira a abertura do histórico.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--color-border)] -mx-1">
          {sorted.map(op => {
            const res = results.get(op.id)
            const pct = res && res.soldCost > 0 ? (res.realized / res.soldCost) * 100 : null
            const isConfirm = confirm?.id === op.id
            const blockedMsg = blocked?.id === op.id ? blocked.msg : null
            return (
              <li key={op.id} className="px-1 py-3 flex gap-3">
                <TypeIcon type={shownType(op)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13.5px] font-semibold text-[var(--color-text-primary)]">{LABEL[shownType(op)]}</span>
                    <span className="text-[12px] text-[var(--color-text-muted)] whitespace-nowrap">
                      {op.dateUnknown ? 'data desconhecida' : fmtDateBR(op.date)}
                    </span>
                  </div>
                  <div className="text-[13px] text-[var(--color-text-primary)] mt-0.5 break-words">{renderLine(op)}</div>
                  {op.fees != null && op.fees > 0 && (
                    <div className="text-[12px] text-[var(--color-text-muted)] mt-0.5">Taxas <span className="font-mono">{fmtFull(op.fees)}</span></div>
                  )}
                  {op.note && <div className="text-[12px] text-[var(--color-text-muted)] mt-0.5 break-words">{op.note}</div>}
                  {res && (
                    <div className="text-[12.5px] mt-1">
                      <span className="text-[var(--color-text-muted)]">Resultado </span>
                      <span className={`font-semibold font-mono ${res.realized > 0.005 ? 'pos' : res.realized < -0.005 ? 'neg' : ''}`}>
                        {fmtSignedFull(res.realized)}{pct != null ? ` (${fmtSignedPct(pct)})` : ''}
                      </span>
                    </div>
                  )}

                  {blockedMsg && (
                    <p className="text-[12.5px] neg mt-2" role="alert">{blockedMsg}</p>
                  )}

                  {isConfirm ? (
                    <div className="mt-2 flex flex-col gap-2" role="alert">
                      <p className="text-[12.5px] text-[var(--color-text-primary)]">
                        {confirm.whole
                          ? `Esta é a única operação. Excluir ${pos.ticker} por inteiro?`
                          : `Apagar ${LABEL_LOWER[shownType(op)]} de ${op.dateUnknown ? 'data desconhecida' : fmtDateBR(op.date)}?`}
                      </p>
                      <div className="flex gap-2">
                        <button type="button" className={`${ROW_BTN} flex-1 border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)]`} onClick={() => setConfirm(null)}>Cancelar</button>
                        <button type="button" className={`${ROW_BTN} flex-1 bg-[var(--color-neg)] text-[var(--color-bg)] hover:opacity-90`} onClick={() => doDelete(op, confirm.whole)}>
                          {confirm.whole ? 'Excluir posição' : 'Apagar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-1 mt-1.5 -ml-3">
                      <button
                        type="button"
                        onClick={() => { setConfirm(null); setBlocked(null); onEditOperation(op) }}
                        className={`${ROW_BTN} text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]`}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => askDelete(op)}
                        className={`${ROW_BTN} text-[var(--color-text-muted)] hover:text-[var(--color-neg)] hover:bg-[var(--color-neg)]/10`}
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </ModalShell>
  )
}
