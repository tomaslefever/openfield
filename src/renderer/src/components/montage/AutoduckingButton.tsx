import { useState } from 'react'
import { AudioWaveform, ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DUCKING_DEFAULTS, duckingConfig, useMontageStore, type DuckingConfig, type TrackRole } from '../../stores/montage-store'

/*
 * Timeline "Autoducking" switch. On: voices are detected (TTS / Voice Studio clips, or tracks marked
 * as voice) and every music/background track dips under them; the dip is derived from the voice
 * clips, so it follows every move or trim while the switch stays on. Off: ducking is switched off
 * on all background tracks, keeping their settings. MCP equivalent: timeline_autoducking.
 */

const FIELDS = [
  ['Reducción (dB)', 'amountDb', 1, -60, 0, 1],
  ['Ataque (ms)', 'attack', 1000, 0, 5000, 10],
  ['Release (ms)', 'release', 1000, 0, 10000, 10],
] as const

const ROLES: [TrackRole | 'none', string][] = [['none', 'Normal'], ['voice', 'Voz'], ['background', 'Fondo']]

export function AutoduckingButton() {
  const doc = useMontageStore((s) => s.doc)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const backgrounds = doc.tracks.filter((t) => t.role === 'background')
  const active = backgrounds.some((t) => duckingConfig(t).enabled)
  const cfg: DuckingConfig = backgrounds[0] ? duckingConfig(backgrounds[0]) : DUCKING_DEFAULTS
  // Settings chosen before the first activation, used when it is switched on
  const [pending, setPending] = useState<Pick<DuckingConfig, 'amountDb' | 'attack' | 'release'> | null>(null)
  const shown = backgrounds.length ? cfg : { ...cfg, ...(pending ?? {}) }
  const soundTracks = doc.tracks.filter((t) => t.kind !== 'caption')

  const toggle = async () => {
    const store = useMontageStore.getState()
    if (active) {
      store.disableAutoDucking()
      toast('Autoducking desactivado', { description: 'Las pistas de fondo vuelven a su volumen; la configuración se mantiene.' })
      return
    }
    setBusy(true)
    try {
      const res = await store.enableAutoDucking({ amountDb: shown.amountDb, attack: shown.attack, release: shown.release })
      if (!res.ok) {
        toast.warning(res.reason === 'no-voices' ? 'No hay locuciones en el timeline' : 'No hay música ni fondo que bajar', {
          description: res.reason === 'no-voices'
            ? 'No encontré clips de voz (TTS o Voice Studio). Marca una pista como Voz en el menú de al lado.'
            : 'Todas las pistas con sonido son de voz. Pon la música en otra pista o márcala como Fondo.',
        })
        return
      }
      const names = useMontageStore.getState().doc.tracks.filter((t) => res.backgroundTracks.includes(t.id)).map((t) => t.name)
      toast.success('Autoducking activado', { description: `${names.join(', ')} baja${names.length > 1 ? 'n' : ''} ${shown.amountDb} dB con las voces.` })
    } finally {
      setBusy(false)
    }
  }

  const change = (key: keyof typeof shown, value: number) => {
    if (backgrounds.length) useMontageStore.getState().setDuckingAll({ [key]: value })
    else setPending({ amountDb: shown.amountDb, attack: shown.attack, release: shown.release, [key]: value })
  }

  return (
    <div className={`flex h-8 items-center rounded-lg ${active ? 'bg-surface-700' : ''}`}>
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={active}
        title={active ? 'Autoducking activo: la música baja sola con las voces (clic para desactivar)' : 'Autoducking: bajar la música automáticamente cuando suenan las locuciones'}
        className={`flex h-8 items-center gap-1 rounded-l-lg pl-2 pr-1.5 text-[12px] transition-colors hover:bg-surface-700 hover:text-ink ${active ? 'text-ink' : 'text-ink-muted'}`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <AudioWaveform size={14} />} Autoducking
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button title="Ajustes del autoducking" className="flex h-8 w-5 items-center justify-center rounded-r-lg text-ink-muted transition-colors hover:bg-surface-700 hover:text-ink">
            <ChevronDown size={12} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3 p-3 text-[12px]">
          <div className="grid grid-cols-3 gap-2">
            {FIELDS.map(([label, key, scale, min, max, step]) => (
              <label key={key} className="block">
                <span className="mb-0.5 block text-[10.5px] text-ink-subtle">{label}</span>
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  key={`${key}:${shown[key]}`}
                  defaultValue={Math.round(shown[key] * scale)}
                  onBlur={(e) => {
                    const raw = Number(e.currentTarget.value)
                    if (!Number.isFinite(raw) || e.currentTarget.value.trim() === '') return
                    const v = Math.min(max, Math.max(min, raw)) / scale
                    if (v !== shown[key]) change(key, v)
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  className="h-7 w-full rounded-md bg-surface-900 px-1.5 text-[12px] text-ink outline-none ring-1 ring-hairline"
                />
              </label>
            ))}
          </div>

          <div>
            <p className="mb-1 text-[11px] text-ink-subtle">Pistas</p>
            {soundTracks.length === 0 && <p className="text-[11px] text-ink-subtle">No hay pistas de video ni de audio.</p>}
            <div className="space-y-1">
              {soundTracks.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-ink" title={t.name}>{t.name}</span>
                  <div className="flex shrink-0 gap-0.5">
                    {ROLES.map(([role, label]) => {
                      const on = (t.role ?? 'none') === role
                      return (
                        <button
                          key={role}
                          onClick={() => useMontageStore.getState().setTrackRole(t.id, role === 'none' ? null : role)}
                          className={`h-6 rounded-md px-1.5 text-[11px] transition-colors ${on ? 'bg-surface-700 text-ink' : 'text-ink-muted hover:bg-surface-800'}`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] leading-snug text-ink-subtle">
            Las voces se detectan de los clips TTS / Voice Studio; corrige aquí qué pista es voz y cuál es fondo. Márgenes y más ajustes: menú de cada pista.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  )
}
