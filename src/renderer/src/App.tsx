import { useEffect } from 'react'
import { useAppStore, type Page } from './stores/app-store'
import { useWorkspaceStore } from './stores/workspace-store'
import { useElementsStore } from './stores/elements-store'
import { useStoryboardStore } from './stores/storyboard-store'
import { usePromptLibraryStore } from './stores/prompt-library-store'
import { useShortDramaStore } from './stores/short-drama-store'
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
import { CinemaStudioPage } from './pages/CinemaStudioPage'
import { SettingsPage } from './pages/SettingsPage'
import { LogsPage } from './pages/LogsPage'
import { MarketplacePage } from './pages/MarketplacePage'
import { AppsPage } from './pages/AppsPage'
import { PromptLibraryPage } from './pages/PromptLibraryPage'
import { StoryboardPage } from './pages/StoryboardPage'
import { ShortDramaApp } from './components/apps/short-drama/ShortDramaApp'
import { WorkspaceHubPage } from './pages/WorkspaceHubPage'
import { PanicButton } from './components/PanicButton'
import { Toaster } from 'sonner'

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
  cinema: CinemaStudioPage,
  settings: SettingsPage,
  logs: LogsPage,
  marketplace: MarketplacePage,
}

function App() {
  const currentPage = useAppStore((s) => s.currentPage)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId)
  const inWorkspace = useWorkspaceStore((s) => s.inWorkspace)

  useEffect(() => {
    useWorkspaceStore.getState().load()
    ;(window as any).electronAPI?.settings?.get('gridRenderScale').then((scale: any) => {
      if (scale) useAppStore.getState().setGridRenderScale(scale)
    }).catch(() => {})
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
    return (
      <div className="relative h-screen w-screen overflow-y-auto bg-surface-950">
        <WorkspaceHubPage />
        <PanicButton />
        <Toaster theme="dark" position="bottom-right" richColors toastOptions={{ style: { background: '#17171a', border: '1px solid #2a2a30' } }} />
      </div>
    )
  }

  const PageComponent = pages[currentPage]

  return (
    <SidebarProvider
      open={!sidebarCollapsed}
      onOpenChange={(open) => {
        if (open === sidebarCollapsed) toggleSidebar()
      }}
      className="relative h-screen overflow-hidden"
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
      <Toaster theme="dark" position="bottom-right" richColors toastOptions={{ style: { background: '#17171a', border: '1px solid #2a2a30' } }} />
    </SidebarProvider>
  )
}

export default App
