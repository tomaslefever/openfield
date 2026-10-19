import { useMemo, useState, useEffect } from 'react'
import { Check, X, RotateCcw, Image, Video, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import {
  usePromptLibraryStore,
  type ReviewStatus,
  type PromptReview,
  type PromptTaxonomy,
  type BuiltinReference,
} from '../../stores/prompt-library-store'
import { fileUrl } from '../../services/file-url'
import { PromptReferenceViewer } from './PromptReferenceViewer'
import { builtinViewerImages, userViewerImages, type ViewerImage } from '../../lib/prompt-references'

/** One prompt as the review list shows it (built-in template or own prompt) */
interface ReviewItem {
  id: string
  source: 'openfield' | 'mine'
  name: string
  kind: 'image' | 'video'
  description: string
  prompt: string
  models: string[]
  types: string[]
  review: PromptReview
  thumb?: string
  /** Every reference, full size, for the viewer */
  viewer: ViewerImage[]
  references: BuiltinReference[]
  sources: { title: string; url: string }[]
}

const STATUS_LABEL: Record<ReviewStatus | 'all', string> = {
  pending: 'Pendientes',
  approved: 'Aprobados',
  rejected: 'Descartados',
  all: 'Todos',
}

/** Image or video: the first thing to know about a prompt */
export function KindChip({ kind }: { kind: 'image' | 'video' }) {
  return kind === 'video' ? (
    <span className="text-[9px] px-1.5 py-0.5 rounded-pill font-semibold flex items-center gap-1 bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
      <Video size={9} /> Video
    </span>
  ) : (
    <span className="text-[9px] px-1.5 py-0.5 rounded-pill font-semibold flex items-center gap-1 bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30">
      <Image size={9} /> Imagen
    </span>
  )
}

export function TagChips({ kind, models, types, taxonomy }: { kind?: 'image' | 'video'; models: string[]; types: string[]; taxonomy: PromptTaxonomy | null }) {
  if (!kind && !models.length && !types.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {kind && <KindChip kind={kind} />}
      {types.map(t => (
        <span key={`t-${t}`} className="text-[9px] px-1.5 py-0.5 rounded-pill bg-accent-500/10 text-accent-400 border border-accent-500/20">
          {taxonomy?.types[t] || t}
        </span>
      ))}
      {models.map(m => (
        <span key={`m-${m}`} className="text-[9px] px-1.5 py-0.5 rounded-pill bg-surface-800 text-surface-400 border border-surface-700">
          {taxonomy?.models[m]?.label || m}
        </span>
      ))}
    </div>
  )
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  if (status === 'pending') return null
  return status === 'approved'
    ? <span className="text-[9px] px-1.5 py-0.5 rounded-pill bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30 flex items-center gap-0.5"><Check size={9} /> Aprobado</span>
    : <span className="text-[9px] px-1.5 py-0.5 rounded-pill bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 flex items-center gap-0.5"><X size={9} /> Descartado</span>
}

function ReviewRow({ item, taxonomy }: { item: ReviewItem; taxonomy: PromptTaxonomy | null }) {
  const setReview = usePromptLibraryStore(s => s.setReview)
  const [note, setNote] = useState(item.review.note)
  const [open, setOpen] = useState(false)
  const [viewing, setViewing] = useState(false)
  useEffect(() => { setNote(item.review.note) }, [item.review.note])

  const status = item.review.status
  const btn = (target: ReviewStatus, label: string, icon: React.ReactNode, active: string) => (
    <button
      onClick={() => setReview(item.id, target, note)}
      className={`text-[10px] px-2 py-1 rounded-pill flex items-center gap-1 border transition-all ${status === target ? active : 'bg-surface-800 text-surface-400 border-surface-700 hover:text-surface-200'}`}
    >
      {icon} {label}
    </button>
  )

  return (
    <div className="card p-3 flex gap-3">
      <div className="w-28 h-28 flex-shrink-0 rounded-lg overflow-hidden bg-surface-800 border border-surface-700 flex items-center justify-center relative">
        {item.thumb ? (
          <button onClick={() => setViewing(true)} className="w-full h-full cursor-zoom-in" title="Ver referencia">
            <img src={item.thumb} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" loading="lazy" />
            {item.viewer.length > 1 && (
              <span className="absolute bottom-1 right-1 text-[9px] px-1 rounded bg-black/60 text-white/90">{item.viewer.length}</span>
            )}
          </button>
        ) : (
          <span className="flex flex-col items-center gap-1 text-[9px] text-surface-600">
            {item.kind === 'video' ? <Video size={20} /> : <Image size={20} />}
            Sin referencia
          </span>
        )}
      </div>
      {viewing && <PromptReferenceViewer title={item.name} images={item.viewer} onClose={() => setViewing(false)} />}

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-surface-100">{item.name}</p>
          <span className="text-[9px] px-1.5 py-0.5 rounded-pill bg-surface-800 text-surface-500 border border-surface-700">
            {item.source === 'openfield' ? 'Openfield' : 'Mío'}
          </span>
          <ReviewBadge status={status} />
        </div>
        <p className="text-xs text-surface-400 leading-relaxed">{item.description}</p>
        <TagChips kind={item.kind} models={item.models} types={item.types} taxonomy={taxonomy} />

        <button onClick={() => setOpen(v => !v)} className="text-[10px] text-accent-400 hover:text-accent-300 flex items-center gap-1 self-start">
          {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />} {open ? 'Ocultar prompt' : 'Ver prompt'}
        </button>
        {open && (
          <div className="text-[11px] text-surface-300 leading-relaxed bg-surface-800/60 border border-surface-700 rounded-lg px-3 py-2 whitespace-pre-wrap">
            {item.prompt}
          </div>
        )}

        {(item.sources.length > 0 || item.references.some(r => r.credit)) && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-surface-500">
            {item.sources.map(s => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="hover:text-accent-400 flex items-center gap-0.5">
                <ExternalLink size={9} /> {s.title}
              </a>
            ))}
            {item.references.filter(r => r.credit).map(r => (
              <a key={r.name} href={r.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-accent-400">
                Ref.: {r.credit}{r.date ? ` · ${r.date}` : ''}{r.license ? ` (${r.license})` : ''}
              </a>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {btn('approved', 'Aprobar', <Check size={10} />, 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/40')}
          {btn('rejected', 'Descartar', <X size={10} />, 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40')}
          {status !== 'pending' && btn('pending', 'Pendiente', <RotateCcw size={10} />, '')}
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={() => { if (note !== item.review.note) setReview(item.id, status, note) }}
            placeholder="Nota para el equipo y los agentes (opcional)"
            className="input-field text-[11px] flex-1 min-w-[180px] py-1"
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Review section of the Prompt Library: every prompt (Openfield templates and the user's own)
 * with its visual reference, model/type tags and sources, to approve or reject. Agents over MCP
 * rank approved prompts first and never see rejected ones; notes travel with the prompt.
 */
export function PromptLibraryReview({ search, kindFilter }: { search: string; kindFilter: 'all' | 'image' | 'video' }) {
  const { builtins, entries, taxonomy } = usePromptLibraryStore()
  const [status, setStatus] = useState<ReviewStatus | 'all'>('pending')
  const [source, setSource] = useState<'all' | 'openfield' | 'mine'>('all')
  const [model, setModel] = useState('')
  const [type, setType] = useState('')

  const items = useMemo<ReviewItem[]>(() => [
    ...builtins.map(b => {
      const img = b.references.find(r => r.type === 'image' && (r.path || r.url))
      return {
        id: b.id, source: 'openfield' as const, name: b.name, kind: b.kind, description: b.description, prompt: b.prompt,
        models: b.models, types: b.types, review: b.review, references: b.references, sources: b.sources,
        thumb: img?.path ? fileUrl(img.path, { thumb: true }) : img?.url,
        viewer: builtinViewerImages(b.references),
      }
    }),
    ...entries.map(e => {
      const img = e.references.find(r => r.type === 'image')
      return {
        id: e.id, source: 'mine' as const, name: e.name, kind: e.kind, description: e.description || '', prompt: e.prompt,
        models: e.models || [], types: e.types || [], review: e.review || { status: 'pending' as const, note: '' },
        references: [], sources: [],
        thumb: img ? `data:${img.mime};base64,${img.base64}` : undefined,
        viewer: userViewerImages(e.references),
      }
    }),
  ], [builtins, entries])

  const base = useMemo(() => {
    const q = search.toLowerCase()
    return items.filter(i =>
      (kindFilter === 'all' || i.kind === kindFilter) &&
      (source === 'all' || i.source === source) &&
      (!model || i.models.includes(model)) &&
      (!type || i.types.includes(type)) &&
      (!q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.prompt.toLowerCase().includes(q))
    )
  }, [items, search, kindFilter, source, model, type])

  const counts = useMemo(() => ({
    pending: base.filter(i => i.review.status === 'pending').length,
    approved: base.filter(i => i.review.status === 'approved').length,
    rejected: base.filter(i => i.review.status === 'rejected').length,
    all: base.length,
  }), [base])

  const visible = status === 'all' ? base : base.filter(i => i.review.status === status)

  return (
    <div className="max-w-5xl mx-auto">
      <p className="text-[11px] text-surface-500 mb-3">
        Revisa los prompts que usan los agentes. Los <b>aprobados</b> se priorizan en las búsquedas por MCP, los <b>descartados</b> dejan de aparecer y la nota viaja con el prompt.
      </p>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        {(['pending', 'approved', 'rejected', 'all'] as const).map(k => (
          <button key={k} onClick={() => setStatus(k)}
            className={`text-[10px] px-2 py-1 rounded-pill transition-all ${status === k ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30' : 'bg-surface-800 text-surface-500 border border-surface-700 hover:text-surface-300'}`}>
            {STATUS_LABEL[k]} · {counts[k]}
          </button>
        ))}
        <select value={source} onChange={e => setSource(e.target.value as any)} className="input-field text-[11px] py-1 w-auto ml-auto">
          <option value="all">Todas las fuentes</option>
          <option value="openfield">Openfield</option>
          <option value="mine">Mis prompts</option>
        </select>
        <select value={model} onChange={e => setModel(e.target.value)} className="input-field text-[11px] py-1 w-auto">
          <option value="">Todos los modelos</option>
          {Object.entries(taxonomy?.models || {}).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)} className="input-field text-[11px] py-1 w-auto">
          <option value="">Todos los tipos</option>
          {Object.entries(taxonomy?.types || {}).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-surface-600 text-center py-20">
          {status === 'pending' ? 'No queda nada pendiente de revisión' : 'Sin resultados'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map(item => <ReviewRow key={item.id} item={item} taxonomy={taxonomy} />)}
        </div>
      )}
    </div>
  )
}
