import { NavLink, Outlet, useNavigate } from 'react-router-dom'

const NAV = [
  { to: '/pedidos',      icon: '📋', label: 'Pedidos' },
  { to: '/cardapio',     icon: '🍦', label: 'Cardápio' },
  { to: '/entregadores', icon: '🛵', label: 'Entregadores' },
  { to: '/configuracoes',icon: '⚙️', label: 'Config.' },
  { to: '/relatorios',   icon: '📊', label: 'Relatórios' },
]

export default function Layout() {
  const navigate = useNavigate()

  function logout() {
    localStorage.removeItem('dubon_token')
    navigate('/login')
  }

  const linkClass = ({ isActive }) =>
    'flex items-center gap-3 px-4 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-colors ' +
    (isActive ? 'bg-white/20 text-white' : 'text-blue-200 hover:bg-white/10 hover:text-white')

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* ── Sidebar desktop ── */}
      <aside className="hidden lg:flex flex-col w-56 bg-brand min-h-screen fixed left-0 top-0 z-40">
        <div className="p-5 border-b border-white/10">
          <div className="text-xl font-bold text-white">🍦 Dubon</div>
          <div className="text-xs text-blue-300 mt-0.5">Painel Administrativo</div>
        </div>
        <nav className="flex-1 p-3">
          {NAV.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-blue-200 hover:bg-white/10 hover:text-white transition-colors"
          >
            <span>🚪</span>
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* ── Conteúdo principal ── */}
      <div className="flex-1 lg:ml-56 pb-20 lg:pb-0">
        {/* Header mobile */}
        <header className="lg:hidden bg-brand text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="font-bold">🍦 Dubon Admin</div>
          <button onClick={logout} className="text-blue-200 text-sm font-medium">
            Sair
          </button>
        </header>

        <main className="p-4 lg:p-6 max-w-5xl mx-auto">
          <Outlet />
        </main>
      </div>

      {/* ── Nav inferior mobile/tablet ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-30 shadow-lg">
        {NAV.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              'flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ' +
              (isActive ? 'text-brand font-semibold' : 'text-gray-400')
            }
          >
            <span className="text-xl">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
