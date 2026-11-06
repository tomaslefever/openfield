import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AudioLines, FolderOpen, Loader, Mic, Plus, RefreshCw, Sparkles, Trash2, Upload, Wand2, X } from 'lucide-react'
import { AudioLibraryPicker } from './AudioLibraryPicker'
import { RecorderModal } from './RecorderModal'
import { parseAssetParams } from './voice-constants'
import { srcUrl } from '../../services/file-url'

interface ClonedVoice {
  id: string
  name: string
  language: string
  referenceText: string
  referenceSeconds: number | null
  hasEmbedding: boolean
  createdAt: number
}

interface RefAudio { base64: string; mime: string; fileName: string; duration?: number }

const MAX_REFERENCE_SECONDS = 30
const MIN_CHARS_PER_SECOND = 7
const DEFAULT_LANGUAGES =['Auto', 'Spanish', 'English', 'Portuguese', 'French', 'German', 'Italian', 'Japanese', 'Korean', 'Chinese', 'Russian']
const LANGUAGE_LABELS: Record<string, string> = {
  Auto: 'Automático', Spanish: 'Español', English: 'Inglés', Portuguese: 'Portugués', French: 'Francés', German: 'Alemán',
  Italian: 'Italiano', Japanese: 'Japonés', Korean: 'Coreano', Chinese: 'Chino', Russian: 'Ruso',
}

function api() {
  return (window as any).electronAPI?.voiceClone
}

const errMsg = (err: any) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

function readFile(file: File): Promise<RefAudio> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || '')
      resolve({ base64: url.slice(url.indexOf(',') + 1), mime: file.type || 'audio/wav', fileName: file.name })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Voice cloning with Qwen3-TTS 1.7B on fal.ai: clone a voice from a short clip and its transcript,
 * then speak any text with it. Lines land in the library as voices, like ElevenLabs ones.
 */
export function VoiceClonePanel({ voiceAssets, onGenerated }: { voiceAssets: any[]; onGenerated?: () => void }) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [languages, setLanguages] = useState<string[]>(DEFAULT_LANGUAGES)
  const [usdPer1k, setUsdPer1k] = useState(0.09)
  const [voices, setVoices] = useState<ClonedVoice[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [creating, setCreating] = useState(false)

  // New voice form
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('Spanish')
  const [refAudio, setRefAudio] = useState<RefAudio | null>(null)
  const [refText, setRefText] = useState('')
  const [refSeconds, setRefSeconds] = useState<number | null>(null)
  const [transcribing, setTranscribing] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [showRecorder, setShowRecorder] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Generation
  const [text, setText] = useState('')
  const [genLanguage, setGenLanguage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [referenceSrc, setReferenceSrc] = useState<string>('')

  const load = useCallback(async () => {
    try {
      const [info, list] = await Promise.all([api()?.info(), api()?.list()])
      setConfigured(!!info?.configured)
      if (Array.isArray(info?.languages) && info.languages.length) setLanguages(info.languages)
      if (info?.usdPer1kChars) setUsdPer1k(info.usdPer1kChars)
      const vs: ClonedVoice[] = Array.isArray(list) ? list : []
      setVoices(vs)
      setSelectedId((cur) => (cur && vs.some((v) => v.id === cur) ? cur : vs[0]?.id || ''))
      if (vs.length === 0) setCreating(true)
    } catch (err) {
      toast.error(errMsg(err))
    }
  }, [])

  useEffect(() => { load() }, [load])

  const selected = voices.find((v) => v.id === selectedId) || null

  useEffect(() => {
    setReferenceSrc('')
    setGenLanguage('')
    if (!selectedId) return
    let cancelled = false
    api()?.reference(selectedId).then((r: any) => {
      if (!cancelled && r?.base64) setReferenceSrc(`data:${r.mime};base64,${r.base64}`)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [selectedId])

  const lines = useMemo(
    () => voiceAssets.filter((a) => parseAssetParams(a).clonedVoiceId === selectedId),
    [voiceAssets, selectedId],
  )

  const resetForm = () => {
    setName('')
    setRefAudio(null)
    setRefText('')
  }

  const setReference = (audio: RefAudio | null) => {
    setRefAudio(audio)
    setRefText('')
    setRefSeconds(audio?.duration && Number.isFinite(audio.duration) ? audio.duration : null)
  }

  const onFile = async (file?: File | null) => {
    if (!file) return
    if (!file.type.startsWith('audio/') && !/\.(wav|mp3|m4a|ogg|flac|aac|webm|opus)$/i.test(file.name)) {
      toast.error('Elige un archivo de audio')
      return
    }
    try { setReference(await readFile(file)) } catch (err) { toast.error(errMsg(err)) }
  }

  const transcribe = async () => {
    if (!refAudio) return
    setTranscribing(true)
    try {
      const res = await api()?.transcribe({ ...refAudio, language: language === 'Auto' ? undefined : language })
      setRefText(res?.text || '')
    } catch (err) {
      toast.error(`No se pudo transcribir: ${errMsg(err)}`)
    } finally {
      setTranscribing(false)
    }
  }

  const clone = async () => {
    if (!refAudio || !name.trim() || !refText.trim()) return
    setCloning(true)
    try {
      const voice: ClonedVoice = await api()?.create({ ...refAudio, name: name.trim(), referenceText: refText.trim(), language })
      toast.success(`Voz “${voice.name}” clonada`)
      resetForm()
      setCreating(false)
      await load()
      setSelectedId(voice.id)
    } catch (err) {
      toast.error(`No se pudo clonar: ${errMsg(err)}`)
    } finally {
      setCloning(false)
    }
  }

  const remove = async (voice: ClonedVoice) => {
    if (!window.confirm(`¿Borrar la voz “${voice.name}”? Los audios ya generados se quedan en la biblioteca.`)) return
    try {
      await api()?.delete(voice.id)
      await load()
    } catch (err) {
      toast.error(errMsg(err))
    }
  }

  const reclone = async (voice: ClonedVoice) => {
    try {
      await api()?.reclone(voice.id)
      toast.success('Voz clonada de nuevo')
      await load()
    } catch (err) {
      toast.error(errMsg(err))
    }
  }

  const generate = async () => {
    if (!selected || !text.trim()) return
    setGenerating(true)
    try {
      await api()?.generate({ voiceId: selected.id, text: text.trim(), language: genLanguage || undefined })
      onGenerated?.()
    } catch (err) {
      toast.error(`No se pudo generar: ${errMsg(err)}`)
    } finally {
      setGenerating(false)
    }
  }

  const cost = (text.trim().length / 1000) * usdPer1k
  // Same limits as the main process (voice-clone-service checkReference): a transcript that leaves
  // part of the clip out, or a long clip, makes Qwen3-TTS babble instead of speaking
  const refLen = refText.trim().replace(/\s+/g, ' ').length
  const refWarning = !refSeconds ? ''
    : refSeconds > MAX_REFERENCE_SECONDS ? `El audio dura ${refSeconds.toFixed(1)} s: recórtalo a 5–20 s de voz limpia (máximo ${MAX_REFERENCE_SECONDS} s).`
    : refLen > 0 && refLen / refSeconds < MIN_CHARS_PER_SECOND ? `La transcripción parece incompleta para ${refSeconds.toFixed(1)} s de audio: escribe todo lo que se dice o usa “Transcribir automáticamente”.`
    : ''
  const canClone = !!refAudio && !!name.trim() && !!refText.trim() && !refWarning && !cloning && !transcribing

  if (configured === false) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="text-meta text-ink-subtle">Configura tu clave de fal.ai en Providers para clonar voces.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <p className="eyebrow">fal.ai · Qwen3-TTS 1.7B</p>
          <h2 className="text-title-lg text-ink mt-1">Clonar voz</h2>
          <p className="text-meta text-ink-subtle mt-1">
            Clona una voz con 5–15 segundos de audio limpio y su transcripción, y genera cualquier texto con ella.
            Usa solo voces propias o de personas que te hayan dado permiso.
          </p>
        </div>

        {/* Saved voices */}
        <div className="flex flex-wrap items-center gap-2">
          {voices.map((v) => (
            <button
              key={v.id}
              onClick={() => { setSelectedId(v.id); setCreating(false) }}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-pill text-xs font-medium border transition-colors ${!creating && v.id === selectedId ? 'border-accent-500 bg-accent-500/10 text-ink' : 'border-hairline text-ink-muted hover:text-ink hover:bg-surface-800/60'}`}
            >
              <AudioLines size={13} /> {v.name}
            </button>
          ))}
          <button
            onClick={() => setCreating(true)}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-pill text-xs font-medium border border-dashed transition-colors ${creating ? 'border-accent-500 text-ink' : 'border-hairline text-ink-muted hover:text-ink'}`}
          >
            <Plus size={13} /> Nueva voz
          </button>
        </div>

        {creating ? (
          <div className="space-y-5 p-5 rounded-xl border border-hairline">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="vc-name" className="eyebrow mb-2 block">Nombre</label>
                <input id="vc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Baloo" className="input-field" />
              </div>
              <div>
                <label htmlFor="vc-lang" className="eyebrow mb-2 block">Idioma</label>
                <select id="vc-lang" value={language} onChange={(e) => setLanguage(e.target.value)} className="input-field">
                  {languages.map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l] || l}</option>)}
                </select>
              </div>
            </div>

            <div>
              <p className="eyebrow mb-2">Audio de referencia</p>
              {refAudio ? (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-hairline bg-surface-soft">
                  <audio
                    controls
                    src={`data:${refAudio.mime};base64,${refAudio.base64}`}
                    onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setRefSeconds(d) }}
                    className="flex-1 h-9"
                  />
                  <span className="text-meta text-ink-subtle truncate max-w-[160px]" title={refAudio.fileName}>
                    {refSeconds ? `${refSeconds.toFixed(1)} s · ` : ''}{refAudio.fileName}
                  </span>
                  <button onClick={() => setReference(null)} className="btn-secondary" aria-label="Quitar audio"><X size={13} /></button>
                </div>
              ) : (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]) }}
                  className="flex flex-wrap items-center justify-center gap-2 p-6 rounded-xl border border-dashed border-hairline text-meta text-ink-subtle"
                >
                  <span className="w-full text-center mb-1">Arrastra un audio aquí o</span>
                  <button onClick={() => fileRef.current?.click()} className="btn-secondary flex items-center gap-1.5"><Upload size={13} /> Subir archivo</button>
                  <button onClick={() => setShowPicker(true)} className="btn-secondary flex items-center gap-1.5"><FolderOpen size={13} /> Biblioteca</button>
                  <button onClick={() => setShowRecorder(true)} className="btn-secondary flex items-center gap-1.5"><Mic size={13} /> Grabar</button>
                  <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
                </div>
              )}
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label htmlFor="vc-ref-text" className="eyebrow">Transcripción exacta del audio</label>
                <button onClick={transcribe} disabled={!refAudio || transcribing} className="text-meta text-accent-400 hover:text-accent-300 disabled:opacity-40 flex items-center gap-1">
                  {transcribing ? <Loader size={12} className="animate-spin" /> : <Wand2 size={12} />}
                  {transcribing ? 'Transcribiendo…' : 'Transcribir automáticamente'}
                </button>
              </div>
              <textarea
                id="vc-ref-text"
                value={refText}
                onChange={(e) => setRefText(e.target.value)}
                placeholder="Lo que se dice en el audio, palabra por palabra"
                className="input-field resize-y min-h-[80px] leading-relaxed"
              />
              {refWarning && <p className="text-meta text-red-400 mt-2">{refWarning}</p>}
            </div>

            <div className="flex justify-end gap-2">
              {voices.length > 0 && <button onClick={() => { resetForm(); setCreating(false) }} className="btn-secondary">Cancelar</button>}
              <button onClick={clone} disabled={!canClone} className="btn-primary flex items-center gap-1.5">
                {cloning ? <Loader size={13} className="animate-spin" /> : <AudioLines size={13} />}
                {cloning ? 'Clonando…' : 'Clonar voz'}
              </button>
            </div>
          </div>
        ) : selected && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl border border-hairline bg-surface-soft space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body text-ink font-emphasis truncate">{selected.name}</p>
                  <p className="text-meta text-ink-subtle">
                    {LANGUAGE_LABELS[selected.language] || selected.language}
                    {selected.referenceSeconds ? ` · referencia de ${selected.referenceSeconds.toFixed(1)} s` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => reclone(selected)} className="btn-secondary flex items-center gap-1.5" title="Volver a clonar desde la referencia guardada">
                    <RefreshCw size={13} /> Reclonar
                  </button>
                  <button onClick={() => remove(selected)} className="btn-secondary" aria-label="Borrar voz" title="Borrar voz"><Trash2 size={13} /></button>
                </div>
              </div>
              {referenceSrc && <audio controls src={referenceSrc} className="w-full h-9" />}
              <p className="text-meta text-ink-subtle">“{selected.referenceText}”</p>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label htmlFor="vc-text" className="eyebrow">Texto</label>
                <span className="font-mono text-eyebrow text-ink-subtle">{text.trim().length} car. · ~${cost.toFixed(3)}</span>
              </div>
              <textarea
                id="vc-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate() }}
                placeholder={`Escribe lo que dirá ${selected.name}…`}
                className="input-field resize-y min-h-[110px] leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <select value={genLanguage} onChange={(e) => setGenLanguage(e.target.value)} className="input-field max-w-[220px]" aria-label="Idioma">
                <option value="">Idioma de la voz ({LANGUAGE_LABELS[selected.language] || selected.language})</option>
                {languages.map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l] || l}</option>)}
              </select>
              <button onClick={generate} disabled={generating || !text.trim()} className="btn-primary flex items-center gap-1.5">
                {generating ? <Loader size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {generating ? 'Generando…' : 'Generar'}
              </button>
            </div>

            {lines.length > 0 && (
              <div className="space-y-2">
                <p className="eyebrow">Últimos audios con esta voz</p>
                {lines.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-hairline">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="text-meta text-ink truncate" title={a.prompt}>{a.prompt}</p>
                      <audio controls preload="none" src={srcUrl(a.localPath || a.filePath)} className="w-full h-8" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showPicker && <AudioLibraryPicker onClose={() => setShowPicker(false)} onSelect={(a) => { setReference(a); setShowPicker(false) }} />}
      {showRecorder && <RecorderModal onClose={() => setShowRecorder(false)} onConfirm={(a) => { setReference(a); setShowRecorder(false) }} />}
    </div>
  )
}
