import { useState, useMemo, useEffect } from 'react'
import {
  User,
  MapPin,
  Package,
  Radio,
  Sparkles,
  Plus,
  Trash2,
  Wand2,
  Library,
  History,
  Copy,
  Check,
  Loader2,
  type LucideIcon,
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
import { QuickPromptComposer } from '../../QuickPromptComposer'
import { ToolButton } from '../../ui/tool-button'
import { GenerationHistoryModal } from './GenerationHistoryModal'
import { srcUrl } from '../../../services/file-url'
import { copyText } from '../../../lib/clipboard'
import { cleanModelName } from '../../../lib/models'
import {
  StageLayout,
  StageHeader,
  StageFooter,
  ControlBar,
  Control,
  SectionHeader,
  IconAction,
  PromptField,
  MediaTile,
} from './ui'
import { aspectStyle, assetLocation, readComposerRefs, composerResolution, type ComposerRef, type PickedAsset } from './media'

type AssetKind = 'character' | 'scenario' | 'prop'

const KIND_LABEL: Record<AssetKind, string> = {
  character: 'Personaje',
  scenario: 'Locación',
  prop: 'Objeto',
}

const KIND_ICON: Record<AssetKind, LucideIcon> = {
  character: User,
  scenario: MapPin,
  prop: Package,
}

interface AssetItem {
  id: string
  name: string
  visualPrompt: string
  imageUrl?: string
  imageAssetId?: string
  generating?: boolean
  imageHistory?: GenerationHistoryItem[]
}

interface ComposerState {
  kind: AssetKind
  id: string
  title: string
  basePrompt: string
  refs: ComposerRef[]
  aspectRatio: string
}

// ───────────────────── Card ─────────────────────

function AssetCard({
  kind,
  item,
  aspect,
  subtitle,
  onUpdate,
  onGenerate,
  onPersonalize,
  onLibrary,
  onHistory,
  onPreview,
  onRemove,
  onRewrite,
  rewriting,
  children,
}: {
  kind: AssetKind
  item: AssetItem
  aspect: string
  subtitle?: { value: string; placeholder: string; onChange: (v: string) => void }
  onUpdate: (data: Partial<AssetItem>) => void
  onGenerate: () => void
  onPersonalize: () => void
  onLibrary: () => void
  onHistory: () => void
  onPreview: () => void
  onRemove: () => void
  onRewrite: () => void
  rewriting: boolean
  children?: React.ReactNode
}) {
  const Icon = KIND_ICON[kind]
  const historyCount = item.imageHistory?.length || 0
  const handleAsset = (asset: PickedAsset) => onUpdate({ imageAssetId: asset.assetId, imageUrl: asset.url })

  return (
    <div className="group flex gap-4 rounded-2xl border border-hairline bg-surface-soft p-3">
      <MediaTile
        src={item.imageUrl}
        aspect={aspectStyle(aspect)}
        generating={item.generating}
        placeholder={<Icon size={20} strokeWidth={1.5} />}
        emptyLabel="Arrastra o genera"
        onOpen={onPreview}
        onAsset={handleAsset}
        className="w-28 sm:w-32 flex-shrink-0 self-start rounded-xl"
      />

      <div className="flex-1 min-w-0 space-y-2.5">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <input
              value={item.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder={`Nombre del ${KIND_LABEL[kind].toLowerCase()}`}
              className="w-full bg-transparent text-body font-emphasis text-ink outline-none border-b border-transparent focus:border-hairline"
            />
            {subtitle && (
              <input
                value={subtitle.value}
                onChange={(e) => subtitle.onChange(e.target.value)}
                placeholder={subtitle.placeholder}
                className="w-full bg-transparent text-meta text-ink-subtle outline-none border-b border-transparent focus:border-hairline mt-0.5"
              />
            )}
          </div>
          <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <IconAction icon={Trash2} title={`Eliminar ${KIND_LABEL[kind].toLowerCase()}`} danger onClick={onRemove} />
          </div>
        </div>

        <PromptField
          label="Prompt visual"
          value={item.visualPrompt}
          onChange={(visualPrompt) => onUpdate({ visualPrompt })}
          placeholder={
            kind === 'character'
              ? 'Rasgos, edad, peinado, vestuario…'
              : kind === 'scenario'
                ? 'Arquitectura, luz, atmósfera, época…'
                : 'Forma, materiales, acabado, escala…'
          }
          rows={2}
          onRewrite={onRewrite}
          rewriting={rewriting}
          disabled={item.generating}
        />

        {children}

        <div className="flex flex-wrap items-center gap-0.5 -ml-1">
          <ToolButton
            icon={item.generating ? Loader2 : Sparkles}
            spin={item.generating}
            solid
            onClick={onGenerate}
            disabled={item.generating || !item.visualPrompt.trim()}
          >
            {item.generating ? 'Generando' : item.imageUrl ? 'Regenerar' : 'Generar'}
          </ToolButton>
          <ToolButton
            icon={Wand2}
            onClick={onPersonalize}
            disabled={item.generating}
            title={item.imageUrl ? 'Pide cambios sobre la imagen actual' : 'Elige modelo, formato y referencias'}
          >
            {item.imageUrl ? 'Editar' : 'Personalizar'}
          </ToolButton>
          <ToolButton icon={Library} onClick={onLibrary} disabled={item.generating} title="Elegir de la biblioteca" />
          {historyCount > 0 && (
            <ToolButton icon={History} onClick={onHistory} title={`${historyCount} versiones`}>
              {historyCount}
            </ToolButton>
          )}
        </div>
      </div>
    </div>
  )
}

// ───────────────────── Stage ─────────────────────

export function Stage2Characters() {
  const {
    characters,
    scenarios,
    props,
    voiceId,
    aspectRatio,
    visualStyle,
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
    generateScenarioImage,
    generateAllScenarioImages,
    regenerateScenarioVisualPrompt,
    generatePropImage,
    generateAllPropImages,
    regeneratePropVisualPrompt,
    regenerateAllStage2Prompts,
    restoreCharacterImage,
    restoreScenarioImage,
    restorePropImage,
    trackImageTask,
    syncPendingTasks,
    setStage,
  } = useShortDramaStore()

  useEffect(() => {
    syncPendingTasks()
  }, [syncPendingTasks])

  const [picker, setPicker] = useState<{ kind: AssetKind; id: string } | null>(null)
  const [historyTarget, setHistoryTarget] = useState<{ kind: AssetKind; id: string } | null>(null)
  const [preview, setPreview] = useState<{ kind: AssetKind; id: string } | null>(null)
  const [composer, setComposer] = useState<ComposerState | null>(null)
  const [rewritingIds, setRewritingIds] = useState<Set<string>>(new Set())
  const [rewritingAll, setRewritingAll] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  const ops = {
    character: { update: updateCharacter, generate: generateCharacterImage, rewrite: regenerateCharacterVisualPrompt, restore: restoreCharacterImage, remove: removeCharacter, list: characters },
    scenario: { update: updateScenario, generate: generateScenarioImage, rewrite: regenerateScenarioVisualPrompt, restore: restoreScenarioImage, remove: removeScenario, list: scenarios },
    prop: { update: updateProp, generate: generatePropImage, rewrite: regeneratePropVisualPrompt, restore: restorePropImage, remove: removeProp, list: props },
  } as const

  const findItem = (kind: AssetKind, id: string): AssetItem | undefined =>
    (ops[kind].list as AssetItem[]).find((x) => x.id === id)

  const aspectFor = (kind: AssetKind) => (kind === 'scenario' ? aspectRatio : '1:1')

  const rewrite = async (kind: AssetKind, id: string) => {
    setRewritingIds((prev) => new Set(prev).add(id))
    try {
      await ops[kind].rewrite(id)
    } catch (err) {
      console.error('[Stage2] Prompt rewrite failed:', err)
    } finally {
      setRewritingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const openComposer = async (kind: AssetKind, item: AssetItem) => {
    const refs = await readComposerRefs([item.imageAssetId])
    setComposer({
      kind,
      id: item.id,
      title: `${KIND_LABEL[kind]} · ${item.name || 'sin nombre'}`,
      basePrompt: item.visualPrompt || item.name,
      refs,
      aspectRatio: aspectFor(kind),
    })
  }

  const allItems = useMemo(
    () => [
      ...characters.map((c) => ({ kind: 'character' as const, item: c as AssetItem, subtitle: c.role })),
      ...scenarios.map((s) => ({ kind: 'scenario' as const, item: s as AssetItem, subtitle: '' })),
      ...props.map((p) => ({ kind: 'prop' as const, item: p as AssetItem, subtitle: p.description })),
    ],
    [characters, scenarios, props],
  )
  const withImages = allItems.filter((x) => x.item.imageUrl)
  const missingCount = allItems.filter((x) => !x.item.imageUrl && !x.item.generating).length
  const isAnyGenerating = allItems.some((x) => x.item.generating)

  const handleGenerateMissing = async () => {
    await generateAllCharacterImages(true)
    await generateAllScenarioImages(true)
    await generateAllPropImages(true)
  }

  const handleRewriteAll = async () => {
    setRewritingAll(true)
    try {
      await regenerateAllStage2Prompts()
    } catch (err) {
      console.error('[Stage2] Rewriting all prompts failed:', err)
    } finally {
      setRewritingAll(false)
    }
  }

  const cardProps = (kind: AssetKind, item: AssetItem) => ({
    kind,
    item,
    aspect: aspectFor(kind),
    onUpdate: (data: Partial<AssetItem>) => (ops[kind].update as (id: string, d: Partial<AssetItem>) => void)(item.id, data),
    onGenerate: () => ops[kind].generate(item.id),
    onPersonalize: () => openComposer(kind, item),
    onLibrary: () => setPicker({ kind, id: item.id }),
    onHistory: () => setHistoryTarget({ kind, id: item.id }),
    onPreview: () => setPreview({ kind, id: item.id }),
    onRemove: () => ops[kind].remove(item.id),
    onRewrite: () => rewrite(kind, item.id),
    rewriting: rewritingIds.has(item.id) || rewritingAll,
  })

  const previewIndex = preview ? withImages.findIndex((x) => x.item.id === preview.id) : -1
  const previewEntry = previewIndex >= 0 ? withImages[previewIndex] : null
  const historyItem = historyTarget ? findItem(historyTarget.kind, historyTarget.id) : undefined
  const isEmpty = allItems.length === 0

  return (
    <StageLayout>
      <StageHeader
        stage={2}
        title="Elenco"
        description="Personajes, locaciones y objetos con una imagen de referencia cada uno, para que se mantengan iguales en todas las tomas."
      >
        <button onClick={handleRewriteAll} disabled={rewritingAll || isAnyGenerating || isEmpty} className="btn-secondary flex items-center gap-1.5">
          {rewritingAll ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
          Reescribir prompts
        </button>
        <button onClick={handleGenerateMissing} disabled={missingCount === 0} className="btn-primary flex items-center gap-1.5">
          <Sparkles size={13} />
          {missingCount > 0 ? `Generar pendientes · ${missingCount}` : isAnyGenerating ? 'Generando…' : 'Todo generado'}
        </button>
      </StageHeader>

      <ControlBar>
        <Control label="Modelo">
          <ModelSelectorDropdown
            kind="image"
            selectedModelId={imageModel.t2iId || imageModel.name}
            onSelect={(m) => setImageModel(m)}
            resolution={imageResolution}
          />
        </Control>
        <Control label="Resolución">
          <ResolutionSelector model={imageModel} value={imageResolution} onChange={(res) => setImageModel(imageModel, res)} />
        </Control>
      </ControlBar>

      <section>
        <SectionHeader title="Personajes" count={characters.length}>
          <ToolButton
            icon={Plus}
            onClick={() =>
              addCharacter({
                name: 'Nuevo personaje',
                role: 'Secundario',
                visualPrompt: '',
                voiceId: '',
              })
            }
          >
            Añadir
          </ToolButton>
        </SectionHeader>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="flex gap-4 rounded-2xl border border-hairline bg-surface-soft p-3">
            <div className="w-28 sm:w-32 aspect-square flex-shrink-0 self-start rounded-xl border border-dashed border-surface-700 flex items-center justify-center text-ink-subtle">
              <Radio size={20} strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0 space-y-2.5">
              <div>
                <p className="text-body font-emphasis text-ink">Narrador</p>
                <p className="text-meta text-ink-subtle mt-0.5">Voz en off para narraciones y tomas sin personaje que hable.</p>
              </div>
              <div>
                <span className="text-meta text-ink-subtle mb-1 block">Voz</span>
                <VoiceSelectorDropdown value={voiceId} onChange={(vid) => setMetadata({ voiceId: vid })} compact />
              </div>
            </div>
          </div>

          {characters.map((char) => (
            <AssetCard
              key={char.id}
              {...cardProps('character', char)}
              subtitle={{ value: char.role, placeholder: 'Rol (ej. protagonista)', onChange: (role) => updateCharacter(char.id, { role }) }}
            >
              <div>
                <span className="text-meta text-ink-subtle mb-1 block">Voz</span>
                <VoiceSelectorDropdown value={char.voiceId} onChange={(vid) => updateCharacter(char.id, { voiceId: vid })} compact />
              </div>
            </AssetCard>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="Locaciones" count={scenarios.length}>
          <ToolButton icon={Plus} onClick={() => addScenario({ name: 'Nueva locación', visualPrompt: '' })}>
            Añadir
          </ToolButton>
        </SectionHeader>
        {scenarios.length === 0 ? (
          <p className="text-meta text-ink-subtle">Sin locaciones. Añade los lugares donde ocurre la historia.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {scenarios.map((scn) => (
              <AssetCard key={scn.id} {...cardProps('scenario', scn)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Objetos" count={props.length}>
          <ToolButton icon={Plus} onClick={() => addProp({ name: 'Nuevo objeto', description: '', visualPrompt: '' })}>
            Añadir
          </ToolButton>
        </SectionHeader>
        {props.length === 0 ? (
          <p className="text-meta text-ink-subtle">Sin objetos. Añade productos, armas, llaves u otros objetos que deban verse siempre iguales.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {props.map((pr) => (
              <AssetCard
                key={pr.id}
                {...cardProps('prop', pr)}
                subtitle={{ value: pr.description, placeholder: 'Para qué sirve en la historia', onChange: (description) => updateProp(pr.id, { description }) }}
              />
            ))}
          </div>
        )}
      </section>

      <StageFooter
        back={{ label: 'Guión', onClick: () => setStage(1) }}
        next={{ label: 'Siguiente: tomas', onClick: () => setStage(3) }}
      />

      {picker && (
        <ImageLibraryPicker
          multiple={false}
          onSelect={(selected: any) => {
            const asset = Array.isArray(selected) ? selected[0] : selected
            const url = assetLocation(asset)
            if (asset && url) {
              (ops[picker.kind].update as (id: string, d: Partial<AssetItem>) => void)(picker.id, { imageAssetId: asset.id, imageUrl: url })
            }
            setPicker(null)
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {historyTarget && historyItem && (
        <GenerationHistoryModal
          isOpen
          onClose={() => setHistoryTarget(null)}
          title={historyItem.name}
          kind="image"
          activeUrl={historyItem.imageUrl}
          activeAssetId={historyItem.imageAssetId}
          history={historyItem.imageHistory || []}
          onRestore={(entry) => ops[historyTarget.kind].restore(historyTarget.id, entry.id)}
        />
      )}

      {composer && (
        <QuickPromptComposer
          title={composer.title}
          basePrompt={composer.basePrompt}
          imageRefs={composer.refs.length ? composer.refs : undefined}
          aspectRatio={composer.aspectRatio}
          resolution={composerResolution(imageResolution)}
          styleSuffix={visualStyle}
          onTaskCreated={(taskId) => {
            trackImageTask(composer.kind, composer.id, taskId)
            setComposer(null)
          }}
          onGenerated={() => { /* the store follows the task */ }}
          onClose={() => setComposer(null)}
        />
      )}

      {previewEntry && previewEntry.item.imageUrl && (
        <ImagePreviewModal
          src={srcUrl(previewEntry.item.imageUrl) || ''}
          onClose={() => setPreview(null)}
          onPrev={previewIndex > 0 ? () => setPreview({ kind: withImages[previewIndex - 1].kind, id: withImages[previewIndex - 1].item.id }) : undefined}
          onNext={previewIndex < withImages.length - 1 ? () => setPreview({ kind: withImages[previewIndex + 1].kind, id: withImages[previewIndex + 1].item.id }) : undefined}
        >
          <div className="space-y-4">
            <div>
              <p className="eyebrow mb-1">{KIND_LABEL[previewEntry.kind]}</p>
              <p className="text-sm text-ink">{previewEntry.item.name}</p>
              {previewEntry.subtitle && <p className="text-meta text-ink-subtle mt-0.5">{previewEntry.subtitle}</p>}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="eyebrow">Prompt visual</p>
                <button
                  onClick={() => {
                    copyText(previewEntry.item.visualPrompt || '')
                    setCopiedPrompt(true)
                    setTimeout(() => setCopiedPrompt(false), 1500)
                  }}
                  className="btn-icon size-7"
                  title="Copiar prompt"
                >
                  {copiedPrompt ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
              <p className="text-sm text-ink leading-relaxed select-text">{previewEntry.item.visualPrompt || '—'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="eyebrow mb-1">Modelo</p>
                <p className="text-ink truncate">{cleanModelName(imageModel.name)}</p>
              </div>
              <div>
                <p className="eyebrow mb-1">Resolución</p>
                <p className="text-ink font-mono">{imageResolution}</p>
              </div>
            </div>
            <button
              onClick={() => {
                ops[previewEntry.kind].generate(previewEntry.item.id)
                setPreview(null)
              }}
              className="btn-primary w-full flex items-center justify-center gap-1.5"
            >
              <Sparkles size={13} /> Regenerar
            </button>
          </div>
        </ImagePreviewModal>
      )}
    </StageLayout>
  )
}
