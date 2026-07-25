import { useEffect } from 'react'
import { useAppStore, type Page } from '../stores/app-store'
import { Image, Video, Library, Workflow, Film, Settings, ChevronLeft, ChevronRight, Coins, RefreshCw, Terminal, Clapperboard } from 'lucide-react'

const navItems: { page: Page; label: string; icon: React.FC<{ size?: number }> }[] = [
  { page: 'image', label: 'Image Generation', icon: Image },
  { page: 'video', label: 'Video Generation', icon: Video },
  // { page: 'cinema', label: 'Cinema Studio', icon: Clapperboard },
  { page: 'library', label: 'Library', icon: Library },
  // { page: 'workflows', label: 'Workflows', icon: Workflow },
  // { page: 'editor', label: 'Video Editor', icon: Film },
  { page: 'settings', label: 'Settings', icon: Settings },
  { page: 'logs', label: 'Logs', icon: Terminal },
]

export function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage)
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const creditBalance = useAppStore((s) => s.creditBalance)
  const setPage = useAppStore((s) => s.setPage)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const setCreditBalance = useAppStore((s) => s.setCreditBalance)

  useEffect(() => {
    const fetch = () => (window as any).electronAPI?.kie.creditBalance().then(setCreditBalance)
    fetch()
    const interval = setInterval(fetch, 30000)
    return () => clearInterval(interval)
  }, [setCreditBalance])

  return (
    <aside className={`fixed left-0 top-0 h-screen bg-surface-950 border-r border-surface-800 z-50 flex flex-col transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}`}>
      <div className={`flex items-center h-14 px-4 border-b border-surface-800 ${collapsed ? 'justify-center' : ''}`}>
        {!collapsed && (
          <span className="text-sm font-semibold text-surface-100 tracking-tight">KIE Studio</span>
        )}
        <button
          onClick={toggleSidebar}
          className={`text-surface-500 hover:text-surface-100 transition-colors ${collapsed ? '' : 'ml-auto'}`}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map(({ page, label, icon: Icon }) => (
          <button
            key={page}
            onClick={() => setPage(page)}
            className={`sidebar-item w-full ${currentPage === page ? 'active' : ''}`}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} />
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
      </nav>

      {/* Credit balance - always visible */}
      <div className={`border-t border-surface-800 px-3 py-2.5 ${collapsed ? 'text-center' : ''}`}>
        <div className="flex items-center gap-2">
          <Coins size={14} className="text-amber-400 flex-shrink-0" />
          {!collapsed && (
            <>
              <span className={`text-xs font-medium ${creditBalance !== null && creditBalance >= 0 ? 'text-surface-100' : 'text-surface-600'}`}>
                {creditBalance !== null && creditBalance >= 0
                  ? `${creditBalance.toLocaleString()} credits`
                  : '— credits'}
              </span>
              <button
                onClick={() => (window as any).electronAPI?.kie.creditBalance().then(setCreditBalance)}
                className="ml-auto text-surface-600 hover:text-surface-300 transition-colors"
                title="Refresh balance"
              >
                <RefreshCw size={11} />
              </button>
            </>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 py-2 border-t border-surface-800">
          <p className="text-[10px] text-surface-600">KIE Studio Desktop v0.1.0</p>
        </div>
      )}
    </aside>
  )
}
