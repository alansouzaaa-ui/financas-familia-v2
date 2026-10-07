import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_QUESTIONS, type Answers, type ChecklistKind, type ChecklistQuestion } from '@/lib/checklist'

// Perguntas editáveis e respostas por ticker (MAIÚSCULO). Sincronizado em `checklist`.
interface ChecklistStore {
  questions: Record<ChecklistKind, ChecklistQuestion[]>
  answers: Record<string, Answers>
  setAnswer: (ticker: string, qid: string, v: boolean | null) => void
  addQuestion: (kind: ChecklistKind, text: string) => void
  updateQuestion: (kind: ChecklistKind, id: string, text: string) => void
  removeQuestion: (kind: ChecklistKind, id: string) => void
  resetQuestions: (kind: ChecklistKind) => void
  hydrate: (data: unknown) => void
}

const KINDS: ChecklistKind[] = ['acao', 'fii']
const clean = (t: string) => t.trim().slice(0, 140)
const cloneDefaults = (kind: ChecklistKind) => DEFAULT_QUESTIONS[kind].map((q) => ({ ...q }))

export const useChecklistStore = create<ChecklistStore>()(
  persist(
    (set, get) => ({
      questions: { acao: cloneDefaults('acao'), fii: cloneDefaults('fii') },
      answers: {},
      setAnswer: (ticker, qid, v) => set((s) => {
        const t = ticker.trim().toUpperCase()
        if (!t) return {}
        const cur = { ...(s.answers[t] ?? {}) }
        if (v === null) delete cur[qid]
        else cur[qid] = v
        const answers = { ...s.answers }
        if (Object.keys(cur).length === 0) delete answers[t]
        else answers[t] = cur
        return { answers }
      }),
      addQuestion: (kind, text) => set((s) => {
        const t = clean(text)
        if (!t) return {}
        const id = `${kind[0]}-${Date.now().toString(36)}`
        return { questions: { ...s.questions, [kind]: [...s.questions[kind], { id, text: t }] } }
      }),
      updateQuestion: (kind, id, text) => set((s) => {
        const t = clean(text)
        if (!t) return {}
        return {
          questions: {
            ...s.questions,
            [kind]: s.questions[kind].map((q) => (q.id === id ? { ...q, text: t } : q)),
          },
        }
      }),
      removeQuestion: (kind, id) => set((s) => {
        const answers: Record<string, Answers> = {}
        for (const [tk, a] of Object.entries(s.answers)) {
          const rest = { ...a }
          delete rest[id]
          if (Object.keys(rest).length > 0) answers[tk] = rest
        }
        return {
          questions: { ...s.questions, [kind]: s.questions[kind].filter((q) => q.id !== id) },
          answers,
        }
      }),
      resetQuestions: (kind) => set((s) => ({ questions: { ...s.questions, [kind]: cloneDefaults(kind) } })),
      hydrate: (data) => {
        if (!data || typeof data !== 'object') return
        const d = data as Record<string, unknown>
        const questions = { ...get().questions }
        const rq = d.questions
        if (rq && typeof rq === 'object' && !Array.isArray(rq)) {
          for (const kind of KINDS) {
            const arr = (rq as Record<string, unknown>)[kind]
            if (!Array.isArray(arr) || arr.length === 0) continue
            const ok = arr.every((q) => {
              const o = q as Partial<ChecklistQuestion> | null
              return !!o && typeof o === 'object' && typeof o.id === 'string' && typeof o.text === 'string'
            })
            if (ok) questions[kind] = (arr as ChecklistQuestion[]).map((q) => ({ id: q.id, text: q.text }))
          }
        }
        const answers: Record<string, Answers> = {}
        const ra = d.answers
        if (ra && typeof ra === 'object' && !Array.isArray(ra)) {
          for (const [tk, a] of Object.entries(ra as Record<string, unknown>)) {
            if (!a || typeof a !== 'object' || Array.isArray(a)) continue
            const out: Answers = {}
            for (const [qid, v] of Object.entries(a as Record<string, unknown>)) {
              if (typeof v === 'boolean') out[qid] = v
            }
            if (Object.keys(out).length > 0) answers[tk] = out
          }
        }
        set({ questions, answers })
      },
    }),
    { name: 'checklist-store' }
  )
)
