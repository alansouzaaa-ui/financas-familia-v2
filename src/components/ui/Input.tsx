import { type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export default function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="label">{label}</label>}
      <input
        className={`
          w-full px-3 py-2 text-[13px] font-sans
          bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[10px]
          text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]
          outline-none transition-colors
          focus:border-[var(--color-text-primary)]
          ${error ? 'border-[var(--color-neg)]' : ''}
          ${className}
        `}
        {...props}
      />
      {error && <span className="text-[11px] neg">{error}</span>}
    </div>
  )
}
