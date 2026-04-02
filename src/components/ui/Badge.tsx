interface BadgeProps {
  children: React.ReactNode
  variant?: 'green' | 'red' | 'blue' | 'amber' | 'purple' | 'gray' | 'manual'
  size?: 'sm' | 'md'
}

const VARIANTS = {
  green:  'bg-[#E1F5EE] text-[#0F6E56]',
  red:    'bg-[#FAECE7] text-[#993C1D]',
  blue:   'bg-[#E8F0FB] text-[#185FA5]',
  amber:  'bg-[#FDF3E0] text-[#BA7517]',
  purple: 'bg-[#F0E8FA] text-[#6B3FA0]',
  gray:   'bg-[#F0EEE9] text-[#6B6860]',
  manual: 'bg-[#F0E8FA] text-[#6B3FA0]',
}

export default function Badge({ children, variant = 'gray', size = 'md' }: BadgeProps) {
  return (
    <span className={`
      inline-flex items-center font-semibold rounded-full uppercase tracking-wide
      ${size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5'}
      ${VARIANTS[variant]}
    `}>
      {children}
    </span>
  )
}
