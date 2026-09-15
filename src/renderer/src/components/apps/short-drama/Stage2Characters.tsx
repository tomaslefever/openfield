import { useState, useMemo, useEffect } from 'react'
import {
  User,
  MapPin,
  Sparkles,
  RefreshCw,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Image as ImageIcon,
  Check,
  FolderOpen,
  Package,
  Maximize2,
  Copy,
  Wand2,
  History,
  Radio,
  Volume2,
} from 'lucide-react'
import {
  useShortDramaStore,
  type GenerationHistoryItem,
} from '../../../stores/short-drama-store'
import { ModelSelectorDropdown } from '../../models/ModelSelectorDropdown'
import { ResolutionSelector } from '../../models/ResolutionSelector'
import { VoiceSelectorDropdown } from '../../voice/VoiceSelectorDropdown'
import { ImageLibraryPicker } from '../../ImageLibraryPicker'
import { ImagePreviewModal } from '../../ui/ImagePreviewModal'
import { GenerationHistoryModal } from './GenerationHistoryModal'
import { srcUrl } from '../../../services/file-url'
import { copyText } from '../../../lib/clipboard'

export function Stage2Characters() {
  const {
    characters,
    scenarios,
    props,
    voiceId,
    setMetadata,
    imageModel,
    imageResolution,
    setImageModel,
    updateCharacter,
    addCharacter,
    removeCharacter,
    updateScenario,
    addScenario,
    removeScenario,
    updateProp,
    addProp,
    removeProp,
    generateCharacterImage,
    generateAllCharacterImages,
    regenerateCharacterVisualPrompt,
    regenerateAllCharacterVisualPrompts,
    generateScenarioImage,
    generateAllScenarioImages,
    regenerateScenarioVisualPrompt,
    regenerateAllScenarioVisualPrompts,
    generatePropImage,
    generateAllPropImages,
    regeneratePropVisualPrompt,
    regenerateAllPropVisualPrompts,
    regenerateAllStage2Prompts,
    restoreCharacterImage,
    restoreScenarioImage,
    restorePropImage,
    syncPendingTasks,
    setStage,
  } = useShortDramaStore()

  useEffect(() => {
    syncPendingTasks()
  }, [])

  const [activePickerTarget, setActivePickerTarget] = useState<{
    type: 'character' | 'scenario' | 'prop'
    id: string
  } | null>(null)

  const [historyModalTarget, setHistoryModalTarget] = useState<{
    type: 'character' | 'scenario' | 'prop'
    id: string
    title: string
    history: GenerationHistoryItem[]
    activeUrl?: string
    activeAssetId?: string
  } | null>(null)

  const [regeneratingPromptIds, setRegeneratingPromptIds] = useState<Set<string>>(new Set())
  const [isRegeneratingAllPrompts, setIsRegeneratingAllPrompts] = useState(false)

  const handleRegenerateCharacterPrompt = async (id: string) => {
    setRegeneratingPromptIds((prev) => new Set(prev).add(id))
    try {
      await regenerateCharacterVisualPrompt(id)
    } catch (err) {
      console.error('Error regenerando prompt de personaje:', err)
    } finally {
      setRegeneratingPromptIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleRegenerateScenarioPrompt = async (id: string) => {
    setRegeneratingPromptIds((prev) => new Set(prev).add(id))
    try {
      await regenerateScenarioVisualPrompt(id)
    } catch (err) {
      console.error('Error regenerando prompt de locación:', err)
    } finally {
      setRegeneratingPromptIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleRegeneratePropPrompt = async (id: string) => {
    setRegeneratingPromptIds((prev) => new Set(prev).add(id))
    try {
      await regeneratePropVisualPrompt(id)
    } catch (err) {
      console.error('Error regenerando prompt de objeto:', err)
    } finally {
      setRegeneratingPromptIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleRegenerateAllStage2Prompts = async () => {
    setIsRegeneratingAllPrompts(true)
    try {
      await regenerateAllStage2Prompts()
    } catch (err) {
      console.error('Error regenerando todos los prompts de recursos:', err)
    } finally {
      setIsRegeneratingAllPrompts(false)
    }
  }

  const [previewItem, setPreviewItem] = useState<{
    id: string
    name: string
    type: 'character' | 'scenario' | 'prop'
    roleOrDesc?: string
    prompt?: string
    imageUrl?: string
  } | null>(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  const allGeneratedItems = useMemo(() => {
    const list: Array<{
      id: string
      name: string
      type: 'character' | 'scenario' | 'prop'
      roleOrDesc?: string
      prompt?: string
      imageUrl: string
    }> = []
    characters.forEach((c) => {
      if (c.imageUrl) {
        list.push({
          id: c.id,
          name: c.name,
          type: 'character',
          roleOrDesc: c.role,
          prompt: c.visualPrompt || '',
          imageUrl: c.imageUrl,
        })
      }
    })
    scenarios.forEach((s) => {
      if (s.imageUrl) {
        list.push({
          id: s.id,
          name: s.name,
          type: 'scenario',
          prompt: s.visualPrompt || '',
          imageUrl: s.imageUrl,
        })
      }
    })
    props.forEach((p) => {
      if (p.imageUrl) {
        list.push({
          id: p.id,
          name: p.name,
          type: 'prop',
          roleOrDesc: p.description,
          prompt: p.visualPrompt || '',
          imageUrl: p.imageUrl,
        })
      }
    })
    return list
  }, [characters, scenarios, props])

  const handleLibrarySelect = (assetOrAssets: any) => {
    const asset = Array.isArray(assetOrAssets) ? assetOrAssets[0] : assetOrAssets
    if (!activePickerTarget || !asset) return
    const imageUrl = asset.local_path || asset.filePath || asset.url
    if (activePickerTarget.type === 'character') {
      updateCharacter(activePickerTarget.id, {
        imageAssetId: asset.id,
        imageUrl,
      })
    } else if (activePickerTarget.type === 'scenario') {
      updateScenario(activePickerTarget.id, {
        imageAssetId: asset.id,
        imageUrl,
      })
    } else if (activePickerTarget.type === 'prop') {
      updateProp(activePickerTarget.id, {
        imageAssetId: asset.id,
        imageUrl,
      })
    }
    setActivePickerTarget(null)
  }

  const isAnyGenerating =
    characters.some((c) => c.generating) ||
    scenarios.some((s) => s.generating) ||
    props.some((pr) => pr.generating)

  const handleGenerateAll = async () => {
    await generateAllCharacterImages()
    await generateAllScenarioImages()
    await generateAllPropImages()
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">
      {/* Stage Header & Global Image Model Selector */}
      <div className="card p-6 border-surface-800 bg-surface-900/60 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-surface-100 flex items-center gap-2">
            <User size={16} className="text-accent-400" />
            Personajes, Locaciones y Objetos Clave
          </h2>
          <p className="text-xs text-surface-500 mt-0.5">
            Genera y define las fichas visuales para mantener consistencia en rostros, escenarios y props de la historia.
          </p>
        </div>

        {/* Reusable Model Selectors */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-surface-400 font-medium">Modelo Imagen:</span>
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

          <button
            onClick={handleRegenerateAllStage2Prompts}
            disabled={isRegeneratingAllPrompts || isAnyGenerating || (characters.length === 0 && scenarios.length === 0 && props.length === 0)}
            className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-1.5 ml-2"
            title="Regenerar prompts visuales con IA para todos los personajes, locaciones y objetos"
          >
            {isRegeneratingAllPrompts ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Wand2 size={13} />
            )}
            Regenerar Prompts Recursos
          </button>

          <button
            onClick={handleGenerateAll}
            disabled={isAnyGenerating || (characters.length === 0 && scenarios.length === 0 && props.length === 0)}
            className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5 ml-2"
          >
            {isAnyGenerating ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            Generar Todos
          </button>
        </div>
      </div>

      {/* 1. Characters Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 flex items-center gap-1.5">
            <User size={13} className="text-blue-400" /> Personajes Principales ({characters.length})
          </h3>
          <button
            onClick={() =>
              addCharacter({
                name: 'Nuevo Personaje',
                role: 'Secundario',
                visualPrompt:
                  'professional reference pose sheet 3 views + 1, cinematic turnaround portrait, sharp look, detailed clothes, realistic, 8k',
                voiceId: 'male-qn-qingse',
              })
            }
            className="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
          >
            <Plus size={13} /> Añadir Personaje
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Dedicated Narrator / V.O. Voice Asset Card */}
          <div className="bg-surface-950/70 border border-violet-500/30 hover:border-violet-500/50 rounded-xl p-4 flex gap-4 transition-colors">
            <div className="w-28 h-28 flex-shrink-0 bg-violet-950/40 border border-violet-500/30 rounded-lg flex flex-col items-center justify-center text-violet-400 p-2 text-center gap-1.5 shadow-inner">
              <Radio size={26} className="text-violet-400" />
              <span className="text-[10px] font-bold text-violet-300">Voz en Off (V.O.)</span>
              <span className="text-[9px] text-surface-400">Narrador</span>
            </div>

            <div className="flex-1 min-w-0 space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-surface-100">Narrador / Voz en Off</span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                      V.O. Global
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-surface-400 leading-relaxed mt-1">
                  Voz asignada para narraciones en off, explicaciones, reflexiones o tomas sin personaje en pantalla.
                </p>
              </div>

              <div className="pt-2 border-t border-surface-800/80">
                <label className="block text-[10px] text-surface-400 uppercase font-semibold mb-1 flex items-center gap-1">
                  <Volume2 size={11} className="text-violet-400" /> Voz Asignada (ElevenLabs / KIE):
                </label>
                <VoiceSelectorDropdown
                  value={voiceId}
                  onChange={(vid) => setMetadata({ voiceId: vid })}
                  compact
                />
              </div>
            </div>
          </div>

          {characters.map((char) => (
            <div
              key={char.id}
              className={`bg-surface-950/70 border rounded-xl p-4 flex gap-4 transition-colors ${
                char.generating
                  ? 'border-accent-500/50 bg-accent-500/5 ring-1 ring-accent-500/20'
                  : 'border-surface-800 hover:border-surface-700'
              }`}
            >
              {/* Character Portrait Preview */}
              <div
                onClick={() => {
                  if (char.imageUrl) {
                    setPreviewItem({
                      id: char.id,
                      name: char.name,
                      type: 'character',
                      roleOrDesc: char.role,
                      prompt: char.visualPrompt,
                      imageUrl: char.imageUrl,
                    })
                  } else if (!char.generating) {
                    generateCharacterImage(char.id)
                  }
                }}
                className={`w-28 h-28 flex-shrink-0 bg-surface-900 border rounded-lg overflow-hidden relative group flex items-center justify-center cursor-pointer ${
                  char.generating
                    ? 'border-accent-500/40 animate-pulse'
                    : char.imageUrl
                    ? 'border-surface-700 hover:border-accent-500/60'
                    : 'border-surface-800 hover:border-accent-500/40'
                }`}
              >
                {char.imageUrl ? (
                  <img
                    src={srcUrl(char.imageUrl)}
                    alt={char.name}
                    className="w-full h-full object-cover"
                  />
                ) : char.generating ? (
                  <div className="flex flex-col items-center justify-center gap-1.5 text-accent-400 p-2 text-center">
                    <RefreshCw size={20} className="animate-spin text-accent-400" />
                    <span className="text-[10px] font-medium">Generando...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-surface-500 hover:text-accent-400 gap-1.5 p-2 text-center transition-colors">
                    <User size={22} />
                    <span className="text-[9px] font-medium">Clic para Generar</span>
                  </div>
                )}

                {/* Overlay action buttons for generated images */}
                {char.imageUrl && !char.generating && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setPreviewItem({
                          id: char.id,
                          name: char.name,
                          type: 'character',
                          roleOrDesc: char.role,
                          prompt: char.visualPrompt,
                          imageUrl: char.imageUrl,
                        })
                      }}
                      className="p-1.5 rounded-md bg-surface-800 hover:bg-surface-700 text-surface-200 text-[10px] shadow"
                      title="Ver Ampliado (Pantalla Completa)"
                    >
                      <Maximize2 size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        generateCharacterImage(char.id)
                      }}
                      className="p-1.5 rounded-md bg-accent-600 hover:bg-accent-500 text-white text-[10px] shadow"
                      title="Regenerar Retrato con KIE"
                    >
                      <Sparkles size={12} />
                    </button>
                    {char.imageHistory && char.imageHistory.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setHistoryModalTarget({
                            type: 'character',
                            id: char.id,
                            title: `Historial de Versiones: ${char.name}`,
                            history: char.imageHistory || [],
                            activeUrl: char.imageUrl,
                            activeAssetId: char.imageAssetId,
                          })
                        }}
                        className="p-1.5 rounded-md bg-surface-800 hover:bg-surface-700 text-surface-200 text-[10px] shadow flex items-center gap-1"
                        title={`Historial de ${char.imageHistory.length} versiones`}
                      >
                        <History size={12} />
                        <span className="text-[9px] font-mono">{char.imageHistory.length}</span>
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setActivePickerTarget({ type: 'character', id: char.id })
                      }}
                      className="p-1.5 rounded-md bg-surface-800 hover:bg-surface-700 text-surface-200 text-[10px] shadow"
                      title="Seleccionar de la Galería"
                    >
                      <FolderOpen size={12} />
                    </button>
                  </div>
                )}
              </div>

              {/* Character Details & Prompt */}
              <div className="flex-1 min-w-0 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <input
                      type="text"
                      value={char.name}
                      onChange={(e) => updateCharacter(char.id, { name: e.target.value })}
                      className="font-semibold text-xs text-surface-100 bg-surface-900 px-2 py-0.5 rounded border border-surface-700 outline-none w-32"
                      placeholder="Nombre"
                    />
                    <input
                      type="text"
                      value={char.role}
                      onChange={(e) => updateCharacter(char.id, { role: e.target.value })}
                      className="text-[11px] text-surface-400 bg-surface-900 px-2 py-0.5 rounded border border-surface-800 outline-none flex-1"
                      placeholder="Rol (ej. Protagonista)"
                    />
                    <button
                      onClick={() => removeCharacter(char.id)}
                      className="text-surface-600 hover:text-red-400 p-1"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-[10px] text-surface-500 uppercase">
                        Prompt Visual de Consistencia:
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRegenerateCharacterPrompt(char.id)}
                        disabled={regeneratingPromptIds.has(char.id) || char.generating}
                        className="text-[9px] text-accent-400 hover:text-accent-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                        title="Regenerar prompt visual con IA para consistencia de personaje"
                      >
                        {regeneratingPromptIds.has(char.id) ? (
                          <>
                            <RefreshCw size={9} className="animate-spin" />
                            <span>Generando...</span>
                          </>
                        ) : (
                          <>
                            <Wand2 size={9} />
                            <span>Regenerar con IA</span>
                          </>
                        )}
                      </button>
                    </div>
                    <textarea
                      value={char.visualPrompt}
                      onChange={(e) => updateCharacter(char.id, { visualPrompt: e.target.value })}
                      className="input-field text-[11px] w-full h-10 resize-none leading-relaxed mb-2"
                      placeholder="Descripción de rasgos faciales, edad, etnia, vestimenta y peinado..."
                    />
                  </div>

                  {/* Character Voice Selection */}
                  <div className="pt-1 border-t border-surface-800/80">
                    <label className="block text-[10px] text-surface-500 uppercase mb-1">
                      Voz de Diálogo Asignada (ElevenLabs):
                    </label>
                    <VoiceSelectorDropdown
                      value={char.voiceId}
                      onChange={(vid) => updateCharacter(char.id, { voiceId: vid })}
                      compact
                    />
                  </div>
                </div>

                {/* Direct Action Row */}
                <div className="flex items-center justify-between pt-1 border-t border-surface-800/80">
                  <span className="text-[10px] text-surface-500">
                    {char.generating
                      ? 'Procesando en KIE...'
                      : char.imageUrl
                      ? '✓ Retrato Listo'
                      : 'Sin imagen'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {char.imageHistory && char.imageHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setHistoryModalTarget({
                            type: 'character',
                            id: char.id,
                            title: `Historial de Versiones: ${char.name}`,
                            history: char.imageHistory || [],
                            activeUrl: char.imageUrl,
                            activeAssetId: char.imageAssetId,
                          })
                        }
                        className="p-1 px-1.5 rounded bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-surface-100 border border-surface-700 text-[10px] flex items-center gap-1"
                        title="Ver versiones generadas previamente"
                      >
                        <History size={11} />
                        <span>{char.imageHistory.length}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => generateCharacterImage(char.id)}
                      disabled={char.generating || !char.visualPrompt.trim()}
                      className="px-2.5 py-1 rounded bg-accent-600/20 hover:bg-accent-600/30 text-accent-400 border border-accent-500/30 text-[10px] font-medium flex items-center gap-1 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {char.generating ? (
                        <>
                          <RefreshCw size={11} className="animate-spin" /> Generando...
                        </>
                      ) : (
                        <>
                          <Sparkles size={11} /> {char.imageUrl ? 'Regenerar' : 'Generar Retrato'}
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setActivePickerTarget({ type: 'character', id: char.id })}
                      disabled={char.generating}
                      className="p-1 rounded bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-surface-200 border border-surface-700 text-[10px]"
                      title="Elegir de Galería"
                    >
                      <FolderOpen size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Scenarios Section */}
      <div className="space-y-3 pt-4 border-t border-surface-800">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 flex items-center gap-1.5">
            <MapPin size={13} className="text-emerald-400" /> Locaciones & Escenarios ({scenarios.length})
          </h3>
          <button
            onClick={() =>
              addScenario({
                name: 'Nueva Locación',
                visualPrompt: 'Cinematic indoor set, dramatic atmosphere, empty environment, completely unpopulated, no people, no humans, 8K, photorealistic',
              })
            }
            className="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
          >
            <Plus size={13} /> Añadir Locación
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scenarios.map((scn) => (
            <div
              key={scn.id}
              className={`bg-surface-950/70 border rounded-xl p-4 flex gap-4 transition-colors ${
                scn.generating
                  ? 'border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20'
                  : 'border-surface-800 hover:border-surface-700'
              }`}
            >
              {/* Scenario Preview */}
              <div
                onClick={() => {
                  if (scn.imageUrl) {
                    setPreviewItem({
                      id: scn.id,
                      name: scn.name,
                      type: 'scenario',
                      prompt: scn.visualPrompt,
                      imageUrl: scn.imageUrl,
                    })
                  } else if (!scn.generating) {
                    generateScenarioImage(scn.id)
                  }
                }}
                className={`w-28 h-28 flex-shrink-0 bg-surface-900 border rounded-lg overflow-hidden relative group flex items-center justify-center cursor-pointer ${
                  scn.generating
                    ? 'border-emerald-500/40 animate-pulse'
                    : scn.imageUrl
                    ? 'border-surface-700 hover:border-emerald-500/60'
                    : 'border-surface-800 hover:border-emerald-500/40'
                }`}
              >
                {scn.imageUrl ? (
                  <img
                    src={srcUrl(scn.imageUrl)}
                    alt={scn.name}
                    className="w-full h-full object-cover"
                  />
                ) : scn.generating ? (
                  <div className="flex flex-col items-center justify-center gap-1.5 text-emerald-400 p-2 text-center">
                    <RefreshCw size={20} className="animate-spin text-emerald-400" />
                    <span className="text-[10px] font-medium">Generando...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-surface-500 hover:text-emerald-400 gap-1.5 p-2 text-center transition-colors">
                    <MapPin size={22} />
                    <span className="text-[9px] font-medium">Clic para Generar</span>
                  </div>
                )}

                {scn.imageUrl && !scn.generating && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setPreviewItem({
                          id: scn.id,
                          name: scn.name,
                          type: 'scenario',
                          prompt: scn.visualPrompt,
                          imageUrl: scn.imageUrl,
                        })
                      }}
                      className="p-1.5 rounded-md bg-surface-800 hover:bg-surface-700 text-surface-200 text-[10px] shadow"
                      title="Ver Ampliado (Pantalla Completa)"
                    >
                      <Maximize2 size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        generateScenarioImage(scn.id)
                      }}
                      className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] shadow"
                      title="Regenerar Fondo con KIE"
                    >
                      <Sparkles size={12} />
                    </button>
                    {scn.imageHistory && scn.imageHistory.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setHistoryModalTarget({
                            type: 'scenario',
                            id: scn.id,
                            title: `Historial de Versiones: ${scn.name}`,
                            history: scn.imageHistory || [],
                            activeUrl: scn.imageUrl,
                            activeAssetId: scn.imageAssetId,
                          })
                        }}
                        className="p-1.5 rounded-md bg-surface-800 hover:bg-surface-700 text-surface-200 text-[10px] shadow flex items-center gap-1"
                        title={`Historial de ${scn.imageHistory.length} versiones`}
                      >
                        <History size={12} />
                        <span className="text-[9px] font-mono">{scn.imageHistory.length}</span>
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setActivePickerTarget({ type: 'scenario', id: scn.id })
                      }}
                      className="p-1.5 rounded-md bg-surface-800 hover:bg-surface-700 text-surface-200 text-[10px] shadow"
                      title="Seleccionar de la Galería"
                    >
                      <FolderOpen size={12} />
                    </button>
                  </div>
                )}
              </div>

              {/* Scenario Details */}
              <div className="flex-1 min-w-0 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <input
                      type="text"
                      value={scn.name}
                      onChange={(e) => updateScenario(scn.id, { name: e.target.value })}
                      className="font-semibold text-xs text-surface-100 bg-surface-900 px-2 py-0.5 rounded border border-surface-700 outline-none flex-1"
                      placeholder="Nombre del Escenario"
                    />
                    <button
                      onClick={() => removeScenario(scn.id)}
                      className="text-surface-600 hover:text-red-400 p-1"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-[10px] text-surface-500 uppercase">
                        Prompt de Locación:
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRegenerateScenarioPrompt(scn.id)}
                        disabled={regeneratingPromptIds.has(scn.id) || scn.generating}
                        className="text-[9px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                        title="Regenerar prompt visual con IA para entorno y locación"
                      >
                        {regeneratingPromptIds.has(scn.id) ? (
                          <>
                            <RefreshCw size={9} className="animate-spin" />
                            <span>Generando...</span>
                          </>
                        ) : (
                          <>
                            <Wand2 size={9} />
                            <span>Regenerar con IA</span>
                          </>
                        )}
                      </button>
                    </div>
                    <textarea
                      value={scn.visualPrompt}
                      onChange={(e) => updateScenario(scn.id, { visualPrompt: e.target.value })}
                      className="input-field text-[11px] w-full h-12 resize-none leading-relaxed"
                      placeholder="Descripción de la iluminación, arquitectura y tono del lugar..."
                    />
                  </div>
                </div>

                {/* Direct Action Row */}
                <div className="flex items-center justify-between pt-1 border-t border-surface-800/80">
                  <span className="text-[10px] text-surface-500">
                    {scn.generating
                      ? 'Procesando en KIE...'
                      : scn.imageUrl
                      ? '✓ Locación Lista'
                      : 'Sin imagen'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {scn.imageHistory && scn.imageHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setHistoryModalTarget({
                            type: 'scenario',
                            id: scn.id,
                            title: `Historial de Versiones: ${scn.name}`,
                            history: scn.imageHistory || [],
                            activeUrl: scn.imageUrl,
                            activeAssetId: scn.imageAssetId,
                          })
                        }
                        className="p-1 px-1.5 rounded bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-surface-100 border border-surface-700 text-[10px] flex items-center gap-1"
                        title="Ver versiones generadas previamente"
                      >
                        <History size={11} />
                        <span>{scn.imageHistory.length}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => generateScenarioImage(scn.id)}
                      disabled={scn.generating || !scn.visualPrompt.trim()}
                      className="px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-[10px] font-medium flex items-center gap-1 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {scn.generating ? (
                        <>
                          <RefreshCw size={11} className="animate-spin" /> Generando...
                        </>
                      ) : (
                        <>
                          <Sparkles size={11} /> {scn.imageUrl ? 'Regenerar' : 'Generar Locación'}
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setActivePickerTarget({ type: 'scenario', id: scn.id })}
                      disabled={scn.generating}
                      className="p-1 rounded bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-surface-200 border border-surface-700 text-[10px]"
                      title="Elegir de Galería"
                    >
                      <FolderOpen size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Props / Key Objects Section */}
      <div className="space-y-3 pt-4 border-t border-surface-800">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 flex items-center gap-1.5">
            <Package size={13} className="text-purple-400" /> Objetos & Props Clave ({props.length})
          </h3>
          <button
            onClick={() =>
              addProp({
                name: 'Nuevo Objeto',
                description: 'Objeto de importancia en la trama',
                visualPrompt: 'Cinematic isolated product shot on clean plain neutral grey studio background, centered, no humans, no hands, no people, dramatic studio lighting, 8K',
              })
            }
            className="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
          >
            <Plus size={13} /> Añadir Objeto
          </button>
        </div>

        {props.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-surface-800 text-center text-surface-500 text-xs">
            No hay objetos o armas clave definidos aún. Puedes añadir artefactos, gemas, llaves o armas que aparezcan en el drama.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {props.map((pr) => (
              <div
                key={pr.id}
                className={`bg-surface-950/70 border rounded-xl p-4 flex gap-4 transition-colors ${
                  pr.generating
                    ? 'border-purple-500/50 bg-purple-500/5 ring-1 ring-purple-500/20'
                    : 'border-surface-800 hover:border-surface-700'
                }`}
              >
                {/* Prop Preview */}
                <div
                  onClick={() => {
                    if (pr.imageUrl) {
                      setPreviewItem({
                        id: pr.id,
                        name: pr.name,
                        type: 'prop',
                        roleOrDesc: pr.description,
                        prompt: pr.visualPrompt,
                        imageUrl: pr.imageUrl,
                      })
                    } else if (!pr.generating) {
                      generatePropImage(pr.id)
                    }
                  }}
                  className={`w-28 h-28 flex-shrink-0 bg-surface-900 border rounded-lg overflow-hidden relative group flex items-center justify-center cursor-pointer ${
                    pr.generating
                      ? 'border-purple-500/40 animate-pulse'
                      : pr.imageUrl
                      ? 'border-surface-700 hover:border-purple-500/60'
                      : 'border-surface-800 hover:border-purple-500/40'
                  }`}
                >
                  {pr.imageUrl ? (
                    <img
                      src={srcUrl(pr.imageUrl)}
                      alt={pr.name}
                      className="w-full h-full object-cover"
                    />
                  ) : pr.generating ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 text-purple-400 p-2 text-center">
                      <RefreshCw size={20} className="animate-spin text-purple-400" />
                      <span className="text-[10px] font-medium">Generando...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-surface-500 hover:text-purple-400 gap-1.5 p-2 text-center transition-colors">
                      <Package size={22} />
                      <span className="text-[9px] font-medium">Clic para Generar</span>
                    </div>
                  )}

                  {pr.imageUrl && !pr.generating && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setPreviewItem({
                            id: pr.id,
                            name: pr.name,
                            type: 'prop',
                            roleOrDesc: pr.description,
                            prompt: pr.visualPrompt,
                            imageUrl: pr.imageUrl,
                          })
                        }}
                        className="p-1.5 rounded-md bg-surface-800 hover:bg-surface-700 text-surface-200 text-[10px] shadow"
                        title="Ver Ampliado (Pantalla Completa)"
                      >
                        <Maximize2 size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          generatePropImage(pr.id)
                        }}
                        className="p-1.5 rounded-md bg-purple-600 hover:bg-purple-500 text-white text-[10px] shadow"
                        title="Regenerar Objeto con KIE"
                      >
                        <Sparkles size={12} />
                      </button>
                      {pr.imageHistory && pr.imageHistory.length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setHistoryModalTarget({
                              type: 'prop',
                              id: pr.id,
                              title: `Historial de Versiones: ${pr.name}`,
                              history: pr.imageHistory || [],
                              activeUrl: pr.imageUrl,
                              activeAssetId: pr.imageAssetId,
                            })
                          }}
                          className="p-1.5 rounded-md bg-surface-800 hover:bg-surface-700 text-surface-200 text-[10px] shadow flex items-center gap-1"
                          title={`Historial de ${pr.imageHistory.length} versiones`}
                        >
                          <History size={12} />
                          <span className="text-[9px] font-mono">{pr.imageHistory.length}</span>
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setActivePickerTarget({ type: 'prop', id: pr.id })
                        }}
                        className="p-1.5 rounded-md bg-surface-800 hover:bg-surface-700 text-surface-200 text-[10px] shadow"
                        title="Seleccionar de la Galería"
                      >
                        <FolderOpen size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Prop Details */}
                <div className="flex-1 min-w-0 space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <input
                        type="text"
                        value={pr.name}
                        onChange={(e) => updateProp(pr.id, { name: e.target.value })}
                        className="font-semibold text-xs text-surface-100 bg-surface-900 px-2 py-0.5 rounded border border-surface-700 outline-none flex-1"
                        placeholder="Nombre del Objeto / Arma"
                      />
                      <button
                        onClick={() => removeProp(pr.id)}
                        className="text-surface-600 hover:text-red-400 p-1"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="block text-[10px] text-surface-500 uppercase">
                          Prompt Visual del Objeto:
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRegeneratePropPrompt(pr.id)}
                          disabled={regeneratingPromptIds.has(pr.id) || pr.generating}
                          className="text-[9px] text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                          title="Regenerar prompt visual con IA para objeto clave"
                        >
                          {regeneratingPromptIds.has(pr.id) ? (
                            <>
                              <RefreshCw size={9} className="animate-spin" />
                              <span>Generando...</span>
                            </>
                          ) : (
                            <>
                              <Wand2 size={9} />
                              <span>Regenerar con IA</span>
                            </>
                          )}
                        </button>
                      </div>
                      <textarea
                        value={pr.visualPrompt}
                        onChange={(e) => updateProp(pr.id, { visualPrompt: e.target.value })}
                        className="input-field text-[11px] w-full h-12 resize-none leading-relaxed"
                        placeholder="Descripción de la textura, materiales, brillo e iluminación del objeto..."
                      />
                    </div>
                  </div>

                  {/* Direct Action Row */}
                  <div className="flex items-center justify-between pt-1 border-t border-surface-800/80">
                    <span className="text-[10px] text-surface-500">
                      {pr.generating
                        ? 'Procesando en KIE...'
                        : pr.imageUrl
                        ? '✓ Objeto Listo'
                        : 'Sin imagen'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {pr.imageHistory && pr.imageHistory.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setHistoryModalTarget({
                              type: 'prop',
                              id: pr.id,
                              title: `Historial de Versiones: ${pr.name}`,
                              history: pr.imageHistory || [],
                              activeUrl: pr.imageUrl,
                              activeAssetId: pr.imageAssetId,
                            })
                          }
                          className="p-1 px-1.5 rounded bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-surface-100 border border-surface-700 text-[10px] flex items-center gap-1"
                          title="Ver versiones generadas previamente"
                        >
                          <History size={11} />
                          <span>{pr.imageHistory.length}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => generatePropImage(pr.id)}
                        disabled={pr.generating || !pr.visualPrompt.trim()}
                        className="px-2.5 py-1 rounded bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 text-[10px] font-medium flex items-center gap-1 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {pr.generating ? (
                          <>
                            <RefreshCw size={11} className="animate-spin" /> Generando...
                          </>
                        ) : (
                          <>
                            <Sparkles size={11} /> {pr.imageUrl ? 'Regenerar' : 'Generar Objeto'}
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setActivePickerTarget({ type: 'prop', id: pr.id })}
                        disabled={pr.generating}
                        className="p-1 rounded bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-surface-200 border border-surface-700 text-[10px]"
                        title="Elegir de Galería"
                      >
                        <FolderOpen size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-surface-800">
        <button
          onClick={() => setStage(1)}
          className="btn-ghost text-xs flex items-center gap-1.5"
        >
          <ArrowLeft size={13} /> Volver a Guión
        </button>

        <button
          onClick={() => setStage(3)}
          className="btn-primary text-xs flex items-center gap-1.5 px-4 py-2"
        >
          Siguiente: Storyboard & Keyframes <ArrowRight size={13} />
        </button>
      </div>

      {/* Image Library Picker Modal */}
      {activePickerTarget && (
        <ImageLibraryPicker
          multiple={false}
          onSelect={handleLibrarySelect}
          onClose={() => setActivePickerTarget(null)}
        />
      )}

      {/* Generation History Modal */}
      {historyModalTarget && (
        <GenerationHistoryModal
          isOpen={!!historyModalTarget}
          onClose={() => setHistoryModalTarget(null)}
          title={historyModalTarget.title}
          kind="image"
          activeUrl={historyModalTarget.activeUrl}
          activeAssetId={historyModalTarget.activeAssetId}
          history={historyModalTarget.history}
          onRestore={(item) => {
            if (historyModalTarget.type === 'character') {
              restoreCharacterImage(historyModalTarget.id, item.id)
            } else if (historyModalTarget.type === 'scenario') {
              restoreScenarioImage(historyModalTarget.id, item.id)
            } else if (historyModalTarget.type === 'prop') {
              restorePropImage(historyModalTarget.id, item.id)
            }
          }}
        />
      )}

      {/* Image Preview Modal (Fullscreen / Zoom / Detail) */}
      {previewItem && (
        <ImagePreviewModal
          src={srcUrl(previewItem.imageUrl) || ''}
          onClose={() => setPreviewItem(null)}
          onPrev={
            allGeneratedItems.findIndex((x) => x.id === previewItem.id) > 0
              ? () => {
                  const idx = allGeneratedItems.findIndex((x) => x.id === previewItem.id)
                  setPreviewItem(allGeneratedItems[idx - 1])
                }
              : undefined
          }
          onNext={
            allGeneratedItems.findIndex((x) => x.id === previewItem.id) < allGeneratedItems.length - 1
              ? () => {
                  const idx = allGeneratedItems.findIndex((x) => x.id === previewItem.id)
                  setPreviewItem(allGeneratedItems[idx + 1])
                }
              : undefined
          }
        >
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                    previewItem.type === 'character'
                      ? 'bg-accent-500/10 text-accent-400 border-accent-500/20'
                      : previewItem.type === 'scenario'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                  }`}
                >
                  {previewItem.type === 'character'
                    ? 'Personaje'
                    : previewItem.type === 'scenario'
                    ? 'Locación / Escenario'
                    : 'Objeto / Prop Clave'}
                </span>
                <h3 className="text-sm font-semibold text-surface-100 truncate">
                  {previewItem.name}
                </h3>
              </div>
              {previewItem.roleOrDesc && (
                <p className="text-xs text-surface-400 italic mt-0.5">
                  {previewItem.roleOrDesc}
                </p>
              )}
            </div>

            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">
                Prompt Visual
              </p>
              <div className="flex items-start gap-1">
                <p className="text-xs text-surface-200 leading-relaxed flex-1 select-text bg-surface-950/60 p-2.5 rounded-lg border border-surface-800">
                  {previewItem.prompt || '—'}
                </p>
                <button
                  onClick={() => {
                    copyText(previewItem.prompt || '')
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

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-surface-800 text-xs">
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider">Modelo</p>
                <p className="text-surface-200 font-medium truncate">{imageModel.name}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider">Resolución</p>
                <p className="text-surface-200 font-mono">{imageResolution}</p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  if (previewItem.type === 'character') {
                    generateCharacterImage(previewItem.id)
                  } else if (previewItem.type === 'scenario') {
                    generateScenarioImage(previewItem.id)
                  } else if (previewItem.type === 'prop') {
                    generatePropImage(previewItem.id)
                  }
                  setPreviewItem(null)
                }}
                className="btn-primary text-xs w-full py-2 flex items-center justify-center gap-1.5"
              >
                <Sparkles size={13} /> Regenerar Imagen con KIE
              </button>
            </div>
          </div>
        </ImagePreviewModal>
      )}
    </div>
  )
}
