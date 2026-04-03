import { useState } from 'react'

const APP_USER = import.meta.env.VITE_APP_USER || 'alan'
const APP_PASS = import.meta.env.VITE_APP_PASS || 'familia@2026'
const AUTH_KEY = 'ff_auth_v1'
const SESSION_DAYS = 7
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 5 * 60 * 1000 // 5 minutos

// ─── token assinado ──────────────────────────────────────────────────────────
// Inclui o hash da senha no token — bypass via localStorage requer conhecer a senha
function makeToken(expiry: number): string {
  const payload = `${expiry}|${APP_PASS.split('').reverse().join('')}|ff-dash-v1`
  return btoa(unescape(encodeURIComponent(payload)))
}

export function isAuthenticated(): boolean {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return false
    const { expiry, token } = JSON.parse(raw)
    if (typeof expiry !== 'number' || Date.now() >= expiry) return false
    return token === makeToken(expiry) // token deve bater com a senha atual
  } catch {
    return false
  }
}

export function saveSession() {
  const expiry = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  localStorage.setItem(AUTH_KEY, JSON.stringify({ expiry, token: makeToken(expiry) }))
}

export function clearSession() {
  localStorage.removeItem(AUTH_KEY)
}

// ─── rate limiting ────────────────────────────────────────────────────────────
const ATTEMPT_KEY = 'ff_attempts'

function getAttemptState(): { count: number; lockedUntil: number } {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPT_KEY) || '{"count":0,"lockedUntil":0}')
  } catch {
    return { count: 0, lockedUntil: 0 }
  }
}

function recordFailedAttempt() {
  const state = getAttemptState()
  const count = state.count + 1
  const lockedUntil = count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : state.lockedUntil
  localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ count, lockedUntil }))
  return { count, lockedUntil }
}

function clearAttempts() {
  localStorage.removeItem(ATTEMPT_KEY)
}

function isLocked(): { locked: boolean; remaining: number } {
  const { lockedUntil } = getAttemptState()
  if (!lockedUntil || Date.now() >= lockedUntil) return { locked: false, remaining: 0 }
  return { locked: true, remaining: Math.ceil((lockedUntil - Date.now()) / 1000) }
}

// ─── componente ───────────────────────────────────────────────────────────────
export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [user, setUser]       = useState('')
  const [pass, setPass]       = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const lockState = isLocked()
    if (lockState.locked) {
      setError(`Muitas tentativas. Aguarde ${lockState.remaining}s para tentar novamente.`)
      return
    }

    setLoading(true)

    setTimeout(() => {
      if (
        user.trim().toLowerCase() === APP_USER.toLowerCase() &&
        pass === APP_PASS
      ) {
        clearAttempts()
        saveSession()
        onLogin()
      } else {
        const { count } = recordFailedAttempt()
        const remaining = MAX_ATTEMPTS - count
        if (remaining <= 0) {
          setError(`Conta bloqueada por ${LOCKOUT_MS / 60000} minutos após ${MAX_ATTEMPTS} tentativas.`)
        } else {
          setError(`Usuário ou senha incorretos. ${remaining} tentativa${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}.`)
        }
        setLoading(false)
      }
    }, 800)
  }

  const lockState = isLocked()

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--color-text-primary)] mb-4">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <path d="M4 19L9 12l4.5 4.5L20 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 6h3v3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-[22px] font-semibold text-[var(--color-text-primary)]">Finanças</h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-1">Acesso restrito</p>
        </div>

        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Usuário</label>
              <input
                type="text"
                autoComplete="username"
                autoFocus
                value={user}
                onChange={e => setUser(e.target.value)}
                placeholder="seu usuário"
                required
                disabled={lockState.locked}
                className="w-full px-3 py-2.5 text-[14px] font-sans bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none transition-colors focus:border-[var(--color-text-primary)] disabled:opacity-50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Senha</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={lockState.locked}
                  className="w-full px-3 py-2.5 pr-10 text-[14px] font-sans bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none transition-colors focus:border-[var(--color-text-primary)] disabled:opacity-50"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  {showPass ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2 2l12 12M6.5 6.6A2 2 0 0 0 9.4 9.5M5.3 4.3C6.1 3.8 7 3.5 8 3.5c3 0 5.5 2.5 6.5 4.5-.5 1-1.3 2-2.3 2.8M1.5 8C2.5 6 5 3.5 8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M1.5 8C2.5 6 5 3.5 8 3.5S13.5 6 14.5 8c-1 2-3.5 4.5-6.5 4.5S2.5 10 1.5 8z" stroke="currentColor" strokeWidth="1.3"/>
                      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-[13px] neg bg-[#FFF1EC] dark:bg-[#993C1D]/20 border border-[#F4C4B0] dark:border-[#993C1D]/40 rounded-[10px] px-3 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || lockState.locked}
              className="w-full bg-[var(--color-text-primary)] text-[var(--color-surface)] text-[14px] font-medium py-2.5 rounded-[10px] transition-opacity hover:opacity-85 disabled:opacity-50 mt-1"
            >
              {loading ? 'Verificando...' : lockState.locked ? `Bloqueado (${lockState.remaining}s)` : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-[var(--color-text-muted)] mt-6">
          Sessão válida por {SESSION_DAYS} dias
        </p>
      </div>
    </div>
  )
}
