import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchDividends } from '@/lib/dividendsService'
import type { DividendEvent } from '@/lib/dividends'

export type DividendEventsStatus = 'idle' | 'loading' | 'done' | 'failed'

/**
 * Busca os proventos assim que a página carrega (independe de card aberto).
 * `symbols` já devem ser `dividendSymbol`s. A chave é a lista ordenada e sem
 * duplicatas; respostas de uma chave antiga são ignoradas e os dados anteriores
 * ficam na tela enquanto os novos carregam.
 */
export function useDividendEvents(symbols: string[]): {
  events: Record<string, DividendEvent[]> | null
  status: DividendEventsStatus
  reload: () => void
} {
  const key = useMemo(() => [...new Set(symbols.filter(Boolean))].sort().join(','), [symbols])
  const [events, setEvents] = useState<Record<string, DividendEvent[]> | null>(null)
  const [doneKey, setDoneKey] = useState<{ key: string; failed: boolean } | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetchDividends(key.split(','))
      .then((res) => {
        if (cancelled) return
        const failed = Object.keys(res).length === 0
        if (!failed) setEvents(res)
        setDoneKey({ key, failed })
      })
      .catch(() => {
        if (!cancelled) setDoneKey({ key, failed: true })
      })
    return () => { cancelled = true }
  }, [key, nonce])

  const reload = useCallback(() => {
    setDoneKey(null)
    setNonce((n) => n + 1)
  }, [])

  let status: DividendEventsStatus
  if (!key) status = 'idle'
  else if (doneKey?.key !== key) status = 'loading'
  else status = doneKey.failed ? 'failed' : 'done'

  return { events: key ? events : null, status, reload }
}
