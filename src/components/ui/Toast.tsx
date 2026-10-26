import { useEffect } from 'react'

import type { ToastMsg } from '@/hooks/useToast'

/** Aviso discreto, fixo na base (acima da navegação no celular), some sozinho em 3,5 s. */
export default function Toast({ toast, onClose, duration = 3500 }: { toast: ToastMsg | null; onClose: () => void; duration?: number }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [toast, duration, onClose])

  if (!toast) return null
  return (
    <div
      className="fixed inset-x-0 z-[70] flex justify-center px-4 pointer-events-none bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-6"
      role="status"
      aria-live="polite"
    >
      <div
        key={toast.id}
        className="pointer-events-auto animate-slide-up flex items-center gap-2.5 max-w-[min(92vw,420px)] pl-3.5 pr-1.5 py-1.5 rounded-full bg-[var(--color-text-primary)] text-[var(--color-bg)] shadow-xl text-[13px] font-medium"
      >
        <svg width="14" height="14" viewBox="0 0 10 10" fill="none" className="flex-shrink-0" aria-hidden="true">
          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="py-1">{toast.text}</span>
        <button
          onClick={onClose}
          aria-label="Fechar aviso"
          className="w-7 h-7 flex items-center justify-center rounded-full opacity-70 hover:opacity-100 hover:bg-white/10 transition-opacity"
        >
          <svg width="12" height="12" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>
    </div>
  )
}
