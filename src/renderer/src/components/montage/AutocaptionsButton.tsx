import { useEffect, useMemo, useState } from 'react'
import { Captions, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ProviderLogo } from '../icons/ProviderLogos'
import { TRANSCRIPTION_MODELS, calcCost } from '../../lib/models'
import { useMontageStore, type CaptionStyle, type MontageClip, type MontageDoc } from '../../stores/montage-store'
import { formatClock } from './time'

/*
 * Timeline autocaptions: transcribes the audio of the selected clip, one track or the whole
 * montage (main `services/autocaptions.ts`) and lays the result on a new caption track.
 */

type Scope = 'clip' | 'track' | 'sequence'
type ProviderId = 'elevenlabs' | 'openai'
interface ProviderInfo { id: ProviderId; label: string; model: string; configured: boolean }

const LANGUAGES = [
  { code: 'auto', label: 'Detectar' },
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'Inglés' },
  { code: 'pt', label: 'Portugués' },
  { code: 'fr', label: 'Francés' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Alemán' },
]

/** Line limits each style starts with: short punchy lines for vertical, subtitle-length for classic */
const STYLE_LIMITS: Record<CaptionStyle, { maxChars: number; maxWords: number }> = {
  social: { maxChars: 22, maxWords: 4 },
  classic: { maxChars: 42, maxWords: 12 },
}

const OPTIONS_KEY = 'openfield.autocaptions'

interface Options {
  provider: ProviderId
  language: string
  translate: boolean
  style: CaptionStyle
  highlight: boolean
  maxChars: number
  maxWords: number
}

function loadOptions(): Partial<Options> {
  try { return JSON.parse(localStorage.getItem(OPTIONS_KEY) || '{}') } catch { return {} }
}

function saveOptions(o: Options) {
  try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(o)) } catch {}
}

/** Same selection as main `captionSources`: clips whose sound the export would mix */
function captionSources(doc: MontageDoc, scope: Scope, clipId: string | null, trackId: string): MontageClip[] {
  const trackById = new Map(doc.tracks.map((t) => [t.id, t]))
  const hasSound = (c: MontageClip) => {
    const kind = trackById.get(c.trackId)?.kind
    return (c.kind === 'video' && kind === 'video') || (c.kind === 'audio' && kind === 'audio')
  }
  if (scope === 'clip') return doc.clips.filter((c) => c.id === clipId && hasSound(c))
  if (scope === 'track') return doc.clips.filter((c) => c.trackId === trackId && hasSound(c))
  return doc.clips.filter((c) => hasSound(c) && !trackById.get(c.trackId)?.muted && c.volume > 0)
}

/** Seconds of audio sent: from the first source to the end of the last one */
function audioSeconds(sources: MontageClip[]): number {
  if (sources.length === 0) return 0
  return Math.max(...sources.map((c) => c.start + c.duration)) - Math.min(...sources.map((c) => c.start))
}

const ISO3: Record<string, string> = { spa: 'es', eng: 'en', por: 'pt', fra: 'fr', ita: 'it', deu: 'de', ger: 'de', cat: 'ca' }
const NAMES: Record<string, string> = { spanish: 'es', english: 'en', portuguese: 'pt', french: 'fr', italian: 'it', german: 'de', catalan: 'ca' }

/** Short tag for the track name from whatever the provider reports (ISO-639-1/3 or an English name) */
function languageTag(lang?: string): string {
  const l = (lang || '').toLowerCase()
  const code = ISO3[l] ?? NAMES[l] ?? (l.length === 2 ? l : '')
  return code ? code.toUpperCase() : 'auto'
}

const usd = (n: number) => `$${n < 0.01 ? n.toFixed(3) : n.toFixed(2)}`

const fieldCls = 'h-7 w-full rounded-md bg-surface-900 px-2 text-[12px] text-ink outline-none ring-1 ring-hairline disabled:opacity-40'

export function AutocaptionsButton() {
  const doc = useMontageStore((s) => s.doc)
  const selectedClipId = useMontageStore((s) => s.selectedClipId)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [scope, setScope] = useState<Scope>('sequence')
  const [trackId, setTrackId] = useState('')
  const [opts, setOpts] = useState<Options>(() => {
    const saved = loadOptions()
    const style: CaptionStyle = saved.style ?? 'social'
    return {
      provider: saved.provider ?? 'elevenlabs',
      language: saved.language ?? 'auto',
      translate: saved.translate ?? false,
      style,
      highlight: saved.highlight ?? true,
      maxChars: saved.maxChars ?? STYLE_LIMITS[style].maxChars,
      maxWords: saved.maxWords ?? STYLE_LIMITS[style].maxWords,
    }
  })
  const set = (patch: Partial<Options>) => setOpts((o) => { const next = { ...o, ...patch }; saveOptions(next); return next })

  const soundTracks = useMemo(
    () => doc.tracks.filter((t) => t.kind !== 'caption' && doc.clips.some((c) => c.trackId === t.id && (c.kind === 'video' || c.kind === 'audio'))),
    [doc],
  )
  const selectedHasSound = captionSources(doc, 'clip', selectedClipId, '').length > 0

  // Refresh keys and sensible defaults every time the panel opens
  useEffect(() => {
    if (!open) return
    const api = (window as any).electronAPI
    Promise.resolve(api?.captions?.providers?.() ?? []).then((list: ProviderInfo[]) => {
      setProviders(list ?? [])
      const current = list?.find((p) => p.id === opts.provider)
      const firstReady = list?.find((p) => p.configured)
      if (!current?.configured && firstReady) set({ provider: firstReady.id })
    }).catch(() => {})
    setScope(selectedHasSound ? 'clip' : 'sequence')
    if (!soundTracks.some((t) => t.id === trackId)) setTrackId(soundTracks[0]?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const translate = opts.translate && opts.provider === 'openai'
  const sources = captionSources(doc, scope, selectedClipId, trackId)
  const seconds = audioSeconds(sources)
  const model = TRANSCRIPTION_MODELS.find((m) => m.provider === opts.provider)
  const cost = model && seconds > 0 ? calcCost(model, undefined, seconds) : null
  const provider = providers.find((p) => p.id === opts.provider)
  const ready = !!provider?.configured && sources.length > 0 && !busy

  const run = async () => {
    const api = (window as any).electronAPI
    if (!api || !ready) return
    setBusy(true)
    try {
      const res = await api.captions?.generate?.({
        doc: useMontageStore.getState().doc,
        scope,
        clipId: selectedClipId ?? undefined,
        trackId,
        provider: opts.provider,
        language: translate ? undefined : opts.language,
        translateToEnglish: translate,
        maxChars: opts.maxChars,
        maxWords: opts.maxWords,
      })
      if (!res?.ok) {
        toast.error('No se pudieron generar los subtítulos', { description: res?.error })
        return
      }
      const tag = translate ? 'EN' : languageTag(res.language ?? (opts.language !== 'auto' ? opts.language : undefined))
      const count = useMontageStore.getState().applyAutocaptions(res.segments ?? [], {
        name: `Subtítulos auto ${tag}`,
        captionStyle: opts.style,
        highlight: opts.style === 'social' && opts.highlight && !translate,
      })
      if (count === 0) toast.warning('No se detectó voz en el audio')
      else {
        toast.success(`${count} subtítulos creados`, { description: `Pista «Subtítulos auto ${tag}» · ${formatClock(res.audioSeconds ?? seconds)} de audio` })
        setOpen(false)
      }
    } catch (err: any) {
      toast.error('No se pudieron generar los subtítulos', { description: String(err?.message || err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={(v) => !busy && setOpen(v)}>
      <PopoverTrigger asChild>
        <button
          title="Generar subtítulos desde el audio"
          className="flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] text-ink-muted transition-colors hover:bg-surface-700 hover:text-ink"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Captions size={14} />} Subtítulos auto
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] space-y-3 p-3 text-[12px]">
        <Field label="Audio">
          <div className="grid grid-cols-3 gap-1">
            <Segment active={scope === 'clip'} disabled={!selectedHasSound} onClick={() => setScope('clip')} title={selectedHasSound ? undefined : 'Selecciona un clip de video o audio'}>Clip</Segment>
            <Segment active={scope === 'track'} disabled={soundTracks.length === 0} onClick={() => setScope('track')}>Pista</Segment>
            <Segment active={scope === 'sequence'} onClick={() => setScope('sequence')}>Secuencia</Segment>
          </div>
          {scope === 'track' && (
            <select value={trackId} onChange={(e) => setTrackId(e.target.value)} className={`${fieldCls} mt-1.5`}>
              {soundTracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </Field>

        <Field label="Transcribir con">
          <div className="space-y-1">
            {providers.map((p) => (
              <button
                key={p.id}
                disabled={!p.configured}
                onClick={() => set({ provider: p.id })}
                title={p.configured ? undefined : 'Agrega la clave en Proveedores para usarlo'}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  opts.provider === p.id && p.configured ? 'bg-surface-800 ring-ink/40' : 'ring-hairline hover:bg-surface-800'
                }`}
              >
                <ProviderLogo provider={p.id} size={14} />
                <span className="flex-1 truncate text-ink">{p.label}</span>
                <span className="text-[11px] text-ink-subtle">{p.configured ? (p.id === 'elevenlabs' ? 'por palabra' : 'por palabra · 25 MB') : 'sin API key'}</span>
              </button>
            ))}
            {providers.length > 0 && !providers.some((p) => p.configured) && (
              <p className="text-[11px] text-ink-subtle">Configura ElevenLabs u OpenAI en Proveedores para transcribir.</p>
            )}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Idioma del audio">
            <select value={translate ? 'auto' : opts.language} disabled={translate} onChange={(e) => set({ language: e.target.value })} className={fieldCls}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </Field>
          <Field label="Texto">
            <select
              value={translate ? 'en' : 'source'}
              disabled={opts.provider !== 'openai'}
              onChange={(e) => set({ translate: e.target.value === 'en' })}
              title={opts.provider === 'openai' ? undefined : 'La traducción al inglés usa OpenAI Whisper'}
              className={fieldCls}
            >
              <option value="source">Idioma original</option>
              <option value="en">Traducir al inglés</option>
            </select>
          </Field>
        </div>

        <Field label="Estilo">
          <div className="grid grid-cols-2 gap-1">
            <Segment active={opts.style === 'social'} onClick={() => set({ style: 'social', ...STYLE_LIMITS.social })}>Vertical (grande)</Segment>
            <Segment active={opts.style === 'classic'} onClick={() => set({ style: 'classic', ...STYLE_LIMITS.classic })}>Clásico</Segment>
          </div>
          {opts.style === 'social' && (
            <label className={`mt-1.5 flex items-center gap-2 text-ink-muted ${translate ? 'opacity-40' : ''}`}>
              <input type="checkbox" checked={opts.highlight && !translate} disabled={translate} onChange={(e) => set({ highlight: e.target.checked })} />
              Resaltar la palabra que se dice{translate ? ' (no disponible al traducir)' : ''}
            </label>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Máx. caracteres por línea">
            <input type="number" min={8} max={120} value={opts.maxChars} onChange={(e) => set({ maxChars: Number(e.target.value) || 0 })} className={fieldCls} />
          </Field>
          <Field label="Máx. palabras por línea">
            <input type="number" min={1} max={30} value={opts.maxWords} onChange={(e) => set({ maxWords: Number(e.target.value) || 0 })} className={fieldCls} />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-md bg-surface-800/70 px-2.5 py-2">
          <span className="text-ink-muted">
            {seconds > 0 ? <>Audio <span className="font-mono tabular-nums text-ink">{formatClock(seconds)}</span></> : 'Sin audio para transcribir'}
          </span>
          {cost && (
            <span className="tabular-nums text-ink" title={`${model!.name}: estimado según ${Math.ceil(seconds)} s de audio`}>
              ≈ {usd(cost.totalDollars)} <span className="text-ink-subtle">· {Math.max(1, cost.totalCredits)} créditos</span>
            </span>
          )}
        </div>

        <button
          onClick={run}
          disabled={!ready}
          className="btn-primary flex w-full items-center justify-center gap-1.5 text-[12px] disabled:opacity-50"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          {busy ? 'Transcribiendo…' : 'Generar subtítulos'}
        </button>
      </PopoverContent>
    </Popover>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-ink-subtle">{label}</p>
      {children}
    </div>
  )
}

function Segment({ active, disabled, onClick, title, children }: { active: boolean; disabled?: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`h-7 rounded-md px-2 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-surface-700 text-ink' : 'text-ink-muted ring-1 ring-hairline hover:bg-surface-800'
      }`}
    >
      {children}
    </button>
  )
}
