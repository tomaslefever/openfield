import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore, type Page } from '../stores/app-store'
import type { LucideIcon } from 'lucide-react'
import { Image, Video, AudioLines, Library, Workflow, Film, Settings, ChevronLeft, ChevronRight, Coins, RefreshCw, Terminal, Clapperboard, Package, Shapes, AppWindow, BookOpen, MoreHorizontal, User, DollarSign, ExternalLink } from 'lucide-react'

const navItems: { page: Page; label: string; icon: React.FC<{ size?: number }> }[] = [
  // { page: 'apps', label: 'Apps', icon: AppWindow },
  { page: 'image', label: 'Image Generation', icon: Image },
  { page: 'video', label: 'Video Generation', icon: Video },
  { page: 'audio', label: 'Audio Generation', icon: AudioLines },
  { page: 'promptLibrary', label: 'Prompt Library', icon: BookOpen },
  { page: 'storyboard', label: 'Storyboard', icon: Clapperboard },
  { page: 'library', label: 'Library', icon: Library },
  { page: 'elements', label: 'Elements', icon: Shapes },
  // { page: 'cinema', label: 'Cinema Studio', icon: Clapperboard },
  // { page: 'workflows', label: 'Workflows', icon: Workflow },
  // { page: 'editor', label: 'Video Editor', icon: Film },
]

const footerItems: { page: Page; label: string; icon: React.FC<{ size?: number }> }[] = [
  { page: 'marketplace', label: 'Model Marketplace', icon: Package },
  { page: 'settings', label: 'Settings', icon: Settings },
  { page: 'logs', label: 'Logs', icon: Terminal },
]

interface Balance {
  provider: 'kie' | 'replicate' | 'fal'
  label: string
  kind: 'credits' | 'account' | 'dollars'
  value: number | string
  url?: string
}

const BALANCE_CONFIG: Record<Balance['provider'], { icon: LucideIcon; color: string }> = {
  kie: { icon: Coins, color: 'text-amber-400' },
  replicate: { icon: User, color: 'text-violet-400' },
  fal: { icon: DollarSign, color: 'text-sky-400' },
}

function formatBalance(b: Balance): string {
  if (b.kind === 'credits') return `${(b.value as number).toLocaleString()} cr`
  if (b.kind === 'dollars') return `$${(b.value as number).toFixed(2)}`
  return `@${b.value}`
}

export function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage)
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const setPage = useAppStore((s) => s.setPage)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const setCreditBalance = useAppStore((s) => s.setCreditBalance)
  const [footerOpen, setFooterOpen] = useState(false)
  const [balances, setBalances] = useState<Balance[]>([])
  const footerRef = useRef<HTMLDivElement>(null)

  const fetchBalances = useCallback(async () => {
    try {
      const api = (window as any).electronAPI
      let list: any[] | null = null
      if (api?.balances?.list) {
        list = await api.balances.list()
      } else if (api?.openfield?.creditBalance) {
        const credits = await api.openfield.creditBalance()
        if (typeof credits === 'number' && credits >= 0) {
          list = [{ provider: 'kie', label: 'KIE.ai', kind: 'credits', value: credits }]
        }
      }
      if (Array.isArray(list)) {
        setBalances(list)
        const kie = list.find((b: any) => b.provider === 'kie')
        if (kie && typeof kie.value === 'number') setCreditBalance(kie.value)
      }
    } catch {
      /* offline */
    }
  }, [setCreditBalance])

  useEffect(() => {
    fetchBalances()
    const interval = setInterval(fetchBalances, 30000)
    return () => clearInterval(interval)
  }, [fetchBalances])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (footerRef.current && !footerRef.current.contains(e.target as Node)) {
        setFooterOpen(false)
      }
    }
    if (footerOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [footerOpen])

  useEffect(() => {
    if (!collapsed) setFooterOpen(false)
  }, [collapsed])

  return (
    <aside className={`fixed left-0 top-0 h-screen bg-surface-950 border-r border-surface-800 z-50 flex flex-col transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}`}>
      <div className={`flex items-center h-14 px-4 border-b border-surface-800 ${collapsed ? 'justify-center' : ''}`}>
        {!collapsed && (
          <img src="/logo.png" alt="Openfield" className="h-7 w-auto max-w-[140px] object-contain" />
        )}
        <button
          onClick={toggleSidebar}
          className={`text-surface-500 hover:text-surface-100 transition-colors ${collapsed ? '' : 'ml-auto'}`}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
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

      {/* Footer items */}
      <div ref={footerRef} className={`border-t border-surface-800 px-2 py-2 space-y-1 relative ${collapsed ? '' : 'border-b-0'}`}>
        {collapsed ? (
          <>
            <button
              onClick={() => setFooterOpen(!footerOpen)}
              className={`sidebar-item w-full justify-center ${footerOpen ? 'active' : ''}`}
              title="More"
            >
              <MoreHorizontal size={18} />
            </button>
            {footerOpen && (
              <div className="absolute bottom-full left-2 mb-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[180px] shadow-xl z-50">
                {footerItems.map(({ page, label, icon: Icon }) => (
                  <button
                    key={page}
                    onClick={() => { setPage(page); setFooterOpen(false) }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${currentPage === page ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/50'}`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between gap-1">
            {footerItems.map(({ page, label, icon: Icon }) => (
              <button
                key={page}
                onClick={() => setPage(page)}
                className={`p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors ${currentPage === page ? 'text-accent-400 bg-accent-500/10' : ''}`}
                title={label}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Balances - shown only for providers with a configured API key */}
      {balances.length > 0 && (
        <div className="border-t border-surface-800 p-2 space-y-1.5">
          {!collapsed && (
            <div className="flex items-center justify-between px-1">
              <span className="text-[9px] uppercase tracking-wider text-surface-600">Balances</span>
              <button
                onClick={fetchBalances}
                className="text-surface-600 hover:text-surface-300 transition-colors"
                title="Refresh balances"
              >
                <RefreshCw size={10} />
              </button>
            </div>
          )}
          <div className={collapsed ? 'flex flex-col items-center gap-1.5' : 'space-y-1.5'}>
            {balances.map((b) => {
              const cfg = BALANCE_CONFIG[b.provider] || BALANCE_CONFIG.kie
              const Icon = cfg.icon
              const rowClasses = `flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-surface-900/60 border border-surface-800 min-w-0 transition-colors ${collapsed ? 'justify-center' : ''}`
              const inner = (
                <>
                  <Icon size={12} className={`${cfg.color} flex-shrink-0`} />
                  {!collapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-surface-600 truncate leading-tight">{b.label}</p>
                      <p className="text-[11px] font-medium text-surface-100 truncate leading-tight">{formatBalance(b)}</p>
                    </div>
                  )}
                  {b.url && !collapsed && <ExternalLink size={10} className="text-surface-600 flex-shrink-0" />}
                </>
              )
              return b.url ? (
                <a
                  key={b.provider}
                  href={b.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`${b.label}: ${formatBalance(b)} — Ver saldo en el dashboard`}
                  className={`${rowClasses} hover:border-surface-600`}
                >
                  {inner}
                </a>
              ) : (
                <div
                  key={b.provider}
                  className={rowClasses}
                  title={`${b.label}: ${formatBalance(b)}`}
                >
                  {inner}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="px-4 py-2 border-t border-surface-800">
          <p className="text-[10px] text-surface-600">Openfield v0.1.0</p>
        </div>
      )}
    </aside>
  )
}
