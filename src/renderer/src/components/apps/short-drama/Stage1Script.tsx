import { useState, useMemo, useEffect } from 'react'
import {
  Sparkles,
  FileText,
  Clapperboard,
  ArrowRight,
  RefreshCw,
  Plus,
  Trash2,
  Layers,
  Bot,
  AlertTriangle,
  Clock,
  Lock,
  SlidersHorizontal,
} from 'lucide-react'
import { useShortDramaStore } from '../../../stores/short-drama-store'
import { useProvidersStore, isModelConfigured } from '../../../stores/providers-store'
import { useAppStore } from '../../../stores/app-store'
import { LLM_MODELS } from '../../../lib/models'
import { AspectRatioSelector } from '../../models/AspectRatioSelector'
import { ModelSelectorDropdown } from '../../models/ModelSelectorDropdown'
import { StreamDuration } from '../../StreamDuration'
import {
  DramaContentType,
  CONTENT_TYPES_CONFIG,
} from '../../../lib/content-type-prompts'

export function Stage1Script() {
  const { configuredProviders } = useProvidersStore()
  const {
    title,
    contentType,
    customPromptGuide,
    ideaPrompt,
    genre,
    tone,
    visualStyle,
    aspectRatio,
    shotsCount,
    script,
    logline,
    characters,
    scenarios,
    props,
    shots,
    videoModel,
    isGeneratingScript,
    scriptError,
    llmModel,
    setLlmModel,
    setMetadata,
    setScript,
    generateScriptBreakdown,
    parseScriptToShots,
    updateShot,
    addShot,
    removeShot,
    setStage,
  } = useShortDramaStore()

  const hasConfiguredLlm = useMemo(() => {
    return LLM_MODELS.some((m) => isModelConfigured(m, configuredProviders))
  }, [configuredProviders])

  // Automatically select first configured LLM if current selected model is not integrated
  useEffect(() => {
    if (!isModelConfigured(llmModel, configuredProviders)) {
      const firstConfigured = LLM_MODELS.find((m) => isModelConfigured(m, configuredProviders))
      if (firstConfigured) {
        setLlmModel(firstConfigured)
      }
    }
  }, [configuredProviders, llmModel, setLlmModel])

  const activeConfig = CONTENT_TYPES_CONFIG[contentType || 'microdrama'] || CONTENT_TYPES_CONFIG.microdrama
  const [activeTab, setActiveTab] = useState<'shots' | 'markdown'>('shots')

  const handleExampleClick = (example: string) => {
    setMetadata({ ideaPrompt: example })
  }

  const handleGenerate = async () => {
    await generateScriptBreakdown()
  }

  const hasGeneratedContent = shots.length > 0
  const isAuto = !shotsCount || shotsCount <= 0

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">
      {/* Configuration & Premise Input Card */}
      <div className="card p-6 border-surface-800 bg-surface-900/60 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center flex-shrink-0">
              <Clapperboard size={18} className="text-accent-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-surface-100">
                  Premisa & Desglose Creativo
                </h2>
                {/* Locked Content Type Badge */}
                <div
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${activeConfig.badgeBg} ${activeConfig.badgeColor} border ${activeConfig.badgeBorder} flex items-center gap-1`}
                  title="Tipo de contenido fijado al crear la pieza"
                >
                  <span>{activeConfig.label}</span>
                  <Lock size={10} className="opacity-70" />
                </div>
              </div>
              <p className="text-xs text-surface-400">
                {activeConfig.tagline}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* LLM Model Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-surface-400 font-medium flex items-center gap-1">
                <Bot size={13} className="text-accent-400" /> Motor LLM:
              </span>
              <ModelSelectorDropdown
                kind="llm"
                selectedModelId={llmModel.modelId || llmModel.name}
                onSelect={(m) => setLlmModel(m)}
                compact
                onlyConfigured
              />
            </div>

            {/* Aspect Ratio Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-surface-400 font-medium">Formato:</span>
              <AspectRatioSelector
                value={aspectRatio}
                onChange={(ar) => setMetadata({ aspectRatio: ar })}
                compact
              />
            </div>
          </div>
        </div>

        {/* Premise input */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-surface-300">
            Idea, Concepto o Premisa ({activeConfig.shortLabel}):
          </label>
          <textarea
            value={ideaPrompt}
            onChange={(e) => setMetadata({ ideaPrompt: e.target.value })}
            placeholder={activeConfig.inputPlaceholder}
            className="input-field w-full h-24 text-xs font-sans resize-none p-3"
          />

          {/* Quick example tags */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-[10px] text-surface-500">Ideas recomendadas:</span>
            {activeConfig.examplePremises.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleExampleClick(ex)}
                className="text-[10px] px-2.5 py-0.5 rounded bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-surface-200 border border-surface-700 transition-colors"
              >
                Idea #{i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Prompt Guide (shown prominently for 'libre', or expandable for other types) */}
        {contentType === 'libre' ? (
          <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                <SlidersHorizontal size={13} className="text-cyan-400" />
                Guía de Extracción y Prompts (Directivas IA)
              </label>
              <span className="text-[10px] text-cyan-400/90 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20 font-medium">
                Prioridad Máxima
              </span>
            </div>
            <p className="text-[11px] text-surface-400">
              Instrucciones personalizadas que guían al LLM en cómo estructurar las escenas, los personajes y el estilo de los prompts en inglés.
            </p>
            <textarea
              value={customPromptGuide}
              onChange={(e) => setMetadata({ customPromptGuide: e.target.value })}
              placeholder="Ingresa tus directivas para estructurar la extracción de escenas y prompts..."
              className="input-field w-full h-24 text-xs font-mono resize-none p-3 bg-surface-900/90 border-cyan-500/30 focus:border-cyan-400 text-surface-200"
            />
          </div>
        ) : (
          <details className="group border border-surface-800 rounded-xl bg-surface-900/30 overflow-hidden text-xs">
            <summary className="px-3.5 py-2 cursor-pointer select-none text-surface-400 hover:text-surface-200 flex items-center justify-between font-medium">
              <span className="flex items-center gap-1.5 text-xs">
                <SlidersHorizontal size={13} className="text-surface-400" />
                Directivas Personalizadas de Extracción / Prompts (Opcional)
              </span>
              <span className="text-[10px] text-surface-500 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="p-3.5 pt-1 border-t border-surface-800/60 space-y-1.5">
              <p className="text-[11px] text-surface-400">
                Pautas adicionales para que el LLM adapte la extracción de escenas y redacción de prompts según tus necesidades específicas.
              </p>
              <textarea
                value={customPromptGuide}
                onChange={(e) => setMetadata({ customPromptGuide: e.target.value })}
                placeholder="Directivas opcionales para complementar las reglas base del formato..."
                className="input-field w-full h-20 text-xs font-mono resize-none p-2.5 bg-surface-900 border-surface-700"
              />
            </div>
          </details>
        )}

        {/* Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-surface-800">
          <div>
            <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1">
              Categoría / Género
            </label>
            <select
              value={genre}
              onChange={(e) => setMetadata({ genre: e.target.value })}
              className="input-field text-xs w-full"
            >
              {activeConfig.genres.map((g) => (
                <option key={g} value={g} className="bg-surface-900">
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1">
              Tono de la Pieza
            </label>
            <select
              value={tone}
              onChange={(e) => setMetadata({ tone: e.target.value })}
              className="input-field text-xs w-full"
            >
              {activeConfig.tones.map((t) => (
                <option key={t} value={t} className="bg-surface-900">
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-surface-500 uppercase tracking-wider">
                Escenas / Tomas
              </label>
              <span className="text-[10px] text-surface-400 font-mono">
                {isAuto ? '✨ Auto (IA)' : `~${(shotsCount || 4) * 5}s`}
              </span>
            </div>

            <div className="space-y-1.5">
              {/* Segmented Toggle: Auto vs Libre */}
              <div className="flex items-center p-0.5 bg-surface-900 rounded-lg border border-surface-800">
                <button
                  type="button"
                  onClick={() => setMetadata({ shotsCount: 0 })}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-md text-xs font-medium transition-all ${
                    isAuto
                      ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30 shadow-sm font-semibold'
                      : 'text-surface-400 hover:text-surface-200'
                  }`}
                  title="El modelo de IA decidirá la cantidad óptima de escenas"
                >
                  <Sparkles size={11} className={isAuto ? 'text-accent-400' : 'text-surface-400'} />
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const fallback = shotsCount && shotsCount > 0 ? shotsCount : 4
                    setMetadata({ shotsCount: fallback })
                  }}
                  className={`flex-1 py-1 px-2 rounded-md text-xs font-medium transition-all ${
                    !isAuto
                      ? 'bg-surface-800 text-surface-100 border border-surface-700 shadow-sm font-semibold'
                      : 'text-surface-400 hover:text-surface-200'
                  }`}
                  title="Define libremente una cantidad exacta de escenas"
                >
                  Libre
                </button>
              </div>

              {/* Input for Libre Mode or Hint for Auto Mode */}
              {!isAuto ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const current = shotsCount && shotsCount > 0 ? shotsCount : 4
                      setMetadata({ shotsCount: Math.max(1, current - 1) })
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-surface-100 transition-colors text-xs font-bold shrink-0 border border-surface-700/50"
                    title="Disminuir escenas"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={shotsCount && shotsCount > 0 ? shotsCount : ''}
                    placeholder="Ej. 6"
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (!isNaN(val)) {
                        setMetadata({ shotsCount: Math.max(1, val) })
                      } else if (e.target.value === '') {
                        setMetadata({ shotsCount: 1 })
                      }
                    }}
                    className="input-field text-xs flex-1 font-mono text-center px-1.5 py-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const current = shotsCount && shotsCount > 0 ? shotsCount : 4
                      setMetadata({ shotsCount: current + 1 })
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-surface-100 transition-colors text-xs font-bold shrink-0 border border-surface-700/50"
                    title="Aumentar escenas"
                  >
                    +
                  </button>
                  <span className="text-xs font-semibold text-accent-400 font-mono shrink-0 pl-0.5">
                    tomas
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5 py-1 px-2 rounded bg-accent-500/5 border border-accent-500/10 text-[10px] text-surface-400 text-center">
                  <span className="text-accent-400/80">✨</span>
                  <span>Definida por la IA según la narrativa</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-surface-500 uppercase tracking-wider mb-1">
              Estilo Visual Coherente
            </label>
            <input
              type="text"
              value={visualStyle}
              onChange={(e) => setMetadata({ visualStyle: e.target.value })}
              className="input-field text-xs w-full"
              placeholder="Fotorealista, 8K, iluminación dramática..."
            />
          </div>
        </div>

        {/* Unconfigured LLM Warning Banner */}
        {!hasConfiguredLlm && (
          <div className="mt-4 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200 shadow-sm">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={18} className="text-amber-400 shrink-0" />
              <div>
                <p className="font-semibold text-amber-300">No hay ningún proveedor de LLM integrado</p>
                <p className="text-[11px] text-amber-400/90 mt-0.5">
                  Para generar guiones y desgloses necesitas configurar al menos una API Key de DeepSeek, OpenAI, Anthropic, Google Gemini o KIE.ai.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => useAppStore.getState().setPage('providers')}
              className="px-3.5 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white font-medium text-xs whitespace-nowrap shadow-sm shrink-0 self-start sm:self-center"
            >
              Configurar Proveedores
            </button>
          </div>
        )}

        {/* Error Banner */}
        {scriptError && (
          <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 flex items-start gap-3 text-xs text-red-200">
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-red-300">
                Error al desglosar con {llmModel.name}:
              </div>
              <p className="text-[11px] text-red-400/90 mt-0.5 break-words">{scriptError}</p>
            </div>
            <button
              onClick={handleGenerate}
              className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 font-medium text-xs flex items-center gap-1 border border-red-500/30 flex-shrink-0"
            >
              <RefreshCw size={11} /> Reintentar
            </button>
          </div>
        )}

        {/* Generate Button */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-surface-800">
          <span className="text-xs text-surface-500">
            {!hasConfiguredLlm
              ? 'Configura un proveedor de LLM en Ajustes para continuar.'
              : hasGeneratedContent
              ? `${shots.length} tomas, ${characters.length} personajes, ${scenarios.length} locaciones y ${props.length} objetos extraídos con ${llmModel.name}.`
              : `Listo para desglosar con ${llmModel.name}.`}
          </span>
          <button
            onClick={handleGenerate}
            disabled={!ideaPrompt.trim() || isGeneratingScript || !hasConfiguredLlm || !isModelConfigured(llmModel, configuredProviders)}
            title={!hasConfiguredLlm ? 'Configura un proveedor de LLM en Ajustes para generar' : undefined}
            className="btn-primary text-xs flex items-center gap-2 px-4 py-2"
          >
            {isGeneratingScript ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Desglosando con {llmModel.name}...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                {hasGeneratedContent ? 'Regenerar Guión y Desglose' : 'Generar Guión & Desglose'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Generated Breakdown / Shots Section */}
      {hasGeneratedContent && (
        <div className="card p-6 border-surface-800 bg-surface-900/60 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-surface-800">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-surface-100 flex items-center gap-2">
                <FileText size={15} className="text-accent-400" />
                {title || 'Guión Estructurado'}
              </h3>
              {logline && (
                <span className="text-xs text-surface-400 italic hidden md:inline border-l border-surface-700 pl-3">
                  "{logline}"
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-surface-800 rounded-lg p-0.5 border border-surface-700">
                <button
                  type="button"
                  onClick={() => setActiveTab('shots')}
                  className={`text-xs px-2.5 py-1 rounded transition-colors ${
                    activeTab === 'shots'
                      ? 'bg-accent-500/20 text-accent-400 font-medium'
                      : 'text-surface-400 hover:text-surface-200'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Layers size={12} /> Desglose de Tomas ({shots.length})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('markdown')}
                  className={`text-xs px-2.5 py-1 rounded transition-colors ${
                    activeTab === 'markdown'
                      ? 'bg-accent-500/20 text-accent-400 font-medium'
                      : 'text-surface-400 hover:text-surface-200'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <FileText size={12} /> Guión Texto
                  </span>
                </button>
              </div>

              <button
                onClick={() => setStage(2)}
                className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5"
              >
                Siguiente: Personajes & Props <ArrowRight size={13} />
              </button>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'shots' ? (
            <div className="space-y-3">
              {shots.map((shot, index) => (
                <div
                  key={shot.id}
                  className="bg-surface-950/60 border border-surface-800 rounded-xl p-4 hover:border-surface-700 transition-colors space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-accent-400 bg-accent-500/10 px-2 py-0.5 rounded border border-accent-500/20">
                        Toma {index + 1}
                      </span>
                      <input
                        type="text"
                        value={shot.cameraMovement}
                        onChange={(e) => updateShot(shot.id, { cameraMovement: e.target.value })}
                        placeholder="Tipo de plano (ej. Primer plano)"
                        className="bg-surface-800 text-surface-200 text-xs px-2 py-1 rounded border border-surface-700 outline-none w-48"
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-surface-500 font-mono flex items-center gap-0.5">
                          <Clock size={10} />
                        </span>
                        <StreamDuration
                          value={shot.estimatedDuration || 5}
                          options={videoModel.durationOptions}
                          min={videoModel.provider === 'replicate' && videoModel.name.includes('P-Video') ? 1 : 4}
                          max={videoModel.durationMax || 15}
                          onChange={(val) => updateShot(shot.id, { estimatedDuration: val })}
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => removeShot(shot.id)}
                      className="text-surface-500 hover:text-red-400 p-1 transition-colors"
                      title="Eliminar toma"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-surface-500 uppercase mb-1">
                        Acción Visual:
                      </label>
                      <textarea
                        value={shot.actionPrompt}
                        onChange={(e) => updateShot(shot.id, { actionPrompt: e.target.value })}
                        className="input-field text-xs w-full h-16 resize-none"
                        placeholder="Descripción de la acción visual..."
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] text-surface-500 uppercase">
                          Diálogo / Voz en Off:
                        </label>
                        <input
                          type="text"
                          value={shot.dialogueSpeaker}
                          onChange={(e) => updateShot(shot.id, { dialogueSpeaker: e.target.value })}
                          placeholder="Hablante"
                          className="bg-surface-800 text-surface-300 text-[10px] px-1.5 py-0.5 rounded border border-surface-700 outline-none w-24 text-right"
                        />
                      </div>
                      <textarea
                        value={shot.dialogueText}
                        onChange={(e) => updateShot(shot.id, { dialogueText: e.target.value })}
                        className="input-field text-xs w-full h-16 resize-none font-serif italic text-surface-200"
                        placeholder="Diálogo o narración de la escena..."
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={() => addShot()}
                className="w-full py-2.5 border border-dashed border-surface-700 hover:border-accent-500/40 rounded-xl text-xs text-surface-400 hover:text-accent-400 flex items-center justify-center gap-1.5 transition-colors bg-surface-900/30"
              >
                <Plus size={14} /> Añadir Nueva Toma
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-surface-400">
                  Edita o pega tu guión estructurado (soporta <code>## Escena (duración)</code> y <code>### Toma (duración)</code>).
                </span>
                <button
                  type="button"
                  onClick={() => {
                    parseScriptToShots()
                    setActiveTab('shots')
                  }}
                  className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5 shadow-sm"
                  title="Extraer tomas, diálogos y duraciones desde el guión"
                >
                  <Sparkles size={13} /> Extraer Tomas del Guión
                </button>
              </div>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder={`## Escena 1 (5s): Encuentro en el callejón\nDescripción de la acción visual en la escena...\n\n### Toma 1 (5s)\nPlano medio. El personaje observa cauteloso a su alrededor.\n\nCARLOS: "No deberías estar aquí."\n\n## Escena 2 (8 seg): La persecución`}
                className="input-field w-full h-80 font-mono text-xs p-4 leading-relaxed resize-none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
