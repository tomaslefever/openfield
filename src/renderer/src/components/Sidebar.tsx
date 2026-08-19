import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore, type Page } from '../stores/app-store'
import { WorkspaceSelector } from './WorkspaceSelector'
import type { LucideIcon } from 'lucide-react'
import {
  Image,
  Video,
  Library,
  Clapperboard,
  Shapes,
  Settings,
  Search,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'

const NAV_ITEMS: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: 'library', label: 'Assets', icon: Library },
  { page: 'image', label: 'Image Generation', icon: Image },
  { page: 'video', label: 'Video Generation', icon: Video },
  { page: 'storyboard', label: 'Storyboard', icon: Clapperboard },
  { page: 'elements', label: 'Elements', icon: Shapes },
]

const FOOTER_ITEMS: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: 'settings', label: 'Settings', icon: Settings },
]

function NavGroup({
  items,
  currentPage,
  hovered,
  onHover,
  onSelect,
}: {
  items: { page: Page; label: string; icon: LucideIcon }[]
  currentPage: Page
  hovered: string | null
  onHover: (page: string | null) => void
  onSelect: (page: Page) => void
}) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)
  const navRef = useRef<HTMLUListElement>(null)
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const collapsed = useSidebar().state === 'collapsed'

  const hasActive = items.some((i) => i.page === currentPage)
  const hasHovered = hovered ? items.some((i) => i.page === hovered) : false
  const pillTarget = hovered ? (hasHovered ? hovered : null) : hasActive ? currentPage : null
  const showPill = pillTarget !== null && !collapsed

  useLayoutEffect(() => {
    const container = navRef.current
    const target = pillTarget ? itemRefs.current[pillTarget] : null
    if (!container || !target) {
      setBox(null)
      return
    }
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    setBox({
      top: targetRect.top - containerRect.top,
      height: targetRect.height,
    })
  }, [pillTarget, collapsed])

  return (
    <SidebarGroup>
      <SidebarMenu
        ref={navRef}
        onMouseLeave={() => onHover(null)}
        className="relative gap-px"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-0 rounded-[7px] bg-sidebar-accent"
          style={{
            top: box?.top ?? 0,
            height: box?.height ?? 0,
            opacity: showPill && box ? 1 : 0,
            transition:
              'top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease',
          }}
        />
        {items.map(({ page, label, icon: Icon }) => {
          const isActive = page === currentPage
          return (
            <SidebarMenuItem key={page}>
              <SidebarMenuButton
                ref={(el) => {
                  itemRefs.current[page] = el
                }}
                isActive={isActive}
                tooltip={label}
                onMouseEnter={() => onHover(page)}
                onFocus={() => onHover(page)}
                onBlur={() => onHover(null)}
                onClick={() => onSelect(page)}
                className={`relative z-10 gap-2.5 rounded-[7px] px-2 py-1.5 text-[13px] hover:bg-transparent data-[active=true]:bg-transparent ${
                  isActive ? 'font-medium text-sidebar-foreground' : 'text-sidebar-foreground/70'
                }`}
              >
                <Icon />
                <span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

export function AppSidebar() {
  const currentPage = useAppStore((s) => s.currentPage)
  const setPage = useAppStore((s) => s.setPage)
  const assetSearch = useAppStore((s) => s.assetSearch)
  const setAssetSearch = useAppStore((s) => s.setAssetSearch)
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'
  const [hovered, setHovered] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ;(window as any).electronAPI?.updater?.state?.().then((s: any) => {
      if (s?.currentVersion) setAppVersion(s.currentVersion)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !collapsed && document.activeElement !== searchRef.current) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [collapsed])

  const handleSearch = (value: string) => {
    setAssetSearch({ query: value })
    if (value && currentPage !== 'library') setPage('library')
  }

  return (
    <Sidebar
      collapsible="icon"
      variant="floating"
      className="[&>[data-sidebar=sidebar]]:bg-sidebar/80 [&>[data-sidebar=sidebar]]:shadow-2xl [&>[data-sidebar=sidebar]]:backdrop-blur-2xl [&>[data-sidebar=sidebar]]:backdrop-saturate-150"
    >
      <SidebarHeader>
        {collapsed ? (
          <WorkspaceSelector collapsed />
        ) : (
          <>
            <WorkspaceSelector collapsed={false} />
            <label className="flex h-8 items-center gap-2 rounded-lg bg-sidebar-accent/60 px-2.5">
              <Search size={12} className="text-sidebar-foreground/50" />
              <input
                ref={searchRef}
                value={assetSearch.query}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Quick search"
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/40"
              />
              <kbd className="flex size-4 items-center justify-center rounded-[5px] bg-sidebar text-[10px] text-sidebar-foreground/50">/</kbd>
            </label>
          </>
        )}
      </SidebarHeader>

      <SidebarContent>
        <NavGroup
          items={NAV_ITEMS}
          currentPage={currentPage}
          hovered={hovered}
          onHover={setHovered}
          onSelect={setPage}
        />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {FOOTER_ITEMS.map(({ page, label, icon: Icon }) => (
            <SidebarMenuItem key={page}>
              <SidebarMenuButton
                isActive={currentPage === page}
                tooltip={label}
                onClick={() => setPage(page)}
                className={`gap-2.5 rounded-[7px] px-2 py-1.5 text-[13px] ${
                  currentPage === page ? 'bg-sidebar-accent font-medium text-sidebar-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60'
                }`}
              >
                <Icon />
                <span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>

        <div className="flex items-center justify-between gap-2 px-1">
          <SidebarTrigger title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} />
          {!collapsed && (
            <p className="text-[10px] text-sidebar-foreground/50">
              Openfield {appVersion ? `v${appVersion}` : ''}
            </p>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
