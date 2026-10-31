import { useState } from 'react'
import { Wand2, Loader, Check, Copy, Save, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { useElementsStore } from '../../stores/elements-store'

const DESIGN_MODELS = [
  { id: 'eleven_ttv_v3', label: 'Eleven TTV v3' },
  { id: 'eleven_multilingual_ttv_v2', label: 'Eleven Multilingual TTV v2' },
]

interface Preview {
  generatedVoiceId: string
  audioBase64: string
  mediaType: string
  durationSecs: number
  assetId: string
}

function api() {
  return (window as any).electronAPI?.elevenlabs
}

/** Voice Design: describe a voice, listen to the previews, save the chosen one and assign it to an element */
export function VoiceDesignPanel({ onSaved }: { onSaved?: () => void }) {
  const elements = useElementsStore((s) => s.elements)
  const updateElement = useElementsStore((s) => s.updateElement)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [text, setText] = useState('')
  const [autoText, setAutoText] = useState(false)
  const [modelId, setModelId] = useState(DESIGN_MODELS[0].id)
  const [loudness, setLoudness] = useState(0.5)
  const [guidance, setGuidance] = useState(5)

  const [designing, setDesigning] = useState(false)
  const [previews, setPreviews] = useState<Preview[]>([])
  const [usedText, setUsedText] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [savedVoice, setSavedVoice] = useState<{ voiceId: string; name: string } | null>(null)
  const [elementId, setElementId] = useState('')

  const descOk = description.trim().length >= 20 && description.trim().length <= 1000
  const textLen = text.trim().length
  const textOk = autoText || (textLen >= 100 && textLen <= 1000)

  const design = async () => {
    if (!descOk || !textOk) return
    setDesigning(true)
    setSelected(null)
    setSavedVoice(null)
    try {
      const res = await api()?.designVoice({
        description: description.trim(),
        text: autoText ? undefined : text.trim(),
        autoGenerateText: autoText,
        modelId,
        loudness,
        guidanceScale: guidance,
      })
      setPreviews(res?.previews || [])
      setUsedText(res?.text || '')
      onSaved?.()
      if (!res?.previews?.length) toast.message('ElevenLabs no devolvió previews; prueba otra descripción')
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo diseñar la voz')
    } finally {
      setDesigning(false)
    }
  }

  const save = async () => {
    if (!selected || !name.trim()) return
    setSaving(true)
    try {
      const voice = await api()?.createDesignedVoice({ name: name.trim(), description: description.trim(), generatedVoiceId: selected })
      setSavedVoice(voice)
      toast.success(`Voz "${voice.name}" guardada`)
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo guardar la voz')
    } finally {
      setSaving(false)
    }
  }

  const assign = () => {
    if (!savedVoice || !elementId) return
    updateElement(elementId, { voiceId: savedVoice.voiceId })
    const el = elements.find((e) => e.id === elementId)
    toast.success(`Voz asignada a ${el?.name || 'el elemento'}`)
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <p className="eyebrow">ElevenLabs · Voice Design</p>
          <h2 className="text-title-lg text-ink mt-1">Diseñar voz</h2>
          <p className="text-meta text-ink-subtle mt-1">Describe una voz nueva, escucha las opciones y guarda la que elijas. No se clona a nadie.</p>
        </div>

        <div>
          <label htmlFor="vd-name" className="eyebrow mb-2 block">Nombre</label>
          <input id="vd-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Narradora del canal" className="input-field" />
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label htmlFor="vd-description" className="eyebrow">Descripción</label>
            <span className={`font-mono text-eyebrow ${descOk || !description ? 'text-ink-subtle' : 'text-red-400'}`}>{description.trim().length}/1000</span>
          </div>
          <textarea
            id="vd-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Edad, acento, timbre, ritmo, actitud y calidad de grabación. Mínimo 20 caracteres."
            className="input-field resize-y min-h-[96px] leading-relaxed"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label htmlFor="vd-text" className="eyebrow">Texto de prueba</label>
            <span className={`font-mono text-eyebrow ${textOk || autoText || !text ? 'text-ink-subtle' : 'text-red-400'}`}>{autoText ? 'automático' : `${textLen}/1000 · mín. 100`}</span>
          </div>
          <textarea
            id="vd-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={autoText}
            rows={4}
            placeholder="Lo que dirán las previews: incluye cifras, nombres propios y frases como las que dirá la voz."
            className="input-field resize-y min-h-[96px] leading-relaxed disabled:opacity-40"
          />
          <label className="flex items-center gap-2 mt-2 text-meta text-ink-muted cursor-pointer select-none">
            <input type="checkbox" checked={autoText} onChange={(e) => setAutoText(e.target.checked)} />
            Generar el texto automáticamente
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="vd-model" className="eyebrow mb-2 block">Modelo</label>
            <select id="vd-model" value={modelId} onChange={(e) => setModelId(e.target.value)} className="input-field">
              {DESIGN_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="vd-loudness" className="eyebrow mb-2 block">Volumen · <span className="font-mono">{loudness.toFixed(1)}</span></label>
            <input id="vd-loudness" type="range" min={-1} max={1} step={0.1} value={loudness} onChange={(e) => setLoudness(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label htmlFor="vd-guidance" className="eyebrow mb-2 block">Fidelidad al prompt · <span className="font-mono">{guidance.toFixed(0)}</span></label>
            <input id="vd-guidance" type="range" min={1} max={10} step={1} value={guidance} onChange={(e) => setGuidance(Number(e.target.value))} className="w-full" />
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={design} disabled={designing || !descOk || !textOk} className="btn-primary flex items-center gap-1.5">
            {designing ? <Loader size={13} className="animate-spin" /> : <Wand2 size={13} />}
            {designing ? 'Diseñando…' : previews.length ? 'Generar otras opciones' : 'Generar opciones'}
          </button>
        </div>

        {previews.length > 0 && (
          <div className="space-y-3">
            <p className="eyebrow">Opciones</p>
            {usedText && autoText && <p className="text-meta text-ink-subtle">Texto usado: “{usedText}”</p>}
            {previews.map((p, i) => {
              const isSelected = selected === p.generatedVoiceId
              return (
                <div
                  key={p.generatedVoiceId}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${isSelected ? 'border-accent-500 bg-accent-500/10' : 'border-hairline bg-surface-soft'}`}
                >
                  <span className="font-mono text-body text-ink w-6 text-center">#{i + 1}</span>
                  <audio controls src={`data:${p.mediaType};base64,${p.audioBase64}`} className="flex-1 h-9" />
                  <span className="font-mono text-meta text-ink-subtle w-12 text-right">{p.durationSecs ? `${p.durationSecs.toFixed(1)} s` : ''}</span>
                  <button
                    onClick={() => setSelected(p.generatedVoiceId)}
                    className={isSelected ? 'btn-primary flex items-center gap-1.5' : 'btn-secondary'}
                  >
                    {isSelected ? <><Check size={13} /> Elegida</> : 'Elegir'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {selected && (
          <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-hairline">
            <p className="text-meta text-ink-muted">Se guarda en tu cuenta de ElevenLabs como <span className="text-ink font-emphasis">{name.trim() || 'sin nombre'}</span>.</p>
            <button onClick={save} disabled={saving || !name.trim() || !!savedVoice} className="btn-primary flex items-center gap-1.5">
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
              {savedVoice ? 'Guardada' : 'Guardar voz'}
            </button>
          </div>
        )}

        {savedVoice && (
          <div className="space-y-4 p-4 rounded-xl border border-hairline bg-surface-soft">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow">Voice ID</p>
                <p className="font-mono text-body text-ink truncate mt-0.5">{savedVoice.voiceId}</p>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(savedVoice.voiceId); toast.success('Voice ID copiado') }}
                className="btn-secondary flex items-center gap-1.5"
              >
                <Copy size={13} /> Copiar
              </button>
            </div>
            <div className="flex items-center gap-2">
              <UserRound size={14} className="text-ink-subtle shrink-0" />
              <select value={elementId} onChange={(e) => setElementId(e.target.value)} className="input-field flex-1" aria-label="Elemento">
                <option value="">Asignar a un elemento…</option>
                {elements.map((el) => <option key={el.id} value={el.id}>{el.name}</option>)}
              </select>
              <button onClick={assign} disabled={!elementId} className="btn-primary">Asignar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
