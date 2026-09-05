import { useId } from 'react'

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  stroke?: string
  className?: string
  /** Desenha a linha do zero quando o intervalo cruza o zero */
  zeroLine?: boolean
}

// Linha de tendência minimalista com área suave e ponto final.
// Serve para dar o "sentido" (subindo/descendo) num relance, sem eixos nem grade.
export default function Sparkline({
  data,
  width = 128,
  height = 40,
  stroke = 'var(--color-pos)',
  className = '',
  zeroLine = true,
}: SparklineProps) {
  const gid = useId().replace(/:/g, '')
  if (!data || data.length < 2) return null

  const pad = 3
  const min = Math.min(...data, 0)
  const max = Math.max(...data, 0)
  const span = max - min || 1
  const x = (i: number) => pad + (i / (data.length - 1)) * (width - pad * 2)
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2)

  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(height - pad).toFixed(1)} L${x(0).toFixed(1)},${(height - pad).toFixed(1)} Z`
  const lastX = x(data.length - 1)
  const lastY = y(data[data.length - 1])
  const zeroY = y(0)
  const showZero = zeroLine && min < 0 && max > 0

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`sg-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showZero && (
        <line x1={pad} y1={zeroY} x2={width - pad} y2={zeroY} stroke="var(--color-text-muted)" strokeWidth="1" strokeDasharray="2 3" opacity="0.35" />
      )}
      <path d={area} fill={`url(#sg-${gid})`} />
      <path d={line} stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.6" fill={stroke} />
      <circle cx={lastX} cy={lastY} r="5" fill={stroke} opacity="0.16" />
    </svg>
  )
}
