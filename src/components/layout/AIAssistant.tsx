import { useState, useRef, useEffect } from 'react'
import { useAIChat } from '@/hooks/useAIChat'

const QUICK_PROMPTS = [
  'Diagnóstico geral das finanças',
  'Como reduzir dívidas de cartão?',
  'Projeção dos próximos 3 meses',
  'Qual meu maior risco atual?',
  'Dica para aumentar poupança',
]

function MarkdownText({ text }: { text: string }) {
  // Minimal markdown: **bold**, bullet lists, line breaks
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul class="list-disc pl-4 my-1">$1</ul>')
    .replace(/\n/g, '<br/>')
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

export default function AIAssistant() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const { messages, streaming, error, send, stop, clear } = useAIChat()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  function handleSend() {
    if (!input.trim() || streaming) return
    send(input.trim())
    setInput('')
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-20 md:bottom-6 right-4 z-50 w-12 h-12 rounded-full bg-[var(--color-text-primary)] text-[var(--color-surface)] shadow-lg flex items-center justify-center hover:opacity-85 transition-all"
        title="IA Financeira"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M7 8.5C7 7.1 8.1 6 9.5 6S12 7.1 12 8.5c0 1.2-.8 2.2-1.9 2.4L10 11v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <circle cx="10" cy="13.5" r=".6" fill="currentColor"/>
        </svg>
        {messages.length > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--color-pos)] rounded-full text-[9px] flex items-center justify-center text-white font-bold">
            {messages.filter(m => m.role === 'assistant').length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 md:bottom-20 right-4 z-50 w-[340px] md:w-[400px] max-h-[70vh] flex flex-col bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[var(--color-pos)] animate-pulse" />
              <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">IA Financeira</span>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={clear} className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-neg)] px-2 py-1 rounded transition-colors">
                  Limpar
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3 min-h-0">
            {messages.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] text-[var(--color-text-muted)] text-center mt-2">
                  Pergunte sobre suas finanças com base no histórico real do dashboard.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1 justify-center">
                  {QUICK_PROMPTS.map(p => (
                    <button
                      key={p}
                      onClick={() => { send(p) }}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-primary)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-[12px] text-[12px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[var(--color-text-primary)] text-[var(--color-surface)]'
                        : 'bg-[var(--color-surface-2)] text-[var(--color-text-primary)]'
                    }`}
                  >
                    {msg.role === 'assistant' && msg.content === '' && streaming ? (
                      <span className="inline-block w-1.5 h-3.5 bg-[var(--color-text-muted)] animate-pulse rounded-sm" />
                    ) : (
                      <MarkdownText text={msg.content} />
                    )}
                  </div>
                </div>
              ))
            )}
            {error && (
              <div className="text-[11px] text-[var(--color-neg)] text-center bg-[#FAECE7] dark:bg-[#993C1D]/20 rounded-[8px] px-3 py-2">
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-[var(--color-border)] p-3">
            {messages.length === 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {QUICK_PROMPTS.slice(0, 3).map(p => (
                  <button key={p} onClick={() => { send(p) }}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                    {p}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Pergunte sobre suas finanças..."
                disabled={streaming}
                rows={1}
                className="flex-1 resize-none px-3 py-2 text-[12px] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[10px] outline-none focus:border-[var(--color-text-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] disabled:opacity-50"
                style={{ maxHeight: 80 }}
                onInput={e => {
                  const t = e.currentTarget
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 80) + 'px'
                }}
              />
              {streaming ? (
                <button
                  onClick={stop}
                  className="p-2 rounded-[10px] bg-[var(--color-neg)] text-white transition-opacity hover:opacity-85 flex-shrink-0"
                  title="Parar geração"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor"/>
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="p-2 rounded-[10px] bg-[var(--color-text-primary)] text-[var(--color-surface)] transition-opacity hover:opacity-85 disabled:opacity-30 flex-shrink-0"
                  title="Enviar"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M12 7H2M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)] mt-1.5 text-center">
              Enter para enviar · Shift+Enter nova linha
            </div>
          </div>
        </div>
      )}
    </>
  )
}
