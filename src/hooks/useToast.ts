import { useCallback, useState } from 'react'

export interface ToastAction { label: string; onClick: () => void }
export interface ToastMsg { id: number; text: string; action?: ToastAction }

/** Estado de um toast único. `show` reinicia o timer mesmo com texto repetido. Com `action` (ex.: Desfazer) o aviso fica mais tempo. */
export function useToast() {
  const [toast, setToast] = useState<ToastMsg | null>(null)
  const show = useCallback((text: string, action?: ToastAction) => setToast({ id: Date.now() + Math.random(), text, action }), [])
  const clear = useCallback(() => setToast(null), [])
  return { toast, show, clear }
}
