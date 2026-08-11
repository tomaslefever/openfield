import { useState, useCallback } from 'react'
import { X, ChevronLeft, Settings2, Play, Save, Download } from 'lucide-react'
import { PromptComposer, type PromptComposerHandle } from '../PromptComposer'
import { PromptLibrary } from './PromptLibrary'
import type { AppDefinition } from '../../stores/apps-store'

interface AppRunnerProps {
  app: AppDefinition
  onClose: () => void
}

function ScriptEditorPlaceholder() {
  const [script, setScript] = useState('')
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">Script Editor</h3>
      <textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        placeholder="Write your script here. Each line becomes a scene or shot..."
        className="input-field h-40 resize-none text-xs font-mono"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-surface-500">{script.split('\n').filter(Boolean).length} lines</span>
        <button className="text-[10px] text-accent-400 hover:text-accent-300">Parse scenes</button>
      </div>
    </div>
  )
}

function PromptListPlaceholder({ aspectRatio, resolution }: { aspectRatio: string; resolution: string }) {
  const [prompts, setPrompts] = useState<string[]>(['', '', '', ''])
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">Prompt Queue</h3>
      <div className="space-y-2">
        {prompts.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-surface-600 w-5">{i + 1}</span>
            <input
              value={p}
              onChange={(e) => {
                const next = [...prompts]
                next[i] = e.target.value
                setPrompts(next)
              }}
              placeholder={`Shot ${i + 1} prompt...`}
              className="input-field text-xs flex-1"
            />
            <button
              onClick={() => {
                setPrompts(prompts.filter((_, j) => j !== i))
              }}
              className="text-surface-600 hover:text-red-400"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => setPrompts([...prompts, ''])}
          className="text-[10px] text-accent-400 hover:text-accent-300"
        >
          + Add prompt
        </button>
        <span className="text-[10px] text-surface-600">{aspectRatio} · {resolution}</span>
      </div>
    </div>
  )
}

function ElementSelectorPlaceholder() {
  const [selectedKind, setSelectedKind] = useState('character')
  const kinds = ['character', 'avatar', 'environment', 'object']
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">Element Selector</h3>
      <div className="flex items-center gap-1.5 mb-3">
        {kinds.map(k => (
          <button
            key={k}
            onClick={() => setSelectedKind(k)}
            className={`text-[10px] px-2 py-1 rounded-lg transition-all ${
              selectedKind === k
                ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30'
                : 'bg-surface-800 text-surface-500 border border-surface-700 hover:text-surface-300'
            }`}
          >
            {k}
          </button>
        ))}
      </div>
      <p className="text-xs text-surface-600">Select elements from your library to use in this app.</p>
    </div>
  )
}

function StoryboardGridPlaceholder() {
  const shots = Array.from({ length: 6 }, (_, i) => i)
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">Storyboard</h3>
      <div className="grid grid-cols-3 gap-2">
        {shots.map(i => (
          <div
            key={i}
            className="aspect-video bg-surface-800 rounded-lg border border-surface-700 flex items-center justify-center group cursor-pointer hover:border-accent-500/30 transition-colors"
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-surface-600">Scene {i + 1}</span>
              <Play size={14} className="text-surface-600 group-hover:text-accent-400 transition-colors" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PipelineControlsPlaceholder() {
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">Pipeline Controls</h3>
      <div className="flex items-center gap-3">
        <button className="btn-primary text-xs flex items-center gap-1.5">
          <Play size={12} /> Run Pipeline
        </button>
        <button className="btn-ghost text-xs">Pause</button>
        <button className="btn-ghost text-xs">Stop</button>
        <span className="text-[10px] text-surface-500 ml-auto">0 / 4 completed</span>
      </div>
    </div>
  )
}

function TransitionTimelinePlaceholder() {
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">Transition Timeline</h3>
      <div className="flex items-center gap-1 h-8 bg-surface-800 rounded-lg border border-surface-700 overflow-hidden px-0.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex-1 h-6 rounded bg-accent-500/10 border border-accent-500/20 flex items-center justify-center">
            <span className="text-[10px] text-accent-400">Frame {i + 1}</span>
          </div>
        ))}
        <div className="w-8 h-6 rounded bg-surface-700 flex items-center justify-center">
          <span className="text-[10px] text-surface-500">→</span>
        </div>
        {[3, 4].map(i => (
          <div key={i} className="flex-1 h-6 rounded bg-surface-700 flex items-center justify-center">
            <span className="text-[10px] text-surface-600">Frame {i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MoodboardViewerPlaceholder() {
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">Moodboard</h3>
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="aspect-square bg-surface-800 rounded-lg border border-surface-700 flex items-center justify-center group cursor-pointer hover:border-accent-500/30 transition-colors"
          >
            <span className="text-[10px] text-surface-600">Ref {i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PoseGeneratorPlaceholder() {
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">Pose Generator</h3>
      <div className="grid grid-cols-4 gap-2">
        {['Front', 'Side', 'Back', 'Action'].map(pose => (
          <div
            key={pose}
            className="aspect-square bg-surface-800 rounded-lg border border-surface-700 flex flex-col items-center justify-center gap-1 group cursor-pointer hover:border-accent-500/30 transition-colors"
          >
            <UserRoundPlaceholder />
            <span className="text-[10px] text-surface-500">{pose}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function UserRoundPlaceholder() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-surface-600">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-7 8-7s8 3 8 7" />
    </svg>
  )
}

function PlatformSelectorPlaceholder() {
  const [platforms, setPlatforms] = useState(['instagram', 'tiktok'])
  const allPlatforms = ['instagram', 'tiktok', 'youtube', 'facebook', 'twitter']
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">Platforms</h3>
      <div className="flex items-center gap-1.5 flex-wrap">
        {allPlatforms.map(p => (
          <button
            key={p}
            onClick={() => {
              setPlatforms(prev =>
                prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
              )
            }}
            className={`text-[10px] px-2 py-1 rounded-lg transition-all capitalize ${
              platforms.includes(p)
                ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30'
                : 'bg-surface-800 text-surface-500 border border-surface-700 hover:text-surface-300'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

function FrameSelectorPlaceholder() {
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">Frame Selector</h3>
      <div className="grid grid-cols-2 gap-2">
        {['First Frame', 'Last Frame'].map(label => (
          <div
            key={label}
            className="aspect-video bg-surface-800 rounded-lg border border-dashed border-surface-700 flex flex-col items-center justify-center gap-1 group cursor-pointer hover:border-accent-500/30 transition-colors"
          >
            <Download size={16} className="text-surface-600" />
            <span className="text-[10px] text-surface-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PreviewPlayerPlaceholder() {
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">Preview</h3>
      <div className="aspect-video bg-surface-800 rounded-lg border border-surface-700 flex items-center justify-center">
        <Play size={24} className="text-surface-600" />
      </div>
    </div>
  )
}

function ResultGridPlaceholder() {
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">Results</h3>
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="aspect-square bg-surface-800 rounded-lg border border-surface-700 flex items-center justify-center group cursor-pointer hover:border-accent-500/30 transition-colors"
          >
            <span className="text-[10px] text-surface-600">#{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const COMPONENT_RENDERERS: Record<string, React.FC<{ params?: Record<string, any> }>> = {
  'script-editor': ScriptEditorPlaceholder,
  'storyboard-grid': StoryboardGridPlaceholder,
  'element-selector': ElementSelectorPlaceholder,
  'prompt-list': PromptListPlaceholder,
  'pipeline-controls': PipelineControlsPlaceholder,
  'transition-timeline': TransitionTimelinePlaceholder,
  'moodboard-viewer': MoodboardViewerPlaceholder,
  'pose-generator': PoseGeneratorPlaceholder,
  'platform-selector': PlatformSelectorPlaceholder,
  'frame-selector': FrameSelectorPlaceholder,
  'preview-player': PreviewPlayerPlaceholder,
  'result-grid': ResultGridPlaceholder,
  'element-creator': () => (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">Element Creator</h3>
      <p className="text-xs text-surface-600">Create and manage character elements with consistent styling.</p>
    </div>
  ),
  'prompt-library': () => <PromptLibrary />,
}

export function AppRunner({ app, onClose }: AppRunnerProps) {
  const [showSettings, setShowSettings] = useState(false)

  const handleGenerate = useCallback(async (params: any) => {
    const api = (window as any).electronAPI
    try {
      if (params.prompt) {
        if (app.kind === 'ugc' || app.kind === 'transition') {
          await api?.openfield.generateVideo(params)
        } else {
          await api?.openfield.generateImage(params)
        }
      }
    } catch (err) {
      console.error(`${app.name} generation failed:`, err)
    }
  }, [app])

  // Separate prompt-composer from other components
  const hasPromptComposer = app.components.some(c => c.componentId === 'prompt-composer')
  const otherComponents = app.components.filter(c => c.componentId !== 'prompt-composer')

  return (
    <div className="flex flex-col h-full">
      {/* App header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-surface-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-surface-500 hover:text-surface-200 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <h2 className="text-sm font-semibold text-surface-100">{app.name}</h2>
            <p className="text-[10px] text-surface-500">{app.components.length} components</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {app.kind === 'pipeline' && (
            <button className="btn-primary text-xs flex items-center gap-1.5">
              <Play size={12} /> Run All
            </button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`btn-ghost text-xs flex items-center gap-1.5 ${showSettings ? 'text-accent-400' : ''}`}
          >
            <Settings2 size={12} /> Settings
          </button>
          <button className="btn-ghost text-xs flex items-center gap-1.5">
            <Save size={12} /> Save
          </button>
        </div>
      </div>

      {/* App workspace */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          {/* Settings panel */}
          {showSettings && (
            <div className="card p-4 mb-6">
              <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">App Settings</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(app.defaultParams).map(([key, value]) => (
                  <div key={key}>
                    <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1">{key}</label>
                    {typeof value === 'boolean' ? (
                      <input type="checkbox" defaultChecked={value} className="mt-1" />
                    ) : typeof value === 'number' ? (
                      <input type="number" defaultValue={value} className="input-field text-xs" />
                    ) : (
                      <input type="text" defaultValue={String(value)} className="input-field text-xs" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Component grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {otherComponents.map((comp, i) => {
              const Renderer = COMPONENT_RENDERERS[comp.componentId]
              if (!Renderer) return null
              return <Renderer key={i} params={comp.props} />
            })}
          </div>
        </div>
      </div>

      {/* Bottom prompt composer bar */}
      {hasPromptComposer && (
        <PromptComposer
          onGenerate={handleGenerate}
          mode={app.kind === 'ugc' || app.kind === 'transition' || app.kind === 'editor' ? 'video' : 'image'}
        />
      )}
    </div>
  )
}
