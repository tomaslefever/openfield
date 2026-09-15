import { useState, useEffect, useRef } from 'react'
import { Sparkles, X, ChevronDown, RefreshCw, Wand2, Plus, BookOpen, Library, Upload } from 'lucide-react'
import { ASPECT_RATIOS } from './aspect-ratios'
import { ImageLibraryPicker } from './ImageLibraryPicker'
import { useElementsStore } from '../stores/elements-store'
import { usePromptLibraryStore } from '../stores/prompt-library-store'

interface ImageModelOption {
  id: string
  name: string
  category: string
}

const IMAGE_GEN_MODELS: ImageModelOption[] = [
  { id: 'gpt-image-2-text-to-image', name: 'GPT Image 2', category: 'OpenAI' },
  { id: 'gpt-image-2-image-to-image', name: 'GPT Image 2 I2I', category: 'OpenAI' },
  { id: 'nano-banana-2', name: 'Nano Banana 2', category: 'Google' },
  { id: 'nano-banana-2-lite', name: 'Nano Banana 2 Lite', category: 'Google' },
  { id: 'seedream-5-pro-text-to-image', name: 'Seedream 5 Pro', category: 'Seedream' },
  { id: 'seedream-5-pro-image-to-image', name: 'Seedream 5 Pro I2I', category: 'Seedream' },
  { id: 'flux2-pro-text-to-image', name: 'Flux 2 Pro', category: 'Flux' },
  { id: 'grok-imagine/text-to-image', name: 'Grok Imagine', category: 'Grok' },
  { id: 'imagen4-fast', name: 'Imagen 4 Fast', category: 'Google' },
]

export interface QuickPromptComposerResult {
  base64: string
  prompt: string
  model: string
  taskId: string
  assetId: string
}

interface QuickPromptComposerProps {
  variant?: 'modal' | 'inline'
  basePrompt?: string
  referenceImage?: string
  referenceMime?: string
  imageRefs?: { base64: string; mime: string }[]
  aspectRatio?: string
  aspectRatioLocked?: boolean
  resolution?: string
  resolutionLocked?: boolean
  promptLocked?: boolean
  styleSuffix?: string
  onGenerated: (result: QuickPromptComposerResult) => void
  onTaskCreated?: (taskId: string) => void
  onClose: () => void
}

function readFileAsBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve({ base64: result.split(',')[1], mime: file.type })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function QuickPromptComposer({
  variant = 'modal',
  basePrompt = '',
  referenceImage,
  referenceMime = 'image/png',
  imageRefs,
  aspectRatio = '1:1',
  aspectRatioLocked = false,
  resolution = '1K',
  resolutionLocked = false,
  promptLocked = false,
  styleSuffix = '',
  onGenerated,
  onTaskCreated,
  onClose,
}: QuickPromptComposerProps) {
  const [prompt, setPrompt] = useState('')
  const [extRefs, setExtRefs] = useState<{ base64: string; mime: string }[]>([])
  const [dragOver, setDragOver] = useState(false)
  const dragCounter = useRef(0)
  const allRefs = [...(imageRefs || []), ...extRefs]
  const hasRefs = !!(referenceImage || allRefs.length > 0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const elements = useElementsStore(s => s.elements)
  const loadElements = useElementsStore(s => s.loadElements)
  const promptLibrary = usePromptLibraryStore(s => s.entries)

  const [showPromptLib, setShowPromptLib] = useState(false)
  const [showInsertMenu, setShowInsertMenu] = useState(false)
  const [showInsertLibrary, setShowInsertLibrary] = useState(false)
  const insertRef = useRef<HTMLDivElement>(null)
  const insertFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadElements() }, [loadElements])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 280) + 'px'
  }, [prompt])

  // @-mention support
  const [atOpen, setAtOpen] = useState(false)
  const [atQuery, setAtQuery] = useState('')
  const atStartRef = useRef(-1)

  const filteredElements = elements.filter(el =>
    el.name.toLowerCase().includes(atQuery.toLowerCase())
  ).slice(0, 8)

  const handlePromptChange = (value: string) => {
    setPrompt(value)
    const ta = textareaRef.current
    if (!ta) return
    const cursor = ta.selectionStart
    const textBefore = value.slice(0, cursor)

    // Find @ trigger before cursor
    const atIdx = textBefore.lastIndexOf('@')
    if (atIdx >= 0 && (atIdx === 0 || textBefore[atIdx - 1] === ' ' || textBefore[atIdx - 1] === '\n')) {
      const query = textBefore.slice(atIdx + 1)
      if (!query.includes(' ') && !query.includes('\n')) {
        setAtOpen(true)
        setAtQuery(query)
        atStartRef.current = atIdx
        return
      }
    }
    setAtOpen(false)
    atStartRef.current = -1
  }

  const handleAtSelect = (el: any) => {
    const before = prompt.slice(0, atStartRef.current)
    const after = prompt.slice(textareaRef.current?.selectionStart ?? atStartRef.current + atQuery.length + 1)
    const insertion = `@element:${el.name}\u200B`
    const newPrompt = before + insertion + ' ' + after
    setPrompt(newPrompt)
    setAtOpen(false)
    atStartRef.current = -1
  }
  const [model, setModel] = useState<string>(
    hasRefs ? 'gpt-image-2-image-to-image' : 'gpt-image-2-text-to-image',
  )
  const [generating, setGenerating] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [resOpen, setResOpen] = useState(false)
  const [arOpen, setArOpen] = useState(false)
  const [res, setRes] = useState(resolution)
  const [ar, setAr] = useState(aspectRatio)
  const popoverRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)

  useEffect(() => { return () => { mountedRef.current = false } }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (insertRef.current && !insertRef.current.contains(e.target as Node)) {
        setShowInsertMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectedModel = IMAGE_GEN_MODELS.find((m) => m.id === model)

  const fullPrompt = promptLocked
    ? basePrompt
    : basePrompt && prompt.trim()
    ? `${basePrompt}\n\n${prompt.trim()}`
    : basePrompt || prompt.trim()

  const promptWithStyle = fullPrompt && styleSuffix
    ? fullPrompt.toLowerCase().includes(styleSuffix.toLowerCase())
      ? fullPrompt
      : `${fullPrompt.replace(/\s+$/, '')}, ${styleSuffix}`
    : fullPrompt

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (let i = 0; i < files.length; i++) {
      if (!files[i].type.startsWith('image/')) continue
      if (files[i].size > 10 * 1024 * 1024) continue
      try {
        const { base64, mime } = await readFileAsBase64(files[i])
        setExtRefs(prev => [...prev, { base64, mime }])
      } catch {}
    }
    e.target.value = ''
    setShowInsertMenu(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setDragOver(false)
    const files = e.dataTransfer?.files
    if (!files) return
    for (let i = 0; i < files.length; i++) {
      if (!files[i].type.startsWith('image/')) continue
      if (files[i].size > 10 * 1024 * 1024) continue
      try {
        const { base64, mime } = await readFileAsBase64(files[i])
        setExtRefs(prev => [...prev, { base64, mime }])
      } catch {}
    }
  }

  const removeExtRef = (i: number) => {
    setExtRefs(prev => prev.filter((_, j) => j !== i))
  }

  const handleInsertLibraryOpen = () => {
    setShowInsertMenu(false)
    setShowInsertLibrary(true)
  }

  const handleInsertLibrarySelect = async (assetOrAssets: any | any[]) => {
    const assets = Array.isArray(assetOrAssets) ? assetOrAssets : [assetOrAssets]
    if (assets.length === 0) return
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64(assets.map((a: any) => a.id))
      if (Array.isArray(results)) {
        const newRefs = results
          .filter((r: any) => r?.base64)
          .map((r: any, idx: number) => ({
            base64: r.base64,
            mime: r.mime || (assets[idx]?.type === 'video' ? 'video/mp4' : assets[idx]?.type === 'audio' ? 'audio/mpeg' : 'image/png')
          }))
        if (newRefs.length > 0) {
          setExtRefs(prev => [...prev, ...newRefs])
        }
      }
    } catch { /* ignore */ }
    setShowInsertLibrary(false)
  }

  const handleGenerate = async () => {
    if (!fullPrompt || generating) return
    console.log('[QuickComposer] handleGenerate:', { fullPrompt: fullPrompt.substring(0, 100), promptLocked, basePrompt: basePrompt?.substring(0, 100), model, ar, res, refs: allRefs.length, styleSuffix: styleSuffix?.substring(0, 60) })
    setGenerating(true)

    try {
      const api = (window as any).electronAPI
      if (!api?.openfield?.generateImage) return

      const mergedRefs = allRefs.length > 0 ? allRefs : undefined
      const taskId = await api.openfield.generateImage({
        prompt: promptWithStyle,
        model,
        imageBase64: mergedRefs ? mergedRefs[0].base64 : (referenceImage || undefined),
        imageMime: mergedRefs ? mergedRefs[0].mime : (referenceImage ? referenceMime : undefined),
        imageRefs: mergedRefs && mergedRefs.length > 1 ? mergedRefs : undefined,
        aspectRatio: ar,
        resolution: res,
      })

      onTaskCreated?.(taskId)

      if (promptLocked) {
        if (mountedRef.current) setGenerating(false)
        return
      }

      const handler = (data: any) => {
        if (data.taskId !== taskId) return
        unsubscribeOk()
        unsubscribeFail()
        if (!mountedRef.current) return
        ;(async () => {
          try {
            const results = await api.assets.readBase64([data.asset?.id])
            const b64 = results?.[0]?.base64 || ''
              if (b64 && mountedRef.current) {
              onGenerated({ base64: b64, prompt: promptWithStyle, model, taskId, assetId: data.asset?.id || taskId })
            }
          } catch { /* ignore */ }
          setGenerating(false)
        })()
      }

      const failHandler = (data: any) => {
        if (data.taskId !== taskId) return
        unsubscribeOk()
        unsubscribeFail()
        if (mountedRef.current) setGenerating(false)
      }

      const unsubscribeOk = api.on('openfield:task:completed', handler)
      const unsubscribeFail = api.on('openfield:task:failed', failHandler)
    } catch {
      if (mountedRef.current) setGenerating(false)
    }
  }

  // Compact reference chip
  const RefChip = ({ base64, mime, label, onRemove }: { base64: string; mime: string; label: string; onRemove?: () => void }) => (
    <span className="inline-flex items-center gap-1 bg-surface-800/80 border border-surface-700 rounded-md pl-1 pr-1 h-6 text-[10px] text-surface-400 group/chip">
      <img src={`data:${mime};base64,${base64}`} className="size-4 rounded object-cover" alt="" />
      <span className="max-w-[50px] truncate">{label}</span>
      {onRemove && (
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove() }} className="text-surface-500 hover:text-red-400 opacity-0 group-hover/chip:opacity-100">
          <X size={10} />
        </button>
      )}
    </span>
  )

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        ref={popoverRef}
        className={`absolute left-1/2 top-1/3 -translate-x-1/2 bg-surface-900 border rounded-2xl shadow-2xl shadow-black/40 w-[420px] transition-colors ${dragOver ? 'border-accent-500/60' : 'border-surface-700/60'}`}
        onClick={(e) => e.stopPropagation()}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setDragOver(true) }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOver(false) } }}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-700/40">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-accent-500/10 rounded-md flex items-center justify-center">
              <Sparkles size={10} className="text-accent-400" />
            </div>
            <span className="text-[12px] font-medium text-surface-300">Quick Generate</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowPromptLib(!showPromptLib)}
              className="text-surface-500 hover:text-surface-200 p-1"
              title="Insert from Prompt Library"
            >
              <BookOpen size={14} />
            </button>
            <button onClick={onClose} className="text-surface-500 hover:text-surface-200">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Prompt library dropdown */}
        {showPromptLib && (
          <div className="border-b border-surface-700/40 max-h-[160px] overflow-y-auto px-3 py-2">
            {promptLibrary.length === 0 ? (
              <p className="text-[11px] text-surface-500 py-2 text-center">No prompts in library</p>
            ) : (
              <div className="space-y-1">
                {promptLibrary.map(e => (
                  <button
                    key={e.id}
                    onClick={() => {
                      setPrompt(prev => prev ? prev + '\n' + e.prompt : e.prompt)
                      setShowPromptLib(false)
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-surface-800 transition-colors group"
                  >
                    <p className="text-[11px] font-medium text-surface-300 truncate">{e.name}</p>
                    <p className="text-[10px] text-surface-500 line-clamp-2">{e.prompt}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reference chips + upload dropzone */}
        {!promptLocked && (
          <div className="flex items-center gap-1.5 px-3 pt-2.5 flex-wrap">
            {imageRefs && imageRefs.map((ref, i) => (
              <RefChip key={`iref-${i}`} base64={ref.base64} mime={ref.mime} label={`Ref ${i + 1}`} />
            ))}
            {extRefs.map((ref, i) => (
              <RefChip key={`eref-${i}`} base64={ref.base64} mime={ref.mime} label="Upload" onRemove={() => removeExtRef(i)} />
            ))}
            <div className="relative" ref={insertRef}>
              <button
                onClick={() => setShowInsertMenu(!showInsertMenu)}
                className={`inline-flex items-center justify-center size-6 border border-dashed rounded-md cursor-pointer transition-colors flex-shrink-0 ${showInsertMenu ? 'border-accent-500/60 bg-surface-800 text-surface-200' : 'border-surface-600 hover:border-accent-500/50 text-surface-500'}`}
                title="Add reference"
              >
                <Plus size={10} />
              </button>
              {showInsertMenu && (
                <div className="absolute top-full left-0 mt-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[190px] shadow-xl z-50">
                  <button onClick={handleInsertLibraryOpen}
                    className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-surface-300 hover:bg-surface-700/50 transition-colors">
                    <Library size={12} className="text-accent-400" /> Insert from library
                  </button>
                  <button onClick={() => insertFileRef.current?.click()}
                    className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-surface-300 hover:bg-surface-700/50 transition-colors">
                    <Upload size={12} className="text-blue-400" /> Upload file
                  </button>
                </div>
              )}
            </div>
            <input ref={insertFileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
          </div>
        )}

        {/* Textarea / Locked prompt */}
        <div className="flex items-end gap-2 p-2">
          <div className="flex-1 relative">
            {promptLocked ? (
              <div className="px-2 py-2 text-xs text-surface-400 leading-relaxed min-h-[80px] flex items-start">
                <span className="whitespace-pre-wrap">{basePrompt}</span>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                placeholder="Describe what you want to generate... Use @ to reference elements"
                className="w-full bg-transparent text-sm text-surface-100 placeholder-surface-500 outline-none px-2 py-2 min-h-[80px] max-h-[280px] leading-relaxed resize-none"
                rows={3}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate() } }}
              />
            )}
            {prompt && !promptLocked && (
              <button
                onClick={() => setPrompt('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
              >
                <X size={14} />
              </button>
            )}
            {/* @-mention dropdown */}
            {atOpen && !promptLocked && (
              <div className="absolute left-2 bottom-full mb-1 bg-surface-800 border border-surface-700 rounded-lg py-1 min-w-[180px] max-h-[200px] overflow-y-auto shadow-xl z-50">
                {filteredElements.length === 0 ? (
                  <p className="px-3 py-2 text-[11px] text-surface-500">
                    {elements.length === 0 ? 'No elements created yet' : 'No matching elements'}
                  </p>
                ) : (
                  filteredElements.map(el => (
                    <button
                      key={el.id}
                      onClick={() => handleAtSelect(el)}
                      className="w-full text-left px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700 hover:text-surface-100 transition-colors flex items-center gap-2"
                    >
                      <span className="truncate">@{el.name}</span>
                      <span className="text-[10px] text-surface-600 flex-shrink-0">{el.kind}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!fullPrompt || generating}
            className="flex-shrink-0 w-8 h-8 bg-accent-600 hover:bg-accent-500 disabled:bg-surface-700 disabled:text-surface-600 text-white rounded-xl flex items-center justify-center transition-colors"
          >
            {generating ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center gap-1.5 px-3 pb-2.5">
          <div className="relative">
            <button
              onClick={() => setModelOpen(!modelOpen)}
              className="flex items-center gap-1 px-2 py-1 bg-surface-800/80 hover:bg-surface-700/80 rounded-lg text-[11px] font-medium text-surface-400 transition-colors"
            >
              <Wand2 size={10} /> {selectedModel?.name} <ChevronDown size={10} />
            </button>
            {modelOpen && (
              <div className="absolute bottom-full left-0 mb-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[200px] shadow-xl max-h-[190px] overflow-y-auto z-50">
                {IMAGE_GEN_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setModelOpen(false) }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                      m.id === model ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/50'
                    }`}
                  >
                    <div>
                      <span>{m.name}</span>
                      <span className="text-[10px] ml-2 text-surface-600">{m.category}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => !aspectRatioLocked && setArOpen(!arOpen)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                aspectRatioLocked
                  ? 'bg-surface-800/40 text-surface-600 cursor-not-allowed'
                  : 'bg-surface-800/80 hover:bg-surface-700/80 text-surface-400'
              }`}
            >
              {ar} {!aspectRatioLocked && <ChevronDown size={10} />}
            </button>
            {arOpen && !aspectRatioLocked && (
              <div className="absolute bottom-full left-0 mb-1.5 bg-surface-800 border border-surface-700 rounded-lg py-1 shadow-xl z-50 max-h-[165px] overflow-y-auto">
                {ASPECT_RATIOS.map((r) => (
                  <button
                    key={r}
                    onClick={() => { setAr(r); setArOpen(false) }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                      r === ar ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => !resolutionLocked && setResOpen(!resOpen)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                resolutionLocked
                  ? 'bg-surface-800/40 text-surface-600 cursor-not-allowed'
                  : 'bg-surface-800/80 hover:bg-surface-700/80 text-surface-400'
              }`}
            >
              {res} {!resolutionLocked && <ChevronDown size={10} />}
            </button>
            {resOpen && !resolutionLocked && (
              <div className="absolute bottom-full left-0 mb-1.5 bg-surface-800 border border-surface-700 rounded-lg py-1 shadow-xl z-50 max-h-[120px] overflow-y-auto">
                {['1K', '2K', '4K'].map((r) => (
                  <button
                    key={r}
                    onClick={() => { setRes(r); setResOpen(false) }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                      r === res ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {showInsertLibrary && (
          <ImageLibraryPicker onSelect={handleInsertLibrarySelect} onClose={() => setShowInsertLibrary(false)} />
        )}
      </div>
    </div>
  )
}
