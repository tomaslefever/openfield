import { useState, useMemo, useEffect } from 'react'
import { Sparkles, Plus, Trash2, Loader2, Minus, ChevronDown } from 'lucide-react'
import { useShortDramaStore } from '../../../stores/short-drama-store'
import { useProvidersStore, isModelConfigured } from '../../../stores/providers-store'
import { useAppStore } from '../../../stores/app-store'
import { LLM_MODELS } from '../../../lib/models'
import { AspectRatioSelector } from '../../models/AspectRatioSelector'
import { ModelSelectorDropdown } from '../../models/ModelSelectorDropdown'
import { StreamDuration } from '../../StreamDuration'
import { CONTENT_TYPES_CONFIG } from '../../../lib/content-type-prompts'
import { StageLayout, StageHeader, StageFooter, SectionHeader, IconAction } from './ui'

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="eyebrow">{label}</span>
        {hint && <span className="text-meta text-ink-subtle">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

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

  const hasConfiguredLlm = useMemo(
    () => LLM_MODELS.some((m) => isModelConfigured(m, configuredProviders)),
    [configuredProviders],
  )

  // Fall back to the first configured LLM when the saved one has no key
  useEffect(() => {
    if (!isModelConfigured(llmModel, configuredProviders)) {
      const firstConfigured = LLM_MODELS.find((m) => isModelConfigured(m, configuredProviders))
      if (firstConfigured) setLlmModel(firstConfigured)
    }
  }, [configuredProviders, llmModel, setLlmModel])

  const activeConfig = CONTENT_TYPES_CONFIG[contentType || 'microdrama'] || CONTENT_TYPES_CONFIG.microdrama
  const [activeTab, setActiveTab] = useState<'shots' | 'script'>('shots')
  const [showDirectives, setShowDirectives] = useState(contentType === 'libre' || !!customPromptGuide)

  const hasGeneratedContent = shots.length > 0
  const isAuto = !shotsCount || shotsCount <= 0
  const shotsValue = shotsCount && shotsCount > 0 ? shotsCount : 4
  const canGenerate = !!ideaPrompt.trim() && !isGeneratingScript && hasConfiguredLlm && isModelConfigured(llmModel, configuredProviders)

  return (
    <StageLayout>
      <StageHeader stage={1} title="Guión y desglose" description={activeConfig.tagline}>
        <ModelSelectorDropdown
          kind="llm"
          selectedModelId={llmModel.modelId || llmModel.name}
          onSelect={(m) => setLlmModel(m)}
          compact
          onlyConfigured
        />
        <AspectRatioSelector value={aspectRatio} onChange={(ar) => setMetadata({ aspectRatio: ar })} compact />
      </StageHeader>

      {!hasConfiguredLlm && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface-soft p-4">
          <div>
            <p className="text-body font-emphasis text-ink">Configura un proveedor de LLM</p>
            <p className="text-meta text-ink-subtle mt-0.5">
              El guión se escribe con DeepSeek, OpenAI, Anthropic, Gemini, OpenRouter o KIE. Añade al menos una API key.
            </p>
          </div>
          <button onClick={() => useAppStore.getState().setPage('providers')} className="btn-primary flex-shrink-0">
            Ir a proveedores
          </button>
        </div>
      )}

      <section className="space-y-5">
        <Field label={`Idea · ${activeConfig.shortLabel}`}>
          <textarea
            value={ideaPrompt}
            onChange={(e) => setMetadata({ ideaPrompt: e.target.value })}
            placeholder={activeConfig.inputPlaceholder}
            rows={4}
            className="input-field resize-none leading-relaxed"
          />
          <div className="flex items-center gap-1 flex-wrap mt-2">
            <span className="text-meta text-ink-subtle mr-1">Ejemplos</span>
            {activeConfig.examplePremises.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setMetadata({ ideaPrompt: ex })}
                title={ex}
                className="h-7 px-3 rounded-pill text-meta text-ink-muted hover:text-ink hover:bg-surface-800 transition-colors"
              >
                Idea {i + 1}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Género">
            <select value={genre} onChange={(e) => setMetadata({ genre: e.target.value })} className="input-field cursor-pointer">
              {activeConfig.genres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Tono">
            <select value={tone} onChange={(e) => setMetadata({ tone: e.target.value })} className="input-field cursor-pointer">
              {activeConfig.tones.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Tomas" hint={isAuto ? 'La IA decide' : `~${shotsValue * 5}s`}>
            <div className="flex items-center gap-1 h-[38px]">
              <div className="flex items-center p-0.5 rounded-pill border border-hairline bg-surface-soft">
                <button
                  type="button"
                  onClick={() => setMetadata({ shotsCount: 0 })}
                  className={`h-7 px-3 rounded-pill text-meta font-emphasis transition-colors ${isAuto ? 'bg-accent-600 text-on-accent' : 'text-ink-muted hover:text-ink'}`}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => setMetadata({ shotsCount: shotsValue })}
                  className={`h-7 px-3 rounded-pill text-meta font-emphasis transition-colors ${!isAuto ? 'bg-accent-600 text-on-accent' : 'text-ink-muted hover:text-ink'}`}
                >
                  Fijo
                </button>
              </div>
              {!isAuto && (
                <div className="flex items-center gap-0.5 ml-1">
                  <IconAction icon={Minus} title="Menos tomas" onClick={() => setMetadata({ shotsCount: Math.max(1, shotsValue - 1) })} />
                  <span className="w-7 text-center font-mono text-body text-ink">{shotsValue}</span>
                  <IconAction icon={Plus} title="Más tomas" onClick={() => setMetadata({ shotsCount: shotsValue + 1 })} />
                </div>
              )}
            </div>
          </Field>
          <Field label="Estilo visual">
            <input
              value={visualStyle}
              onChange={(e) => setMetadata({ visualStyle: e.target.value })}
              placeholder="Fotorealista, iluminación dramática…"
              className="input-field"
            />
          </Field>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowDirectives(!showDirectives)}
            className="flex items-center gap-1.5 text-meta text-ink-muted hover:text-ink transition-colors"
          >
            <ChevronDown size={13} className={`transition-transform ${showDirectives ? '' : '-rotate-90'}`} />
            Directivas para la IA {contentType === 'libre' ? '(recomendadas en formato libre)' : '(opcional)'}
          </button>
          {showDirectives && (
            <textarea
              value={customPromptGuide}
              onChange={(e) => setMetadata({ customPromptGuide: e.target.value })}
              placeholder="Cómo estructurar escenas y personajes, y cómo redactar los prompts de imagen y video…"
              rows={3}
              className="input-field resize-none text-meta leading-relaxed mt-2"
            />
          )}
        </div>

        {scriptError && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
            <div className="min-w-0">
              <p className="text-body font-emphasis text-red-600 dark:text-red-400">No se pudo escribir el guión con {llmModel.name}</p>
              <p className="text-meta text-ink-muted mt-0.5 break-words">{scriptError}</p>
            </div>
            <button onClick={() => generateScriptBreakdown()} className="btn-secondary flex-shrink-0">Reintentar</button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-meta text-ink-subtle">
            {hasGeneratedContent
              ? `${shots.length} tomas · ${characters.length} personajes · ${scenarios.length} locaciones · ${props.length} objetos`
              : `Se escribirá con ${llmModel.name}`}
          </p>
          <button onClick={() => generateScriptBreakdown()} disabled={!canGenerate} className="btn-primary flex items-center gap-1.5 self-start sm:self-auto">
            {isGeneratingScript ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {isGeneratingScript ? 'Escribiendo…' : hasGeneratedContent ? 'Reescribir guión' : 'Escribir guión'}
          </button>
        </div>
      </section>

      {hasGeneratedContent && (
        <section>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 mb-4 border-b border-hairline">
            <div className="min-w-0">
              <p className="text-title text-ink truncate">{title || 'Guión'}</p>
              {logline && <p className="text-meta text-ink-subtle mt-0.5">{logline}</p>}
            </div>
            <div className="flex items-center p-0.5 rounded-pill border border-hairline bg-surface-soft flex-shrink-0">
              {(['shots', 'script'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`h-7 px-3 rounded-pill text-meta font-emphasis transition-colors ${activeTab === tab ? 'bg-accent-600 text-on-accent' : 'text-ink-muted hover:text-ink'}`}
                >
                  {tab === 'shots' ? `Tomas · ${shots.length}` : 'Texto'}
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'shots' ? (
            <div className="space-y-2">
              {shots.map((shot, index) => (
                <div key={shot.id} className="group grid gap-3 rounded-2xl border border-hairline bg-surface-soft p-4 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <span className="font-mono text-body text-ink-subtle w-6 pt-1">{String(index + 1).padStart(2, '0')}</span>
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <input
                        value={shot.cameraMovement}
                        onChange={(e) => updateShot(shot.id, { cameraMovement: e.target.value })}
                        placeholder="Plano (ej. primer plano)"
                        className="min-w-0 flex-1 bg-transparent text-meta font-emphasis text-ink outline-none border-b border-transparent focus:border-hairline"
                      />
                      <StreamDuration
                        value={shot.estimatedDuration || 5}
                        options={videoModel.durationOptions}
                        min={videoModel.provider === 'replicate' && videoModel.name.includes('P-Video') ? 1 : 4}
                        max={videoModel.durationMax || 15}
                        onChange={(val) => updateShot(shot.id, { estimatedDuration: val })}
                      />
                    </div>
                    <textarea
                      value={shot.actionPrompt}
                      onChange={(e) => updateShot(shot.id, { actionPrompt: e.target.value })}
                      placeholder="Qué se ve en la toma…"
                      rows={3}
                      className="input-field resize-none text-meta leading-relaxed"
                    />
                  </div>
                  <div className="space-y-2 min-w-0">
                    <input
                      value={shot.dialogueSpeaker}
                      onChange={(e) => updateShot(shot.id, { dialogueSpeaker: e.target.value })}
                      placeholder="Quién habla"
                      className="w-full bg-transparent text-meta font-emphasis text-ink outline-none border-b border-transparent focus:border-hairline"
                    />
                    <textarea
                      value={shot.dialogueText}
                      onChange={(e) => updateShot(shot.id, { dialogueText: e.target.value })}
                      placeholder="Diálogo o narración (opcional)"
                      rows={3}
                      className="input-field resize-none text-meta leading-relaxed"
                    />
                  </div>
                  <div className="md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <IconAction icon={Trash2} title="Eliminar toma" danger onClick={() => removeShot(shot.id)} />
                  </div>
                </div>
              ))}
              <button
                onClick={() => addShot()}
                className="w-full h-11 rounded-2xl border border-dashed border-surface-700 text-meta text-ink-muted hover:text-ink hover:border-surface-500 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus size={13} /> Añadir toma
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <SectionHeader title="Guión en texto">
                <button
                  type="button"
                  onClick={() => { parseScriptToShots(); setActiveTab('shots') }}
                  className="btn-secondary flex items-center gap-1.5"
                  title="Reemplaza las tomas por las que encuentre en el texto"
                >
                  Extraer tomas del texto
                </button>
              </SectionHeader>
              <p className="text-meta text-ink-subtle">
                Usa <code className="font-mono">## Escena (5s)</code> y <code className="font-mono">### Toma (5s)</code> para que se detecten escenas, tomas y duraciones.
              </p>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder={`## Escena 1 (5s): Encuentro en el callejón\nDescripción de la acción…\n\n### Toma 1 (5s)\nPlano medio. El personaje observa a su alrededor.\n\nCARLOS: "No deberías estar aquí."`}
                className="input-field h-96 font-mono text-meta leading-relaxed resize-none"
              />
            </div>
          )}
        </section>
      )}

      <StageFooter next={hasGeneratedContent ? { label: 'Siguiente: elenco', onClick: () => setStage(2) } : undefined} />
    </StageLayout>
  )
}
