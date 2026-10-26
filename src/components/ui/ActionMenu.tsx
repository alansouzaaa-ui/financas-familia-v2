import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface ActionMenuItem {
  key: string
  label: string
  icon?: ReactNode
  danger?: boolean
  /** desenha um separador acima do item */
  separatorBefore?: boolean
  onSelect: () => void
}

interface Props {
  items: ActionMenuItem[]
  /** rótulo acessível do botão ⋯ */
  label?: string
  className?: string
}

const MARGIN = 8
const GAP = 4

/**
 * Botão ⋯ com menu em portal (`position: fixed`), então nunca é cortado por
 * `overflow` de cards. Abre para baixo e vira para cima se faltar espaço.
 */
export default function ActionMenu({ items, label = 'Mais opções', className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const close = useCallback((returnFocus = false) => {
    setOpen(false)
    setPos(null)
    if (returnFocus) btnRef.current?.focus()
  }, [])

  // Posiciona depois de medir o menu (renderizado invisível no 1º frame)
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return
    const b = btnRef.current.getBoundingClientRect()
    const m = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    const below = vh - b.bottom - MARGIN
    const above = b.top - MARGIN
    const top = below >= m.height + GAP || below >= above
      ? Math.min(b.bottom + GAP, Math.max(MARGIN, vh - MARGIN - m.height))
      : Math.max(MARGIN, b.top - GAP - m.height)
    const left = Math.min(Math.max(MARGIN, b.right - m.width), vw - MARGIN - m.width)
    setPos({ top, left })
  }, [open])

  // Foco no 1º item ao abrir
  useEffect(() => {
    if (!open || !pos) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    // só na primeira vez que a posição fica pronta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos === null])

  // Fecha: clique fora, Esc, scroll, resize
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(true) }
    }
    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return
      close()
    }
    const onResize = () => close()
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, close])

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); els[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); els[els.length - 1]?.focus() }
    else if (e.key === 'Tab') close()
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true) } }}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={`w-8 h-8 flex items-center justify-center rounded-[8px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] focus-visible:bg-[var(--color-surface-2)] transition-colors ${open ? 'bg-[var(--color-surface-2)] text-[var(--color-text-primary)]' : ''} ${className}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="13" r="1.4" /></svg>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          className="z-[80] w-[250px] max-w-[calc(100vw-16px)] rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl py-1 text-[13px] animate-fade-in"
        >
          {items.map(it => (
            <div key={it.key} role="none">
              {it.separatorBefore && <div role="separator" className="h-px bg-[var(--color-border)] my-1" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => { close(); it.onSelect() }}
                className={`w-full h-10 flex items-center gap-2.5 px-3 text-left transition-colors focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-2)] ${it.danger ? 'text-[var(--color-neg)]' : 'text-[var(--color-text-primary)]'}`}
              >
                <span className="w-4 flex items-center justify-center flex-shrink-0" aria-hidden="true">{it.icon}</span>
                <span className="flex-1 truncate">{it.label}</span>
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
