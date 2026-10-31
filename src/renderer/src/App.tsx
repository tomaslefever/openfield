import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useAppStore, type Page } from './stores/app-store'
import { useWorkspaceStore } from './stores/workspace-store'
import { useElementsStore } from './stores/elements-store'
import { useStoryboardStore } from './stores/storyboard-store'
import { usePromptLibraryStore } from './stores/prompt-library-store'
import { useShortDramaStore } from './stores/short-drama-store'
import { useProvidersStore } from './stores/providers-store'
import { installContentStudioAgent } from './lib/content-studio-agent'
import { AppSidebar } from './components/Sidebar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { ImageGenPage } from './pages/ImageGenPage'
import { VideoGenPage } from './pages/VideoGenPage'
import { VoiceGenPage } from './pages/VoiceGenPage'
import { MusicGenPage } from './pages/MusicGenPage'
import { LibraryPage } from './pages/LibraryPage'
import { ElementsPage } from './pages/ElementsPage'
import { WorkflowsPage } from './pages/WorkflowsPage'
import { EditorPage } from './pages/EditorPage'
import { MontagePage } from './pages/MontagePage'
import { CinemaStudioPage } from './pages/CinemaStudioPage'
import { SettingsPage } from './pages/SettingsPage'
import { ProvidersPage } from './pages/ProvidersPage'
import { LogsPage } from './pages/LogsPage'
import { AppsPage } from './pages/AppsPage'
import { PromptLibraryPage } from './pages/PromptLibraryPage'
import { StoryboardPage } from './pages/StoryboardPage'
import { ShortDramaApp } from './components/apps/short-drama/ShortDramaApp'
import { WorkspaceHubPage } from './pages/WorkspaceHubPage'
import { TitleBar } from './components/TitleBar'
import { PanicButton } from './components/PanicButton'
import { Toaster } from 'sonner'
import { useResolvedTheme } from './lib/theme'

const TOAST_STYLE = { background: 'rgb(var(--canvas))', color: 'rgb(var(--ink))', border: '1px solid rgb(var(--hairline))' }

const pages: Record<Page, React.FC> = {
  contentStudio: ShortDramaApp,
  apps: AppsPage,
  promptLibrary: PromptLibraryPage,
  storyboard: StoryboardPage,
  image: ImageGenPage,
  video: VideoGenPage,
  voice: VoiceGenPage,
  music: MusicGenPage,
  library: LibraryPage,
  elements: ElementsPage,
  workflows: WorkflowsPage,
  editor: EditorPage,
  montage: MontagePage,
  cinema: CinemaStudioPage,
  providers: ProvidersPage,
  settings: SettingsPage,
  logs: LogsPage,
}

const HUB_PAGES: Page[] = ['providers', 'settings', 'logs']

function App() {
  const currentPage = useAppStore((s) => s.currentPage)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId)
  const inWorkspace = useWorkspaceStore((s) => s.inWorkspace)
  const theme = useResolvedTheme()
  // Providers/Settings/Logs are app-wide, so the hub can open them without
  // entering a workspace. Remember the in-workspace page to restore on return.
  const [hubPageOpen, setHubPageOpen] = useState(false)
  const pageBeforeHub = useRef<Page>(currentPage)

  const openHubPage = (page: Page) => {
    if (!hubPageOpen) pageBeforeHub.current = currentPage
    useAppStore.getState().setPage(page)
    setHubPageOpen(true)
  }

  const closeHubPage = () => {
    setHubPageOpen(false)
    useAppStore.getState().setPage(pageBeforeHub.current)
  }

  useEffect(() => {
    useWorkspaceStore.getState().load()
    useProvidersStore.getState().load()
    installContentStudioAgent()
    ;(window as any).electronAPI?.settings?.get('gridRenderScale').then((scale: any) => {
      if (scale) useAppStore.getState().setGridRenderScale(scale)
    }).catch(() => {})
  }, [])

  // The MCP bridge can create, rename or switch workspaces: resync and, when
  // asked, open the workspace it switched to.
  useEffect(() => {
    return (window as any).electronAPI?.on?.('workspaces:changed', (payload: { enter?: boolean } = {}) => {
      useWorkspaceStore.getState().load().then(() => {
        if (payload?.enter) useWorkspaceStore.setState({ inWorkspace: true })
      }).catch(() => {})
    })
  }, [])

  // The MCP bridge can save, edit or delete prompts of the Prompt Library
  useEffect(() => {
    return (window as any).electronAPI?.on?.('prompts:changed', () => {
      usePromptLibraryStore.getState().loadEntries()
    })
  }, [])

  // When the active workspace changes, reload workspace-scoped data and reset
  // any in-memory state that belongs to the previous workspace.
  useEffect(() => {
    if (!activeWorkspaceId) return
    useElementsStore.getState().loadElements()
    useStoryboardStore.getState().clear()
    usePromptLibraryStore.getState().loadEntries()
    useShortDramaStore.getState().resetForWorkspace()
  }, [activeWorkspaceId])

  if (!inWorkspace) {
    const HubPage = hubPageOpen && HUB_PAGES.includes(currentPage) ? pages[currentPage] : null
    return (
      <div className="flex h-screen w-screen flex-col bg-surface-950">
        <TitleBar />
        <div className="relative flex-1 min-h-0 overflow-y-auto">
          {HubPage ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center px-4 py-2.5 border-b border-surface-800/80 shrink-0">
                <button
                  onClick={closeHubPage}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium text-surface-300 hover:text-ink hover:bg-surface-800 transition-colors"
                >
                  <ArrowLeft size={14} />
                  <span>Workspaces</span>
                </button>
              </div>
              <div className="relative flex-1 min-h-0 overflow-hidden">
                <HubPage />
              </div>
            </div>
          ) : (
            <WorkspaceHubPage onOpenPage={openHubPage} />
          )}
        </div>
        <PanicButton />
        <Toaster theme={theme} position="bottom-right" richColors toastOptions={{ style: TOAST_STYLE }} />
      </div>
    )
  }

  const PageComponent = pages[currentPage]

  return (
    <div className="flex h-screen flex-col">
      <TitleBar />
      <SidebarProvider
        open={!sidebarCollapsed}
        onOpenChange={(open) => {
          if (open === sidebarCollapsed) toggleSidebar()
        }}
        className="relative min-h-0 flex-1 overflow-hidden"
      >
        <div
          className="fixed inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: 'url(./background.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'brightness(2.2) saturate(1.2) contrast(1.05)',
          }}
        />
        <div className="fixed inset-0 z-0 pointer-events-none bg-surface-950/90" />
        <AppSidebar />
        <SidebarInset className="relative overflow-hidden">
          <PageComponent />
        </SidebarInset>
        <PanicButton />
        <Toaster theme={theme} position="bottom-right" richColors toastOptions={{ style: TOAST_STYLE }} />
      </SidebarProvider>
    </div>
  )
}

export default App
