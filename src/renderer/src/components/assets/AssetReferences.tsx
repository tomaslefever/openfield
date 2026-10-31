import { useEffect, useState } from 'react'
import { AudioLines, ImageOff, Play } from 'lucide-react'
import { srcUrl, thumbUrl } from '../../services/file-url'

export type RefKind = 'image' | 'video' | 'audio'

export interface ResolvedRef {
  key: string
  label: string
  kind: RefKind
  /** Local path, URL or data URI; null when the reference can no longer be found */
  src: string | null
  /** Library asset backing the reference, when it was stored by ID */
  assetId?: string
}

export interface RawRef {
  label: string
  kind: RefKind
  assetId?: string
  src?: string
}

const KIND_LABEL: Record<RefKind, string> = { image: 'Imagen', video: 'Video', audio: 'Audio' }

function inlineSrc(r: any, kind: RefKind): string | undefined {
  if (!r || typeof r !== 'object') return undefined
  if (typeof r.localPath === 'string' && r.localPath) return r.localPath
  if (typeof r.url === 'string' && r.url) return r.url
  if (typeof r.base64 === 'string' && r.base64.length > 50) {
    if (r.base64.startsWith('data:')) return r.base64
    const mime = r.mime || (kind === 'image' ? 'image/png' : kind === 'video' ? 'video/mp4' : 'audio/mpeg')
    return `data:${mime};base64,${r.base64}`
  }
  return undefined
}

/** Every input media a generation used, read from its stored parameters (deduplicated) */
export function collectReferences(params: any): RawRef[] {
  if (!params || typeof params !== 'object') return []
  const out: RawRef[] = []
  const seen = new Set<string>()
  const push = (ref: RawRef) => {
    const id = ref.assetId || ref.src
    if (!id || seen.has(id)) return
    seen.add(id)
    out.push(ref)
  }
  const single = (assetKey: string, b64Key: string, urlKey: string, label: string, kind: RefKind, mimeKey?: string) => {
    const b64 = params[b64Key]
    push({
      label, kind,
      assetId: params[assetKey] || undefined,
      src: params[urlKey] || (typeof b64 === 'string' && b64.length > 50 ? inlineSrc({ base64: b64, mime: mimeKey ? params[mimeKey] : undefined }, kind) : undefined),
    })
  }
  const list = (refs: any, kind: RefKind, labelFor: (r: any, i: number, n: number) => string) => {
    if (!Array.isArray(refs)) return
    refs.forEach((r, i) => {
      if (!r || typeof r !== 'object') return
      push({ label: labelFor(r, i, refs.length), kind, assetId: r.assetId || undefined, src: inlineSrc(r, kind) })
    })
  }
  const numbered = (kind: RefKind) => (_r: any, i: number, n: number) => n > 1 ? `${KIND_LABEL[kind]} ${i + 1}` : KIND_LABEL[kind]

  single('firstFrameAssetId', 'firstFrameBase64', 'firstFrameUrl', 'Primer frame', 'image')
  single('lastFrameAssetId', 'lastFrameBase64', 'lastFrameUrl', 'Último frame', 'image')
  single('imageAssetId', 'imageBase64', 'imageUrl', 'Imagen', 'image', 'imageMime')
  list(params.imageRefs, 'image', (r, i, n) => r.name === 'first_frame' ? 'Primer frame' : numbered('image')(r, i, n))
  list(params.imageRefEntries, 'image', (r, i, n) => r.type === 'subject' ? 'Sujeto' : r.type === 'background' ? 'Fondo' : numbered('image')(r, i, n))
  list(params.videoRefs, 'video', numbered('video'))
  single('audioAssetId', 'audioBase64', 'audioUrl', 'Audio', 'audio', 'audioMime')
  list(params.audioRefs, 'audio', numbered('audio'))
  return out
}

/** Resolves stored references (asset IDs → files on disk) for display */
function useResolvedReferences(params: any, assetId: string): ResolvedRef[] {
  const [refs, setRefs] = useState<ResolvedRef[]>([])
  const signature = JSON.stringify(collectReferences(params).map(r => [r.label, r.kind, r.assetId, r.src?.slice(0, 200)]))

  useEffect(() => {
    let cancelled = false
    const raw = collectReferences(params)
    if (raw.length === 0) { setRefs([]); return }
    const api = (window as any).electronAPI
    Promise.all(raw.map(async (r, i): Promise<ResolvedRef> => {
      let src = r.src || null
      if (r.assetId) {
        try {
          const a = await api?.assets.get(r.assetId)
          const p = a?.localPath || (a?.filePath && !a.filePath.startsWith('__error__') ? a.filePath : null)
          if (p) src = p
        } catch {}
      }
      return { key: `${i}-${r.assetId || r.src?.slice(0, 64)}`, label: r.label, kind: r.kind, src, assetId: r.assetId }
    })).then(res => { if (!cancelled) setRefs(res) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, signature])

  return refs
}

/** Thumbnail strip of the references used; clicking one previews it on the media stage */
export function AssetReferences({ params, assetId, activeKey, onSelect }: {
  params: any
  assetId: string
  activeKey?: string | null
  onSelect: (ref: ResolvedRef) => void
}) {
  const refs = useResolvedReferences(params, assetId)
  if (refs.length === 0) return null
  return (
    <section className="pt-4 border-t border-hairline-soft">
      <p className="eyebrow mb-1.5">Referencias <span className="tabular-nums text-ink-subtle">· {refs.length}</span></p>
      <ul className="grid grid-cols-4 gap-2">
        {refs.map(ref => {
          const active = activeKey === ref.key
          return (
            <li key={ref.key} className="min-w-0">
              <button
                type="button"
                disabled={!ref.src}
                onClick={() => ref.src && onSelect(ref)}
                title={ref.src ? `Ver ${ref.label.toLowerCase()}` : `${ref.label} — ya no está disponible`}
                aria-label={ref.src ? `Ver referencia: ${ref.label}` : `${ref.label} no disponible`}
                aria-pressed={active}
                className={`relative w-full aspect-square rounded-lg overflow-hidden bg-surface-soft border transition-colors flex items-center justify-center ${active ? 'border-ink ring-1 ring-ink' : 'border-hairline hover:border-ink-subtle'} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {!ref.src ? (
                  <ImageOff size={16} className="text-ink-subtle" />
                ) : ref.kind === 'image' ? (
                  <img src={thumbUrl(ref.src)} alt={ref.label} className="w-full h-full object-cover" draggable={false} loading="lazy" />
                ) : ref.kind === 'video' ? (
                  <>
                    <video src={srcUrl(ref.src)} muted preload="metadata" className="w-full h-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="size-6 rounded-full bg-black/55 flex items-center justify-center text-white"><Play size={11} fill="currentColor" /></span>
                    </span>
                  </>
                ) : (
                  <AudioLines size={18} className="text-ink-muted" />
                )}
              </button>
              <p className="mt-1 text-meta text-ink-muted truncate text-center">{ref.label}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
