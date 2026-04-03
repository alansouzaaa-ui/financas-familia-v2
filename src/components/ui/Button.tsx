import { type ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'warning'
  size?: 'sm' | 'md' | 'lg'
}

const VARIANTS = {
  primary: 'bg-[var(--color-text-primary)] text-[var(--color-surface)] hover:opacity-85',
  ghost:   'border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-primary)] hover:text-[var(--color-text-primary)] bg-transparent',
  danger:  'bg-[#993C1D] text-white hover:opacity-85 dark:bg-[#F07050]',
  warning: 'bg-[#BA7517] text-white hover:opacity-85 dark:bg-[#FBBF24] dark:text-[#1A1917]',
}

const SIZES = {
  sm: 'text-[11px] px-3 py-1.5 rounded-[8px]',
  md: 'text-[13px] px-4 py-2 rounded-[10px]',
  lg: 'text-[14px] px-5 py-2.5 rounded-[10px]',
}

export default function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 font-medium font-sans transition-opacity cursor-pointer ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
