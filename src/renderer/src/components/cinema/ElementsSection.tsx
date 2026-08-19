import { useState } from 'react'
import { useCinemaStore, type ElementType, type CinemaElement } from '../../stores/cinema-store'
import { Plus, User, Box, Mountain, Edit3, Trash2, X, Mic, Image } from 'lucide-react'

const TYPE_CONFIG: Record<ElementType, { label: string; icon: typeof User; color: string }> = {
  character: { label: 'Personaje', icon: User, color: 'text-blue-400' },
  object: { label: 'Objeto', icon: Box, color: 'text-amber-400' },
  scenario: { label: 'Escenario', icon: Mountain, color: 'text-emerald-400' },
}

function ElementModal({
  projectId,
  element,
  onClose,
}: {
  projectId: string
  element?: CinemaElement
  onClose: () => void
}) {
  const addElement = useCinemaStore(s => s.addElement)
  const updateElement = useCinemaStore(s => s.updateElement)
  const [type, setType] = useState<ElementType>(element?.type || 'character')
  const [name, setName] = useState(element?.name || '')
  const [description, setDescription] = useState(element?.description || '')
  const [stylesheet, setStylesheet] = useState(element?.stylesheet || '')
  const [voiceId, setVoiceId] = useState(element?.voiceId || '')
  const [imageBase64, setImageBase64] = useState(element?.imageBase64 || '')

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setImageBase64(result.split(',')[1] || result)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = () => {
    if (!name.trim()) return
    const data = { name: name.trim(), type, description, stylesheet, voiceId, imageBase64 }
    if (element) {
      updateElement(projectId, element.id, data)
    } else {
      addElement(projectId, data)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-800 rounded-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-surface-800">
          <h3 className="text-sm font-semibold text-surface-100">
            {element ? 'Editar elemento' : 'Nuevo elemento'}
          </h3>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-100"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Tipo</label>
            <div className="flex gap-2">
              {(Object.entries(TYPE_CONFIG) as [ElementType, typeof TYPE_CONFIG['character']][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setType(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    type === key
                      ? 'bg-surface-700 text-surface-100 border border-surface-600'
                      : 'bg-surface-800 text-surface-500 hover:text-surface-300'
                  }`}
                >
                  <cfg.icon size={12} className={cfg.color} />
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Nombre</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del elemento" className="input-field" />
          </div>

          <div>
            <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Descripción</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe el elemento en detalle..."
              className="input-field min-h-[80px] resize-none"
              rows={3}
            />
          </div>

          <div>
            <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Stylesheet / Prompt base</label>
            <textarea
              value={stylesheet}
              onChange={e => setStylesheet(e.target.value)}
              placeholder="Fragmento de prompt para mantener consistencia visual..."
              className="input-field min-h-[60px] resize-none text-xs"
              rows={2}
            />
          </div>

          {type === 'character' && (
            <div>
              <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Mic size={10} /> Voice ID (ElevenLabs)
              </label>
              <input
                value={voiceId}
                onChange={e => setVoiceId(e.target.value)}
                placeholder="ID de voz de ElevenLabs..."
                className="input-field text-xs font-mono"
              />
            </div>
          )}

          <div>
            <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Image size={10} /> Imagen de referencia
            </label>
            <div className="flex items-center gap-2">
              {imageBase64 && (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-surface-800 flex-shrink-0">
                  <img src={`data:image/png;base64,${imageBase64}`} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => setImageBase64('')} className="absolute top-1 right-1 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center">
                    <X size={10} className="text-white" />
                  </button>
                </div>
              )}
              <label className="btn-ghost text-xs cursor-pointer">
                <UploadIcon />
                {imageBase64 ? 'Cambiar' : 'Subir imagen'}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-4 border-t border-surface-800">
          <button onClick={handleSave} disabled={!name.trim()} className="btn-primary flex-1 text-xs text-center justify-center">
            {element ? 'Guardar cambios' : 'Crear elemento'}
          </button>
          <button onClick={onClose} className="btn-ghost text-xs">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function UploadIcon() { return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> }

export function ElementsSection({ projectId }: { projectId: string }) {
  const elements = useCinemaStore(s => s.elements[projectId] || [])
  const deleteElement = useCinemaStore(s => s.deleteElement)
  const [filter, setFilter] = useState<ElementType | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingElement, setEditingElement] = useState<CinemaElement | undefined>(undefined)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const filtered = filter === 'all' ? elements : elements.filter(e => e.type === filter)

  const typeCounts = {
    all: elements.length,
    character: elements.filter(e => e.type === 'character').length,
    object: elements.filter(e => e.type === 'object').length,
    scenario: elements.filter(e => e.type === 'scenario').length,
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-800">
        <div className="flex items-center gap-2">
          <User size={16} className="text-accent-400" />
          <h2 className="text-sm font-semibold text-surface-100">Elements</h2>
        </div>
        <button onClick={() => { setEditingElement(undefined); setShowModal(true) }} className="btn-primary text-xs flex items-center gap-1">
          <Plus size={12} /> Nuevo
        </button>
      </div>

      <div className="flex items-center gap-1 px-4 py-2 border-b border-surface-800/50">
        {([['all', 'Todos'], ['character', 'Personajes'], ['object', 'Objetos'], ['scenario', 'Escenarios']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key as ElementType | 'all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              filter === key ? 'bg-surface-700 text-surface-100' : 'text-surface-500 hover:text-surface-300'
            }`}
          >
            {label} <span className="text-surface-600 ml-0.5">({typeCounts[key as keyof typeof typeCounts]})</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-surface-600 gap-2">
            <Box size={32} className="opacity-50" />
            <p className="text-sm">No hay elementos</p>
            <p className="text-xs text-surface-700">Crea personajes, objetos y escenarios para tu proyecto</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(el => {
              const cfg = TYPE_CONFIG[el.type]
              return (
                <div key={el.id} className="card p-3 group relative">
                  <div className="flex items-start gap-2 mb-2">
                    <cfg.icon size={14} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-surface-200 truncate">{el.name}</p>
                      <p className="text-[10px] text-surface-500">{cfg.label}</p>
                    </div>
                  </div>
                  {el.imageBase64 && (
                    <div className="aspect-square rounded-lg overflow-hidden bg-surface-800 mb-2">
                      <img src={`data:image/png;base64,${el.imageBase64}`} alt={el.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <p className="text-[11px] text-surface-400 line-clamp-3 leading-relaxed">{el.description || 'Sin descripción'}</p>
                  {el.type === 'character' && el.voiceId && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-surface-500">
                      <Mic size={10} /> Voz: <span className="text-accent-400/70 font-mono">{el.voiceId.slice(0, 12)}...</span>
                    </div>
                  )}

                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditingElement(el); setShowModal(true) }}
                      className="w-6 h-6 bg-surface-800 hover:bg-surface-700 rounded-md flex items-center justify-center text-surface-400 hover:text-surface-100"
                    >
                      <Edit3 size={11} />
                    </button>
                    {confirmDelete === el.id ? (
                      <div className="flex gap-0.5 bg-surface-800 rounded-md p-0.5">
                        <button onClick={() => { deleteElement(projectId, el.id); setConfirmDelete(null) }} className="px-1.5 py-0.5 bg-red-500/80 rounded text-[10px] text-white">Sí</button>
                        <button onClick={() => setConfirmDelete(null)} className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] text-white">No</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(el.id)}
                        className="w-6 h-6 bg-surface-800 hover:bg-red-500/20 rounded-md flex items-center justify-center text-surface-400 hover:text-red-400"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <ElementModal
          projectId={projectId}
          element={editingElement}
          onClose={() => { setShowModal(false); setEditingElement(undefined) }}
        />
      )}
    </div>
  )
}
