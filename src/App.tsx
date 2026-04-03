import { useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import OverviewPage from '@/pages/Overview'
import MonthlyPage from '@/pages/Monthly'
import AnnualPage from '@/pages/Annual'
import GoalsPage from '@/pages/Goals'
import RecurringPage from '@/pages/Recurring'
import LaunchPage from '@/pages/Launch'
import InvestmentsPage from '@/pages/Investments'
import LoginPage, { isAuthenticated } from '@/pages/Login'

export default function App() {
  const [authed, setAuthed] = useState<boolean>(isAuthenticated)

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppShell onLogout={() => setAuthed(false)} />}>
          <Route index element={<OverviewPage />} />
          <Route path="mensal" element={<MonthlyPage />} />
          <Route path="anual" element={<AnnualPage />} />
          <Route path="metas" element={<GoalsPage />} />
          <Route path="recorrentes" element={<RecurringPage />} />
          <Route path="lancar" element={<LaunchPage />} />
          <Route path="investimentos" element={<InvestmentsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
