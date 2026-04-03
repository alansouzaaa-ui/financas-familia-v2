import { type SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
}

export default function Select({ label, options, className = '', ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="label">{label}</label>}
      <select
        className={`
          w-full px-3 py-2 text-[13px] font-sans
          bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[10px]
          text-[var(--color-text-primary)] outline-none transition-colors
          focus:border-[var(--color-text-primary)] cursor-pointer
          ${className}
        `}
        {...props}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
