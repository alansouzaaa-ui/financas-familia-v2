interface BadgeProps {
  children: React.ReactNode
  variant?: 'green' | 'red' | 'blue' | 'amber' | 'purple' | 'gray' | 'manual'
  size?: 'sm' | 'md'
}

const VARIANTS = {
  green:  'bg-[#E1F5EE] text-[#0F6E56] dark:bg-[#0F6E56]/20 dark:text-[#2DD4A0]',
  red:    'bg-[#FAECE7] text-[#993C1D] dark:bg-[#993C1D]/20 dark:text-[#F07050]',
  blue:   'bg-[#E8F0FB] text-[#185FA5] dark:bg-[#185FA5]/20 dark:text-[#60A5FA]',
  amber:  'bg-[#FDF3E0] text-[#BA7517] dark:bg-[#BA7517]/20 dark:text-[#FBBF24]',
  purple: 'bg-[#F0E8FA] text-[#6B3FA0] dark:bg-[#6B3FA0]/20 dark:text-[#C084FC]',
  gray:   'bg-[#F0EEE9] text-[#6B6860] dark:bg-[var(--color-surface-2)] dark:text-[var(--color-text-muted)]',
  manual: 'bg-[#F0E8FA] text-[#6B3FA0] dark:bg-[#6B3FA0]/20 dark:text-[#C084FC]',
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
