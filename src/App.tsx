import { HashRouter, Routes, Route } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import OverviewPage from '@/pages/Overview'
import MonthlyPage from '@/pages/Monthly'
import AnnualPage from '@/pages/Annual'
import GoalsPage from '@/pages/Goals'
import RecurringPage from '@/pages/Recurring'
import LaunchPage from '@/pages/Launch'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="mensal" element={<MonthlyPage />} />
          <Route path="anual" element={<AnnualPage />} />
          <Route path="metas" element={<GoalsPage />} />
          <Route path="recorrentes" element={<RecurringPage />} />
          <Route path="lancar" element={<LaunchPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
