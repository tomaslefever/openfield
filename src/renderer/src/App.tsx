import { useAppStore, type Page } from './stores/app-store'
import { Sidebar } from './components/Sidebar'
import { ImageGenPage } from './pages/ImageGenPage'
import { VideoGenPage } from './pages/VideoGenPage'
import { LibraryPage } from './pages/LibraryPage'
import { WorkflowsPage } from './pages/WorkflowsPage'
import { EditorPage } from './pages/EditorPage'
import { CinemaStudioPage } from './pages/CinemaStudioPage'
import { SettingsPage } from './pages/SettingsPage'
import { LogsPage } from './pages/LogsPage'

const pages: Record<Page, React.FC> = {
  image: ImageGenPage,
  video: VideoGenPage,
  library: LibraryPage,
  workflows: WorkflowsPage,
  editor: EditorPage,
  cinema: CinemaStudioPage,
  settings: SettingsPage,
  logs: LogsPage,
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
    </div>
  )
}

export default App
