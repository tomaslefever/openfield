import { useState, useMemo } from 'react'
import {
  Clapperboard, Smartphone, Wand2, ArrowLeftRight, Film,
  GitBranch, UserRound, Share2, Images, Search, Play, X,
  ChevronRight, Plus, Zap, Sparkles, BookOpen
} from 'lucide-react'
import { useAppsStore, BUILTIN_APPS, CATEGORY_LABELS, KIND_LABELS, type AppDefinition, type AppKind } from '../stores/apps-store'
import { AppRunner } from '../components/apps/AppRunner'

const ICON_MAP: Record<string, React.FC<{ size?: number; className?: string }>> = {
  Clapperboard, Smartphone, Wand2, ArrowLeftRight, Film,
  GitBranch, UserRound, Share2, Images, BookOpen,
}

function AppCard({ app, onLaunch, onDetails }: {
  app: AppDefinition
  onLaunch: (app: AppDefinition) => void
  onDetails: (app: AppDefinition) => void
}) {
  const Icon = ICON_MAP[app.icon] || Sparkles

  return (
    <div
      className="card group relative overflow-hidden p-0 cursor-pointer hover:border-accent-500/40 transition-colors"
      onClick={() => onDetails(app)}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 220px' }}
    >
      <div className="p-5 flex flex-col h-full">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center flex-shrink-0">
            <Icon size={20} className="text-accent-400" />
          </div>
          {app.isBuiltIn && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-500/10 text-accent-400 border border-accent-500/20">
              Built-in
            </span>
          )}
        </div>
        <h3 className="text-sm font-semibold text-surface-100 mb-1">{app.name}</h3>
        <p className="text-xs text-surface-500 line-clamp-2 flex-1 mb-3">{app.description}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            {app.tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-800 text-surface-500">
                {tag}
              </span>
            ))}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onLaunch(app) }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium transition-all opacity-0 group-hover:opacity-100"
          >
            <Play size={12} /> Launch
          </button>
        </div>
      </div>
    </div>
  )
}

export function AppsPage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activeKind, setActiveKind] = useState<AppKind | null>(null)
  const [runningApp, setRunningApp] = useState<AppDefinition | null>(null)

  const selectedApp = useAppsStore(s => s.selectedApp)
  const setSelectedApp = useAppsStore(s => s.selectApp)

  const categories = useMemo(() =>
    [...new Set(BUILTIN_APPS.map(a => a.category))].sort(),
    []
  )

  const kinds = useMemo(() =>
    [...new Set(BUILTIN_APPS.map(a => a.kind))].sort(),
    []
  )

  const filteredApps = useMemo(() => {
    let apps = BUILTIN_APPS
    if (search) {
      const q = search.toLowerCase()
      apps = apps.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    if (activeCategory) {
      apps = apps.filter(a => a.category === activeCategory)
    }
    if (activeKind) {
      apps = apps.filter(a => a.kind === activeKind)
    }
    return apps
  }, [search, activeCategory, activeKind])

  const handleLaunch = (app: AppDefinition) => {
    setRunningApp(app)
  }

  const handleDetails = (app: AppDefinition) => {
    setSelectedApp(app)
  }

  if (runningApp) {
    return (
      <AppRunner
        app={runningApp}
        onClose={() => setRunningApp(null)}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 pb-32">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-lg font-semibold text-surface-100">Apps</h1>
              <p className="text-xs text-surface-500 mt-1">
                Build and launch custom applications using Openfield components
              </p>
            </div>
          </div>

          {/* Search and filters */}
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search apps..."
                className="input-field pl-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg transition-all ${
                    activeCategory === cat
                      ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30'
                      : 'bg-surface-800 text-surface-400 hover:text-surface-200 border border-surface-700'
                  }`}
                >
                  {CATEGORY_LABELS[cat] || cat}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              {kinds.map(kind => (
                <button
                  key={kind}
                  onClick={() => setActiveKind(activeKind === kind ? null : kind)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg transition-all ${
                    activeKind === kind
                      ? 'bg-surface-700 text-surface-200 border border-surface-600'
                      : 'bg-surface-800 text-surface-500 hover:text-surface-300 border border-surface-800'
                  }`}
                >
                  {KIND_LABELS[kind] || kind}
                </button>
              ))}
            </div>
          </div>

          {/* App grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredApps.map(app => (
              <AppCard
                key={app.id}
                app={app}
                onLaunch={handleLaunch}
                onDetails={handleDetails}
              />
            ))}
          </div>

          {filteredApps.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-surface-600">
              <Search size={48} className="mb-4 opacity-50" />
              <p className="text-sm">No apps found matching your filters.</p>
              <button
                onClick={() => { setSearch(''); setActiveCategory(null); setActiveKind(null) }}
                className="text-xs text-accent-400 hover:text-accent-300 mt-2"
              >
                Clear all filters
              </button>
            </div>
          )}

          {/* Coming soon section */}
          <div className="mt-10">
            <h2 className="text-sm font-semibold text-surface-200 mb-4 flex items-center gap-2">
              <Plus size={14} className="text-accent-400" /> Build Your Own
            </h2>
            <div className="card p-6 text-center border-dashed">
              <div className="w-12 h-12 rounded-xl bg-surface-800 flex items-center justify-center mx-auto mb-3">
                <Zap size={24} className="text-surface-500" />
              </div>
              <h3 className="text-sm font-medium text-surface-300 mb-1">Custom App Builder</h3>
              <p className="text-xs text-surface-500 max-w-md mx-auto mb-4">
                Create your own apps by combining Openfield components: script editors, storyboard grids,
                prompt composers, element selectors, transition timelines, and more.
              </p>
              <button className="btn-primary text-xs" disabled>
                Coming Soon
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
