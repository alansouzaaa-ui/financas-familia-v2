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
          bg-[#F7F6F3] border border-[#E8E6E0] rounded-[10px]
          text-[#1A1917] outline-none transition-colors
          focus:border-[#1A1917] cursor-pointer
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
