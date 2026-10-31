import { useEffect, useState } from 'react'
import { Check, ChevronDown, Download, LayoutTemplate, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useWorkspaceStore } from '../stores/workspace-store'
import { docDuration, useMontageStore } from '../stores/montage-store'
import { MediaBin } from '../components/montage/MediaBin'
import { MontagePreview } from '../components/montage/MontagePreview'
import { MontageTimeline } from '../components/montage/MontageTimeline'
import { useMontageShortcuts } from '../components/montage/shortcuts'

/** Minimal montage editor: media on the left, preview on top, one timeline below */
export function MontagePage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId)
  const loaded = useMontageStore((s) => s.loaded)

  useEffect(() => {
    useMontageStore.getState().load()
  }, [activeWorkspaceId])

  // Stop playback when leaving the page
  useEffect(() => () => useMontageStore.getState().pause(), [])

  useMontageShortcuts()

  return (
    <div className="relative z-10 flex h-full min-h-0 gap-3 p-3">
      <aside className="flex w-[300px] shrink-0 flex-col">
        <MontageTitle />
        <div className="min-h-0 flex-1">{loaded && <MediaBin />}</div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-3">
        <section className="min-h-0 flex-1 rounded-[14px] bg-surface-900/80 p-4">
          <MontagePreview />
        </section>
        <section className="h-[300px] shrink-0 overflow-hidden rounded-[14px] bg-surface-900/80">
          <MontageTimeline />
        </section>
      </main>
    </div>
  )
}

function MontageTitle() {
  const name = useMontageStore((s) => s.name)
  const montages = useMontageStore((s) => s.montages)
  const activeId = useMontageStore((s) => s.activeId)
  const { renameMontage, open, createMontage, deleteMontage } = useMontageStore.getState()
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [layouts, setLayouts] = useState<{ name: string; description: string; vertical: boolean }[]>([])

  // Layout presets for "Nuevo montaje desde plantilla" (built-in + saved)
  useEffect(() => {
    if (!menuOpen) return
    ;(window as any).electronAPI?.projects.layouts?.().then((l: any[]) => setLayouts(l ?? [])).catch(() => {})
  }, [menuOpen])

  const fromTemplate = async (layout: string) => {
    setMenuOpen(false)
    const res = await useMontageStore.getState().createFromLayout(layout)
    if (res.ok) toast.success('Montaje creado desde la plantilla', { description: `${layout} · el montaje actual no se modificó` })
    else toast.error('No se pudo crear el montaje', { description: res.error })
  }

  return (
    <div className="flex h-12 items-center gap-1 px-2 pb-1">
      {editing ? (
        <input
          autoFocus
          defaultValue={name}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => { renameMontage(e.currentTarget.value); setEditing(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="h-8 min-w-0 flex-1 rounded-md bg-surface-900 px-2 text-[17px] text-ink outline-none ring-1 ring-hairline"
        />
      ) : (
        <>
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <button className="flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-left transition-colors hover:bg-surface-800">
                <span className="truncate text-[17px] font-emphasis text-ink">{name || 'Montaje'}</span>
                <ChevronDown size={14} className="shrink-0 text-ink-subtle" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-1">
              <div className="max-h-72 overflow-y-auto">
                {montages.map((m) => (
                  <div key={m.id} className="group flex items-center rounded-md hover:bg-surface-800">
                    <button
                      onClick={() => { open(m.id); setMenuOpen(false) }}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[12.5px] text-ink"
                    >
                      <Check size={13} className={m.id === activeId ? 'text-ink' : 'invisible'} />
                      <span className="truncate">{m.name}</span>
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`¿Eliminar "${m.name}"? Los medios de la biblioteca no se borran.`)) deleteMontage(m.id)
                      }}
                      title="Eliminar montaje"
                      className="mr-1 flex h-6 w-6 items-center justify-center rounded text-ink-subtle opacity-0 hover:text-ink group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="my-1 h-px bg-hairline" />
              <button
                onClick={() => { createMontage(); setMenuOpen(false) }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-surface-800"
              >
                <Plus size={13} /> Nuevo montaje
              </button>
              {layouts.length > 0 && (
                <>
                  <p className="px-2 pb-0.5 pt-1.5 text-[10.5px] text-ink-subtle">Nuevo montaje desde plantilla</p>
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
                </>
              )}
            </PopoverContent>
          </Popover>
          <button
            onClick={() => setEditing(true)}
            title="Renombrar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-800 hover:text-ink"
          >
            <Pencil size={13} />
          </button>
          <ExportButton />
        </>
      )}
    </div>
  )
}

/** Renders the active montage to MP4 (save dialog in main); click again while running to cancel */
function ExportButton() {
  const activeId = useMontageStore((s) => s.activeId)
  const empty = useMontageStore((s) => docDuration(s.doc) <= 0)
  const [progress, setProgress] = useState<number | null>(null)

  useEffect(() => {
    if (!activeId) return
    const api = (window as any).electronAPI
    // Exports started by an agent (MCP timeline_export) report here too
    const offs = [
      api?.on('export:progress', (p: { projectId: string; percent: number }) => {
        if (p.projectId === activeId) setProgress(p.percent)
      }),
      api?.on('export:complete', (p: { projectId: string }) => { if (p.projectId === activeId) setProgress(null) }),
      api?.on('export:error', (p: { projectId: string }) => { if (p.projectId === activeId) setProgress(null) }),
    ]
    return () => offs.forEach((off) => off?.())
  }, [activeId])

  const run = async () => {
    const api = (window as any).electronAPI
    if (progress !== null) {
      api?.projects.cancelExport()
      return
    }
    const { activeId: id } = useMontageStore.getState()
    if (!id || !api) return
    useMontageStore.getState().pause()
    // The store saves on a debounce; export reads the project row, so persist the latest doc first
    await useMontageStore.getState().saveNow()
    setProgress(0)
    try {
      const res = await api.projects.export(id)
      if (res?.ok) toast.success('Montaje exportado', { description: res.path })
      else if (!res?.canceled) toast.error('No se pudo exportar', { description: res?.error })
    } finally {
      setProgress(null)
    }
  }

  const busy = progress !== null
  return (
    <button
      onClick={run}
      disabled={!busy && (empty || !activeId)}
      title={busy ? 'Cancelar exportación' : 'Exportar MP4'}
      className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-surface-800 px-2.5 text-[12px] text-ink transition-colors hover:bg-surface-700 disabled:opacity-40 disabled:hover:bg-surface-800"
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      {busy ? `${Math.round(progress)}%` : 'Exportar'}
    </button>
  )
}
