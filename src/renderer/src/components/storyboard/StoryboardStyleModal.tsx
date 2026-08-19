import { useState } from 'react'
import { X, Palette, Check, Sparkles } from 'lucide-react'

interface StyleOption {
  id: string
  name: string
  description: string
  gradient: string
}

const STYLE_OPTIONS: StyleOption[] = [
  { id: '3d-animation', name: '3D Animation', description: 'Render 3D estilo Pixar', gradient: 'from-indigo-500/60 to-cyan-500/60' },
  { id: 'realistic', name: 'Realistic', description: 'Fotorrealismo cinematográfico', gradient: 'from-amber-500/60 to-orange-600/60' },
  { id: 'charcoal', name: 'Charcoal', description: 'Carboncillo en blanco y negro', gradient: 'from-zinc-600/60 to-zinc-900/80' },
  { id: 'claymation', name: 'Claymation', description: 'Stop-motion de plastilina', gradient: 'from-rose-500/60 to-fuchsia-600/60' },
  { id: 'concept-sketch', name: 'Concept Sketch', description: 'Arte conceptual, línea y mancha', gradient: 'from-teal-500/60 to-emerald-600/60' },
  { id: 'anime', name: 'Anime', description: 'Cel shading y colores vibrantes', gradient: 'from-pink-500/60 to-purple-600/60' },
]

interface StoryboardStyleModalProps {
  mode: 'create' | 'change'
  defaultName?: string
  currentStyle?: string
  onConfirm: (name: string, style: string) => void | Promise<void>
  onClose: () => void
}

export function StoryboardStyleModal({
  mode,
  defaultName = '',
  currentStyle = '',
  onConfirm,
  onClose,
}: StoryboardStyleModalProps) {
  const [name, setName] = useState(defaultName)
  const [selected, setSelected] = useState<string>(currentStyle)
  const [customOpen, setCustomOpen] = useState(currentStyle && !STYLE_OPTIONS.some(s => s.id === currentStyle))
  const [customStyle, setCustomStyle] = useState(customOpen ? currentStyle : '')
  const [saving, setSaving] = useState(false)

  const finalStyle = customOpen ? customStyle.trim() : selected

  const handleConfirm = async () => {
    if (!finalStyle || saving) return
    setSaving(true)
    try {
      await onConfirm(mode === 'create' ? name.trim() || 'Untitled Storyboard' : defaultName, finalStyle)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div
        className="bg-surface-900 border border-surface-800 rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden m-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-800 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-accent-500/15 flex items-center justify-center">
            <Palette size={13} className="text-accent-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-surface-100">
              {mode === 'create' ? 'Nuevo Storyboard' : 'Estilo visual'}
            </h3>
            <p className="text-[10px] text-surface-500">
              {mode === 'create' ? '¿Qué estilo tendrá? Se aplicará a los prompts de las escenas.' : 'Cambiar el estilo de este storyboard'}
            </p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-surface-500 hover:text-surface-200 hover:bg-surface-800 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Name */}
          {mode === 'create' && (
            <div>
              <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Nombre</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Storyboard 1"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm() } }}
                className="input-field text-xs"
              />
            </div>
          )}

          {/* Preset styles */}
          <div>
            <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1.5 block">Estilo visual</label>
            <div className="grid grid-cols-2 gap-2">
              {STYLE_OPTIONS.map(opt => {
                const active = !customOpen && selected === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => { setSelected(opt.id); setCustomOpen(false) }}
                    className={`relative rounded-xl border p-2.5 text-left transition-all group ${
                      active
                        ? 'border-accent-400 bg-accent-500/10 ring-1 ring-accent-400/40'
                        : 'border-surface-700 bg-surface-800/50 hover:border-surface-600 hover:bg-surface-800'
                    }`}
                  >
                    <div className={`w-full h-8 rounded-lg bg-gradient-to-br ${opt.gradient} mb-2 opacity-80`} />
                    <p className="text-[11px] font-semibold text-surface-200">{opt.name}</p>
                    <p className="text-[9px] text-surface-500 mt-0.5 leading-snug">{opt.description}</p>
                    {active && (
                      <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-accent-500 flex items-center justify-center">
                        <Check size={9} className="text-white" />
                      </span>
                    )}
                  </button>
                )
              })}

              {/* Custom */}
              <button
                onClick={() => setCustomOpen(true)}
                className={`relative rounded-xl border p-2.5 text-left transition-all ${
                  customOpen
                    ? 'border-accent-400 bg-accent-500/10 ring-1 ring-accent-400/40'
                    : 'border-dashed border-surface-600 bg-surface-800/30 hover:border-surface-500 hover:bg-surface-800'
                }`}
              >
                <div className="w-full h-8 rounded-lg bg-gradient-to-br from-surface-600/40 to-surface-800/60 mb-2 flex items-center justify-center">
                  <Sparkles size={12} className="text-surface-400" />
                </div>
                <p className="text-[11px] font-semibold text-surface-200">Create custom style</p>
                <p className="text-[9px] text-surface-500 mt-0.5 leading-snug">Describe tu propio estilo</p>
                {customOpen && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-accent-500 flex items-center justify-center">
                    <Check size={9} className="text-white" />
                  </span>
                )}
              </button>
            </div>

            {/* Custom style input */}
            {customOpen && (
              <div className="mt-2">
                <input
                  value={customStyle}
                  onChange={e => setCustomStyle(e.target.value)}
                  placeholder="ej. watercolor, soft pastels, brush strokes"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm() } }}
                  className="input-field text-xs"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-surface-800 flex items-center justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="text-[11px] px-3 py-1.5 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!finalStyle || saving}
            className="btn-primary text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mode === 'create' ? 'Crear Storyboard' : 'Guardar estilo'}
          </button>
        </div>
      </div>
    </div>
  )
}
