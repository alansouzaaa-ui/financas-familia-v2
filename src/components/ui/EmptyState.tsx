interface EmptyStateProps {
  message: string
  hint?: string
}

export default function EmptyState({ message, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-[var(--color-border)]">
        <circle cx="20" cy="20" r="19" stroke="currentColor" strokeWidth="2"/>
        <path d="M14 20h12M20 14v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <p className="text-[13px] text-[var(--color-text-muted)] font-medium">{message}</p>
      {hint && <p className="text-[12px] text-[var(--color-text-muted)]">{hint}</p>}
    </div>
  )
}
