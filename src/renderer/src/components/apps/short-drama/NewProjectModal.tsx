import React, { useEffect, useState } from 'react'
import {
  X,
  Clapperboard,
  Sparkles,
  UserCheck,
  Tv,
  Megaphone,
  Shirt,
  PackageOpen,
  SlidersHorizontal,
  EyeOff,
  Check,
  type LucideIcon,
} from 'lucide-react'
import { useWorkspaceStore } from '../../../stores/workspace-store'
import { type DramaContentType, CONTENT_TYPES_CONFIG } from '../../../lib/content-type-prompts'

interface NewProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (data: {
    title: string
    contentType: DramaContentType
    customPromptGuide?: string
    workspaceId?: string
  }) => void
}

const TYPE_ICONS: Record<DramaContentType, LucideIcon> = {
  microdrama: Clapperboard,
  ugc: UserCheck,
  tvc: Tv,
  ads: Megaphone,
  reels: Sparkles,
  try_on: Shirt,
  unboxing: PackageOpen,
  libre: SlidersHorizontal,
  faceless: EyeOff,
}

const ORDERED_TYPES: DramaContentType[] = ['microdrama', 'ugc', 'tvc', 'ads', 'reels', 'try_on', 'unboxing', 'faceless', 'libre']

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose, onCreate }) => {
  const { workspaces, activeId: activeWorkspaceId } = useWorkspaceStore()
  const defaultWs =
    workspaces.find((w) => w.id === activeWorkspaceId)?.id ||
    workspaces.find((w) => w.name.toLowerCase() === 'default')?.id ||
    workspaces[0]?.id ||
    ''

  const [selectedType, setSelectedType] = useState<DramaContentType>('microdrama')
  const [title, setTitle] = useState('')
  const [customPromptGuide, setCustomPromptGuide] = useState('')
  const [targetWorkspaceId, setTargetWorkspaceId] = useState<string>(defaultWs)

  useEffect(() => {
    if (isOpen) setTargetWorkspaceId((current) => current || defaultWs)
  }, [defaultWs, isOpen])

  if (!isOpen) return null

  const activeConfig = CONTENT_TYPES_CONFIG[selectedType]

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    onCreate({
      title: title.trim() || `Nueva pieza · ${activeConfig.shortLabel}`,
      contentType: selectedType,
      customPromptGuide: customPromptGuide.trim(),
      workspaceId: targetWorkspaceId || defaultWs,
    })
    setTitle('')
    setCustomPromptGuide('')
  }

  return (
    <div className="modal-scrim z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="modal-surface w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div>
            <p className="eyebrow">Nueva pieza</p>
            <h2 className="text-title-lg text-ink mt-1">¿Qué vas a producir?</h2>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {ORDERED_TYPES.map((typeKey) => {
              const conf = CONTENT_TYPES_CONFIG[typeKey]
              const Icon = TYPE_ICONS[typeKey]
              const selected = selectedType === typeKey
              return (
                <button
                  key={typeKey}
                  type="button"
                  onClick={() => setSelectedType(typeKey)}
                  className={`relative flex flex-col items-start gap-4 p-3 rounded-xl border text-left transition-colors ${
                    selected
                      ? 'bg-accent-600 border-accent-600 text-on-accent'
                      : 'bg-surface-soft border-hairline text-ink hover:border-surface-600'
                  }`}
                >
                  <Icon size={17} strokeWidth={1.75} />
                  <div className="min-w-0">
                    <p className="text-body font-emphasis">{conf.label}</p>
                    <p className={`text-meta mt-0.5 line-clamp-2 ${selected ? 'opacity-70' : 'text-ink-subtle'}`}>{conf.tagline}</p>
                  </div>
                  {selected && <Check size={13} className="absolute top-3 right-3" />}
                </button>
              )
            })}
          </div>

          <p className="text-meta text-ink-subtle -mt-3">
            {activeConfig.description} El formato define la estructura del guión y los prompts, y no se puede cambiar después.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="eyebrow mb-2 block" htmlFor="project-title">Título</label>
              <input
                id="project-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Ej. Campaña ${activeConfig.shortLabel} 2026`}
                className="input-field"
                autoFocus
              />
            </div>
            {workspaces.length > 1 && (
              <div>
                <label className="eyebrow mb-2 block" htmlFor="project-ws">Workspace</label>
                <select
                  id="project-ws"
                  value={targetWorkspaceId || defaultWs}
                  onChange={(e) => setTargetWorkspaceId(e.target.value)}
                  className="input-field cursor-pointer"
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>{ws.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {selectedType === 'libre' && (
            <div>
              <label className="eyebrow mb-2 block" htmlFor="project-guide">Guía de extracción y prompts</label>
              <textarea
                id="project-guide"
                value={customPromptGuide}
                onChange={(e) => setCustomPromptGuide(e.target.value)}
                placeholder="Ej. Estructura la historia en escenas de ritmo pausado. Describe la vestimenta y edad de cada personaje. En los prompts de imagen usa 35 mm e iluminación natural…"
                rows={4}
                className="input-field resize-none text-meta leading-relaxed"
              />
              <p className="text-meta text-ink-subtle mt-1.5">
                Indica al modelo cómo extraer personajes, escenas y tomas, y cómo redactar los prompts.
              </p>
            </div>
          )}
        </form>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-hairline">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={() => handleSubmit()} className="btn-primary">
            Crear {activeConfig.shortLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
