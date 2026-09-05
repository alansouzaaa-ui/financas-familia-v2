interface MoneyProps {
  value: number
  /** Mostra '+' para positivos além de '−' para negativos */
  signed?: boolean
  /** Casas decimais (default 0) */
  cents?: boolean
  /** Classes extras no wrapper — cor herda daqui (ex: 'pos', 'neg') */
  className?: string
}

// Trata o valor como dinheiro com o "R$" discreto (prefixo apagado e menor)
// e dígitos tabulares para alinhamento perfeito. O sinal usa o traço − (U+2212).
export default function Money({ value, signed = false, cents = false, className = '' }: MoneyProps) {
  const digits = Math.abs(value).toLocaleString('pt-BR', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })
  const sign = value < -0.005 ? '−' : signed && value > 0.005 ? '+' : ''

  return (
    <span className={`inline-flex items-baseline gap-[0.24em] font-mono tnum whitespace-nowrap ${className}`}>
      {sign && <span className="font-normal">{sign}</span>}
      <span className="font-normal opacity-40" style={{ fontSize: '0.6em', letterSpacing: 0 }}>R$</span>
      <span>{digits}</span>
    </span>
  )
}
