import { useAppStore, type Page } from './stores/app-store'
import { Sidebar } from './components/Sidebar'
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

  const PageComponent = pages[currentPage]

  return (
    <div className="flex h-screen overflow-hidden bg-surface-950">
      <Sidebar />
      <main className={`flex-1 flex flex-col overflow-hidden transition-all duration-200 ${sidebarCollapsed ? 'ml-16' : 'ml-56'}`}>
        <PageComponent />
      </main>
      <PanicButton />
    </div>
  )
}

export default App
