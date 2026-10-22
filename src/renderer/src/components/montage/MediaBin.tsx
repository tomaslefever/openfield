import { useCallback, useEffect, useState } from 'react'
import { AudioLines, Image as ImageIcon, Plus, Search, Upload, Video } from 'lucide-react'
import { posterUrl, thumbUrl } from '../../services/file-url'
import { toMontageAsset, useMontageStore, type MontageAsset } from '../../stores/montage-store'
import { formatClock } from './time'

export const ASSET_MIME = 'application/x-montage-asset'

type Tab = 'media' | 'audio'

/** Workspace library, filtered to what can go on the timeline */
export function MediaBin() {
  const addAsset = useMontageStore((s) => s.addAsset)
  const addCaption = useMontageStore((s) => s.addCaption)
  const [assets, setAssets] = useState<MontageAsset[]>([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('media')

  const load = useCallback(async () => {
    const res = await (window as any).electronAPI?.assets.list({
      types: tab === 'audio' ? ['audio'] : ['video', 'image'],
      search: query || undefined,
      limit: 200,
    })
    const rows: any[] = Array.isArray(res?.assets) ? res.assets : []
    setAssets(rows.map(toMontageAsset).filter((a): a is MontageAsset => a !== null))
  }, [tab, query])

  useEffect(() => {
    const t = setTimeout(load, query ? 200 : 0)
    return () => clearTimeout(t)
  }, [load, query])

  useEffect(() => (window as any).electronAPI?.on?.('assets:changed', () => load()), [load])

  const importFiles = async () => {
    await (window as any).electronAPI?.assets.importFromDialog()
    load()
  }

  const chip = (active: boolean) =>
    `rounded-pill px-3 py-1.5 text-[12.5px] transition-colors ${
      active ? 'bg-surface-700 text-ink' : 'text-ink-muted shadow-[inset_0_0_0_1px_rgb(var(--hairline))] hover:text-ink'
    }`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        <button className={chip(tab === 'media')} onClick={() => setTab('media')}>Medios</button>
        <button className={chip(false)} onClick={() => addCaption()} title="Añade un subtítulo en el cursor (T)">Añadir texto</button>
        <button className={chip(tab === 'audio')} onClick={() => setTab('audio')}>Audio</button>
      </div>

      <div className="flex items-center gap-1.5 px-4 pb-3">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-surface-900 px-2.5">
          <Search size={12} className="shrink-0 text-ink-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-subtle"
          />
        </label>
        <button
          onClick={importFiles}
          title="Importar archivos"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-800 hover:text-ink"
        >
          <Upload size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {assets.length === 0 ? (
          <p className="px-1 pt-6 text-center text-xs text-ink-subtle">
            {tab === 'audio' ? 'Sin audios en este workspace.' : 'Sin medios en este workspace.'} Importa archivos o genera en el Playground.
          </p>
        ) : tab === 'audio' ? (
          <div className="flex flex-col gap-1">
            {assets.map((a) => (
              <AudioItem key={a.id} asset={a} onAdd={() => addAsset(a)} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {assets.map((a) => (
              <MediaItem key={a.id} asset={a} onAdd={() => addAsset(a)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const dragProps = (asset: MontageAsset, onAdd: () => void) => ({
  draggable: true,
  onDragStart: (e: React.DragEvent) => {
    e.dataTransfer.setData(ASSET_MIME, JSON.stringify(asset))
    e.dataTransfer.effectAllowed = 'copy'
  },
  onDoubleClick: onAdd,
  title: `${asset.name} — arrastra al timeline o doble clic para añadir`,
})

function AddButton({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      title="Añadir en el cursor"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
    >
      <Plus size={13} />
    </button>
  )
}

function MediaItem({ asset, onAdd }: { asset: MontageAsset; onAdd: () => void }) {
  const isVideo = asset.type === 'video'
  const remote = /^https?:/.test(asset.path)
  const thumb = isVideo ? posterUrl(asset.path) : thumbUrl(asset.path)
  const TypeIcon = isVideo ? Video : ImageIcon
  return (
    <div {...dragProps(asset, onAdd)} className="group relative aspect-[3/4] cursor-grab overflow-hidden rounded-[6px] bg-surface-900 active:cursor-grabbing">
      {isVideo && remote ? (
        <video src={`${asset.path}#t=0.1`} muted preload="metadata" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
      ) : (
        <img src={thumb} alt="" draggable={false} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <TypeIcon size={13} className="absolute left-1.5 top-1.5 text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)]" />
      <div className="absolute right-1 top-1">
        <AddButton onAdd={onAdd} />
      </div>
      {isVideo && asset.duration ? (
        <span className="absolute bottom-1 right-1 rounded-[4px] bg-black/60 px-1 font-mono text-[10px] text-white">
          {formatClock(asset.duration, false)}
        </span>
      ) : null}
    </div>
  )
}

function AudioItem({ asset, onAdd }: { asset: MontageAsset; onAdd: () => void }) {
  return (
    <div
      {...dragProps(asset, onAdd)}
      className="group flex cursor-grab items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-surface-900 active:cursor-grabbing"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-600 text-white">
        <AudioLines size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-ink">{asset.name}</span>
        {asset.duration ? <span className="block font-mono text-[10.5px] text-ink-subtle">{formatClock(asset.duration, false)}</span> : null}
      </span>
      <span className="[&>button]:bg-surface-700 [&>button]:text-ink">
        <AddButton onAdd={onAdd} />
      </span>
    </div>
  )
}
