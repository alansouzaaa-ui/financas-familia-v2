import { useState, useRef } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'

const EDGE_URL = 'https://wmisuthjiwrojjsbtlbm.supabase.co/functions/v1/analyze-finances'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function buildContext(months: ReturnType<typeof useFinanceStore.getState>['allMonths']): string {
  const last12 = months.slice(-12)
  const lines = last12.map(m =>
    `${m.label}: receita=${m.revenue.toFixed(0)}, fixos=${m.fixedCosts.toFixed(0)}, ` +
    `variáveis=${(m.variableCosts ?? 0).toFixed(0)}, empréstimos=${m.loans.toFixed(0)}, ` +
    `cartões=${m.cards.toFixed(0)}, balanço=${m.balance.toFixed(0)}`
  )
  const last = months[months.length - 1]
  const totalRev = months.reduce((s, m) => s + m.revenue, 0)
  const totalExp = months.reduce((s, m) => s + m.totalExpenses, 0)
  return [
    `Histórico dos últimos ${last12.length} meses:`,
    ...lines,
    '',
    `Totais históricos (${months.length} meses): receita acumulada=${totalRev.toFixed(0)}, despesas acumuladas=${totalExp.toFixed(0)}`,
    `Último mês registrado: ${last?.label ?? 'N/A'}`,
  ].join('\n')
}

export function useAIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function send(question: string) {
    if (!question.trim() || streaming) return

    setError(null)
    const context = buildContext(useFinanceStore.getState().allMonths)

    const userMsg: ChatMessage = { role: 'user', content: question }
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }])
    setStreaming(true)

    abortRef.current = new AbortController()

    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context }),
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => 'Erro ao conectar com a IA')
        throw new Error(txt)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const json = JSON.parse(data)
            // Anthropic SSE delta format
            const delta = json.delta?.text ?? json.content?.[0]?.text ?? ''
            if (delta) {
              setMessages(prev => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: last.content + delta }
                }
                return updated
              })
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError('Não foi possível conectar à IA. Verifique sua conexão.')
        setMessages(prev => prev.slice(0, -1)) // remove empty assistant msg
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  function clear() {
    if (!streaming) setMessages([])
  }

  return { messages, streaming, error, send, stop, clear }
}
