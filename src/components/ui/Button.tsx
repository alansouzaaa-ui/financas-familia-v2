import { type ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'warning'
  size?: 'sm' | 'md' | 'lg'
}

const VARIANTS = {
  primary: 'bg-[#1A1917] text-white hover:opacity-85',
  ghost:   'border border-[#E8E6E0] text-[#6B6860] hover:border-[#1A1917] hover:text-[#1A1917] bg-transparent',
  danger:  'bg-[#993C1D] text-white hover:opacity-85',
  warning: 'bg-[#BA7517] text-white hover:opacity-85',
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
