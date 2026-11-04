import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  /** Rodapé fixo (botões). */
  footer?: ReactNode
  /** Largura máxima no desktop (px). */
  maxWidth?: number
  /** Campo que recebe o foco ao abrir (no celular o foco vai para o painel, para não abrir o teclado). */
  initialFocusRef?: React.RefObject<HTMLElement | null>
  /** Papel do diálogo (alertdialog para confirmações). */
  role?: 'dialog' | 'alertdialog'
}

/**
 * Casca de diálogo do módulo de investimentos: portal, folha inferior no celular
 * e caixa centralizada (440px) no desktop, trap de foco, Esc, clique no fundo
 * fecha e trava o scroll do body. Mesmo padrão do RepeatMonthsModal.
 */
export default function ModalShell({ title, subtitle, onClose, children, footer, maxWidth = 440, initialFocusRef, role = 'dialog' }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const coarse = window.matchMedia?.('(pointer: coarse)').matches
    if (coarse || !initialFocusRef?.current) panelRef.current?.focus()
    else { initialFocusRef.current.focus(); (initialFocusRef.current as HTMLInputElement).select?.() }
    return () => {
      document.body.style.overflow = prevOverflow
      prevFocus?.focus?.()
    }
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (e.key !== 'Tab' || !panelRef.current) return
    const els = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    if (els.length === 0) return
    const first = els[0], last = els[els.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onKeyDown={onKeyDown}>
      <div className="fixed inset-0 bg-black/50 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ maxWidth }}
        className="relative w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92dvh] flex flex-col animate-slide-up outline-none"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[17px] font-semibold text-[var(--color-text-primary)]">{title}</h2>
            {subtitle && <div className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-10 h-10 sm:w-8 sm:h-8 -mr-1.5 -mt-1 flex items-center justify-center rounded-[8px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] transition-colors flex-shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="px-5 pb-4 flex flex-col gap-4 overflow-y-auto min-h-0">{children}</div>
        {footer && (
          <div className="flex-shrink-0 border-t border-[var(--color-border)] px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
