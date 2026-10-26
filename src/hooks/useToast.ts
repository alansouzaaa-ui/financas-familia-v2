import { useCallback, useState } from 'react'

export interface ToastMsg { id: number; text: string }

/** Estado de um toast único. `show` reinicia o timer mesmo com texto repetido. */
export function useToast() {
  const [toast, setToast] = useState<ToastMsg | null>(null)
  const show = useCallback((text: string) => setToast({ id: Date.now() + Math.random(), text }), [])
  const clear = useCallback(() => setToast(null), [])
  return { toast, show, clear }
}
