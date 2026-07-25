import { useState, useMemo } from 'react'
import { useCinemaStore, SHOT_TYPE_LABELS, type ShotType, type StoryboardShot } from '../../stores/cinema-store'
import { Film, Plus, Sparkles, X, ChevronDown, User, Box, Mountain, Loader } from 'lucide-react'

const SHOT_TYPES: ShotType[] = [
  'extreme-close-up', 'close-up', 'medium-close-up', 'medium', 'medium-long',
  'long', 'extreme-long', 'two-shot', 'over-the-shoulder', 'point-of-view',
  'dutch-angle', 'aerial', 'tracking', 'panning', 'static',
]

function ShotCard({
  shot,
  projectId,
  sceneTitle,
  elements,
}: {
  shot: StoryboardShot
  projectId: string
  sceneTitle: string
  elements: ReturnType<typeof useCinemaStore.getState>['elements'][string]
}) {
  const updateStoryboardShot = useCinemaStore(s => s.updateStoryboardShot)
  const deleteStoryboardShot = useCinemaStore(s => s.deleteStoryboardShot)
  const [showShotTypes, setShowShotTypes] = useState(false)

  const toggleElement = (field: 'characterIds' | 'objectIds' | 'scenarioIds', id: string) => {
    const current = shot[field]
    const next = current.includes(id) ? current.filter(i => i !== id) : [...current, id]
    updateStoryboardShot(projectId, shot.id, { [field]: next })
  }

  const handleGenerate = async () => {
    if (!shot.prompt.trim()) return
    updateStoryboardShot(projectId, shot.id, { isGenerating: true })
    try {
      const api = (window as any).electronAPI
      if (api?.kie?.generateImage) {
        // Attempt image generation for storyboard
        await api.kie.generateImage({
          prompt: shot.prompt,
          model: 'gpt-image-2-text-to-image',
          aspectRatio: '16:9',
          resolution: '1K',
        })
      }
    } catch (err) {
      console.error('Storyboard generation failed:', err)
    } finally {
      updateStoryboardShot(projectId, shot.id, { isGenerating: false })
    }
  }

  const chars = elements.filter(e => e.type === 'character')
  const objs = elements.filter(e => e.type === 'object')
  const scenarios = elements.filter(e => e.type === 'scenario')

  const hasElements = chars.length > 0 || objs.length > 0 || scenarios.length > 0

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-accent-500/10 text-accent-400 flex items-center justify-center text-[10px] font-bold">
            <Film size={10} />
          </span>
          <span className="text-xs font-medium text-surface-300">{sceneTitle}</span>
        </div>
        <button
          onClick={() => deleteStoryboardShot(projectId, shot.id)}
          className="text-surface-600 hover:text-red-400 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div>
        <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Descripción</label>
        <textarea
          value={shot.description}
          onChange={e => updateStoryboardShot(projectId, shot.id, { description: e.target.value })}
          placeholder="Describe la toma..."
          className="input-field min-h-[50px] resize-none text-xs"
          rows={2}
        />
      </div>

      <div>
        <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Prompt de generación</label>
        <textarea
          value={shot.prompt}
          onChange={e => updateStoryboardShot(projectId, shot.id, { prompt: e.target.value })}
          placeholder="Prompt para generar esta toma..."
          className="input-field min-h-[60px] resize-none text-xs"
          rows={3}
        />
      </div>

      <div>
        <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Plano</label>
        <div className="relative">
          <button
            onClick={() => setShowShotTypes(!showShotTypes)}
            className="flex items-center justify-between w-full px-2.5 py-1.5 bg-surface-800 rounded-lg text-xs text-surface-300 hover:text-surface-100 transition-colors"
          >
            <span>{SHOT_TYPE_LABELS[shot.shotType] || shot.shotType}</span>
            <ChevronDown size={12} />
          </button>
          {showShotTypes && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface-800 border border-surface-700 rounded-xl py-1 max-h-[200px] overflow-y-auto z-10 shadow-xl">
              {SHOT_TYPES.map(st => (
                <button
                  key={st}
                  onClick={() => { updateStoryboardShot(projectId, shot.id, { shotType: st }); setShowShotTypes(false) }}
                  className={`w-full text-left px-3 py-1 text-xs transition-colors ${
                    shot.shotType === st ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100'
                  }`}
                >
                  {SHOT_TYPE_LABELS[st]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {hasElements && (
        <div>
          <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Elementos</label>
          <div className="space-y-1.5">
            {chars.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <User size={11} className="text-blue-400 flex-shrink-0" />
                {chars.map(el => (
                  <button
                    key={el.id}
                    onClick={() => toggleElement('characterIds', el.id)}
                    className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                      shot.characterIds.includes(el.id)
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : 'bg-surface-800 text-surface-500 hover:text-surface-300'
                    }`}
                  >
                    {el.name}
                  </button>
                ))}
              </div>
            )}
            {objs.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <Box size={11} className="text-amber-400 flex-shrink-0" />
                {objs.map(el => (
                  <button
                    key={el.id}
                    onClick={() => toggleElement('objectIds', el.id)}
                    className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                      shot.objectIds.includes(el.id)
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-surface-800 text-surface-500 hover:text-surface-300'
                    }`}
                  >
                    {el.name}
                  </button>
                ))}
              </div>
            )}
            {scenarios.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <Mountain size={11} className="text-emerald-400 flex-shrink-0" />
                {scenarios.map(el => (
                  <button
                    key={el.id}
                    onClick={() => toggleElement('scenarioIds', el.id)}
                    className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                      shot.scenarioIds.includes(el.id)
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-surface-800 text-surface-500 hover:text-surface-300'
                    }`}
                  >
                    {el.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {shot.generatedImageBase64 && (
        <div className="aspect-video rounded-lg overflow-hidden bg-surface-800">
          <img src={`data:image/png;base64,${shot.generatedImageBase64}`} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleGenerate}
          disabled={shot.isGenerating || !shot.prompt.trim()}
          className="btn-primary text-xs flex items-center gap-1.5 flex-1 justify-center"
        >
          {shot.isGenerating ? (
            <><Loader size={12} className="animate-spin" /> Generando...</>
          ) : (
            <><Sparkles size={12} /> {shot.generatedImageBase64 ? 'Regenerar' : 'Generar'}</>
          )}
        </button>
      </div>
    </div>
  )
}

export function StoryboardSection({ projectId }: { projectId: string }) {
  const scenes = useCinemaStore(s => s.scenes[projectId] || [])
  const shots = useCinemaStore(s => s.shots[projectId] || [])
  const storyboard = useCinemaStore(s => s.storyboard[projectId] || [])
  const elements = useCinemaStore(s => s.elements[projectId] || [])
  const addStoryboardShot = useCinemaStore(s => s.addStoryboardShot)

  const shotsByScene = useMemo(() => {
    const map: Record<string, typeof shots> = {}
    for (const shot of shots) map[shot.sceneId] = [...(map[shot.sceneId] || []), shot]
    return map
  }, [shots])

  const handleAddToStoryboard = (shotId: string) => {
    addStoryboardShot(projectId, {
      sceneId: shotId,
      description: '',
      prompt: '',
      shotType: 'medium',
      characterIds: [],
      objectIds: [],
      scenarioIds: [],
      generatedImageBase64: '',
      generatedVideoPath: '',
      isGenerating: false,
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-800">
        <div className="flex items-center gap-2">
          <Film size={16} className="text-accent-400" />
          <h2 className="text-sm font-semibold text-surface-100">Storyboard</h2>
          <span className="text-[10px] text-surface-600 ml-2">{storyboard.length} tomas</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {scenes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-surface-600 gap-2">
            <Film size={32} className="opacity-50" />
            <p className="text-sm">No hay escenas definidas</p>
            <p className="text-xs text-surface-700">Primero escribe el guión en la sección Guión</p>
          </div>
        ) : (
          <div className="space-y-8">
            {scenes.map(scene => {
              const sceneShots = shotsByScene[scene.id] || []
              const sceneStoryboardShots = storyboard.filter(sb => {
                return sceneShots.some(s => s.id === sb.sceneId)
              })

              return (
                <div key={scene.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-6 h-6 rounded-lg bg-surface-800 text-surface-400 flex items-center justify-center text-[10px] font-bold">
                      {scene.order + 1}
                    </span>
                    <h3 className="text-sm font-medium text-surface-200">{scene.title}</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sceneStoryboardShots.map(sb => {
                      const sourceShot = sceneShots.find(s => s.id === sb.sceneId)
                      return (
                        <ShotCard
                          key={sb.id}
                          shot={sb}
                          projectId={projectId}
                          sceneTitle={sourceShot?.description || scene.title}
                          elements={elements}
                        />
                      )
                    })}

                    {sceneShots
                      .filter(s => !storyboard.some(sb => sb.sceneId === s.id))
                      .map(s => (
                        <button
                          key={s.id}
                          onClick={() => handleAddToStoryboard(s.id)}
                          className="card border-dashed border-surface-700 hover:border-accent-500/50 p-4 flex flex-col items-center justify-center gap-2 text-surface-600 hover:text-accent-400 transition-colors min-h-[200px]"
                        >
                          <Plus size={20} />
                          <span className="text-xs">Agregar toma al storyboard</span>
                          <span className="text-[10px] text-surface-700">{s.description}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
