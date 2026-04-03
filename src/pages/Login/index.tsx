import { useState } from 'react'

const APP_USER = import.meta.env.VITE_APP_USER || 'alan'
const APP_PASS = import.meta.env.VITE_APP_PASS || 'familia@2026'
const AUTH_KEY = 'ff_auth_v1'
const SESSION_DAYS = 7

export function isAuthenticated(): boolean {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return false
    const { expiry } = JSON.parse(raw)
    return typeof expiry === 'number' && Date.now() < expiry
  } catch {
    return false
  }
}

export function saveSession() {
  const expiry = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  localStorage.setItem(AUTH_KEY, JSON.stringify({ expiry }))
}

export function clearSession() {
  localStorage.removeItem(AUTH_KEY)
}

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [user, setUser]     = useState('')
  const [pass, setPass]     = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Pequeno delay para evitar brute-force
    setTimeout(() => {
      if (
        user.trim().toLowerCase() === APP_USER.toLowerCase() &&
        pass === APP_PASS
      ) {
        saveSession()
        onLogin()
      } else {
        setError('Usuário ou senha incorretos.')
        setLoading(false)
      }
    }, 600)
  }

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo / título */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1A1917] mb-4">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <path d="M4 19L9 12l4.5 4.5L20 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 6h3v3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-[22px] font-semibold text-[#1A1917]">Finanças</h1>
          <p className="text-[13px] text-[#6B6860] mt-1">Acesso restrito</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#E8E6E0] p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* Usuário */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6B6860] uppercase tracking-wider">
                Usuário
              </label>
              <input
                type="text"
                autoComplete="username"
                autoFocus
                value={user}
                onChange={e => setUser(e.target.value)}
                placeholder="seu usuário"
                required
                className="w-full px-3 py-2.5 text-[14px] font-sans bg-[#F7F6F3] border border-[#E8E6E0] rounded-[10px] text-[#1A1917] placeholder:text-[#BDBBB5] outline-none transition-colors focus:border-[#1A1917]"
              />
            </div>

            {/* Senha */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#6B6860] uppercase tracking-wider">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2.5 pr-10 text-[14px] font-sans bg-[#F7F6F3] border border-[#E8E6E0] rounded-[10px] text-[#1A1917] placeholder:text-[#BDBBB5] outline-none transition-colors focus:border-[#1A1917]"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6860] hover:text-[#1A1917] transition-colors"
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

            {/* Erro */}
            {error && (
              <div className="text-[13px] text-[#993C1D] bg-[#FFF1EC] border border-[#F4C4B0] rounded-[10px] px-3 py-2.5">
                {error}
              </div>
            )}

            {/* Botão */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1A1917] text-white text-[14px] font-medium py-2.5 rounded-[10px] transition-opacity hover:opacity-85 disabled:opacity-50 mt-1"
            >
              {loading ? 'Verificando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-[#BDBBB5] mt-6">
          Sessão válida por {SESSION_DAYS} dias
        </p>
      </div>
    </div>
  )
}
