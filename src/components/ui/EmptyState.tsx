import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface EmptyStateProps {
  message: string
  hint?: string
  icon?: ReactNode
  /** CTA que leva a uma rota (ex: lançar, definir meta) */
  action?: { label: string; to: string }
  /** CTA que dispara uma função (ex: abrir formulário nesta página) */
  onAction?: { label: string; onClick: () => void }
}

const DefaultIcon = (
  <svg width="26" height="26" viewBox="0 0 40 40" fill="none" className="text-[var(--color-text-muted)]">
    <circle cx="20" cy="20" r="19" stroke="currentColor" strokeWidth="2"/>
    <path d="M14 20h12M20 14v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)

export default function EmptyState({ message, hint, icon, action, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface-2)] flex items-center justify-center mb-1">
        {icon ?? DefaultIcon}
      </div>
      <div>
        <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{message}</p>
        {hint && <p className="text-[12.5px] text-[var(--color-text-muted)] mt-1 max-w-[36ch] mx-auto">{hint}</p>}
      </div>
      {action && (
        <Link
          to={action.to}
          className="inline-flex items-center gap-1.5 mt-1 px-3.5 py-2 rounded-[10px] text-[13px] font-semibold bg-[var(--color-text-primary)] text-[var(--color-surface)] hover:opacity-90 transition-opacity"
        >
          {action.label}
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M3 6.5h7M7 3.5l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </Link>
      )}
      {onAction && (
        <button
          onClick={onAction.onClick}
          className="inline-flex items-center gap-1.5 mt-1 px-3.5 py-2 rounded-[10px] text-[13px] font-semibold bg-[var(--color-text-primary)] text-[var(--color-surface)] hover:opacity-90 transition-opacity"
        >
          {onAction.label}
        </button>
      )}
    </div>
  )
}
