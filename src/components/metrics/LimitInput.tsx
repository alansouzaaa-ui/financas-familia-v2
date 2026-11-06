import { useState } from 'react'

export default function LimitInput({ value, onCommit, label }: { value: number | null; onCommit: (v: number | null) => void; label: string }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  const commit = () => {
    const n = parseFloat(draft.replace(',', '.'))
    onCommit(Number.isFinite(n) && n > 0 ? n : null)
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`Limite de ${label}`}
      placeholder="sem limite"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur() } }}
      className="w-28 px-2 py-1 text-[12px] font-mono text-right bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-text-primary)]"
    />
  )
}
