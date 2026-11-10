import { useEffect, useMemo, useState } from 'react'
import { GalleryHorizontalEnd, LayoutTemplate, Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMontageStore, type MontageSummary } from '../../stores/montage-store'
import { posterUrl, thumbUrl } from '../../services/file-url'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { IconAction } from '../ui/icon-action'
import { formatClock } from './time'

const ASPECTS: [number, string][] = [[16 / 9, '16:9'], [9 / 16, '9:16'], [1, '1:1'], [4 / 5, '4:5'], [4 / 3, '4:3'], [21 / 9, '21:9']]

function aspectLabel(aspect?: number) {
  if (!aspect) return '16:9'
  const hit = ASPECTS.find(([v]) => Math.abs(v - aspect) < 0.02)
  return hit ? hit[1] : aspect.toFixed(2)
}

/** Landing view of the Timeline page: every timeline in the workspace as a storyboard-like card */
export function TimelineGallery() {
  const montages = useMontageStore((s) => s.montages)
  const activeId = useMontageStore((s) => s.activeId)
  const { edit, createMontage, deleteMontage } = useMontageStore.getState()
  const [query, setQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<MontageSummary | null>(null)
  const [creating, setCreating] = useState(false)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? montages.filter((m) => m.name.toLowerCase().includes(q)) : montages
  }, [montages, query])

  const create = async () => {
    setCreating(true)
    try { await createMontage() } finally { setCreating(false) }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-title-lg text-ink">Timelines</h1>
            <p className="mt-1 text-meta text-ink-subtle">
              {montages.length > 0
                ? `${montages.length} ${montages.length === 1 ? 'timeline' : 'timelines'} en este workspace`
                : 'Monta clips, voces, música y subtítulos en una línea de tiempo'}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <TemplateMenu />
            <button onClick={create} disabled={creating} className="btn-primary flex items-center gap-1.5">
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Nuevo timeline
            </button>
          </div>
        </div>

        {montages.length > 6 && (
          <div className="relative mb-8 max-w-sm">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar timeline"
              className="h-9 w-full rounded-pill border border-hairline bg-surface-soft pl-9 pr-8 text-body text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent-500"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink" title="Limpiar">
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {montages.length === 0 ? (
          <div className="block-lilac max-w-3xl rounded-block p-10 sm:p-14">
            <p className="eyebrow !text-current opacity-70">Empieza aquí</p>
            <h2 className="mt-2 text-[26px] font-strong leading-snug tracking-tight">Crea tu primer timeline</h2>
            <p className="mt-2 max-w-md text-body opacity-80">Arrastra videos, imágenes y audio de tu biblioteca, ajusta el corte y exporta un MP4.</p>
            <button onClick={create} className="btn-primary mt-6 flex items-center gap-1.5">
              <Plus size={14} /> Nuevo timeline
            </button>
          </div>
        ) : shown.length === 0 ? (
          <p className="py-20 text-center text-body text-ink">Ningún timeline coincide con «{query}»</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((m) => (
              <TimelineCard key={m.id} m={m} open={m.id === activeId} onOpen={() => edit(m.id)} onDelete={() => setConfirmDelete(m)} />
            ))}
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`¿Eliminar "${confirmDelete.name}"?`}
          description="Se borra el timeline. Los videos, imágenes y audios siguen en tu biblioteca."
          confirmLabel="Eliminar"
          danger
          onConfirm={() => deleteMontage(confirmDelete.id)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

function TimelineCard({ m, open, onOpen, onDelete }: { m: MontageSummary; open: boolean; onOpen: () => void; onDelete: () => void }) {
  const frames = m.frames ?? []
  const date = m.updatedAt ? new Date(m.updatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : ''
  const clips = m.clipCount ?? 0

  return (
    <div className="group relative">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-hairline bg-surface-soft transition-colors group-hover:border-surface-600">
          {frames.length > 0 ? (
            <div className="grid h-full gap-px bg-canvas" style={{ gridTemplateColumns: `repeat(${frames.length}, minmax(0, 1fr))` }}>
              {frames.map((f, i) => (
                <img
                  key={i}
                  src={f.kind === 'video' ? posterUrl(f.src) : thumbUrl(f.src)}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                  className="h-full w-full bg-surface-800 object-cover"
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink-subtle">
              <GalleryHorizontalEnd size={28} strokeWidth={1.25} />
            </div>
          )}
          <span className="absolute bottom-2 left-2 inline-flex h-6 items-center rounded-pill bg-canvas/90 px-2 font-mono text-eyebrow uppercase text-ink">
            {formatClock(m.duration ?? 0, false)} · {aspectLabel(m.aspect)}
          </span>
        </div>
        <div className="mt-2.5 px-0.5">
          <p className="truncate text-body font-emphasis text-ink">{m.name}</p>
          <p className="truncate text-meta text-ink-subtle">
            {clips} {clips === 1 ? 'clip' : 'clips'}{date ? ` · ${date}` : ''}
          </p>
        </div>
      </button>
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <IconAction icon={Trash2} title="Eliminar" overlay danger onClick={onDelete} />
      </div>
    </div>
  )
}

/** Built-in and saved layout presets ("Nuevo montaje desde plantilla") */
function TemplateMenu() {
  const [open, setOpen] = useState(false)
  const [layouts, setLayouts] = useState<{ name: string; description: string; vertical: boolean }[]>([])

  useEffect(() => {
    ;(window as any).electronAPI?.projects.layouts?.().then((l: any[]) => setLayouts(l ?? [])).catch(() => {})
  }, [])

  if (layouts.length === 0) return null

  const fromTemplate = async (layout: string) => {
    setOpen(false)
    const res = await useMontageStore.getState().createFromLayout(layout)
    if (!res.ok) toast.error('No se pudo crear el timeline', { description: res.error })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="btn-ghost flex items-center gap-1.5" title="Nuevo timeline desde plantilla">
          <LayoutTemplate size={14} /> Plantillas
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        {layouts.map((l) => (
          <button
            key={l.name}
            onClick={() => fromTemplate(l.name)}
            title={l.description}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-surface-800"
          >
            <LayoutTemplate size={13} className="shrink-0 text-ink-muted" />
            <span className="truncate">{l.name}</span>
            <span className="ml-auto shrink-0 text-[10.5px] text-ink-subtle">{l.vertical ? '9:16' : '16:9'}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
