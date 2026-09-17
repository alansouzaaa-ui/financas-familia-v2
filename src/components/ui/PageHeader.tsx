import type { ReactNode } from 'react'

interface Props {
  eyebrow?: string
  title: string
  subtitle?: ReactNode
  children?: ReactNode   // ações à direita (filtros, botões)
}

// Cabeçalho editorial padrão das telas: eyebrow (régua verde/dourado) +
// título serifado (Fraunces) + subtítulo. Dá identidade e ritmo consistentes.
export default function PageHeader({ eyebrow, title, subtitle, children }: Props) {
  return (
    <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-5">
      <div className="min-w-0">
        {eyebrow && <p className="section-head label">{eyebrow}</p>}
        <h1 className="display text-[clamp(22px,3.4vw,27px)] tracking-[-0.015em] mt-1.5">{title}</h1>
        {subtitle && <p className="text-[13px] text-[var(--color-text-muted)] mt-1.5 max-w-[62ch]">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 flex-shrink-0">{children}</div>}
    </header>
  )
}
