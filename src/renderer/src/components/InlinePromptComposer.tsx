import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, Loader, ChevronDown } from 'lucide-react'

const IMAGE_MODELS = [
  { id: 'gpt-image-2-text-to-image', name: 'GPT Image 2', cost: 6 },
  { id: 'nano-banana-2', name: 'Nano Banana 2', cost: 8 },
  { id: 'seedream-5-pro-text-to-image', name: 'Seedream 5 Pro', cost: 12 },
  { id: 'flux2-pro-text-to-image', name: 'Flux 2 Pro', cost: 10 },
  { id: 'grok-imagine/text-to-image', name: 'Grok Imagine', cost: 4 },
  { id: 'imagen4-fast', name: 'Imagen 4 Fast', cost: 8 },
]

interface InlinePromptComposerProps {
  initialPrompt: string
  aspectRatio?: string
  resolution?: string
  modelId: string
  onModelChange?: (modelId: string) => void
  onChange?: (prompt: string) => void
  onGenerated: (base64: string, prompt: string) => void
}

export function InlinePromptComposer({
  initialPrompt,
  aspectRatio = '16:9',
  resolution = '1K',
  modelId,
  onModelChange,
  onChange,
  onGenerated,
}: InlinePromptComposerProps) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [generating, setGenerating] = useState(false)
  const [showModels, setShowModels] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const selectedModel = IMAGE_MODELS.find(m => m.id === modelId) || IMAGE_MODELS[0]

  useEffect(() => {
    setPrompt(initialPrompt)
  }, [initialPrompt])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [prompt])

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)

    try {
      const api = (window as any).electronAPI
      const modelIdToUse = modelId
      const taskId = await api?.openfield.generateImage({
        prompt: prompt.trim(),
        model: modelIdToUse,
        aspectRatio,
        resolution,
      })

      let resolved = false
      const cleanup1 = api.on('openfield:task:completed', (p: any) => {
        if (p.taskId !== taskId || resolved) return
        resolved = true
        cleanup1?.()
        cleanup2?.()
        api.assets.readBase64([p.assetId]).then((results: any[]) => {
          const b64 = results?.[0]?.base64 || ''
          if (b64) {
            onGenerated(b64, prompt.trim())
            setGenerating(false)
          } else {
            setGenerating(false)
          }
        }).catch(() => setGenerating(false))
      })

      const cleanup2 = api.on('openfield:task:failed', (p: any) => {
        if (p.taskId !== taskId || resolved) return
        resolved = true
        cleanup1?.()
        cleanup2?.()
        setGenerating(false)
      })
    } catch {
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => { setPrompt(e.target.value); onChange?.(e.target.value) }}
            placeholder="Describe the scene visually..."
            className="w-full bg-transparent text-xs text-surface-100 placeholder:text-surface-600 outline-none resize-none min-h-[36px] leading-relaxed py-1"
            rows={1}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleGenerate()
              }
            }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-surface-600">{aspectRatio}</span>
        <span className="text-surface-600">·</span>
        <span className="text-surface-600">{resolution}</span>
        <span className="text-surface-600">·</span>
        <div className="relative">
          <button
            onClick={() => setShowModels(!showModels)}
            className="text-amber-400 hover:text-amber-300 flex items-center gap-0.5 transition-colors"
          >
            {selectedModel.name}
            <ChevronDown size={10} />
          </button>
          {showModels && (
            <div className="absolute bottom-full left-0 mb-1 bg-surface-800 border border-surface-700 rounded-lg py-1 min-w-[160px] shadow-xl z-50"
              onMouseLeave={() => setShowModels(false)}>
              {IMAGE_MODELS.map(m => (
                <button key={m.id}
                  onClick={() => { onModelChange?.(m.id); setShowModels(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${m.id === modelId ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:bg-surface-700/50 hover:text-surface-200'}`}>
                  <span>{m.name}</span>
                  <span className="text-[10px] text-amber-400">{m.cost} cr</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-surface-600">·</span>
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || generating}
          className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-[11px] font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {generating ? (
            <Loader size={10} className="animate-spin" />
          ) : (
            <>
              <Sparkles size={10} />
              <span>{selectedModel.cost} cr</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
