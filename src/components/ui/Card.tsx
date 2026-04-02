interface CardProps {
  children: React.ReactNode
  className?: string
  title?: string
  action?: React.ReactNode
}

export default function Card({ children, className = '', title, action }: CardProps) {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <div className="label">{title}</div>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
