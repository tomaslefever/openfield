import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore, type Page } from '../stores/app-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { WorkspaceSelector } from './WorkspaceSelector'
import { RestartToUpdateButton } from './RestartToUpdateButton'
import type { LucideIcon } from 'lucide-react'
import {
  Sparkles,
  Clapperboard,
  Shapes,
  Settings,
  Search,
  AudioLines,
  Mic,
  KeyRound,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
  { page: 'library', label: 'Playground', icon: Sparkles },
  { page: 'voice', label: 'Voice Generation', icon: Mic },
  { page: 'music', label: 'Music Generation', icon: AudioLines },
  { page: 'elements', label: 'Elements', icon: Shapes },
  { page: 'contentStudio', label: 'Content Studio', icon: Clapperboard },
]

const FOOTER_ITEMS: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: 'providers', label: 'Providers', icon: KeyRound },
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
            <SidebarMenuItem key={page} className={collapsed ? 'flex justify-center' : ''}>
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
                className={`relative z-10 gap-3 rounded-[8px] text-[13.5px] transition-colors ${
                  collapsed
                    ? `!size-10 !p-0 justify-center ${
                        isActive
                          ? 'bg-sidebar-accent font-medium text-sidebar-foreground'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60'
                      }`
                    : `px-2.5 py-2 hover:bg-transparent data-[active=true]:bg-transparent ${
                        isActive ? 'font-medium text-sidebar-foreground' : 'text-sidebar-foreground/70'
                      }`
                }`}
              >
                <Icon />
                {!collapsed && <span>{label}</span>}
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
  const { state, setOpen } = useSidebar()
  const collapsed = state === 'collapsed'
  const [hovered, setHovered] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        if (collapsed) {
          setOpen(true)
          setTimeout(() => {
            searchRef.current?.focus()
            searchRef.current?.select()
          }, 50)
        } else {
          searchRef.current?.focus()
          searchRef.current?.select()
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [collapsed, setOpen])

  const handleSearch = (value: string) => {
    setAssetSearch({ query: value })
    if (value && currentPage !== 'library') setPage('library')
  }

  return (
    <Sidebar
      collapsible="icon"
      variant="sidebar"
      className="[&>[data-sidebar=sidebar]]:relative [&>[data-sidebar=sidebar]]:bg-sidebar/95 border-r border-sidebar-border/70 backdrop-blur-xl"
    >
      {/* Sidebar collapse button */}
      <div className="absolute -right-[15px] top-3.5 z-40">
        <SidebarTrigger
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-surface-700/80 bg-surface-900/95 text-surface-400 shadow-md backdrop-blur transition-all hover:scale-110 hover:bg-surface-800 hover:text-surface-100 cursor-pointer"
        >
          <ChevronRight
            size={13}
            className={cn('transition-transform duration-200', !collapsed && 'rotate-180')}
          />
        </SidebarTrigger>
      </div>

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
              <kbd className="flex h-4 items-center justify-center rounded-[5px] bg-sidebar px-1 text-[10px] text-sidebar-foreground/50">Ctrl+F</kbd>
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
            <SidebarMenuItem key={page} className={collapsed ? 'flex justify-center' : ''}>
              <SidebarMenuButton
                isActive={currentPage === page}
                tooltip={label}
                onClick={() => setPage(page)}
                className={`gap-3 rounded-[8px] text-[13.5px] transition-colors ${
                  collapsed
                    ? `!size-10 !p-0 justify-center ${
                        currentPage === page
                          ? 'bg-sidebar-accent font-medium text-sidebar-foreground'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60'
                      }`
                    : `px-2.5 py-2 ${
                        currentPage === page
                          ? 'bg-sidebar-accent font-medium text-sidebar-foreground'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60'
                      }`
                }`}
              >
                <Icon />
                {!collapsed && <span>{label}</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <RestartToUpdateButton collapsed={collapsed} />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
