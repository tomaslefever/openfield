import { Users, MapPin, Package, Trash2, Wand2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ELEMENT_TYPE_CONFIG } from '../../utils/script-elements'
import type { StoryboardElement, StoryboardElementType } from '../../stores/storyboard-store'

const TYPE_ICONS: Record<StoryboardElementType, LucideIcon> = {
  character: Users,
  scenario: MapPin,
  object: Package,
}

const TYPE_ORDER: StoryboardElementType[] = ['character', 'scenario', 'object']

interface ElementsTabProps {
  elements: StoryboardElement[]
  onRemove: (id: string) => void
  onExtract: () => void
}

export function ElementsTab({ elements, onRemove, onExtract }: ElementsTabProps) {
  const groups = TYPE_ORDER.map(type => ({
    type,
    config: ELEMENT_TYPE_CONFIG[type],
    Icon: TYPE_ICONS[type],
    items: elements.filter(e => e.type === type),
  }))

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-surface-100">Elements</h2>
            <p className="text-[11px] text-surface-500 mt-0.5">Elementos extraídos del guión: personajes, locaciones y objetos.</p>
          </div>
          <button onClick={onExtract} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-600 hover:bg-accent-500 text-white transition-colors">
            <Wand2 size={12} /> Re-analizar guión
          </button>
        </div>

        {elements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-surface-600">
            <Users size={40} className="mb-3 opacity-50" />
            <p className="text-sm">No hay elementos todavía.</p>
            <p className="text-xs text-surface-700 mt-1">Escribe el guión en la pestaña <span className="text-accent-400">Guión</span> y pulsa <span className="text-accent-400">Crear elements</span> para extraer personajes, locaciones y objetos automáticamente.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(({ type, config, Icon, items }) => (
              <section key={type}>
                <div className="flex items-center gap-2 mb-2.5">
                  <Icon size={14} className={config.color} />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">{config.plural}</h3>
                  <span className="text-[10px] text-surface-600">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <p className="text-[11px] text-surface-600 bg-surface-800/30 border border-dashed border-surface-800 rounded-xl px-3 py-4 text-center">Sin {config.label.toLowerCase()}s en el guión todavía</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map(el => (
                      <div key={el.id} className={`card p-3 group relative ${config.border}`}>
                        <div className="flex items-start gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${config.bg}`}>
                            <Icon size={15} className={config.color} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-surface-100 truncate">{el.name}</p>
                            <p className="text-[11px] text-surface-500 mt-0.5 leading-relaxed line-clamp-3">
                              {el.description || <span className="italic text-surface-600">Sin descripción</span>}
                            </p>
                          </div>
                          <button
                            onClick={() => onRemove(el.id)}
                            className="p-1 text-surface-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                            title="Eliminar elemento"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
