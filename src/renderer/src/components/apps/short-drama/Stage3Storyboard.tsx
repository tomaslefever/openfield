import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Film,
  Sparkles,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Image as ImageIcon,
  FolderOpen,
  Camera,
  Copy,
  Check,
  User,
  MapPin,
  Package,
  Wand2,
  Upload,
  Play,
  Pause,
  Volume2,
  Mic,
  History,
  GripVertical,
  Trash2,
  ChevronDown,
  Plus,
} from 'lucide-react'
import {
  useShortDramaStore,
  DramaShot,
  DramaCharacter,
  DramaScenario,
  DramaProp,
  parseDialogueTurns,
  cleanTextForTts,
} from '../../../stores/short-drama-store'
import { ModelSelectorDropdown } from '../../models/ModelSelectorDropdown'
import { ResolutionSelector } from '../../models/ResolutionSelector'
import { AspectRatioSelector } from '../../models/AspectRatioSelector'
import { ImageLibraryPicker } from '../../ImageLibraryPicker'
import { ImagePreviewModal } from '../../ui/ImagePreviewModal'
import { PromptComposer } from '../../PromptComposer'
import { GenerationHistoryModal } from './GenerationHistoryModal'
import { srcUrl } from '../../../services/file-url'
import { copyText } from '../../../lib/clipboard'

function getAspectRatioStyle(ratio?: string): React.CSSProperties {
  if (!ratio) return { aspectRatio: '9 / 16' }
  const parts = ratio.split(':')
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { aspectRatio: `${parts[0]} / ${parts[1]}` }
  }
  return { aspectRatio: '9 / 16' }
}

export function Stage3Storyboard() {
  const {
    characters,
    scenarios,
    props,
    shots,
    imageModel,
    imageResolution,
    voiceModel,
    aspectRatio,
    setImageModel,
    setVoiceModel,
    setMetadata,
    updateShot,
    duplicateShot,
    removeShot,
    reorderShots,
    generateShotKeyframe,
    generateAllKeyframes,
    regenerateAllKeyframePrompts,
    generateShotVoice,
    generateAllVoices,
    restoreShotKeyframe,
    saveCurrentProject,
    syncPendingTasks,
    setStage,
  } = useShortDramaStore()

  useEffect(() => {
    syncPendingTasks()
  }, [])

  const [activePickerShotId, setActivePickerShotId] = useState<string | null>(null)
  const [selectedPreviewShot, setSelectedPreviewShot] = useState<DramaShot | null>(null)
  const [historyModalShot, setHistoryModalShot] = useState<DramaShot | null>(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [expandedActionShots, setExpandedActionShots] = useState<Set<string>>(new Set())
  const [expandedDialogueShots, setExpandedDialogueShots] = useState<Set<string>>(new Set())
  const [isRegeneratingAllPrompts, setIsRegeneratingAllPrompts] = useState(false)
  const [dragOverShotId, setDragOverShotId] = useState<string | null>(null)
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null)
  const [dragOverReorderCardId, setDragOverReorderCardId] = useState<string | null>(null)

  const handleDragStartCard = (shotId: string, e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-drama-shot-id', shotId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedCardId(shotId)
  }

  const handleDragOverCard = (shotId: string, e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-drama-shot-id')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (dragOverReorderCardId !== shotId) {
        setDragOverReorderCardId(shotId)
      }
    }
  }

  const handleDropReorderCard = (targetShotId: string, e: React.DragEvent) => {
    const sourceShotId = e.dataTransfer.getData('application/x-drama-shot-id')
    setDraggedCardId(null)
    setDragOverReorderCardId(null)
    if (sourceShotId && sourceShotId !== targetShotId) {
      e.preventDefault()
      e.stopPropagation()
      const fromIdx = shots.findIndex((s) => s.id === sourceShotId)
      const toIdx = shots.findIndex((s) => s.id === targetShotId)
      if (fromIdx !== -1 && toIdx !== -1) {
        reorderShots(fromIdx, toIdx)
      }
    }
  }

  const handleDragEndCard = () => {
    setDraggedCardId(null)
    setDragOverReorderCardId(null)
  }

  const handleRegenerateAllPrompts = async () => {
    setIsRegeneratingAllPrompts(true)
    try {
      await regenerateAllKeyframePrompts()
    } catch (err) {
      console.error('Error al regenerar todos los prompts de fotogramas iniciales:', err)
    } finally {
      setIsRegeneratingAllPrompts(false)
    }
  }

  const isAnyGenerating = shots.some((s) => s.keyframeGenerating)
  const shotsWithKeyframes = useMemo(() => shots.filter((s) => Boolean(s.keyframeUrl)), [shots])

  const dialogueShots = useMemo(
    () => shots.filter((s) => s.dialogueText && s.dialogueText.trim()),
    [shots]
  )
  const isAnyAudioGenerating = useMemo(
    () => dialogueShots.some((s) => s.audioStatus === 'generating'),
    [dialogueShots]
  )
  const completedAudioCount = useMemo(
    () => dialogueShots.filter((s) => s.audioStatus === 'completed').length,
    [dialogueShots]
  )

  const handleLibrarySelect = (assetOrAssets: any) => {
    const asset = Array.isArray(assetOrAssets) ? assetOrAssets[0] : assetOrAssets
    if (!activePickerShotId || !asset) return
    const keyframeUrl = asset.local_path || asset.filePath || asset.url
    updateShot(activePickerShotId, {
      keyframeAssetId: asset.id,
      keyframeUrl,
    })
    setActivePickerShotId(null)
  }

  const handleDropOnShot = async (shotId: string, e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverShotId(null)

    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      const file = files[0]
      if (file.type.startsWith('image/')) {
        const api = (window as any).electronAPI
        try {
          const reader = new FileReader()
          reader.onload = async () => {
            const dataUrl = reader.result as string
            const base64 = dataUrl.split(',')[1] || ''
            const mime = file.type || 'image/png'

            let assetId: string | undefined
            if (api?.assets?.importBase64) {
              const imported = await api.assets.importBase64(base64, mime, file.name, undefined, 'import')
              assetId = imported?.id || imported?.assetId
            }

            updateShot(shotId, {
              keyframeUrl: (file as any).path || dataUrl,
              keyframeAssetId: assetId,
            })
            await saveCurrentProject()
          }
          reader.readAsDataURL(file)
        } catch (err) {
          console.error('Error al importar imagen arrastrada para la toma:', err)
        }
        return
      }
    }

    try {
      const textData = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain')
      if (textData) {
        const parsed = JSON.parse(textData)
        const url = parsed.local_path || parsed.filePath || parsed.url || parsed.imageUrl
        if (url) {
          updateShot(shotId, {
            keyframeUrl: url,
            keyframeAssetId: parsed.id || parsed.assetId,
          })
          await saveCurrentProject()
        }
      }
    } catch { /* ignore non-JSON */ }
  }

  const toggleCharacterInShot = (shotId: string, charName: string) => {
    const shot = shots.find((s) => s.id === shotId)
    if (!shot) return
    const current = shot.characterNames || []
    const updated = current.includes(charName)
      ? current.filter((n) => n !== charName)
      : [...current, charName]
    updateShot(shotId, { characterNames: updated })
  }

  const setScenarioInShot = (shotId: string, scnName: string) => {
    const shot = shots.find((s) => s.id === shotId)
    if (!shot) return
    const updated = shot.scenarioName === scnName ? '' : scnName
    updateShot(shotId, { scenarioName: updated })
  }

  const togglePropInShot = (shotId: string, propName: string) => {
    const shot = shots.find((s) => s.id === shotId)
    if (!shot) return
    const current = shot.propNames || []
    const updated = current.includes(propName)
      ? current.filter((n) => n !== propName)
      : [...current, propName]
    updateShot(shotId, { propNames: updated })
  }

  const autoDetectElementsInShot = (shotId: string) => {
    const shot = shots.find((s) => s.id === shotId)
    if (!shot) return
    const text = `${shot.actionPrompt || ''} ${shot.keyframePrompt || ''} ${shot.dialogueSpeaker || ''} ${shot.dialogueText || ''}`.toLowerCase()

    const matchedChars = characters
      .filter((c) => text.includes(c.name.toLowerCase()) || text.includes(`@${c.name.toLowerCase()}`))
      .map((c) => c.name)

    if (shot.dialogueSpeaker) {
      const speakerChar = characters.find((c) => c.name.toLowerCase().trim() === shot.dialogueSpeaker.toLowerCase().trim())
      if (speakerChar && !matchedChars.includes(speakerChar.name)) {
        matchedChars.unshift(speakerChar.name)
      }
    }

    const matchedScn = scenarios.find((s) =>
      text.includes(s.name.toLowerCase()) || text.includes(`@${s.name.toLowerCase()}`)
    )

    const matchedProps = props
      .filter((p) => text.includes(p.name.toLowerCase()) || text.includes(`@${p.name.toLowerCase()}`))
      .map((p) => p.name)

    updateShot(shotId, {
      characterNames: Array.from(new Set([...(shot.characterNames || []), ...matchedChars])),
      scenarioName: matchedScn ? matchedScn.name : shot.scenarioName,
      propNames: Array.from(new Set([...(shot.propNames || []), ...matchedProps])),
    })
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6 bg-[#060709]">
      {/* Header & Controls */}
      <div className="bg-[#0e0f16] p-5 rounded-2xl shadow-xl shadow-black/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-surface-100 flex items-center gap-2">
            <Film size={16} className="text-accent-400" />
            Storyboard & Keyframes Iniciales
          </h2>
          <p className="text-xs text-surface-500 mt-0.5">
            Genera los keyframes cinematográficos y sintetiza los diálogos multi-voz con ElevenLabs directamente en cada escena.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-surface-400 font-medium">Modelo Keyframe:</span>
          <ModelSelectorDropdown
            kind="image"
            selectedModelId={imageModel.t2iId || imageModel.name}
            onSelect={(m) => setImageModel(m)}
            resolution={imageResolution}
          />
          <ResolutionSelector
            model={imageModel}
            value={imageResolution}
            onChange={(res) => setImageModel(imageModel, res)}
          />
          <AspectRatioSelector
            value={aspectRatio}
            onChange={(r) => setMetadata({ aspectRatio: r })}
            compact
          />

          <span className="text-xs text-surface-400 font-medium ml-2">Voz:</span>
          <ModelSelectorDropdown
            kind="audio"
            selectedModelId={voiceModel.t2aId || voiceModel.name}
            onSelect={(m) => setVoiceModel(m)}
          />

          <button
            onClick={() => handleRegenerateAllPrompts()}
            disabled={isRegeneratingAllPrompts || isAnyGenerating || shots.length === 0}
            className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-1.5 ml-1"
            title="Regenerar prompts del fotograma inicial (Frame 0) con IA para todas las tomas"
          >
            {isRegeneratingAllPrompts ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Wand2 size={13} />
            )}
            Regenerar Prompts
          </button>

          {dialogueShots.length > 0 && (
            <button
              onClick={() => generateAllVoices()}
              disabled={isAnyAudioGenerating || dialogueShots.length === 0}
              className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-1.5"
              title="Sintetizar las voces y diálogos de todas las escenas con ElevenLabs"
            >
              {isAnyAudioGenerating ? (
                <RefreshCw size={13} className="animate-spin text-accent-400" />
              ) : (
                <Mic size={13} className="text-accent-400" />
              )}
              Sintetizar Diálogos ({completedAudioCount}/{dialogueShots.length})
            </button>
          )}

          <button
            onClick={() => generateAllKeyframes()}
            disabled={isAnyGenerating || shots.length === 0}
            className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5 ml-1"
          >
            {isAnyGenerating ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            Generar Todos los Frames
          </button>
        </div>
      </div>

      {/* Storyboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {shots.map((shot) => (
          <StoryboardShotCard
            key={shot.id}
            shot={shot}
            characters={characters}
            scenarios={scenarios}
            props={props}
            aspectRatio={aspectRatio}
            dragOverShotId={dragOverShotId}
            setDragOverShotId={setDragOverShotId}
            handleDropOnShot={handleDropOnShot}
            generateShotKeyframe={generateShotKeyframe}
            generateShotVoice={generateShotVoice}
            updateShot={updateShot}
            duplicateShot={duplicateShot}
            removeShot={removeShot}
            draggedCardId={draggedCardId}
            dragOverReorderCardId={dragOverReorderCardId}
            handleDragStartCard={handleDragStartCard}
            handleDragOverCard={handleDragOverCard}
            handleDropReorderCard={handleDropReorderCard}
            handleDragEndCard={handleDragEndCard}
            setSelectedPreviewShot={setSelectedPreviewShot}
            setActivePickerShotId={setActivePickerShotId}
            setHistoryModalShot={setHistoryModalShot}
            expandedActionShots={expandedActionShots}
            setExpandedActionShots={setExpandedActionShots}
            expandedDialogueShots={expandedDialogueShots}
            setExpandedDialogueShots={setExpandedDialogueShots}
          />
        ))}
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-surface-800">
        <button
          onClick={() => setStage(2)}
          className="btn-ghost text-xs flex items-center gap-1.5"
        >
          <ArrowLeft size={13} /> Volver a Personajes
        </button>

        <button
          onClick={() => setStage(4)}
          className="btn-primary text-xs flex items-center gap-1.5 px-4 py-2"
        >
          Siguiente: Animación a Video <ArrowRight size={13} />
        </button>
      </div>

      {/* Image Library Picker Modal */}
      {activePickerShotId && (
        <ImageLibraryPicker
          multiple={false}
          onSelect={handleLibrarySelect}
          onClose={() => setActivePickerShotId(null)}
        />
      )}

      {/* Generation History Modal for Keyframes */}
      {historyModalShot && (
        <GenerationHistoryModal
          isOpen={!!historyModalShot}
          onClose={() => setHistoryModalShot(null)}
          title={`Historial de Keyframes: Toma ${historyModalShot.order}`}
          kind="image"
          activeUrl={historyModalShot.keyframeUrl}
          activeAssetId={historyModalShot.keyframeAssetId}
          history={historyModalShot.keyframeHistory || []}
          onRestore={(item) => {
            restoreShotKeyframe(historyModalShot.id, item.id)
          }}
        />
      )}

      {/* Keyframe Preview Modal (Fullscreen / Zoom / Detail) */}
      {selectedPreviewShot && (
        <ImagePreviewModal
          src={srcUrl(selectedPreviewShot.keyframeUrl) || ''}
          onClose={() => setSelectedPreviewShot(null)}
          onPrev={
            shotsWithKeyframes.findIndex((s) => s.id === selectedPreviewShot.id) > 0
              ? () => {
                  const idx = shotsWithKeyframes.findIndex((s) => s.id === selectedPreviewShot.id)
                  setSelectedPreviewShot(shotsWithKeyframes[idx - 1])
                }
              : undefined
          }
          onNext={
            shotsWithKeyframes.findIndex((s) => s.id === selectedPreviewShot.id) <
            shotsWithKeyframes.length - 1
              ? () => {
                  const idx = shotsWithKeyframes.findIndex((s) => s.id === selectedPreviewShot.id)
                  setSelectedPreviewShot(shotsWithKeyframes[idx + 1])
                }
              : undefined
          }
        >
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-accent-500/10 text-accent-400 border-accent-500/20">
                  Toma {selectedPreviewShot.order}
                </span>
                <span className="text-xs font-semibold text-surface-200 flex items-center gap-1">
                  <Camera size={12} className="text-accent-400" />
                  {selectedPreviewShot.cameraMovement || 'Plano Estándar'}
                </span>
                <span className="text-[10px] text-surface-500 font-mono ml-auto">
                  ~{selectedPreviewShot.estimatedDuration}s
                </span>
              </div>
            </div>

            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">
                Descripción / Acción Visual
              </p>
              <div className="flex items-start gap-1">
                <p className="text-xs text-surface-200 leading-relaxed flex-1 select-text bg-surface-950/60 p-2.5 rounded-lg border border-surface-800">
                  {selectedPreviewShot.actionPrompt || '—'}
                </p>
                <button
                  onClick={() => {
                    copyText(selectedPreviewShot.actionPrompt || '')
                    setCopiedPrompt(true)
                    setTimeout(() => setCopiedPrompt(false), 1500)
                  }}
                  className="p-1.5 rounded bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-surface-100 flex-shrink-0 border border-surface-700 transition-colors"
                  title="Copiar Prompt"
                >
                  {copiedPrompt ? (
                    <Check size={13} className="text-emerald-400" />
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
              </div>
            </div>

            {selectedPreviewShot.dialogueText && (
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">
                  Diálogo / Locución
                </p>
                <p className="text-xs text-surface-300 italic bg-surface-950/60 p-2.5 rounded-lg border border-surface-800">
                  <strong className="text-accent-400 not-italic">{selectedPreviewShot.dialogueSpeaker || 'V.O.'}:</strong> "{selectedPreviewShot.dialogueText}"
                </p>
              </div>
            )}

            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">
                Prompt Fotograma Inicial (Frame 0)
              </p>
              <p className="text-xs text-surface-200 leading-relaxed select-text bg-surface-950/60 p-2.5 rounded-lg border border-surface-800">
                {selectedPreviewShot.keyframePrompt || '—'}
              </p>
            </div>
          </div>
        </ImagePreviewModal>
      )}
    </div>
  )
}

interface StoryboardAudioRowProps {
  shot: DramaShot
  characters: DramaCharacter[]
  updateShot: (shotId: string, updates: Partial<DramaShot>) => void
  onGenerateAudio: (customText?: string) => void
}

function StoryboardAudioRow({ shot, characters, updateShot, onGenerateAudio }: StoryboardAudioRowProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [localText, setLocalText] = useState(shot.dialogueText || '')
  const [speakerDropdownOpen, setSpeakerDropdownOpen] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speakerDropdownRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setLocalText(shot.dialogueText || '')
  }, [shot.dialogueText])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (speakerDropdownRef.current && !speakerDropdownRef.current.contains(e.target as Node)) {
        setSpeakerDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const parsedTurns = useMemo(
    () => parseDialogueTurns(localText, shot.dialogueSpeaker, characters),
    [localText, shot.dialogueSpeaker, characters]
  )

  const uniqueSpeakers = useMemo(
    () => Array.from(new Set(parsedTurns.map((t) => t.speaker).filter(Boolean))),
    [parsedTurns]
  )
  const isMultiSpeaker = uniqueSpeakers.length >= 2 || parsedTurns.length >= 2
  const isGenerating = shot.audioStatus === 'generating'
  const isCompleted = shot.audioStatus === 'completed' && !!(shot.audioLocalPath || shot.audioUrl)
  const resolvedAudioUrl = shot.audioLocalPath
    ? srcUrl(shot.audioLocalPath)
    : shot.audioUrl
    ? srcUrl(shot.audioUrl)
    : ''

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [resolvedAudioUrl])

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setLocalText(val)
    updateShot(shot.id, { dialogueText: val })
  }

  const handleSelectSpeaker = (speakerName: string) => {
    updateShot(shot.id, { dialogueSpeaker: speakerName })
    setSpeakerDropdownOpen(false)
  }

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
    }
  }

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || secs < 0) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const handleClearAudio = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
    updateShot(shot.id, {
      audioStatus: 'idle',
      audioLocalPath: undefined,
      audioUrl: undefined,
      audioAssetId: undefined,
      audioTaskId: undefined,
    })
  }

  return (
    <div className="bg-[#08090f] border border-white/10 rounded-xl p-2.5 space-y-2 relative transition-all">
      {/* Header: Speaker selector, multi-voice badge, edit toggle, generate audio */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {/* Speaker Selector Dropdown */}
          <div className="relative" ref={speakerDropdownRef}>
            <button
              type="button"
              onClick={() => setSpeakerDropdownOpen((v) => !v)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-[11px] font-semibold text-accent-400 border border-white/10 transition-colors"
              title="Cambiar personaje / voz"
            >
              <Mic size={12} className="shrink-0 text-accent-400" />
              <span className="truncate max-w-[110px]">{shot.dialogueSpeaker || 'Locutor'}</span>
              <ChevronDown size={10} className="text-surface-400" />
            </button>

            {speakerDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-44 bg-surface-900 border border-surface-700 rounded-xl shadow-2xl py-1 z-50 text-xs overflow-hidden">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-surface-400 border-b border-white/5">
                  Voz / Personaje
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectSpeaker('Locutor')}
                  className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-surface-200 flex items-center justify-between text-[11px]"
                >
                  <span>Locutor / V.O.</span>
                  {(!shot.dialogueSpeaker || shot.dialogueSpeaker === 'Locutor') && (
                    <Check size={12} className="text-accent-400" />
                  )}
                </button>
                {characters.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectSpeaker(c.name)}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-surface-200 flex items-center justify-between text-[11px]"
                  >
                    <span className="truncate">{c.name}</span>
                    {shot.dialogueSpeaker?.toLowerCase().trim() === c.name.toLowerCase().trim() && (
                      <Check size={12} className="text-accent-400" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isMultiSpeaker && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
              {parsedTurns.length} turnos · Multi-voz
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Clear audio button if audio exists */}
          {isCompleted && (
            <button
              type="button"
              onClick={handleClearAudio}
              className="p-1 rounded-lg bg-surface-800 hover:bg-red-500/20 text-surface-400 hover:text-red-400 border border-white/5 transition-colors"
              title="Eliminar audio generado"
            >
              <Trash2 size={11} />
            </button>
          )}

          {/* Generate / Regenerate Audio Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onGenerateAudio(localText)
            }}
            disabled={isGenerating || !localText.trim()}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1.5 transition-all ${
              isCompleted
                ? 'bg-white/5 hover:bg-white/10 text-surface-300 hover:text-surface-100 border border-white/10'
                : 'bg-accent-600 hover:bg-accent-500 text-white shadow-md shadow-accent-950/40 border border-accent-400/30 font-semibold'
            } ${(!localText.trim() || isGenerating) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            title={isCompleted ? 'Regenerar audio de diálogo' : 'Sintetizar audio con ElevenLabs'}
          >
            {isGenerating ? (
              <>
                <RefreshCw size={11} className="animate-spin text-accent-400" />
                <span>Sintetizando...</span>
              </>
            ) : isCompleted ? (
              <>
                <RefreshCw size={11} />
                <span>Regenerar Audio</span>
              </>
            ) : (
              <>
                <Sparkles size={11} />
                <span>Generar Audio</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Dialogue Text Area (Always directly editable) */}
      <div className="space-y-1">
        <textarea
          value={localText}
          onChange={handleTextChange}
          placeholder="Escribe el diálogo o locución para esta toma..."
          rows={Math.min(4, Math.max(2, (localText.match(/\n/g) || []).length + 1))}
          className="w-full bg-black/60 hover:bg-black/80 focus:bg-black/90 border border-white/10 focus:border-accent-500/50 rounded-lg p-2 text-xs text-surface-100 placeholder-surface-500 resize-none transition-colors focus:outline-none leading-relaxed"
        />

        {/* Multi-turn preview if 2+ speakers detected in lines */}
        {parsedTurns.length > 1 && (
          <div className="text-[10px] text-surface-400 bg-white/5 rounded-md p-1.5 space-y-0.5 border border-white/5">
            <span className="font-semibold text-surface-300 block mb-0.5">Vista previa de turnos detectados:</span>
            {parsedTurns.map((turn, idx) => (
              <div key={idx} className="flex items-baseline gap-1">
                <span className="font-semibold text-accent-400 shrink-0">{turn.speaker}:</span>
                <span className="text-surface-300 truncate">"{turn.text}"</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Integrated Mini Audio Player */}
      {isCompleted && resolvedAudioUrl && (
        <div className="flex items-center gap-2 pt-0.5 bg-black/50 px-2 py-1.5 rounded-lg border border-white/5">
          <audio
            ref={audioRef}
            src={resolvedAudioUrl}
            preload="auto"
            onTimeUpdate={() => {
              if (audioRef.current) setCurrentTime(audioRef.current.currentTime)
            }}
            onLoadedMetadata={() => {
              if (audioRef.current) setDuration(audioRef.current.duration)
            }}
            onEnded={() => {
              setIsPlaying(false)
              setCurrentTime(0)
            }}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
          />

          <button
            type="button"
            onClick={togglePlay}
            className="w-6 h-6 rounded-full bg-accent-500 hover:bg-accent-400 text-black flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-sm"
          >
            {isPlaying ? (
              <Pause size={10} className="fill-current" />
            ) : (
              <Play size={10} className="fill-current ml-0.5" />
            )}
          </button>

          {/* Progress scrubber */}
          <div className="flex-1 flex flex-col justify-center">
            <div
              className="h-1.5 bg-surface-800 rounded-full cursor-pointer relative overflow-hidden group/bar"
              onClick={(e) => {
                e.stopPropagation()
                const rect = e.currentTarget.getBoundingClientRect()
                const clickX = e.clientX - rect.left
                const pct = Math.max(0, Math.min(1, clickX / rect.width))
                if (audioRef.current && duration > 0) {
                  audioRef.current.currentTime = pct * duration
                  setCurrentTime(pct * duration)
                }
              }}
            >
              <div
                className="h-full bg-accent-400 rounded-full transition-all"
                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[9px] text-surface-400 mt-0.5">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface StoryboardShotCardProps {
  shot: DramaShot
  characters: DramaCharacter[]
  scenarios: DramaScenario[]
  props: DramaProp[]
  aspectRatio: string
  dragOverShotId: string | null
  setDragOverShotId: (id: string | null) => void
  handleDropOnShot: (shotId: string, e: React.DragEvent) => void
  generateShotKeyframe: (shotId: string, customParams?: any) => Promise<void>
  generateShotVoice: (shotId: string, customDialogueText?: string) => Promise<void>
  updateShot: (shotId: string, updates: Partial<DramaShot>) => void
  duplicateShot: (id: string) => void
  removeShot: (id: string) => void
  draggedCardId: string | null
  dragOverReorderCardId: string | null
  handleDragStartCard: (shotId: string, e: React.DragEvent) => void
  handleDragOverCard: (shotId: string, e: React.DragEvent) => void
  handleDropReorderCard: (targetShotId: string, e: React.DragEvent) => void
  handleDragEndCard: () => void
  setSelectedPreviewShot: (shot: DramaShot | null) => void
  setActivePickerShotId: (id: string | null) => void
  setHistoryModalShot: (shot: DramaShot | null) => void
  expandedActionShots: Set<string>
  setExpandedActionShots: React.Dispatch<React.SetStateAction<Set<string>>>
  expandedDialogueShots: Set<string>
  setExpandedDialogueShots: React.Dispatch<React.SetStateAction<Set<string>>>
}

function StoryboardShotCard({
  shot,
  characters,
  scenarios,
  props,
  aspectRatio,
  dragOverShotId,
  setDragOverShotId,
  handleDropOnShot,
  generateShotKeyframe,
  generateShotVoice,
  updateShot,
  duplicateShot,
  removeShot,
  draggedCardId,
  dragOverReorderCardId,
  handleDragStartCard,
  handleDragOverCard,
  handleDropReorderCard,
  handleDragEndCard,
  setSelectedPreviewShot,
  setActivePickerShotId,
  setHistoryModalShot,
  expandedActionShots,
  setExpandedActionShots,
}: StoryboardShotCardProps) {
  const shotRefs = useMemo(() => {
    const list: Array<{ base64?: string; url?: string; mime: string; name?: string; refType?: string; assetId?: string }> = []

    // 1. Linked characters in this shot
    const linkedChars = characters.filter((c) => (shot.characterNames || []).includes(c.name))
    const speakerChar = characters.find(
      (c) => (shot.dialogueSpeaker || '').toLowerCase().trim() === c.name.toLowerCase().trim()
    )
    if (speakerChar && !linkedChars.some((c) => c.id === speakerChar.id)) {
      linkedChars.unshift(speakerChar)
    }

    for (const char of linkedChars) {
      if (char.imageUrl || char.imageBase64 || char.imageAssetId) {
        list.push({
          base64: char.imageBase64 || '',
          url: char.imageUrl,
          assetId: char.imageAssetId,
          mime: 'image/png',
          name: char.name,
          refType: 'character',
        })
      }
    }

    // 2. Scenario
    const linkedScn = scenarios.find((s) => s.name === shot.scenarioName)
    if (linkedScn && (linkedScn.imageUrl || linkedScn.imageAssetId)) {
      list.push({
        base64: '',
        url: linkedScn.imageUrl,
        assetId: linkedScn.imageAssetId,
        mime: 'image/png',
        name: linkedScn.name,
        refType: 'scenario',
      })
    }

    // 3. Props
    const linkedProps = props.filter((p) => (shot.propNames || []).includes(p.name))
    for (const pr of linkedProps) {
      if (pr.imageUrl || pr.imageAssetId) {
        list.push({
          base64: '',
          url: pr.imageUrl,
          assetId: pr.imageAssetId,
          mime: 'image/png',
          name: pr.name,
          refType: 'prop',
        })
      }
    }

    return list
  }, [shot.characterNames, shot.dialogueSpeaker, shot.scenarioName, shot.propNames, characters, scenarios, props])

  const promptValue = shot.keyframePrompt || shot.actionPrompt || ''

  return (
    <div
      key={shot.id}
      onDragOver={(e) => handleDragOverCard(shot.id, e)}
      onDrop={(e) => handleDropReorderCard(shot.id, e)}
      className={`bg-[#0d0e15] rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-black/50 transition-all border group/card ${
        dragOverReorderCardId === shot.id
          ? 'border-accent-500 ring-2 ring-accent-500/30'
          : draggedCardId === shot.id
          ? 'opacity-40 border-dashed border-white/20'
          : 'border-white/5 hover:border-white/10'
      }`}
    >
      {/* ─── CARD HEADER: Media Container & Dropzone ─── */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOverShotId(shot.id)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOverShotId(null)
        }}
        onDrop={(e) => handleDropOnShot(shot.id, e)}
        onClick={() => {
          if (shot.keyframeUrl) {
            setSelectedPreviewShot(shot)
          } else if (!shot.keyframeGenerating) {
            generateShotKeyframe(shot.id)
          }
        }}
        className={`w-full bg-[#08090d] relative group flex items-center justify-center cursor-pointer transition-all ${
          dragOverShotId === shot.id
            ? 'ring-2 ring-accent-500 bg-accent-500/10'
            : ''
        } ${
          shot.keyframeGenerating ? 'animate-pulse' : ''
        }`}
        style={getAspectRatioStyle(aspectRatio)}
      >
        {shot.keyframeUrl ? (
          <img
            src={srcUrl(shot.keyframeUrl)}
            alt={`Toma ${shot.order}`}
            className="w-full h-full object-cover"
          />
        ) : shot.keyframeGenerating ? (
          <div className="flex flex-col items-center justify-center gap-1.5 text-accent-400 p-2 text-center">
            <RefreshCw size={22} className="animate-spin text-accent-400" />
            <span className="text-[10px] font-medium">Generando Frame...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-surface-500 hover:text-accent-400 gap-1.5 p-3 text-center transition-colors">
            <ImageIcon size={26} />
            <span className="text-[10px] font-medium leading-tight">
              {dragOverShotId === shot.id ? 'Soltar imagen aquí' : 'Clic para generar o arrastra una imagen'}
            </span>
          </div>
        )}

        {/* Dropzone Active Visual Feedback */}
        {dragOverShotId === shot.id && (
          <div className="absolute inset-0 bg-accent-600/30 backdrop-blur-sm flex flex-col items-center justify-center text-white z-20 pointer-events-none">
            <Upload size={24} className="animate-bounce mb-1" />
            <span className="text-xs font-semibold">Soltar imagen aquí</span>
          </div>
        )}

        {/* Shot Controls (Top-Left) */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200">
          <div
            draggable
            onDragStart={(e) => handleDragStartCard(shot.id, e)}
            onDragEnd={handleDragEndCard}
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-lg bg-black/75 hover:bg-surface-700 backdrop-blur-md text-surface-400 hover:text-white border border-white/10 transition-all shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center"
            title="Arrastrar para reordenar frame"
          >
            <GripVertical size={13} />
          </div>
          <div className="bg-black/75 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] font-bold text-accent-400 border border-white/10 shadow-sm pointer-events-none">
            Toma {shot.order}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              duplicateShot(shot.id)
            }}
            className="p-1 px-2 rounded-lg bg-black/75 hover:bg-surface-700 backdrop-blur-md text-surface-300 hover:text-white border border-white/10 transition-all shadow-md flex items-center gap-1 text-[10px] font-medium"
            title="Duplicar frame (insertar a continuación)"
          >
            <Copy size={11} className="text-accent-400" />
            <span>Duplicar</span>
          </button>
        </div>

        {/* Top-Right Gallery Picker, History & Delete Buttons */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200">
          {shot.keyframeHistory && shot.keyframeHistory.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setHistoryModalShot(shot)
              }}
              className="p-1.5 rounded-lg bg-black/70 hover:bg-surface-700 backdrop-blur-md text-surface-300 hover:text-white border border-white/10 transition-all shadow-md flex items-center gap-1"
              title={`Historial de ${shot.keyframeHistory.length} versiones`}
            >
              <History size={13} />
              <span className="text-[9px] font-mono">{shot.keyframeHistory.length}</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setActivePickerShotId(shot.id)
            }}
            disabled={shot.keyframeGenerating}
            className="p-1.5 rounded-lg bg-black/70 hover:bg-surface-700 backdrop-blur-md text-surface-300 hover:text-white border border-white/10 transition-all shadow-md"
            title="Elegir imagen de la Galería"
          >
            <FolderOpen size={13} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              removeShot(shot.id)
            }}
            className="p-1.5 rounded-lg bg-black/70 hover:bg-red-500/30 backdrop-blur-md text-surface-400 hover:text-red-400 border border-white/10 transition-all shadow-md"
            title="Eliminar toma"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ─── CARD CONTENT: Description, Dialogues & Integrated PromptComposer ─── */}
      <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
        <div className="space-y-2">
          {/* Scene Action Description (Click-to-expand) */}
          <p
            onClick={() => {
              setExpandedActionShots((prev) => {
                const next = new Set(prev)
                if (next.has(shot.id)) next.delete(shot.id)
                else next.add(shot.id)
                return next
              })
            }}
            className={`text-xs text-surface-300 leading-relaxed cursor-pointer select-none transition-colors hover:text-surface-100 ${
              expandedActionShots.has(shot.id) ? '' : 'line-clamp-2'
            }`}
            title={expandedActionShots.has(shot.id) ? 'Clic para contraer descripción' : 'Clic para ver descripción completa'}
          >
            {shot.actionPrompt}
          </p>

          {/* Scene Dialogues & Voice Generation Row */}
          {shot.dialogueText !== undefined && shot.dialogueText !== '' ? (
            <StoryboardAudioRow
              shot={shot}
              characters={characters}
              updateShot={updateShot}
              onGenerateAudio={(customText) => generateShotVoice(shot.id, customText)}
            />
          ) : (
            <button
              type="button"
              onClick={() => updateShot(shot.id, { dialogueText: ' ' })}
              className="w-full py-1.5 px-2.5 rounded-lg border border-dashed border-white/10 hover:border-accent-500/40 text-[10px] text-surface-400 hover:text-accent-300 flex items-center justify-center gap-1.5 transition-colors bg-white/[0.02] hover:bg-white/[0.04]"
            >
              <Plus size={11} />
              <span>Agregar Diálogo / Locución</span>
            </button>
          )}
        </div>

        {/* ─── PROMPT COMPOSER REUTILIZADO DE IMAGEGEN/VIDEOGEN ─── */}
        <div className="pt-1">
          <PromptComposer
            mode="image"
            embedded
            iconOnlyGenerate
            initialPrompt={promptValue}
            onPromptChange={(newPrompt) => updateShot(shot.id, { keyframePrompt: newPrompt })}
            initialDuration={shot.estimatedDuration || 5}
            onDurationChange={(dur) => updateShot(shot.id, { estimatedDuration: dur })}
            initialRefs={shotRefs}
            disabled={shot.keyframeGenerating}
            onGenerate={(params) => {
              if (params.prompt) {
                updateShot(shot.id, { keyframePrompt: params.prompt })
              }
              generateShotKeyframe(shot.id, {
                prompt: params.prompt,
                imageRefs: params.imageRefs,
                imageBase64: params.imageBase64,
                aspectRatio: params.aspectRatio,
                resolution: params.resolution,
              })
            }}
          />
        </div>
      </div>
    </div>
  )
}
