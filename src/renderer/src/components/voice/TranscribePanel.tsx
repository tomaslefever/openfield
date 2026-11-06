import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, FileText, FolderOpen, Loader, Mic, Subtitles, Upload, Wand2, X } from 'lucide-react'
import { AudioLibraryPicker } from './AudioLibraryPicker'
import { RecorderModal } from './RecorderModal'

interface Media { base64: string; mime: string; fileName: string; duration?: number }
interface Segment { start: number; end: number; text: string }
interface Transcript {
  text: string
  segments: Segment[]
  language: string | null
  durationSeconds: number | null
  plain: string
  srt: string
}

const LANGUAGES: [string, string][] = [
  ['Auto', 'Detectar automáticamente'], ['Spanish', 'Español'], ['English', 'Inglés'], ['Portuguese', 'Portugués'],
  ['French', 'Francés'], ['German', 'Alemán'], ['Italian', 'Italiano'], ['Japanese', 'Japonés'], ['Korean', 'Coreano'],
  ['Chinese', 'Chino'], ['Russian', 'Ruso'],
]

function api() {
  return (window as any).electronAPI?.transcription
}

const errMsg = (err: any) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function readFile(file: File): Promise<Media> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || '')
      resolve({ base64: url.slice(url.indexOf(',') + 1), mime: file.type || 'application/octet-stream', fileName: file.name })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Speech to text for any audio or video (fal Whisper): copy it or save it as .txt / .srt */
export function TranscribePanel() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [media, setMedia] = useState<Media | null>(null)
  const [language, setLanguage] = useState('Auto')
  const [transcribing, setTranscribing] = useState(false)
  const [result, setResult] = useState<Transcript | null>(null)
  const [text, setText] = useState('')
  const [view, setView] = useState<'text' | 'timed'>('text')
  const [copied, setCopied] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [showRecorder, setShowRecorder] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api()?.info().then((i: any) => setConfigured(!!i?.configured)).catch(() => setConfigured(false))
  }, [])

  const isVideo = !!media?.mime.startsWith('video/')
  const mediaSrc = media ? `data:${media.mime};base64,${media.base64}` : ''

  const choose = (m: Media | null) => {
    setMedia(m)
    setResult(null)
    setText('')
  }

  const onFile = async (file?: File | null) => {
    if (!file) return
    if (!/^(audio|video)\//.test(file.type) && !/\.(wav|mp3|m4a|ogg|opus|flac|aac|webm|mp4|mov|mkv)$/i.test(file.name)) {
      toast.error('Elige un archivo de audio o vídeo')
      return
    }
    if (file.size > 500 * 1024 * 1024) {
      toast.error('El archivo es demasiado grande (máximo 500 MB)')
      return
    }
    try { choose(await readFile(file)) } catch (err) { toast.error(errMsg(err)) }
  }

  const transcribe = async () => {
    if (!media) return
    setTranscribing(true)
    try {
      const res: Transcript = await api()?.fromBase64({ ...media, language })
      setResult(res)
      setText(res.plain)
      setView('text')
    } catch (err) {
      toast.error(`No se pudo transcribir: ${errMsg(err)}`)
    } finally {
      setTranscribing(false)
    }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const save = async (format: 'txt' | 'srt') => {
    if (!result) return
    try {
      const res = await api()?.save({ content: format === 'srt' ? result.srt : text, name: media?.fileName, format })
      if (res?.ok) toast.success(`Guardado en ${res.path}`)
      else if (res?.error) toast.error(res.error)
    } catch (err) {
      toast.error(errMsg(err))
    }
  }

  if (configured === false) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="text-meta text-ink-subtle">Configura tu clave de fal.ai en Providers para transcribir audio.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <p className="eyebrow">fal.ai · Whisper</p>
          <h2 className="text-title-lg text-ink mt-1">Transcribir</h2>
          <p className="text-meta text-ink-subtle mt-1">Saca el texto de cualquier audio o vídeo. Puedes copiarlo o guardarlo como .txt o como subtítulos .srt.</p>
        </div>

        {media ? (
          <div className="space-y-3 p-3 rounded-xl border border-hairline bg-surface-soft">
            <div className="flex items-center gap-3">
              <span className="flex-1 text-meta text-ink-subtle truncate" title={media.fileName}>{media.fileName}</span>
              <button onClick={() => choose(null)} className="btn-secondary shrink-0" aria-label="Quitar archivo"><X size={13} /></button>
            </div>
            {isVideo
              ? <video controls src={mediaSrc} className="w-full max-h-64 rounded-lg bg-black" />
              : <audio controls src={mediaSrc} className="w-full h-9" />}
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files?.[0]) }}
            className={`flex flex-wrap items-center justify-center gap-2 p-8 rounded-xl border border-dashed text-meta text-ink-subtle transition-colors ${dragOver ? 'border-accent-500 bg-accent-500/5' : 'border-hairline'}`}
          >
            <span className="w-full text-center mb-1">Arrastra un audio o vídeo aquí o</span>
            <button onClick={() => fileRef.current?.click()} className="btn-secondary flex items-center gap-1.5"><Upload size={13} /> Subir archivo</button>
            <button onClick={() => setShowPicker(true)} className="btn-secondary flex items-center gap-1.5"><FolderOpen size={13} /> Biblioteca</button>
            <button onClick={() => setShowRecorder(true)} className="btn-secondary flex items-center gap-1.5"><Mic size={13} /> Grabar</button>
            <input ref={fileRef} type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input-field max-w-[240px]" aria-label="Idioma del audio">
            {LANGUAGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <button onClick={transcribe} disabled={!media || transcribing} className="btn-primary flex items-center gap-1.5">
            {transcribing ? <Loader size={13} className="animate-spin" /> : <Wand2 size={13} />}
            {transcribing ? 'Transcribiendo…' : result ? 'Transcribir de nuevo' : 'Transcribir'}
          </button>
        </div>

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1" role="tablist">
                {([['text', 'Texto'], ['timed', 'Con tiempos']] as const).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={view === id}
                    onClick={() => setView(id)}
                    className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${view === id ? 'bg-surface-800 text-ink' : 'text-surface-400 hover:text-ink hover:bg-surface-800/60'}`}
                  >
                    {label}
                  </button>
                ))}
                <span className="font-mono text-eyebrow text-ink-subtle ml-2">
                  {[result.durationSeconds ? clock(result.durationSeconds) : '', result.language || '', `${text.trim().split(/\s+/).filter(Boolean).length} palabras`].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={copy} className="btn-secondary flex items-center gap-1.5">{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copiado' : 'Copiar'}</button>
                <button onClick={() => save('txt')} className="btn-secondary flex items-center gap-1.5"><FileText size={13} /> .txt</button>
                <button onClick={() => save('srt')} disabled={!result.segments.length} className="btn-secondary flex items-center gap-1.5"><Subtitles size={13} /> .srt</button>
              </div>
            </div>

            {view === 'text' ? (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label="Transcripción"
                className="input-field resize-y min-h-[240px] leading-relaxed"
              />
            ) : (
              <div className="rounded-xl border border-hairline divide-y divide-hairline max-h-[420px] overflow-y-auto">
                {result.segments.map((s, i) => (
                  <div key={i} className="flex gap-3 px-3 py-2">
                    <span className="font-mono text-meta text-ink-subtle shrink-0 w-24">{clock(s.start)} – {clock(s.end)}</span>
                    <span className="text-meta text-ink">{s.text}</span>
                  </div>
                ))}
              </div>
            )}
            {view === 'text' && <p className="text-meta text-ink-subtle">Puedes corregir el texto antes de copiarlo o guardarlo. Los subtítulos .srt usan la transcripción original con sus tiempos.</p>}
          </div>
        )}
      </div>

      {showPicker && <AudioLibraryPicker onClose={() => setShowPicker(false)} onSelect={(a) => { choose(a); setShowPicker(false) }} />}
      {showRecorder && <RecorderModal onClose={() => setShowRecorder(false)} onConfirm={(a) => { choose(a); setShowRecorder(false) }} />}
    </div>
  )
}
