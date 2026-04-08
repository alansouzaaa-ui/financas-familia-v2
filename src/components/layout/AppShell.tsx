import { Outlet, useLocation, NavLink } from 'react-router-dom'
import { clearSession } from '@/pages/Login'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useSyncManager, type SyncStatus } from '@/hooks/useSyncManager'
import { isSupabaseConfigured } from '@/config/supabase'

const NAV_ITEMS = [
  {
    to: '/',
    label: 'Geral',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="2" width="7" height="7" rx="1.5" fill="currentColor" opacity=".8"/>
        <rect x="11" y="2" width="7" height="7" rx="1.5" fill="currentColor" opacity=".4"/>
        <rect x="2" y="11" width="7" height="7" rx="1.5" fill="currentColor" opacity=".4"/>
        <rect x="11" y="11" width="7" height="7" rx="1.5" fill="currentColor" opacity=".8"/>
      </svg>
    ),
  },
  {
    to: '/mensal',
    label: 'Mensal',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="5" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M6 5V3M14 5V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M2 9h16" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    to: '/anual',
    label: 'Anual',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 14L7 9l3.5 3.5L17 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    to: '/metas',
    label: 'Metas',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="10" cy="10" r="1" fill="currentColor"/>
      </svg>
    ),
  },
  {
    to: '/investimentos',
    label: 'Invest.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 13L7.5 8l3 3L17 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 4h3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 17h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    to: '/lancar',
    label: 'Lançar',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M10 7v6M7 10h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
]

function SyncIndicator({ status, lastSync, onPull }: { status: SyncStatus; lastSync: Date | null; onPull: () => void }) {
  if (!isSupabaseConfigured) return null

  const color =
    status === 'synced'  ? 'text-[var(--color-pos)]' :
    status === 'syncing' ? 'text-blue-500 animate-pulse' :
    status === 'error'   ? 'text-[var(--color-neg)]' :
    'text-[var(--color-text-muted)]'

  const title =
    status === 'synced'  ? `Sincronizado${lastSync ? ` às ${lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}` :
    status === 'syncing' ? 'Sincronizando...' :
    status === 'error'   ? 'Erro de sincronização — clique para tentar novamente' :
    'Aguardando sincronização'

  return (
    <button
      onClick={onPull}
      title={title}
      className={`p-1.5 rounded-lg transition-colors hover:bg-[var(--color-surface-2)] ${color}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M13 8A5 5 0 1 1 3 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M13 5v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M13.5 10.5A6 6 0 0 1 5.5 2.5a6 6 0 1 0 8 8z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function SidebarNav({ onLogout, syncStatus, lastSync, onPull }: { onLogout: () => void; syncStatus: SyncStatus; lastSync: Date | null; onPull: () => void }) {
  const { isDark, toggle } = useDarkMode()

  return (
    <aside className="hidden md:flex flex-col w-52 min-h-screen bg-[var(--color-surface)] border-r border-[var(--color-border)] px-3 py-5 flex-shrink-0 transition-colors duration-200">
      <div className="px-2 mb-6 flex items-center justify-between">
        <div>
          <div className="font-semibold text-[15px] text-[var(--color-text-primary)]">Finanças</div>
          <div className="text-[11px] text-[var(--color-text-muted)] font-mono mt-0.5">Jul/2021 – hoje</div>
        </div>
        <div className="flex items-center gap-0.5">
          <SyncIndicator status={syncStatus} lastSync={lastSync} onPull={onPull} />
          <button
            onClick={toggle}
            title={isDark ? 'Modo claro' : 'Modo escuro'}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] transition-all duration-150 ` +
              (isActive
                ? 'bg-[var(--color-text-primary)] text-[var(--color-surface)] font-medium'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]')
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={onLogout}
        className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] text-[var(--color-text-muted)] hover:bg-[#FFF1EC] dark:hover:bg-[#2A1A14] hover:text-[#993C1D] dark:hover:text-[#F07050] transition-all duration-150 mt-2"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M7 3H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M12 12l3-3-3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M15 9H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        Sair
      </button>
    </aside>
  )
}

function BottomNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--color-surface)] border-t border-[var(--color-border)] transition-colors duration-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ` +
              (isActive ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]')
            }
          >
            {({ isActive }) => (
              <>
                <span className={`p-1.5 rounded-[10px] transition-colors ${isActive ? 'bg-[var(--color-surface-2)]' : ''}`}>
                  {item.icon}
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export default function AppShell({ onLogout }: { onLogout: () => void }) {
  const location = useLocation()
  const { isDark, toggle } = useDarkMode()
  const { status: syncStatus, lastSync, pull: syncPull } = useSyncManager()
  const currentPage = NAV_ITEMS.find(i =>
    i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to)
  )

  function handleLogout() {
    clearSession()
    ;['finance-store', 'investment-store', 'goals-store', 'recurring-store'].forEach(k =>
      localStorage.removeItem(k)
    )
    onLogout()
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)] transition-colors duration-200">
      <SidebarNav onLogout={handleLogout} syncStatus={syncStatus} lastSync={lastSync} onPull={syncPull} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-40 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 h-12 flex items-center justify-between transition-colors duration-200">
          <span className="font-semibold text-[15px] text-[var(--color-text-primary)]">
            {currentPage?.label ?? 'Dashboard'}
          </span>
          <div className="flex items-center gap-1">
            <SyncIndicator status={syncStatus} lastSync={lastSync} onPull={syncPull} />
            <button
              onClick={toggle}
              className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              title={isDark ? 'Modo claro' : 'Modo escuro'}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[#993C1D] dark:hover:text-[#F07050] transition-colors"
              title="Sair"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M7 3H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M12 12l3-3-3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M15 9H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-nav md:pb-6 max-w-5xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
