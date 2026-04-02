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
          bg-[#F7F6F3] border border-[#E8E6E0] rounded-[10px]
          text-[#1A1917] placeholder:text-[#6B6860]
          outline-none transition-colors
          focus:border-[#1A1917]
          ${error ? 'border-[#993C1D]' : ''}
          ${className}
        `}
        {...props}
      />
      {error && <span className="text-[11px] text-[#993C1D]">{error}</span>}
    </div>
  )
}
