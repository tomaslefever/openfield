import React, { useState } from 'react'
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
  ArrowRight,
  Lock,
  Check,
  Folder,
} from 'lucide-react'
import { useWorkspaceStore } from '../../../stores/workspace-store'
import {
  DramaContentType,
  CONTENT_TYPES_CONFIG,
} from '../../../lib/content-type-prompts'

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

const TYPE_ICONS: Record<DramaContentType, React.ReactNode> = {
  microdrama: <Clapperboard size={20} className="text-amber-400" />,
  ugc: <UserCheck size={20} className="text-emerald-400" />,
  tvc: <Tv size={20} className="text-sky-400" />,
  ads: <Megaphone size={20} className="text-rose-400" />,
  reels: <Sparkles size={20} className="text-purple-400" />,
  try_on: <Shirt size={20} className="text-pink-400" />,
  unboxing: <PackageOpen size={20} className="text-teal-400" />,
  libre: <SlidersHorizontal size={20} className="text-cyan-400" />,
  faceless: <EyeOff size={20} className="text-violet-400" />,
}

const ORDERED_TYPES: DramaContentType[] = [
  'microdrama',
  'ugc',
  'tvc',
  'ads',
  'reels',
  'try_on',
  'unboxing',
  'libre',
  'faceless',
]

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
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

  React.useEffect(() => {
    if (defaultWs && !targetWorkspaceId) {
      setTargetWorkspaceId(defaultWs)
    }
  }, [defaultWs, isOpen])

  if (!isOpen) return null

  const activeConfig = CONTENT_TYPES_CONFIG[selectedType]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const finalTitle = title.trim() || `Nueva Pieza - ${activeConfig.shortLabel}`
    onCreate({
      title: finalTitle,
      contentType: selectedType,
      customPromptGuide: customPromptGuide.trim(),
      workspaceId: targetWorkspaceId || defaultWs,
    })
    setTitle('')
    setCustomPromptGuide('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-surface-950 border border-surface-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 px-6 border-b border-surface-800 flex items-center justify-between bg-surface-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-surface-100">
                Crear Nueva Pieza de Contenido
              </h2>
              <p className="text-xs text-surface-400">
                Selecciona el formato y objetivo de producción para tu nuevo proyecto
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-surface-400 hover:text-surface-200 hover:bg-surface-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Workspace Destination Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-surface-200 flex items-center gap-1.5">
                <Folder size={13} className="text-accent-400" />
                Workspace de Destino
              </label>
              <span className="text-[10px] text-surface-400">
                Dónde se guardará y organizará esta pieza
              </span>
            </div>
            <div className="relative">
              <select
                value={targetWorkspaceId || defaultWs}
                onChange={(e) => setTargetWorkspaceId(e.target.value)}
                className="input-field w-full text-xs py-2.5 px-3.5 bg-surface-900 border-surface-700/80 focus:border-accent-500 cursor-pointer text-surface-100"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id} className="bg-surface-950 text-surface-100">
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Project Title Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-surface-200">
              Título del Proyecto (Opcional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Ej: Campaña ${activeConfig.shortLabel} 2026`}
              className="input-field w-full text-xs py-2.5 px-3.5 bg-surface-900 border-surface-700/80 focus:border-accent-500"
            />
          </div>

          {/* Content Type Selector */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-surface-200 flex items-center gap-1.5">
                Tipo de Contenido
                <span className="text-[10px] font-normal text-surface-400">(Selección definitiva)</span>
              </label>
              <div className="flex items-center gap-1 text-[11px] text-amber-400/90 font-medium">
                <Lock size={12} />
                <span>Bloqueado tras la creación</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ORDERED_TYPES.map((typeKey) => {
                const conf = CONTENT_TYPES_CONFIG[typeKey]
                const isSelected = selectedType === typeKey
                return (
                  <div
                    key={typeKey}
                    onClick={() => setSelectedType(typeKey)}
                    className={`relative p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 text-left ${
                      isSelected
                        ? 'bg-surface-900/90 border-accent-500 shadow-md shadow-accent-500/10 ring-1 ring-accent-500/40'
                        : 'bg-surface-900/40 border-surface-800 hover:bg-surface-900/70 hover:border-surface-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-2 rounded-lg ${conf.badgeBg} border ${conf.badgeBorder}`}>
                          {TYPE_ICONS[typeKey]}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-surface-100 flex items-center gap-1.5">
                            {conf.label}
                          </div>
                          <div className="text-[10px] text-surface-400 line-clamp-1">
                            {conf.tagline}
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-accent-500 text-surface-950 flex items-center justify-center flex-shrink-0">
                          <Check size={12} strokeWidth={3} />
                        </div>
                      )}
                    </div>

                    <p className="text-[11px] text-surface-400 leading-relaxed line-clamp-2">
                      {conf.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Custom Prompt Guide for 'libre' content type */}
          {selectedType === 'libre' && (
            <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/30 space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                  <SlidersHorizontal size={14} className="text-cyan-400" />
                  Guía para Estructurar Extracción y Prompts
                </label>
                <span className="text-[10px] text-cyan-400/90 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20 font-medium">
                  Directiva IA
                </span>
              </div>
              <p className="text-[11px] text-surface-300 leading-relaxed">
                Ingresa aquí las instrucciones que servirán como guía para estructurar la extracción del contenido (personajes, escenas, planos) y la redacción de los prompts de imagen/video.
              </p>
              <textarea
                value={customPromptGuide}
                onChange={(e) => setCustomPromptGuide(e.target.value)}
                placeholder="Ej: Estructura la historia en escenas con ritmo pausado y contemplativo. Extrae personajes detallando su vestimenta y edad. Para los prompts de imagen en inglés, usa composición de 35mm, iluminación cinematográfica natural y estética realista sin grano excesivo..."
                className="input-field w-full h-28 text-xs font-mono resize-none p-3 bg-surface-900/90 border-cyan-500/40 focus:border-cyan-400 text-surface-100 placeholder:text-surface-600"
              />
            </div>
          )}

          {/* Lock Notice Callout */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-amber-300 text-xs">
            <Lock size={15} className="mt-0.5 flex-shrink-0 text-amber-400" />
            <div className="space-y-0.5">
              <span className="font-semibold block">Aviso de Configuración Inmutable</span>
              <p className="text-[11px] text-amber-300/80 leading-relaxed">
                El tipo de contenido define la arquitectura del guion, prompts maestros de IA y formatos de video. Una vez creada la pieza, este parámetro no se podrá modificar.
              </p>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 px-6 border-t border-surface-800 bg-surface-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-surface-400 hover:text-surface-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary flex items-center gap-2 px-5 py-2 text-xs font-semibold shadow-lg shadow-accent-600/20"
          >
            <span>Crear {activeConfig.shortLabel}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
