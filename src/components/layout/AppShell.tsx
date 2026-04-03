import { Outlet, useLocation, NavLink } from 'react-router-dom'
import { clearSession } from '@/pages/Login'

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

function SidebarNav({ onLogout }: { onLogout: () => void }) {
  return (
    <aside className="hidden md:flex flex-col w-52 min-h-screen bg-white border-r border-[#E8E6E0] px-3 py-5 flex-shrink-0">
      <div className="px-2 mb-6">
        <div className="font-semibold text-[15px] text-[#1A1917]">Finanças</div>
        <div className="text-[11px] text-[#6B6860] font-mono mt-0.5">Jul/2021 – hoje</div>
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
                ? 'bg-[#1A1917] text-white font-medium'
                : 'text-[#6B6860] hover:bg-[#F7F6F3] hover:text-[#1A1917]')
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={onLogout}
        className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] text-[#6B6860] hover:bg-[#FFF1EC] hover:text-[#993C1D] transition-all duration-150 mt-2"
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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E8E6E0]"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ` +
              (isActive ? 'text-[#1A1917]' : 'text-[#6B6860]')
            }
          >
            {({ isActive }) => (
              <>
                <span className={`p-1.5 rounded-[10px] transition-colors ${isActive ? 'bg-[#F7F6F3]' : ''}`}>
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
  const currentPage = NAV_ITEMS.find(i =>
    i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to)
  )

  function handleLogout() {
    clearSession()
    // Limpa dados em cache do browser para não vazar para próximo usuário
    ;['finance-store', 'investment-store', 'goals-store', 'recurring-store'].forEach(k =>
      localStorage.removeItem(k)
    )
    onLogout()
  }

  return (
    <div className="flex min-h-screen bg-[#F7F6F3]">
      <SidebarNav onLogout={handleLogout} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-40 bg-white border-b border-[#E8E6E0] px-4 h-12 flex items-center justify-between">
          <span className="font-semibold text-[15px]">{currentPage?.label ?? 'Dashboard'}</span>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-[#6B6860] hover:text-[#993C1D] transition-colors"
            title="Sair"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M7 3H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M12 12l3-3-3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 9H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-nav md:pb-6 max-w-5xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
