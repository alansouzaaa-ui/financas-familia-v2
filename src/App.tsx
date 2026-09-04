import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import OverviewPage from '@/pages/Overview'
import MonthlyPage from '@/pages/Monthly'
import AnnualPage from '@/pages/Annual'
import GoalsPage from '@/pages/Goals'
import RecurringPage from '@/pages/Recurring'
import LaunchPage from '@/pages/Launch'
import CardsPage from '@/pages/Cards'
import ReportsPage from '@/pages/Reports'
import InvestmentsPage from '@/pages/Investments'
import LoginPage from '@/pages/Login'
import { checkSession, clearSession } from '@/pages/Login/auth'

export default function App() {
  // null = loading, true = authenticated, false = not authenticated
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    checkSession().then((ok: boolean) => setAuthed(ok))
  }, [])

  async function handleLogout() {
    await clearSession()
    setAuthed(false)
  }

  if (authed === null) {
    // Loading state while checking session
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[var(--color-text-muted)] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppShell onLogout={handleLogout} />}>
          <Route index element={<OverviewPage />} />
          <Route path="mensal" element={<MonthlyPage />} />
          <Route path="anual" element={<AnnualPage />} />
          <Route path="metas" element={<GoalsPage />} />
          <Route path="recorrentes" element={<RecurringPage />} />
          <Route path="lancar" element={<LaunchPage />} />
          <Route path="cartoes" element={<CardsPage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="investimentos" element={<InvestmentsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
