import { useState } from 'react'
import { useCinemaStore } from '../../stores/cinema-store'
import { X, Sparkles } from 'lucide-react'

interface Props {
  onClose: () => void
  onCreated: (projectId: string) => void
}

export function ProjectWizard({ onClose, onCreated }: Props) {
  const createProject = useCinemaStore(s => s.createProject)
  const [name, setName] = useState('')

  const handleCreate = () => {
    if (!name.trim()) return
    try {
      if (typeof createProject !== 'function') throw new Error('createProject no es una función')
      const id = createProject(name.trim())
      if (!id) throw new Error('createProject no devolvió un ID')
      onCreated(id)
    } catch (err: any) {
      console.error('Error al crear proyecto:', err)
      alert(`Error al crear el proyecto: ${err?.message || err}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface-900 border border-surface-800 rounded-2xl w-full max-w-md mx-4 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-accent-500/10 flex items-center justify-center">
              <Sparkles size={16} className="text-accent-400" />
            </div>
            <h2 className="text-sm font-semibold text-surface-100">Nuevo Proyecto</h2>
          </div>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-100"><X size={18} /></button>
        </div>

        <div className="px-6 py-5">
          <label className="text-xs font-medium text-surface-300 mb-1.5 block">Nombre del proyecto</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: El último viaje, Campaña Verano 2026..."
            className="input-field text-sm"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
          />
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-surface-800 bg-surface-950/50">
          <button onClick={onClose} className="btn-ghost text-xs">Cancelar</button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="btn-primary text-xs"
          >
            Crear proyecto
          </button>
        </div>
      </div>
    </div>
  )
}
