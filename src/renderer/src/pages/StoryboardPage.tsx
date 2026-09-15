import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  Plus, Trash2, Copy, Image, Video, Film, ArrowRight,
  Coins, Settings2, Loader, ArrowLeft, Clapperboard, X, Pencil,
  Maximize, Monitor, Upload, Wand2, Library, Sparkles, Palette, FileText, Shapes, RefreshCw
} from 'lucide-react'
import { useStoryboardStore, type SceneShot, type SceneTransition, type StoryboardElement } from '../stores/storyboard-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { srcUrl } from '../services/file-url'
import { StoryboardStyleModal } from '../components/storyboard/StoryboardStyleModal'
import { QuickPromptComposer, type QuickPromptComposerResult } from '../components/QuickPromptComposer'
import { Tabs } from '../components/ui/tabs'
import { ScriptTab } from '../components/storyboard/ScriptTab'
import { ElementsTab } from '../components/storyboard/ElementsTab'
import { parseScriptScenes, extractScriptElements } from '../utils/script-elements'

function SceneCard({
  scene,
  index,
  total,
  onUpdate,
  onRemove,
  onDuplicate,
  onGenerateVideo,
  onDragStart,
  onDrop,
  videoCost,
  onImageGenerated,
  defaultAspectRatio,
  nextSceneId,
  transitions,
  onAddTransition,
  onRemoveTransition,
  styleSuffix = '',
}: {
  scene: SceneShot
  index: number
  total: number
  onUpdate: (id: string, updates: Partial<SceneShot>) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  onGenerateVideo: (id: string) => void
  onDragStart: (e: React.DragEvent, index: number) => void
  onDrop: (index: number) => void
  videoCost: number
  onImageGenerated: (base64: string, prompt: string, assetId?: string) => void
  defaultAspectRatio: string
  nextSceneId: string | null
  transitions: SceneTransition[]
  onAddTransition: (fromSceneId: string, toSceneId: string) => void
  onRemoveTransition: (id: string) => void
  styleSuffix?: string
}) {
  const [tab, setTab] = useState<'image' | 'video'>(scene.videoBase64 ? 'video' : 'image')
  const [showDetails, setShowDetails] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [editDesc, setEditDesc] = useState(scene.description)
  const [showQuickComposer, setShowQuickComposer] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [libraryAssets, setLibraryAssets] = useState<any[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditDesc(scene.description)
  }, [scene.description, showDetails])

  useEffect(() => {
    if (scene.videoBase64) setTab('video')
  }, [scene.videoBase64])

  const handleQuickGenerated = (result: QuickPromptComposerResult) => {
    onUpdate(scene.id, { prompt: result.prompt })
    onImageGenerated(result.base64, result.prompt, result.assetId)
    setShowQuickComposer(false)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      if (!base64) return
      try {
        const api = (window as any).electronAPI
        const result = await api?.assets.importBase64(base64, file.type || 'image/png', file.name)
        const assetId = result?.id || ''
        onImageGenerated(base64, scene.prompt, assetId)
      } catch {
        onImageGenerated(base64, scene.prompt)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleLibraryOpen = async () => {
    setShowLibrary(true)
    try {
      const api = (window as any).electronAPI
      const list = await api?.assets.list({ type: 'image', limit: 60, excludeUploads: true })
      setLibraryAssets(list?.assets || [])
    } catch { setLibraryAssets([]) }
  }

  const handleLibrarySelect = async (asset: any) => {
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64([asset.id])
      if (results?.[0]?.base64) {
        onImageGenerated(results[0].base64, scene.prompt, asset.id)
      }
    } catch { /* */ }
    setShowLibrary(false)
  }

  return (
    <div
      className={`card overflow-hidden p-0 transition-all group ${dragOver ? 'ring-2 ring-accent-400 scale-[1.02]' : ''}`}
      draggable
      onDragStart={(e) => { onDragStart(e, index); setShowDetails(false) }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop(index) }}
      onDragEnd={() => setDragOver(false)}
    >
      {/* Preview area */}
      <div className="relative" style={{ aspectRatio: (defaultAspectRatio || '16:9').replace(':', '/') }}>
        {tab === 'image' ? (
          <div className="w-full h-full bg-surface-800 flex items-center justify-center overflow-hidden">
            {scene.isGeneratingImage ? (
              <div className="flex flex-col items-center gap-2">
                <Loader size={20} className="animate-spin text-accent-400" />
                <span className="text-[10px] text-surface-500">Generating...</span>
              </div>
            ) : scene.imageBase64 ? (
              <img
                src={scene.imageBase64 ? `data:image/png;base64,${scene.imageBase64}` : undefined}
                alt={`Scene ${index + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 p-3 text-surface-600 group/img relative w-full h-full">
                <Image size={18} className="opacity-40" />
                <span className="text-[9px] text-center">
                  {scene.prompt.trim() ? 'Add image' : 'Add a prompt below'}
                </span>
                {/* Hover: icon buttons top-right */}
                <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity">
                  <button onClick={() => setShowQuickComposer(true)} className="p-1 rounded bg-black/50 hover:bg-black/70 text-white" title="Generate with AI">
                    <Wand2 size={10} />
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="p-1 rounded bg-black/50 hover:bg-black/70 text-white" title="Upload image">
                    <Upload size={10} />
                  </button>
                  <button onClick={handleLibraryOpen} className="p-1 rounded bg-black/50 hover:bg-black/70 text-white" title="Browse library">
                    <Library size={10} />
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full bg-surface-800 flex items-center justify-center overflow-hidden">
            {scene.isGeneratingVideo ? (
              <div className="flex flex-col items-center gap-2">
                <Loader size={20} className="animate-spin text-accent-400" />
                <span className="text-[10px] text-surface-500">Video...</span>
              </div>
            ) : scene.videoBase64 ? (
              <video
                src={scene.videoBase64 ? `data:video/mp4;base64,${scene.videoBase64}` : undefined}
                className="w-full h-full object-cover"
                controls
              />
            ) : (
              <button
                onClick={() => onGenerateVideo(scene.id)}
                disabled={!scene.imageBase64}
                className="flex flex-col items-center justify-center gap-2 p-3 w-full h-full group disabled:opacity-30 disabled:cursor-not-allowed"
                title={`Generate video · ${videoCost} credits`}
              >
                <div className="w-9 h-9 rounded-full bg-surface-700 flex items-center justify-center group-hover:bg-accent-600/20 group-enabled:group-hover:scale-110 transition-all">
                  <Video size={16} className="text-surface-500 group-hover:text-accent-400" />
                </div>
                <span className="text-[10px] text-surface-500 group-hover:text-accent-400">
                  {scene.imageBase64 ? 'Generate video' : 'Generate image first'}
                </span>
                {scene.imageBase64 && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-mono">
                    {videoCost} cr
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {/* Overlay when image exists */}
        {scene.imageBase64 && tab === 'image' && (
          <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setShowQuickComposer(true)} className="p-1 rounded bg-black/50 hover:bg-black/70 text-white" title="Regenerate">
              <Wand2 size={10} />
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="p-1 rounded bg-black/50 hover:bg-black/70 text-white" title="Replace image">
              <Upload size={10} />
            </button>
            <button onClick={handleLibraryOpen} className="p-1 rounded bg-black/50 hover:bg-black/70 text-white" title="From library">
              <Library size={10} />
            </button>
          </div>
        )}

        {/* Tab switcher at bottom */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center gap-0.5 p-1.5 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setTab('image')}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-all ${tab === 'image' ? 'bg-white/20 text-white' : 'bg-black/30 text-white/60 hover:text-white'}`}>
            Image
          </button>
          <button onClick={() => setTab('video')}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-all ${tab === 'video' ? 'bg-white/20 text-white' : 'bg-black/30 text-white/60 hover:text-white'}`}>
            Video
          </button>
        </div>
      </div>

      {/* Footer: compact info */}
      <div className="p-2 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-surface-400 line-clamp-1 flex-1">
            Scene {index + 1}{scene.description ? ` — ${scene.description}` : ''}
          </p>
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
            <button onClick={() => setShowDetails(!showDetails)}
              className="p-0.5 text-surface-600 hover:text-accent-400">
              <Settings2 size={10} />
            </button>
          </div>
        </div>

        {/* Expandable detail panel */}
        {showDetails && (
          <div className="pt-2 border-t border-surface-800 space-y-2">
            <div>
              <label className="text-[9px] text-surface-500 uppercase tracking-wider mb-0.5 block">Descripción</label>
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                onBlur={() => onUpdate(scene.id, { description: editDesc })}
                placeholder="Scene description (script only, not used for generation)"
                className="input-field h-12 resize-none text-[10px]"
              />
            </div>
            <div>
              <label className="text-[9px] text-surface-500 uppercase tracking-wider mb-0.5 block">Prompt</label>
              <div className="bg-surface-800/50 rounded-lg border border-surface-700 px-3 py-2">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-[10px] text-surface-300 leading-relaxed min-h-[20px] line-clamp-2">
                    {scene.prompt || <span className="text-surface-600 italic">No prompt set</span>}
                  </p>
                  <button
                    onClick={() => setShowQuickComposer(true)}
                    className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Sparkles size={10} />
                    Generate
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => onDuplicate(scene.id)}
                className="text-[9px] text-surface-500 hover:text-accent-400 flex items-center gap-1">
                <Copy size={10} /> Duplicate
              </button>
              {nextSceneId && (
                <>
                  <span className="text-surface-700">|</span>
                  <button
                    onClick={() => {
                      const existing = transitions.find(
                        t => t.fromSceneId === scene.id && t.toSceneId === nextSceneId
                      )
                      if (existing) {
                        onRemoveTransition(existing.id)
                      } else {
                        onAddTransition(scene.id, nextSceneId)
                      }
                    }}
                    className={`text-[9px] flex items-center gap-1 ${
                      transitions.some(t => t.fromSceneId === scene.id && t.toSceneId === nextSceneId)
                        ? 'text-amber-400 hover:text-amber-300'
                        : 'text-surface-500 hover:text-amber-400'
                    }`}
                  >
                    <ArrowRight size={10} /> Transition
                  </button>
                </>
              )}
              <button onClick={() => onRemove(scene.id)}
                className="text-[9px] text-surface-500 hover:text-red-400 flex items-center gap-1 ml-auto">
                <Trash2 size={10} /> Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* QuickPromptComposer modal */}
      {showQuickComposer && (
        <QuickPromptComposer
          basePrompt={scene.prompt}
          aspectRatio={scene.imageBase64 ? scene.aspectRatio : defaultAspectRatio}
          resolution={scene.resolution}
          styleSuffix={styleSuffix}
          onGenerated={handleQuickGenerated}
          onClose={() => setShowQuickComposer(false)}
        />
      )}

      {/* Library picker modal */}
      {showLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setShowLibrary(false)}>
          <div className="bg-surface-900 border border-surface-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
              <h3 className="text-sm font-semibold text-surface-100">Image Library</h3>
              <button onClick={() => setShowLibrary(false)} className="text-surface-500 hover:text-surface-200"><X size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-4 gap-2">
                {libraryAssets.map((asset: any) => (
                  <button key={asset.id} onClick={() => handleLibrarySelect(asset)} className="aspect-square bg-surface-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-accent-500 transition-all">
                    <img
                      src={srcUrl(asset.localPath || asset.filePath)}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                ))}
              </div>
              {libraryAssets.length === 0 && (
                <p className="text-xs text-surface-500 text-center py-8">No images in library</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

import { IMAGE_MODELS, VIDEO_MODELS, calcCost, calcVideoCost, costCredits } from '../lib/models'

function getImageModelCost(modelId: string): number {
  const m = IMAGE_MODELS.find(m => m.t2iId === modelId || m.i2iId === modelId)
  return m ? calcCost(m, '1K').totalCredits : 0
}
function getVideoModelCost(modelId: string, resolution?: string, seconds?: number): number {
  const m = VIDEO_MODELS.find(m => m.t2vId === modelId || m.i2vId === modelId || m.fflfId === modelId)
  if (!m) return 0
  return calcVideoCost(m, { resolution, requestedSeconds: seconds || 0 }).totalCredits
}

export function StoryboardPage() {
  const store = useStoryboardStore()
  const {
    boardId, boardName, scenes, transitions,
    imageModelId, videoModelId, transitionModelId,
    defaultDuration, defaultAspectRatio, defaultResolution, loaded,
  } = store

  const [boards, setBoards] = useState<any[]>([])
  const [showVideoModels, setShowVideoModels] = useState(false)
  const [showTransitionModels, setShowTransitionModels] = useState(false)
  const [showAr, setShowAr] = useState(false)
  const [showRes, setShowRes] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editNameId, setEditNameId] = useState<string | null>(null)
  const [editNameValue, setEditNameValue] = useState('')
  const [styleModalMode, setStyleModalMode] = useState<'create' | 'change' | null>(null)
  const [styleSuffixes, setStyleSuffixes] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'script' | 'elements' | 'story'>('story')
  const dragIndex = useRef<number | null>(null)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId)

  // Load style suffix map (for prompt injection)
  useEffect(() => {
    const api = (window as any).electronAPI
    api?.storyboard?.listStyles?.().then((styles: any[]) => {
      const map: Record<string, string> = {}
      for (const s of styles) map[s.id] = s.suffix || ''
      setStyleSuffixes(map)
    }).catch(() => { /* */ })
  }, [])

  const refreshBoardList = useCallback(async (): Promise<any[]> => {
    const api = (window as any).electronAPI
    const list = await api?.storyboard.list()
    const result = list || []
    setBoards(result)
    return result
  }, [])

  // Load board list on mount and when the active workspace changes
  useEffect(() => {
    refreshBoardList()
  }, [refreshBoardList, activeWorkspaceId])

  const handleCreateBoard = async (name: string, style: string) => {
    const newId = await store.createBoard(name, style)
    if (newId) await store.loadBoard(newId)
    await refreshBoardList()
  }

  const handleDeleteBoard = async (id: string) => {
    setConfirmDeleteId(null)
    if (boardId === id) store.clear()
    await store.deleteBoard(id)
    await refreshBoardList()
  }

  const handleOpenBoard = async (id: string) => {
    if (editNameId) return
    setConfirmDeleteId(null)
    await store.loadBoard(id)
  }

  const handleBack = () => {
    store.clear()
    refreshBoardList()
  }

  const styleSuffix = store.style
    ? styleSuffixes[store.style] !== undefined ? styleSuffixes[store.style] : store.style
    : ''

  const handleImageGenerated = useCallback((sceneId: string, base64: string, prompt: string, assetId?: string) => {
    store.setSceneImage(sceneId, base64, assetId || '')
    if (prompt) store.updateScene(sceneId, { prompt })
    const api = (window as any).electronAPI
    if (assetId) {
      api?.storyboard.setSceneAsset(sceneId, 'image', assetId)
    }
  }, [store])

  const handleRenameBoard = async (id: string, name: string) => {
    setEditNameId(null)
    const api = (window as any).electronAPI
    await api?.storyboard.updateName(id, name)
    await refreshBoardList()
  }

  const formatDate = (ts: number) => {
    if (!ts) return ''
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Generate video for a scene (image-to-video)
  const handleGenerateVideo = useCallback(async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId)
    if (!scene || !scene.imageBase64) return

    store.updateScene(sceneId, { isGeneratingVideo: true })
    try {
      const api = (window as any).electronAPI
      const taskId = await api?.openfield.generateVideo({
        sceneId,
        prompt: scene.prompt,
        model: videoModelId,
        imageBase64: scene.imageBase64,
        imageMime: 'image/png',
        duration: defaultDuration,
        aspectRatio: '16:9',
        resolution: scene.resolution || '1K',
      })

      const check = () => {
        const unsub = api.on('openfield:task:completed', (p: any) => {
          if (p.taskId === taskId) {
            unsub?.()
            api.assets.readBase64([p.assetId]).then((results: any[]) => {
              if (results?.[0]?.base64) {
                store.setSceneVideo(sceneId, results[0].base64, p.assetId)
                api?.storyboard.setSceneAsset(sceneId, 'video', p.assetId)
              } else {
                store.updateScene(sceneId, { isGeneratingVideo: false })
              }
            }).catch(() => store.updateScene(sceneId, { isGeneratingVideo: false }))
          }
        })
        api.on('openfield:task:failed', (p: any) => {
          if (p.taskId === taskId) {
            unsub?.()
            store.updateScene(sceneId, { isGeneratingVideo: false })
          }
        })
      }
      check()
    } catch (err) {
      console.error('Scene video generation failed:', err)
      store.updateScene(sceneId, { isGeneratingVideo: false })
    }
  }, [scenes, videoModelId, defaultDuration, store])

  // Generate transition between two scenes
  const handleGenerateTransition = useCallback(async (transitionId: string) => {
    const t = transitions.find(tr => tr.id === transitionId)
    if (!t) return
    const fromScene = scenes.find(s => s.id === t.fromSceneId)
    const toScene = scenes.find(s => s.id === t.toSceneId)
    if (!fromScene?.imageBase64 || !toScene?.imageBase64) return

    store.updateTransition(transitionId, { isGenerating: true })
    try {
      const api = (window as any).electronAPI
      const taskId = await api?.openfield.generateVideo({
        transitionId,
        prompt: `Smooth transition from scene to scene`,
        model: transitionModelId,
        firstFrameBase64: fromScene.imageBase64,
        lastFrameBase64: toScene.imageBase64,
        duration: t.duration,
        aspectRatio: '16:9',
        resolution: '1K',
      })

      const check = () => {
        const unsub = api.on('openfield:task:completed', (p: any) => {
          if (p.taskId === taskId) {
            unsub?.()
            api.assets.readBase64([p.assetId]).then((results: any[]) => {
              if (results?.[0]?.base64) {
                store.updateTransition(transitionId, {
                  videoBase64: results[0].base64,
                  videoAssetId: p.assetId,
                  isGenerating: false,
                })
                api?.storyboard.updateTransition(transitionId, { videoAssetId: p.assetId })
              } else {
                store.updateTransition(transitionId, { isGenerating: false })
              }
            }).catch(() => store.updateTransition(transitionId, { isGenerating: false }))
          }
        })
        api.on('openfield:task:failed', (p: any) => {
          if (p.taskId === taskId) {
            unsub?.()
            store.updateTransition(transitionId, { isGenerating: false })
          }
        })
      }
      check()
    } catch (err) {
      console.error('Transition generation failed:', err)
      store.updateTransition(transitionId, { isGenerating: false })
    }
  }, [scenes, transitions, transitionModelId, store])

  // Total credit cost
  const totalCost = scenes.reduce((sum, s) => sum + (s.imageBase64 ? 0 : getImageModelCost(imageModelId)), 0)
    + transitions.filter(t => !t.videoBase64).length * getVideoModelCost(transitionModelId, defaultResolution, defaultDuration)

  // Group shots into scene rows (from script ## Escena headers when counts match)
  const scriptScenes = useMemo(() => parseScriptScenes(store.script), [store.script])
  const sceneGroups = useMemo(() => {
    const groups: { title: string; description: string; shotCount: number; shots: SceneShot[] }[] = []
    const totalShots = scriptScenes.reduce((a, s) => a + s.shotCount, 0)
    if (scriptScenes.length > 0 && totalShots > 0 && totalShots === scenes.length) {
      let idx = 0
      for (const sc of scriptScenes) {
        groups.push({ title: sc.title, description: sc.description, shotCount: sc.shotCount, shots: scenes.slice(idx, idx + sc.shotCount) })
        idx += sc.shotCount
      }
    } else {
      for (let i = 0; i < scenes.length; i++) {
        groups.push({ title: `Escena ${i + 1}`, description: scenes[i].description, shotCount: 1, shots: [scenes[i]] })
      }
    }
    return groups
  }, [scriptScenes, scenes])

  const handleExtractElements = (els: Omit<StoryboardElement, 'id'>[]) => {
    return store.addElements(els)
  }

  // ─── Home view: grid of storyboards ─────────────────────────────
  if (!boardId) {
    return (
      <div className="flex flex-col h-full">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-800 flex-shrink-0">
          <h1 className="text-sm font-semibold text-surface-100 flex items-center gap-2">
            <Clapperboard size={16} className="text-accent-400" />
            Storyboards
          </h1>
          <span className="text-[10px] text-surface-600">{boards.length} {boards.length === 1 ? 'board' : 'boards'}</span>
          <button
            onClick={() => refreshBoardList()}
            title="Reload storyboards"
            className="p-1.5 rounded-lg text-surface-500 hover:text-surface-100 hover:bg-surface-800 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setStyleModalMode('create')} className="btn-primary text-xs flex items-center gap-1.5 ml-auto">
            <Plus size={12} /> New Storyboard
          </button>
        </div>

        {/* Grid of cards */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-6xl mx-auto">
            {boards.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-surface-600">
                <Clapperboard size={48} className="mb-4 opacity-50" />
                <p className="text-sm">No storyboards yet. Create your first one to start storyboarding.</p>
                <button onClick={() => setStyleModalMode('create')} className="btn-primary text-xs mt-4 flex items-center gap-1.5">
                  <Plus size={12} /> New Storyboard
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {boards.map(board => (
                  <div key={board.id} className="card overflow-hidden group relative !p-0">
                    <button onClick={() => handleOpenBoard(board.id)} className="w-full text-left block">
                      <div className="relative aspect-video bg-surface-800 overflow-hidden">
                        {board.thumbnailPath ? (
                          <img
                            src={srcUrl(board.thumbnailPath, board.updated_at)}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Clapperboard size={28} className="text-surface-700" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-surface-950/70 to-transparent" />
                        <span className="absolute bottom-2 left-2 text-[10px] font-mono text-surface-300 bg-black/50 px-1.5 py-0.5 rounded">
                          {board.sceneCount ?? 0} scenes
                        </span>
                      </div>
                      <div className="p-3">
                        {editNameId === board.id ? (
                          <input
                            value={editNameValue}
                            onChange={e => setEditNameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); handleRenameBoard(board.id, editNameValue) }
                              if (e.key === 'Escape') setEditNameId(null)
                            }}
                            onBlur={() => handleRenameBoard(board.id, editNameValue)}
                            className="text-xs font-semibold w-full bg-surface-800 border border-surface-700 rounded px-1.5 py-0.5 text-surface-100 outline-none focus:border-accent-500"
                            autoFocus
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <span
                            onClick={e => { e.stopPropagation(); setEditNameId(board.id); setEditNameValue(board.name) }}
                            className="text-xs font-semibold text-surface-100 truncate w-full text-left hover:text-accent-400 transition-colors flex items-center gap-1 group cursor-pointer"
                            title="Click to rename"
                            role="button"
                            tabIndex={0}
                          >
                            <span className="truncate">{board.name}</span>
                            <Pencil size={10} className="text-surface-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </span>
                        )}
                        <p className="text-[10px] text-surface-500 mt-0.5">
                          {formatDate(board.updatedAt ?? board.updated_at)}
                        </p>
                      </div>
                    </button>

                    {confirmDeleteId === board.id ? (
                      <div className="absolute top-2 right-2 flex gap-1 bg-surface-900 border border-surface-700 rounded-lg p-1 z-10">
                        <span className="text-[9px] text-surface-300 px-1 self-center">Delete?</span>
                        <button
                          onClick={() => handleDeleteBoard(board.id)}
                          className="px-1.5 py-0.5 bg-red-500/80 rounded text-[9px] text-white hover:bg-red-500"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] text-white hover:bg-white/20"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(board.id)}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 hover:bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title="Delete storyboard"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}

                {/* New board card */}
                <button
                  onClick={() => setStyleModalMode('create')}
                  className="aspect-video border-2 border-dashed border-surface-800 rounded-xl flex flex-col items-center justify-center gap-2 text-surface-600 hover:text-accent-400 hover:border-accent-400/40 transition-all"
                >
                  <Plus size={24} />
                  <span className="text-xs">New Storyboard</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Style modal */}
        {styleModalMode === 'create' && (
          <StoryboardStyleModal
            mode="create"
            defaultName={`Storyboard ${boards.length + 1}`}
            onConfirm={async (name, style) => {
              await handleCreateBoard(name, style)
              setStyleModalMode(null)
            }}
            onClose={() => setStyleModalMode(null)}
          />
        )}
      </div>
    )
  }

  // ─── Editor view: a single storyboard ───────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-800 flex-shrink-0 flex-wrap">
        <button
          onClick={handleBack}
          title="Back to storyboards"
          className="p-1.5 rounded-lg text-surface-500 hover:text-surface-100 hover:bg-surface-800 transition-colors"
        >
          <ArrowLeft size={14} />
        </button>
        <button
          onClick={() => store.loadBoard(boardId)}
          title="Recargar storyboard"
          className="p-1.5 rounded-lg text-surface-500 hover:text-surface-100 hover:bg-surface-800 transition-colors"
        >
          <RefreshCw size={14} />
        </button>
        {editNameId === boardId ? (
          <input
            value={editNameValue}
            onChange={e => setEditNameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); store.setBoardName(editNameValue); setEditNameId(null) }
              if (e.key === 'Escape') setEditNameId(null)
            }}
            onBlur={() => { store.setBoardName(editNameValue); setEditNameId(null) }}
            className="text-sm font-semibold bg-surface-800 border border-surface-700 rounded px-2 py-0.5 text-surface-100 outline-none focus:border-accent-500 max-w-[220px]"
            autoFocus
          />
        ) : (
          <button
            onClick={() => { setEditNameId(boardId); setEditNameValue(boardName) }}
            className="text-sm font-semibold text-surface-100 truncate max-w-[220px] hover:text-accent-400 transition-colors flex items-center gap-1.5 group"
            title="Click to rename"
          >
            <span className="truncate">{boardName}</span>
            <Pencil size={11} className="text-surface-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </button>
        )}

        {/* Style badge */}
        <button
          onClick={() => setStyleModalMode('change')}
          title="Cambiar estilo visual"
          className={`text-[10px] px-2 py-1 rounded-lg border flex items-center gap-1.5 transition-colors ${
            store.style
              ? 'bg-accent-500/10 text-accent-400 border-accent-500/30 hover:bg-accent-500/20'
              : 'bg-surface-800 text-surface-500 border-dashed border-surface-700 hover:text-surface-300 hover:border-surface-600'
          }`}
        >
          <Palette size={12} />
          <span className="max-w-[120px] truncate">{store.style || 'Sin estilo'}</span>
        </button>

        <div className="h-5 w-px bg-surface-800" />

        {/* Video model selector */}
        <div className="relative">
          <button onClick={() => setShowVideoModels(!showVideoModels)}
            className="text-[10px] px-2 py-1 rounded-lg bg-surface-800 text-surface-300 hover:text-surface-100 border border-surface-700 flex items-center gap-1.5">
            <Video size={12} className="text-blue-400" />
            {VIDEO_MODELS.find(m => m.t2vId === videoModelId || m.i2vId === videoModelId)?.name || 'Select'}
          </button>
          {showVideoModels && (
            <div className="absolute top-full mt-1 bg-surface-800 border border-surface-700 rounded-lg py-1 z-50 min-w-[180px] shadow-xl max-h-60 overflow-y-auto"
              onMouseLeave={() => setShowVideoModels(false)}>
              {VIDEO_MODELS.map(m => (
                <button key={m.t2vId}
                  onClick={() => { store.setVideoModelId(m.t2vId!); store.saveSettings(); setShowVideoModels(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${(videoModelId === m.t2vId || videoModelId === m.i2vId) ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:bg-surface-700/50 hover:text-surface-200'}`}>
                  <span>{m.name}</span>
                  <span className="text-[10px] text-amber-400">{costCredits(m)} cr</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Transition model selector */}
        <div className="relative">
          <button onClick={() => setShowTransitionModels(!showTransitionModels)}
            className="text-[10px] px-2 py-1 rounded-lg bg-surface-800 text-surface-300 hover:text-surface-100 border border-surface-700 flex items-center gap-1.5">
            <ArrowRight size={12} className="text-amber-400" />
            {VIDEO_MODELS.find(m => m.fflfId === transitionModelId || m.t2vId === transitionModelId)?.name || 'Select'}
          </button>
          {showTransitionModels && (
            <div className="absolute top-full mt-1 bg-surface-800 border border-surface-700 rounded-lg py-1 z-50 min-w-[180px] shadow-xl max-h-60 overflow-y-auto"
              onMouseLeave={() => setShowTransitionModels(false)}>
              {VIDEO_MODELS.filter(m => m.fflfId).map(m => (
                <button key={m.fflfId}
                  onClick={() => { store.setTransitionModelId(m.fflfId!); store.saveSettings(); setShowTransitionModels(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${transitionModelId === m.fflfId ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:bg-surface-700/50 hover:text-surface-200'}`}>
                  <span>{m.name}</span>
                  <span className="text-[10px] text-amber-400">{costCredits(m)} cr</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Aspect ratio selector */}
          <div className="relative">
            <button onClick={() => { setShowAr(!showAr); setShowRes(false) }}
              className="text-[10px] px-2 py-1 rounded-lg bg-surface-800 text-surface-300 hover:text-surface-100 border border-surface-700 flex items-center gap-1.5">
              <Maximize size={12} className="text-purple-400" />
              {defaultAspectRatio}
            </button>
            {showAr && (
              <div className="absolute top-full right-0 mt-1 bg-surface-800 border border-surface-700 rounded-lg py-1 z-50 min-w-[100px] shadow-xl"
                onMouseLeave={() => setShowAr(false)}>
                {['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'].map(r => (
                  <button key={r}
                    onClick={() => { store.setAspectRatio(r); store.saveSettings(); setShowAr(false) }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${defaultAspectRatio === r ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:bg-surface-700/50 hover:text-surface-200'}`}>
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Resolution selector */}
          <div className="relative">
            <button onClick={() => { setShowRes(!showRes); setShowAr(false) }}
              className="text-[10px] px-2 py-1 rounded-lg bg-surface-800 text-surface-300 hover:text-surface-100 border border-surface-700 flex items-center gap-1.5">
              <Monitor size={12} className="text-cyan-400" />
              {defaultResolution}
            </button>
            {showRes && (
              <div className="absolute top-full right-0 mt-1 bg-surface-800 border border-surface-700 rounded-lg py-1 z-50 min-w-[80px] shadow-xl"
                onMouseLeave={() => setShowRes(false)}>
                {['1K', '2K', '4K'].map(r => (
                  <button key={r}
                    onClick={() => { store.setResolution(r); store.saveSettings(); setShowRes(false) }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${defaultResolution === r ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:bg-surface-700/50 hover:text-surface-200'}`}>
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="btn-primary text-xs flex items-center gap-1.5">
            <Coins size={12} /> {totalCost} credits
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center justify-center px-4 py-2 border-b border-surface-800 flex-shrink-0">
        <Tabs
          tabs={[
            { id: 'script', label: 'Guión', icon: FileText, count: store.script ? Math.max(1, (store.script.match(/^##\s/gm) || []).length) : 0 },
            { id: 'elements', label: 'Elements', icon: Shapes, count: store.elements.length },
            { id: 'story', label: 'Story', icon: Film, count: scenes.length },
          ]}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as any)}
        />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'script' && (
          <ScriptTab
            script={store.script}
            onScriptChange={store.setScript}
            elements={store.elements}
            onCreateElements={handleExtractElements}
            onSwitchToElements={() => setActiveTab('elements')}
          />
        )}

        {activeTab === 'elements' && (
          <ElementsTab
            elements={store.elements}
            onRemove={store.removeElement}
            onExtract={() => { handleExtractElements(extractScriptElements(store.script)) }}
          />
        )}

        {activeTab === 'story' && (
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto">
              {scenes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-surface-600">
                  <Film size={48} className="mb-4 opacity-50" />
                  <p className="text-sm">No scenes yet. Add your first scene to start building.</p>
                  <button
                    onClick={() => store.addScene()}
                    className="btn-primary text-xs mt-4 flex items-center gap-1.5"
                  >
                    <Plus size={12} /> Add Scene
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {sceneGroups.map((group, gi) => {
                    const baseIndex = sceneGroups.slice(0, gi).reduce((a, g) => a + g.shots.length, 0)
                    return (
                      <div key={gi} className="panel overflow-hidden">
                        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-surface-800 bg-surface-900/60">
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-accent-500/10 text-accent-400 border border-accent-500/20 flex-shrink-0">
                            Escena {gi + 1}
                          </span>
                          <span className="text-xs font-semibold text-surface-100 truncate">{group.title}</span>
                          {group.shotCount > 1 && (
                            <span className="text-[10px] text-surface-500 flex-shrink-0">{group.shotCount} tomas</span>
                          )}
                          <div className="flex-1" />
                          <span className="text-[10px] text-surface-500 flex-shrink-0">
                            {group.shots.filter(s => s.imageBase64).length}/{group.shots.length} imágenes
                          </span>
                        </div>
                        {group.description && (
                          <p className="px-4 pt-2.5 pb-0 text-[11px] text-surface-500 leading-relaxed">{group.description}</p>
                        )}
                        <div className="p-4 flex flex-wrap gap-3 items-start">
                          {group.shots.map((scene, j) => {
                            const i = baseIndex + j
                            return (
                              <div key={scene.id} className="w-[220px] flex-shrink-0">
                                <SceneCard
                                  scene={scene}
                                  index={i}
                                  total={scenes.length}
                                  nextSceneId={i < scenes.length - 1 ? scenes[i + 1].id : null}
                                  transitions={transitions}
                                  onUpdate={store.updateScene}
                                  onRemove={store.removeScene}
                                  onDuplicate={store.duplicateScene}
                                  onAddTransition={store.addTransition}
                                  onRemoveTransition={store.removeTransition}
                                  onGenerateVideo={handleGenerateVideo}
                                  onDragStart={(e, idx) => { dragIndex.current = idx; e.dataTransfer.effectAllowed = 'move' }}
                                  onDrop={(dropIdx) => {
                                    if (dragIndex.current != null && dragIndex.current !== dropIdx) {
                                      store.reorderScenes(dragIndex.current, dropIdx)
                                    }
                                    dragIndex.current = null
                                  }}
                                  videoCost={getVideoModelCost(videoModelId, defaultResolution, defaultDuration)}
                                  defaultAspectRatio={defaultAspectRatio}
                                  styleSuffix={styleSuffix}
                                  onImageGenerated={(base64, prompt, assetId) => handleImageGenerated(scene.id, base64, prompt, assetId)}
                                />
                              </div>
                            )
                          })}
                          <button
                            onClick={() => store.addScene()}
                            className="w-[220px] h-full min-h-[150px] flex-shrink-0 border-2 border-dashed border-surface-800 rounded-xl text-surface-600 hover:text-surface-400 hover:border-surface-600 transition-all flex flex-col items-center justify-center gap-1.5"
                            title="Add shot to this scene"
                          >
                            <Plus size={18} />
                            <span className="text-[10px]">Add Shot</span>
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {/* Add scene at end */}
                  <button
                    onClick={() => store.addScene()}
                    className="w-full py-6 border-2 border-dashed border-surface-800 rounded-xl text-surface-600 hover:text-surface-400 hover:border-surface-600 transition-all flex flex-col items-center gap-2"
                  >
                    <Plus size={20} />
                    <span className="text-xs">Add Scene</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Style change modal */}
      {styleModalMode === 'change' && (
        <StoryboardStyleModal
          mode="change"
          defaultName={boardName}
          currentStyle={store.style}
          onConfirm={async (_name, style) => {
            store.setStyle(style)
            setStyleModalMode(null)
          }}
          onClose={() => setStyleModalMode(null)}
        />
      )}
    </div>
  )
}
