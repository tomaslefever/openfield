import { useAppStore, type Page } from './stores/app-store'
import { Sidebar } from './components/Sidebar'
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import { ImageGenPage } from './pages/ImageGenPage'
import { VideoGenPage } from './pages/VideoGenPage'
import { AudioGenPage } from './pages/AudioGenPage'
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
import { PanicButton } from './components/PanicButton'

const pages: Record<Page, React.FC> = {
  apps: AppsPage,
  promptLibrary: PromptLibraryPage,
  storyboard: StoryboardPage,
  image: ImageGenPage,
  video: VideoGenPage,
  audio: AudioGenPage,
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

  const PageComponent = pages[currentPage]

  return (
    <div className="flex h-screen overflow-hidden bg-surface-950">
      <Sidebar />
      <button
        onClick={toggleSidebar}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={`fixed top-3.5 z-40 h-7 w-7 flex items-center justify-center rounded-lg bg-surface-900 border border-surface-800 text-surface-500 hover:text-surface-100 hover:border-surface-600 transition-all duration-200 ${sidebarCollapsed ? 'left-[54px]' : 'left-[214px]'}`}
      >
        {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
      </button>
      <main className={`flex-1 flex flex-col overflow-hidden transition-all duration-200 ${sidebarCollapsed ? 'ml-16' : 'ml-56'}`}>
        <PageComponent />
      </main>
      <PanicButton />
    </div>
  )
}

export default App
