interface SkeletonProps {
  className?: string
  /** atalho para largura via style (ex: '60%', 120) */
  w?: string | number
  h?: string | number
  rounded?: string
}

// Bloco de carregamento (shimmer). Use para reservar o espaço do conteúdo
// enquanto os dados chegam — nunca por cima de dados já visíveis.
export default function Skeleton({ className = '', w, h, rounded = 'rounded-[8px]' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-[var(--color-surface-2)] ${rounded} ${className}`}
      style={{ width: w, height: h }}
      aria-hidden="true"
    />
  )
}

// Cartão-esqueleto no formato de um KPI/tile.
export function SkeletonCard({ lines = 2, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`card flex flex-col gap-3 ${className}`}>
      <Skeleton w="45%" h={11} />
      <Skeleton w="70%" h={24} rounded="rounded-[6px]" />
      {lines > 2 && <Skeleton w="35%" h={11} />}
    </div>
  )
}
