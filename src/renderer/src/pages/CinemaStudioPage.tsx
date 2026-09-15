import { useState, Component } from 'react'
import { useCinemaStore } from '../stores/cinema-store'
import { ScriptSection } from '../components/cinema/ScriptSection'
import { ElementsSection } from '../components/cinema/ElementsSection'
import { StoryboardSection } from '../components/cinema/StoryboardSection'
import { EditorSection } from '../components/cinema/EditorSection'
import { ProjectWizard } from '../components/cinema/ProjectWizard'
import { FileText, User, Film, Video, Plus, FolderOpen, ChevronDown, X, Edit3, Check, Trash2, Search } from 'lucide-react'

type CinemaTab = 'script' | 'elements' | 'storyboard' | 'editor'

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-surface-500 gap-4 p-8">
          <p className="text-sm text-red-400">Error al cargar Cinema Studio</p>
          <pre className="text-xs text-surface-600 bg-surface-800 p-3 rounded-lg max-w-xl overflow-auto">{this.state.error.message}</pre>
          <button onClick={() => this.setState({ error: null })} className="btn-primary text-sm">Reintentar</button>
        </div>
      )
    }
    return this.props.children
  }
}

const TABS: { key: CinemaTab; label: string; icon: typeof FileText }[] = [
  { key: 'script', label: 'Guión', icon: FileText },
  { key: 'elements', label: 'Elements', icon: User },
  { key: 'storyboard', label: 'Storyboard', icon: Film },
  { key: 'editor', label: 'Editor', icon: Video },
]

function ProjectSelector({ onNewProject }: { onNewProject: () => void }) {
  const projects = useCinemaStore(s => s.projects)
  const currentProjectId = useCinemaStore(s => s.currentProjectId)
  const setCurrentProject = useCinemaStore(s => s.setCurrentProject)
  const deleteProject = useCinemaStore(s => s.deleteProject)
  const renameProject = useCinemaStore(s => s.renameProject)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showNewInput, setShowNewInput] = useState(false)
  const [newName, setNewName] = useState('')
  const [filter, setFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const current = projects.find(p => p.id === currentProjectId)
  const filtered = filter.trim()
    ? projects.filter(p => p.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : projects

  const handleCreate = () => {
    if (!newName.trim()) return
    setNewName('')
    setShowNewInput(false)
    onNewProject()
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-semibold text-surface-100">Cinema Studio</span>

      <div className="relative">
        <button
          onClick={() => { setShowDropdown(prev => { const next = !prev; if (!next) setFilter(''); return next }) }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-800 hover:bg-surface-700 rounded-lg text-sm text-surface-300 transition-colors"
        >
          <FolderOpen size={13} className="text-accent-400" />
          <span className="max-w-[180px] truncate">{current?.name || 'Sin proyecto'}</span>
          <ChevronDown size={12} />
        </button>

        {showDropdown && (
          <div className="absolute top-full left-0 mt-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[240px] shadow-xl z-50 max-h-[280px] flex flex-col">
            <div className="px-2 pb-1.5 border-b border-surface-700">
              <div className="flex items-center gap-1.5 bg-surface-900 border border-surface-700 rounded-lg px-2 py-1">
                <Search size={11} className="text-surface-500 flex-shrink-0" />
                <input
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder="Filtrar proyectos..."
                  className="flex-1 bg-transparent text-xs text-surface-100 outline-none placeholder:text-surface-600 min-w-0"
                  autoFocus
                />
                {filter && (
                  <button onClick={() => setFilter('')} className="text-surface-500 hover:text-surface-300 flex-shrink-0">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-y-auto">
            {filtered.map(p => (
              <div key={p.id} className="flex items-center group">
                {editingId === p.id ? (
                  <div className="flex items-center gap-1 px-3 py-1.5 w-full">
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 bg-surface-900 border border-surface-700 rounded px-2 py-0.5 text-xs text-surface-100 outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') { renameProject(p.id, editName); setEditingId(null) }
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                    <button onClick={() => { renameProject(p.id, editName); setEditingId(null) }} className="text-green-400"><Check size={12} /></button>
                    <button onClick={() => setEditingId(null)} className="text-surface-500"><X size={12} /></button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => { setCurrentProject(p.id); setShowDropdown(false); setFilter('') }}
                      className={`flex-1 text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                        p.id === currentProjectId ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/50'
                      }`}
                    >
                      <FolderOpen size={11} />
                      <span className="truncate flex-1">{p.name}</span>
                    </button>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 pr-1">
                      <button
                        onClick={() => { setEditingId(p.id); setEditName(p.name) }}
                        className="p-1 text-surface-500 hover:text-surface-100"
                      >
                        <Edit3 size={10} />
                      </button>
                      {confirmDelete === p.id ? (
                        <div className="flex gap-0.5">
                          <button onClick={() => { deleteProject(p.id); setConfirmDelete(null); setShowDropdown(false); setFilter('') }}
                            className="px-1.5 py-0.5 bg-red-500/80 rounded text-[9px] text-white">Sí</button>
                          <button onClick={() => setConfirmDelete(null)}
                            className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] text-white">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(p.id)} className="p-1 text-surface-500 hover:text-red-400">
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
            </div>
          </div>
        )}
      </div>

      {showNewInput ? (
        <div className="flex items-center gap-1.5">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nombre del proyecto..."
            className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-surface-100 outline-none focus:border-accent-500 w-40"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNewInput(false) }}
          />
          <button onClick={handleCreate} className="p-1.5 bg-accent-600 rounded-lg text-white"><Check size={12} /></button>
          <button onClick={() => setShowNewInput(false)} className="p-1.5 text-surface-500"><X size={12} /></button>
        </div>
      ) : (
        <button onClick={onNewProject} className="btn-ghost text-xs flex items-center gap-1">
          <Plus size={12} /> Nuevo proyecto
        </button>
      )}
    </div>
  )
}

export function CinemaStudioPage() {
  return (
    <ErrorBoundary>
      <CinemaStudioPageInner />
    </ErrorBoundary>
  )
}

function CinemaStudioPageInner() {
  const [activeTab, setActiveTab] = useState<CinemaTab>('script')
  const [showWizard, setShowWizard] = useState(false)
  const projects = useCinemaStore(s => s.projects)
  const currentProjectId = useCinemaStore(s => s.currentProjectId)
  const setCurrentProject = useCinemaStore(s => s.setCurrentProject)

  const renderWizard = showWizard && (
    <ProjectWizard
      onClose={() => setShowWizard(false)}
      onCreated={(id) => { setCurrentProject(id); setShowWizard(false) }}
    />
  )

  if (projects.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-6 py-3 border-b border-surface-800">
          <span className="text-sm font-semibold text-surface-100">Cinema Studio</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Film size={64} className="mx-auto text-surface-700" />
            <div>
              <h1 className="text-xl font-semibold text-surface-100 mb-2">Bienvenido a Cinema Studio</h1>
              <p className="text-sm text-surface-500 max-w-md mx-auto mb-4">
                Crea tu primer proyecto para comenzar a producir contenido audiovisual con IA. Pasa por todas las etapas: guión, elementos, storyboard y edición.
              </p>
              <button onClick={() => setShowWizard(true)} className="btn-primary text-sm flex items-center gap-2 mx-auto">
                <Plus size={14} /> Crear proyecto
              </button>
            </div>
          </div>
        </div>
        {renderWizard}
      </div>
    )
  }

  if (!currentProjectId) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-6 py-3 border-b border-surface-800">
          <span className="text-sm font-semibold text-surface-100">Cinema Studio</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6">
            <FolderOpen size={64} className="mx-auto text-surface-700" />
            <div>
              <p className="text-sm text-surface-500 mb-4">Selecciona o crea un proyecto para comenzar</p>
              <ProjectSelectorView onNewProject={() => setShowWizard(true)} />
            </div>
          </div>
        </div>
        {renderWizard}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-800 bg-surface-950/80 backdrop-blur-sm">
        <ProjectSelector onNewProject={() => setShowWizard(true)} />
        <span className="text-[10px] text-surface-600">Cinema Studio v0.1</span>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'script' && <ScriptSection projectId={currentProjectId} />}
        {activeTab === 'elements' && <ElementsSection projectId={currentProjectId} />}
        {activeTab === 'storyboard' && <StoryboardSection projectId={currentProjectId} />}
        {activeTab === 'editor' && <EditorSection projectId={currentProjectId} />}
      </div>

      {/* Bottom tabs */}
      <div className="flex items-center bg-surface-900 border-t border-surface-800">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-medium transition-colors border-t-2 flex-1 justify-center ${
              activeTab === key
                ? 'border-accent-500 text-accent-400 bg-accent-500/5'
                : 'border-transparent text-surface-500 hover:text-surface-300 hover:bg-surface-800/50'
            }`}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {renderWizard}
    </div>
  )
}

function ProjectSelectorView({ onNewProject }: { onNewProject: () => void }) {
  const projects = useCinemaStore(s => s.projects)
  const currentProjectId = useCinemaStore(s => s.currentProjectId)
  const setCurrentProject = useCinemaStore(s => s.setCurrentProject)

  return (
    <div className="space-y-3">
      {projects.map(p => (
        <button
          key={p.id}
          onClick={() => setCurrentProject(p.id)}
          className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-center gap-3 ${
            p.id === currentProjectId
              ? 'bg-accent-500/10 border-accent-500/30 text-accent-300'
              : 'bg-surface-800 border-surface-700 text-surface-300 hover:border-surface-600'
          }`}
        >
          <FolderOpen size={16} />
          <span className="text-sm font-medium">{p.name}</span>
        </button>
      ))}
      <div className="pt-2">
        <button onClick={onNewProject} className="btn-primary text-sm flex items-center gap-2 mx-auto">
          <Plus size={14} /> Crear proyecto
        </button>
      </div>
    </div>
  )
}
