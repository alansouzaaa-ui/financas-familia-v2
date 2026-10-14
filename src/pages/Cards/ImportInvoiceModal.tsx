import { useEffect, useMemo, useRef, useState } from 'react'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useCategoriesStore } from '@/stores/useCategoriesStore'
import { fmt } from '@/lib/formatters'
import {
  buildDrafts, reconcile, draftsToItems,
  type DraftLine, type Extraction,
} from '@/lib/invoiceImport'
import type { MonthAbbr, MonthItem } from '@/types/finance'

const MONTHS: { value: MonthAbbr; label: string }[] = [
  { value: 'Jan', label: 'Janeiro' }, { value: 'Fev', label: 'Fevereiro' },
  { value: 'Mar', label: 'Março' },   { value: 'Abr', label: 'Abril' },
  { value: 'Mai', label: 'Maio' },    { value: 'Jun', label: 'Junho' },
  { value: 'Jul', label: 'Julho' },   { value: 'Ago', label: 'Agosto' },
  { value: 'Set', label: 'Setembro' },{ value: 'Out', label: 'Outubro' },
  { value: 'Nov', label: 'Novembro' },{ value: 'Dez', label: 'Dezembro' },
]

// A Vercel limita o corpo da requisição a ~4,5 MB; em base64 o PDF cresce ~33%.
const MAX_BYTES = 3 * 1024 * 1024
const GENERIC_ERROR = 'Não foi possível ler a fatura.'

interface Props {
  cardId: string
  cardName: string
  defaultYear: number
  defaultMonth: MonthAbbr
  onClose: () => void
  onImported: (year: number, month: MonthAbbr, count: number) => void
}

type Step = 'pick' | 'loading' | 'error' | 'review'

function fmtDateBR(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
function fmtDM(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[2]}/${m[1]}` : iso
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result ?? '')
      const i = s.indexOf(',')
      resolve(i >= 0 ? s.slice(i + 1) : s)
    }
    r.onerror = () => reject(new Error('read'))
    r.readAsDataURL(file)
  })
}

export default function ImportInvoiceModal({ cardId, cardName, defaultYear, defaultMonth, onClose, onImported }: Props) {
  const allMonths = useFinanceStore(s => s.allMonths)
  const upsertItem = useFinanceStore(s => s.upsertItem)
  const tags = useCategoriesStore(s => s.tags)

  const [step, setStep] = useState<Step>('pick')
  const [error, setError] = useState('')
  const [extraction, setExtraction] = useState<Extraction | null>(null)
  const [drafts, setDrafts] = useState<DraftLine[]>([])
  const [month, setMonth] = useState<MonthAbbr>(defaultMonth)
  const [year, setYear] = useState<number>(defaultYear)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  function fail(msg: string) { setError(msg); setStep('error') }

  async function onFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_BYTES) { fail('O arquivo é maior que 3 MB. Envie um PDF menor.'); return }
    if (file.type && file.type !== 'application/pdf') { fail('Envie um arquivo PDF.'); return }
    setStep('loading')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const pdfBase64 = await readBase64(file)
      const res = await fetch('/api/import-invoice', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64 }),
        signal: ctrl.signal,
      })
      let data: { ok?: boolean; error?: string; extraction?: Extraction } | null = null
      try { data = await res.json() } catch { data = null }
      if (ctrl.signal.aborted) return
      if (!res.ok || !data || !data.ok || !data.extraction) {
        fail(data?.error || GENERIC_ERROR)
        return
      }
      const ex = data.extraction
      // Mês-alvo: mês do vencimento, se houver
      let ty = defaultYear
      let tm = defaultMonth
      const due = ex.dueDate ? /^(\d{4})-(\d{2})-\d{2}/.exec(ex.dueDate) : null
      if (due) {
        const idx = Number(due[2]) - 1
        if (idx >= 0 && idx < 12) { ty = Number(due[1]); tm = MONTHS[idx].value }
      }
      const existing = allMonths.flatMap(r => r.items ?? []).filter((i): i is MonthItem => !!i)
      setExtraction(ex)
      setDrafts(buildDrafts(ex, { cardId, fallbackYear: ty, existing }))
      setYear(ty); setMonth(tm)
      setStep('review')
    } catch (e) {
      if ((e as Error)?.name === 'AbortError' || ctrl.signal.aborted) return
      fail(GENERIC_ERROR)
    }
  }

  function cancelLoading() {
    abortRef.current?.abort()
    onClose()
  }

  function patch(key: string, p: Partial<DraftLine>) {
    setDrafts(ds => ds.map(d => d.key === key ? { ...d, ...p } : d))
  }

  const check = useMemo(
    () => reconcile(
      drafts.map(d => d.status === 'ignored' ? d : { ...d, include: true }),
      extraction?.totalAmount ?? null,
    ),
    [drafts, extraction],
  )
  const selected = drafts.filter(d => d.include && (d.status === 'new' || d.status === 'duplicate'))
  const selectedSum = Math.round(selected.reduce((s, d) => s + d.value, 0) * 100) / 100

  const sorted = useMemo(
    () => [...drafts.filter(d => d.status !== 'ignored'), ...drafts.filter(d => d.status === 'ignored')],
    [drafts],
  )
  const tagMap = useMemo(() => Object.fromEntries(tags.map(t => [t.id, t])), [tags])

  function doImport() {
    if (selected.length === 0) return
    const mIdx = MONTHS.findIndex(m => m.value === month)
    const monthKey = `${year}-${String(mIdx + 1).padStart(2, '0')}`
    const items = draftsToItems(drafts, cardId, monthKey)
    items.forEach(it => upsertItem(year, month, it))
    onImported(year, month, items.length)
    onClose()
  }

  const years = useMemo(() => {
    const base = new Date().getFullYear()
    const set = new Set<number>([base - 2, base - 1, base, base + 1, year, defaultYear])
    return [...set].sort((a, b) => a - b)
  }, [year, defaultYear])

  const selectCls = 'px-2.5 py-2 text-[13px] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[8px] outline-none focus:border-[var(--color-text-primary)]'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={step === 'loading' ? undefined : onClose} />
      <div className="relative w-full sm:max-w-[760px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <h2 className="text-[17px] font-semibold truncate">Importar fatura · {cardName}</h2>
          <button
            onClick={step === 'loading' ? cancelLoading : onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] p-1"
            aria-label="Fechar"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {step === 'pick' && (
          <div className="px-5 pb-5 flex flex-col gap-4">
            <p className="text-[13px] text-[var(--color-text-muted)]">
              Selecione o PDF da fatura. A leitura é feita por IA e pode levar até 1 minuto. Revise antes de importar.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              onChange={e => { void onFile(e.target.files?.[0]); e.target.value = '' }}
              className="block w-full text-[13px] file:mr-3 file:px-3 file:py-2 file:rounded-[8px] file:border-0 file:bg-[var(--color-primary)] file:text-white file:font-semibold file:cursor-pointer"
            />
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2.5 rounded-[10px] text-[14px] font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {step === 'loading' && (
          <div className="px-5 pb-6 flex flex-col items-center gap-4 py-6">
            <div className="w-9 h-9 rounded-full border-[3px] border-[var(--color-border)] border-t-[var(--color-primary)] animate-spin" />
            <p className="text-[14px] font-medium">Lendo fatura…</p>
            <p className="text-[12px] text-[var(--color-text-muted)] text-center">Isso pode levar até 1 minuto.</p>
            <button onClick={cancelLoading} className="px-4 py-2.5 rounded-[10px] text-[14px] font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
              Cancelar
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="px-5 pb-5 flex flex-col gap-4">
            <p className="text-[13px] neg">{error || GENERIC_ERROR}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2.5 rounded-[10px] text-[14px] font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                Cancelar
              </button>
              <button onClick={() => setStep('pick')} className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity">
                Tentar outro arquivo
              </button>
            </div>
          </div>
        )}

        {step === 'review' && extraction && (
          <>
            <div className="px-5 pb-3 flex-shrink-0 flex flex-col gap-3">
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-[var(--color-text-muted)]">
                {extraction.issuer && <span>Emissor: <strong className="text-[var(--color-text-primary)]">{extraction.issuer}</strong></span>}
                <span>Vencimento: <strong className="text-[var(--color-text-primary)]">{fmtDateBR(extraction.dueDate)}</strong></span>
                <span>Total da fatura: <strong className="font-mono text-[var(--color-text-primary)]">{extraction.totalAmount != null ? fmt(extraction.totalAmount) : '—'}</strong></span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="label">Lançar na fatura de</span>
                <select value={month} onChange={e => setMonth(e.target.value as MonthAbbr)} className={selectCls}>
                  {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select value={year} onChange={e => setYear(Number(e.target.value))} className={selectCls}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Lista de linhas (rola internamente) */}
            <div className="flex-1 min-h-0 overflow-auto border-y border-[var(--color-border)]">
              {sorted.length === 0 && (
                <p className="px-5 py-6 text-[13px] text-[var(--color-text-muted)]">Nenhuma linha encontrada na fatura.</p>
              )}
              {sorted.map(d => {
                const ignored = d.status === 'ignored'
                const tg = d.tag ? tagMap[d.tag] : null
                return (
                  <div
                    key={d.key}
                    className={`flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)] last:border-0 min-w-[520px] ${ignored || d.status === 'already-imported' ? 'opacity-55' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={d.include}
                      disabled={ignored}
                      onChange={e => patch(d.key, { include: e.target.checked })}
                      className="w-4 h-4 flex-shrink-0"
                      aria-label="Incluir lançamento"
                    />
                    <span className="font-mono text-[12px] text-[var(--color-text-muted)] w-[40px] flex-shrink-0">{fmtDM(d.date)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] truncate" title={d.description}>{d.description}</div>
                      {d.status === 'duplicate' && (
                        <span className="inline-block text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--color-chart-amber)]/[0.15] text-[var(--color-chart-amber)]" title={d.reason}>possível duplicata</span>
                      )}
                      {d.status === 'already-imported' && (
                        <span className="inline-block text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-muted)]" title={d.reason}>já importado</span>
                      )}
                      {ignored && (
                        <span className="inline-block text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-muted)]" title={d.reason}>ignorado{d.reason ? ` · ${d.reason}` : ''}</span>
                      )}
                    </div>
                    <span className={`font-mono text-[13px] font-semibold whitespace-nowrap ${d.value < 0 ? 'pos' : ''}`}>{fmt(d.value)}</span>
                    <select
                      value={d.tag ?? ''}
                      onChange={e => patch(d.key, { tag: e.target.value || undefined })}
                      disabled={ignored}
                      title={tg ? `Categoria: ${tg.label}` : 'Escolher categoria'}
                      className="w-[110px] flex-shrink-0 h-[34px] px-1.5 text-[12px] rounded-[8px] outline-none border border-[var(--color-border)] bg-[var(--color-surface-2)]"
                      style={tg ? { backgroundColor: tg.color + '26', color: tg.color, borderColor: 'transparent' } : undefined}
                    >
                      <option value="">🏷️ —</option>
                      {tags.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
                    </select>
                  </div>
                )
              })}
            </div>

            {/* Conferência + ações */}
            <div className="px-5 py-4 flex-shrink-0 flex flex-col gap-3">
              <div className="text-[12.5px] flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="text-[var(--color-text-muted)]">
                    Soma das linhas <span className="font-mono">{fmt(check.sum)}</span> · Total da fatura <span className="font-mono">{check.total != null ? fmt(check.total) : '—'}</span>
                  </span>
                  {check.total != null && (check.ok
                    ? <span className="pos font-medium">✓ Confere</span>
                    : <span className="font-medium text-[var(--color-chart-amber)]">Diferença de {fmt(Math.abs(check.diff ?? 0))}</span>)}
                </div>
                <div className="text-[var(--color-text-muted)]">
                  {selected.length} {selected.length === 1 ? 'lançamento será importado' : 'lançamentos serão importados'} · <span className="font-mono">{fmt(selectedSum)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-[10px] text-[14px] font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={doImport}
                  disabled={selected.length === 0}
                  className="flex-1 py-2.5 rounded-[10px] text-[14px] font-semibold bg-[var(--color-primary)] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  Importar {selected.length} {selected.length === 1 ? 'lançamento' : 'lançamentos'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
