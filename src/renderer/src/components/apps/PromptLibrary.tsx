import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { Plus, Trash2, X, Upload, Image, Video, Search, Copy, Check, FileText, Sparkles, Library, Save, Maximize2 } from 'lucide-react'
import { usePromptLibraryStore, type PromptEntry, type PromptReference, type BuiltinTemplate } from '../../stores/prompt-library-store'
import { useAppStore } from '../../stores/app-store'
import { ImageLibraryPicker } from '../ImageLibraryPicker'
import { PromptLibraryReview, TagChips, ReviewBadge } from './PromptLibraryReview'
import { fileUrl } from '../../services/file-url'
import { PromptReferenceViewer } from './PromptReferenceViewer'
import { builtinViewerImages } from '../../lib/prompt-references'

function PromptCard({
  entry,
  onDelete,
  onAddFile,
  onRemoveRef,
  onUpdate,
}: {
  entry: PromptEntry
  onDelete: (id: string) => void
  onAddFile: (file: File, id: string) => void
  onRemoveRef: (entryId: string, refId: string) => void
  onUpdate: (id: string, updates: Partial<PromptEntry>) => void
}) {
  const [modal, setModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [draftName, setDraftName] = useState(entry.name)
  const [draftPrompt, setDraftPrompt] = useState(entry.prompt)
  const [draftKind, setDraftKind] = useState(entry.kind)
  const [draftTags, setDraftTags] = useState(entry.tags.join(', '))
  const [draftDescription, setDraftDescription] = useState(entry.description || '')
  const [draftRefs, setDraftRefs] = useState<PromptReference[]>(entry.references)
  const fileRef = useRef<HTMLInputElement>(null)
  const firstRef = entry.references[0]
  const setPage = useAppStore(s => s.setPage)
  const setComposerPayload = useAppStore(s => s.setComposerPayload)

  // Sync drafts when the modal opens (or the entry changes externally)
  useEffect(() => {
    if (!modal) return
    setDraftName(entry.name)
    setDraftPrompt(entry.prompt)
    setDraftKind(entry.kind)
    setDraftTags(entry.tags.join(', '))
    setDraftDescription(entry.description || '')
    setDraftRefs(entry.references)
  }, [modal, entry])

  const stageFileAsRef = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return
    const reader = new FileReader()
    const ref: PromptReference = await new Promise((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string
        resolve({
          id: crypto.randomUUID(),
          base64: result.split(',')[1],
          mime: file.type,
          type: file.type.startsWith('video/') ? 'video' : 'image',
          name: file.name,
        })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    setDraftRefs(prev => [...prev, ref])
  }, [])

  // Paste an image from the clipboard while the modal is open
  useEffect(() => {
    if (!modal) return
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as Node | null
      if (target && (target as HTMLElement).closest?.('input, textarea, [contenteditable="true"]')) return
      const items = e.clipboardData?.items
      if (!items) return
      const imageItem = Array.from(items).find(it => it.type.startsWith('image/'))
      if (!imageItem) return
      const file = imageItem.getAsFile()
      if (!file) return
      e.preventDefault()
      stageFileAsRef(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [modal, stageFileAsRef])

  const refsEqual =
    draftRefs.length === entry.references.length &&
    draftRefs.every((r, i) => r.id === entry.references[i].id)
  const dirty =
    draftPrompt.trim() !== entry.prompt ||
    draftName.trim() !== entry.name ||
    draftKind !== entry.kind ||
    draftTags.trim() !== entry.tags.join(', ') ||
    draftDescription.trim() !== (entry.description || '') ||
    !refsEqual

  const handleSave = () => {
    onUpdate(entry.id, {
      name: draftName.trim() || entry.name,
      prompt: draftPrompt.trim(),
      kind: draftKind,
      tags: draftTags.split(',').map(t => t.trim()).filter(Boolean),
      description: draftDescription.trim(),
      references: draftRefs,
    })
  }

  const handleGenerate = () => {
    const refs = draftRefs.map(r => ({
      base64: r.base64,
      mime: r.mime,
      name: r.name,
      refType: 'prompt_library' as const,
    }))
    setComposerPayload({
      prompt: draftPrompt.trim(),
      mode: draftKind,
      aspectRatio: refs.length > 0 ? 'auto' : '3:4',
      resolution: '1K',
      imageRefs: refs.length > 0 ? refs : undefined,
    })
    setPage(draftKind === 'video' ? 'video' : 'image')
    setModal(false)
  }

  const handleLibrarySelect = async (assetOrAssets: any | any[]) => {
    setShowPicker(false)
    const assets = Array.isArray(assetOrAssets) ? assetOrAssets : [assetOrAssets]
    if (assets.length === 0) return
    const api = (window as any).electronAPI
    const res = await api?.assets.readBase64(assets.map((a: any) => a.id))
    if (!Array.isArray(res)) return
    const newRefs: PromptReference[] = []
    for (let i = 0; i < res.length; i++) {
      const r = res[i]
      if (!r?.base64) continue
      const a = assets[i]
      newRefs.push({
        id: crypto.randomUUID(),
        base64: r.base64,
        mime: r.mime || (a?.type === 'video' ? 'video/mp4' : 'image/png'),
        type: (a?.type === 'video' ? 'video' : 'image') as 'image' | 'video',
        name: a?.fileName || a?.file_name || a?.prompt || 'library asset',
      })
    }
    if (newRefs.length > 0) {
      setDraftRefs(prev => [...prev, ...newRefs])
    }
  }

  const draftFirstRef = draftRefs[0]

  return (
    <>
      {/* Card */}
      <div
        className="card group relative overflow-hidden p-0 cursor-pointer hover:border-accent-500/40 transition-colors"
        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 280px' }}
        onClick={() => setModal(true)}
        onDragOver={(e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          Array.from(e.dataTransfer?.files || []).forEach(f => onAddFile(f, entry.id))
        }}
      >
        <div className="aspect-[4/3] bg-surface-800 flex items-center justify-center overflow-hidden relative">
          {firstRef ? (
            firstRef.type === 'image' ? (
              <img
                src={`data:${firstRef.mime};base64,${firstRef.base64}`}
                alt={entry.name}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <video
                src={`data:${firstRef.mime};base64,${firstRef.base64}`}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
                onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                onMouseLeave={e => (e.target as HTMLVideoElement).pause()}
              />
            )
          ) : (
            <div className="flex flex-col items-center gap-2 text-surface-600 p-4">
              {entry.kind === 'video' ? (
                <Video size={28} className="opacity-40" />
              ) : (
                <Image size={28} className="opacity-40" />
              )}
              <span className="text-sm font-medium text-surface-400 text-center leading-snug">{entry.name}</span>
            </div>
          )}

          {/* Hover actions */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2">
            <button
              onClick={e => { e.stopPropagation(); handleGenerate() }}
              className="opacity-0 group-hover:opacity-100 px-2.5 py-2 rounded-full bg-accent-500 hover:bg-accent-400 text-on-accent transition-all"
              title={entry.kind === 'video' ? 'Generar video' : 'Generar imagen'}
            >
              <Sparkles size={14} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); fileRef.current?.click() }}
              className="opacity-0 group-hover:opacity-100 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all"
              title="Upload reference"
            >
              <Upload size={14} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); if (firstRef) onRemoveRef(entry.id, firstRef.id) }}
              className="opacity-0 group-hover:opacity-100 p-2 rounded-full bg-red-500/70 hover:bg-red-500 text-white transition-all"
              title="Remove reference"
            >
              <Trash2 size={14} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onAddFile(f, entry.id); e.target.value = '' }}
            />
          </div>

          {/* Drop overlay */}
          {dragOver && (
            <div className="absolute inset-0 z-10 bg-accent-500/20 border-2 border-dashed border-accent-400 flex items-center justify-center pointer-events-none">
              <span className="text-xs font-semibold text-white bg-black/70 px-3 py-1.5 rounded-lg">Drop reference</span>
            </div>
          )}

          {/* Kind badge */}
          <div className="absolute top-2 right-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${entry.kind === 'video' ? 'bg-blue-500/20 text-blue-400 border-blue-500/20' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20'}`}>
              {entry.kind === 'video' ? 'Video' : 'Image'}
            </span>
          </div>

          {entry.references.length > 1 && (
            <div className="absolute bottom-2 right-2 bg-black/60 rounded-md px-1.5 py-0.5 text-[10px] text-white">
              +{entry.references.length - 1}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3">
          <h3 className="text-xs font-semibold text-surface-200 truncate">{entry.name}</h3>
          <p className="text-[10px] text-surface-500 line-clamp-2 mt-0.5">{entry.prompt}</p>
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {entry.tags.slice(0, 3).map(t => (
              <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-surface-800 text-surface-500">{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-scrim z-50 flex items-center justify-center" onClick={() => setModal(false)}>
          <div
            className="modal-surface w-full max-w-2xl max-h-[90vh] flex flex-col m-4 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header - always editable */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-surface-800 flex-shrink-0 gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {draftKind === 'video' ? (
                  <Video size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                ) : (
                  <Image size={16} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                )}
                <input
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  placeholder="Entry name"
                  className="bg-transparent text-sm font-semibold text-surface-100 focus:outline-none focus:bg-surface-800/60 focus:ring-1 focus:ring-accent-500/40 rounded-md px-1.5 py-0.5 min-w-0 flex-1"
                />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className="flex items-center gap-1 mr-2">
                  {(['image', 'video'] as const).map(k => (
                    <button
                      key={k}
                      onClick={() => setDraftKind(k)}
                      className={`text-[10px] px-2 py-1 rounded-pill transition-all flex items-center gap-1 capitalize ${draftKind === k
                        ? (k === 'video' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30')
                        : 'bg-surface-800 text-surface-500 border border-surface-700 hover:text-surface-300'}`}
                    >
                      {k === 'image' ? <Image size={12} /> : <Video size={12} />}{k}
                    </button>
                  ))}
                </div>
                <button onClick={() => { onDelete(entry.id); setModal(false) }} className="btn-ghost text-xs flex items-center gap-1 text-red-600 dark:text-red-400" title="Delete entry">
                  <Trash2 size={12} />
                </button>
                <button onClick={() => setModal(false)} className="btn-ghost p-1">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Reference asset */}
            <div
              className="flex-shrink-0 bg-surface-950 relative"
              onDragOver={(e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                Array.from(e.dataTransfer?.files || []).forEach(f => stageFileAsRef(f))
              }}
            >
              <div className="max-h-60 overflow-hidden flex items-center justify-center">
                {draftFirstRef ? (
                  draftFirstRef.type === 'image' ? (
                    <img
                      src={`data:${draftFirstRef.mime};base64,${draftFirstRef.base64}`}
                      alt={entry.name}
                      className="w-full max-h-60 object-contain"
                    />
                  ) : (
                    <video
                      src={`data:${draftFirstRef.mime};base64,${draftFirstRef.base64}`}
                      className="w-full max-h-60 object-contain"
                      controls
                    />
                  )
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-surface-600">
                    {draftKind === 'video' ? <Video size={32} className="opacity-40" /> : <Image size={32} className="opacity-40" />}
                    <span className="text-sm text-surface-500">No reference asset</span>
                  </div>
                )}
              </div>

              {/* Remove thumbnail */}
              {draftFirstRef && (
                <button
                  onClick={() => setDraftRefs(prev => prev.slice(1))}
                  className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/60 hover:bg-red-500/80 text-white/80 hover:text-white transition-all"
                  title="Remove reference"
                >
                  <Trash2 size={12} />
                </button>
              )}
              {draftRefs.length > 1 && (
                <div className="absolute bottom-2 right-2 bg-black/60 rounded-md px-1.5 py-0.5 text-[10px] text-white">
                  +{draftRefs.length - 1}
                </div>
              )}
              {dragOver && (
                <div className="absolute inset-0 z-10 bg-accent-500/20 border-2 border-dashed border-accent-400 flex items-center justify-center pointer-events-none">
                  <span className="text-xs font-semibold text-white bg-black/70 px-3 py-1.5 rounded-lg">Drop reference</span>
                </div>
              )}
            </div>

            {/* Asset toolbar */}
            <div className="flex items-center gap-1 px-4 py-2 bg-surface-900/40 border-b border-surface-800/60 flex-shrink-0">
              <button
                onClick={() => fileRef.current?.click()}
                className="text-[10px] px-2 py-1 rounded-pill bg-surface-800 text-surface-400 hover:text-surface-200 hover:bg-surface-700 transition-all flex items-center gap-1"
              >
                <Upload size={10} /> Agregar referencia
              </button>
              <button
                onClick={() => setShowPicker(true)}
                className="text-[10px] px-2 py-1 rounded-pill bg-surface-800 text-surface-400 hover:text-surface-200 hover:bg-surface-700 transition-all flex items-center gap-1"
              >
                <Library size={10} /> Agregar desde library
              </button>
              <span className="ml-auto text-[10px] text-surface-600">Arrastra un archivo o pega una imagen (Ctrl+V)</span>
            </div>

            {/* Prompt - scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              <div className="flex items-center justify-between mb-2">
                <p className="eyebrow">Prompt</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(draftPrompt); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  className="text-[10px] text-accent-400 hover:text-accent-300 flex items-center gap-1"
                >
                  {copied ? <Check size={10} className="text-green-600 dark:text-green-400" /> : <Copy size={10} />}
                  Copy
                </button>
              </div>
              <textarea
                value={draftPrompt}
                onChange={e => setDraftPrompt(e.target.value)}
                spellCheck={false}
                className="w-full bg-surface-800/60 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200 leading-relaxed resize-y min-h-[90px] focus:border-accent-500/50 focus:outline-none"
              />

              {/* Tags */}
              <div className="mt-4">
                <p className="eyebrow mb-2">Tags</p>
                <input
                  value={draftTags}
                  onChange={e => setDraftTags(e.target.value)}
                  placeholder="Tags (comma separated)"
                  className="input-field text-xs w-full"
                />
              </div>

              {/* Description: what agents read over MCP to pick this prompt */}
              <div className="mt-4">
                <p className="eyebrow mb-2">Cuándo usarlo</p>
                <input
                  value={draftDescription}
                  onChange={e => setDraftDescription(e.target.value)}
                  placeholder="Ej.: anuncio de producto premium para Instagram"
                  className="input-field text-xs w-full"
                />
              </div>

              {/* More references */}
              {draftRefs.length > 1 && (
                <div className="mt-4">
                  <p className="eyebrow mb-2">More references ({draftRefs.length - 1})</p>
                  <div className="grid grid-cols-3 gap-2">
                    {draftRefs.slice(1).map(ref => (
                      <div key={ref.id} className="group relative">
                        {ref.type === 'image' ? (
                          <img src={`data:${ref.mime};base64,${ref.base64}`} alt={ref.name} className="w-full aspect-video object-cover rounded-lg border border-surface-700" />
                        ) : (
                          <video src={`data:${ref.mime};base64,${ref.base64}`} className="w-full aspect-video object-cover rounded-lg border border-surface-700" controls />
                        )}
                        <button
                          onClick={() => setDraftRefs(prev => prev.filter(r => r.id !== ref.id))}
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded bg-red-500/80 text-white transition-all"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-surface-800 flex-shrink-0">
              <button
                onClick={handleSave}
                disabled={!dirty}
                className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-pill transition-all ${dirty ? 'bg-accent-500 hover:bg-accent-400 text-on-accent' : 'bg-surface-800 text-surface-600 cursor-not-allowed'}`}
              >
                <Save size={12} /> Guardar
              </button>
              <button onClick={handleGenerate} className="btn-primary text-xs flex items-center gap-1.5">
                <Sparkles size={12} /> {draftKind === 'video' ? 'Generar video' : 'Generar imagen'}
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) stageFileAsRef(f); e.target.value = '' }}
            />
          </div>

          {/* Library picker */}
          {showPicker && (
            <ImageLibraryPicker onSelect={handleLibrarySelect} onClose={() => setShowPicker(false)} />
          )}
        </div>
      )}
    </>
  )
}

const CATEGORY_LABELS: Record<string, string> = {
  advertising: 'Publicidad',
  product: 'Producto',
  ugc: 'UGC',
  social: 'Redes',
  food: 'Gastronomía',
  beauty: 'Belleza',
  fashion: 'Moda',
  'real-estate': 'Inmobiliaria',
  brand: 'Marca',
  character: 'Personajes',
  storyboard: 'Storyboard',
  editing: 'Edición',
  style: 'Estilo',
}

/** Highlights the {{variables}} of a template */
function TemplateText({ text }: { text: string }) {
  const parts = text.split(/(\{\{\s*[a-zA-Z][a-zA-Z0-9_]*\s*\}\})/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('{{')
          ? <span key={i} className="text-accent-400 font-medium">{part}</span>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

function TemplateCard({ template, onSave }: { template: BuiltinTemplate; onSave: (t: BuiltinTemplate) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const setPage = useAppStore(s => s.setPage)
  const setComposerPayload = useAppStore(s => s.setComposerPayload)
  const taxonomy = usePromptLibraryStore(s => s.taxonomy)
  const [viewing, setViewing] = useState(false)
  const ref = template.references.find(r => r.type === 'image' && (r.path || r.url))
  const refSrc = ref?.path ? fileUrl(ref.path, { thumb: true }) : ref?.url
  const viewerImages = useMemo(() => builtinViewerImages(template.references), [template.references])

  const handleUse = () => {
    setComposerPayload({
      prompt: template.prompt,
      mode: template.kind,
      aspectRatio: template.aspectRatios[0] || '3:4',
      resolution: '1K',
    })
    setPage(template.kind === 'video' ? 'video' : 'image')
  }

  return (
    <div className="card p-4 flex flex-col gap-3">
      {refSrc && (
        <div className="-mx-4 -mt-4 mb-1 relative group">
          <button onClick={() => setViewing(true)} className="block w-full cursor-zoom-in" title="Ver referencia">
            <img src={refSrc} alt={ref?.caption || template.name} referrerPolicy="no-referrer" loading="lazy" className="w-full aspect-[4/3] object-cover rounded-t-[inherit]" />
            <span className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/60 text-white/90 opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 size={12} />
            </span>
            {viewerImages.length > 1 && (
              <span className="absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded bg-black/60 text-white/90">{viewerImages.length} refs</span>
            )}
          </button>
          {ref?.credit && (
            <a href={ref.sourceUrl} target="_blank" rel="noreferrer" title={ref.caption}
              className="absolute bottom-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded bg-black/60 text-white/80 hover:text-white max-w-[90%] truncate">
              {ref.credit}
            </a>
          )}
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-surface-100 leading-snug">{template.name}</p>
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-surface-500">
            {template.kind === 'video' ? <Video size={11} /> : <Image size={11} />}
            <span>{CATEGORY_LABELS[template.category] || template.category}</span>
            {template.aspectRatios.length > 0 && <span>· {template.aspectRatios.join(' · ')}</span>}
            {template.durationSeconds ? <span>· {template.durationSeconds}s</span> : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[9px] px-1.5 py-0.5 rounded-pill bg-accent-500/10 text-accent-400 border border-accent-500/20">Openfield</span>
          <ReviewBadge status={template.review?.status || 'pending'} />
        </div>
      </div>

      <p className="text-xs text-surface-400 leading-relaxed">{template.description}</p>
      <TagChips models={template.models || []} types={template.types || []} taxonomy={taxonomy} />

      <button
        onClick={() => setExpanded(v => !v)}
        className={`text-left text-[11px] text-surface-300 leading-relaxed bg-surface-800/60 border border-surface-700 rounded-lg px-3 py-2 ${expanded ? '' : 'line-clamp-4'}`}
        title={expanded ? 'Contraer' : 'Ver plantilla completa'}
      >
        <TemplateText text={template.prompt} />
      </button>

      {expanded && template.guidance.length > 0 && (
        <ul className="text-[11px] text-surface-400 list-disc pl-4 space-y-1">
          {template.guidance.map((g, i) => <li key={i}>{g}</li>)}
        </ul>
      )}

      <div className="flex items-center gap-1.5 mt-auto pt-1">
        <button
          onClick={() => { navigator.clipboard.writeText(template.prompt); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
          className="text-[10px] px-2 py-1 rounded-pill bg-surface-800 text-surface-400 border border-surface-700 hover:text-surface-200 flex items-center gap-1"
        >
          {copied ? <Check size={10} className="text-green-600 dark:text-green-400" /> : <Copy size={10} />} Copiar
        </button>
        <button
          onClick={() => onSave(template)}
          className="text-[10px] px-2 py-1 rounded-pill bg-surface-800 text-surface-400 border border-surface-700 hover:text-surface-200 flex items-center gap-1 whitespace-nowrap"
          title="Guardar una copia editable en tu biblioteca"
        >
          <Library size={10} /> Guardar
        </button>
        <button onClick={handleUse} className="btn-primary text-[10px] ml-auto flex items-center gap-1 px-2.5 py-1">
          <Sparkles size={10} /> Usar
        </button>
      </div>

      {viewing && (
        <PromptReferenceViewer title={template.name} images={viewerImages} onClose={() => setViewing(false)} />
      )}
    </div>
  )
}

export function PromptLibrary() {
  const {
    entries, builtins, loadBuiltins, addEntry, updateEntry, removeEntry,
    addReference, removeReference,
  } = usePromptLibraryStore()

  const [tab, setTab] = useState<'mine' | 'openfield' | 'review'>('mine')
  useEffect(() => { loadBuiltins() }, [loadBuiltins])

  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'image' | 'video'>('all')
  const [showAdd, setShowAdd] = useState(false)

  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [newKind, setNewKind] = useState<'image' | 'video'>('image')
  const [newTags, setNewTags] = useState('')

  const filtered = useMemo(() => {
    let result = entries
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.prompt.toLowerCase().includes(q) ||
        e.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    if (kindFilter !== 'all') result = result.filter(e => e.kind === kindFilter)
    return result
  }, [entries, search, kindFilter])

  const filteredTemplates = useMemo(() => {
    let result = builtins
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (CATEGORY_LABELS[t.category] || t.category).toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q)) ||
        t.types.some(tag => tag.toLowerCase().includes(q)) ||
        t.models.some(tag => tag.toLowerCase().includes(q))
      )
    }
    if (kindFilter !== 'all') result = result.filter(t => t.kind === kindFilter)
    return result
  }, [builtins, search, kindFilter])

  const handleSaveTemplate = async (t: BuiltinTemplate) => {
    await addEntry({
      name: t.name,
      prompt: t.prompt,
      kind: t.kind,
      references: [],
      tags: t.tags,
      category: t.category,
      description: t.description,
      models: t.models,
      types: t.types,
    })
    setTab('mine')
  }

  const handleAddFile = async (file: File, targetId: string) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return
    const reader = new FileReader()
    const ref: PromptReference = await new Promise((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string
        resolve({
          id: crypto.randomUUID(),
          base64: result.split(',')[1],
          mime: file.type,
          type: file.type.startsWith('video/') ? 'video' : 'image',
          name: file.name,
        })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    addReference(targetId, ref)
  }

  const handleSubmitAdd = () => {
    if (!newName.trim() || !newPrompt.trim()) return
    addEntry({
      name: newName.trim(),
      prompt: newPrompt.trim(),
      kind: newKind,
      references: [],
      tags: newTags.split(',').map(t => t.trim()).filter(Boolean),
    })
    setNewName(''); setNewPrompt(''); setNewKind('image'); setNewTags(''); setShowAdd(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-2 px-4 py-3 border-b border-surface-800 flex-shrink-0">
        <h1 className="text-sm font-semibold text-surface-100 flex items-center gap-2 whitespace-nowrap">
          <FileText size={16} className="text-accent-400" />
          Prompt Library
        </h1>
        <span className="text-[10px] text-surface-600 whitespace-nowrap">{tab === 'mine' ? filtered.length : tab === 'openfield' ? filteredTemplates.length : entries.length + builtins.length} prompts</span>

        <div className="flex items-center gap-1 ml-4">
          {([['mine', 'Mis prompts'], ['openfield', 'Openfield'], ['review', 'Revisión']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`text-[10px] px-2 py-1 rounded-pill whitespace-nowrap transition-all ${tab === k ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30' : 'bg-surface-800 text-surface-500 border border-surface-700 hover:text-surface-300'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-2">
          {(['all', 'image', 'video'] as const).map(k => (
            <button key={k} onClick={() => setKindFilter(k)}
              className={`text-[10px] px-2 py-1 rounded-pill transition-all capitalize ${kindFilter === k ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30' : 'bg-surface-800 text-surface-500 border border-surface-700 hover:text-surface-300'}`}>
              {k === 'all' ? 'All' : k}
            </button>
          ))}
        </div>

        <div className="relative ml-auto mr-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="input-field pl-8 text-xs w-[180px]" />
        </div>

        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-xs flex items-center gap-1.5 whitespace-nowrap">
          <Plus size={12} /> New Prompt
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card mx-4 mt-4 p-4 border-accent-500/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-surface-300">New Prompt Entry</h3>
            <button onClick={() => setShowAdd(false)} className="text-surface-500 hover:text-surface-200"><X size={14} /></button>
          </div>
          <div className="space-y-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Entry name..." className="input-field text-sm" />
            <textarea value={newPrompt} onChange={e => setNewPrompt(e.target.value)} placeholder="Write your prompt..." className="input-field h-24 resize-none text-sm" />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {(['image', 'video'] as const).map(k => (
                  <button key={k} onClick={() => setNewKind(k)} className={`text-[10px] px-2 py-1 rounded-pill transition-all flex items-center gap-1 capitalize ${newKind === k ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30' : 'bg-surface-800 text-surface-500 border border-surface-700'}`}>
                    {k === 'image' ? <Image size={12} /> : <Video size={12} />}{k}
                  </button>
                ))}
              </div>
              <input value={newTags} onChange={e => setNewTags(e.target.value)} placeholder="Tags (comma separated)" className="input-field text-xs flex-1" />
            </div>
            <button onClick={handleSubmitAdd} className="btn-primary text-xs w-full">Add Prompt</button>
          </div>
        </div>
      )}

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'review' ? (
          <PromptLibraryReview search={search} kindFilter={kindFilter} />
        ) : tab === 'openfield' ? (
          <div className="max-w-7xl mx-auto">
            <p className="text-[11px] text-surface-500 mb-4">
              Plantillas curadas por Openfield. Los agentes conectados por MCP las consultan como referencia y las adaptan a tu marca; guarda una copia para editarla.
            </p>
            {filteredTemplates.length === 0 ? (
              <p className="text-sm text-surface-600 text-center py-20">Sin resultados</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredTemplates.map(t => <TemplateCard key={t.id} template={t} onSave={handleSaveTemplate} />)}
              </div>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-surface-600">
            <FileText size={48} className="mb-4 opacity-50" />
            <p className="text-sm">No prompts yet</p>
            <button onClick={() => setShowAdd(true)} className="text-xs text-accent-400 hover:text-accent-300 mt-2">Create your first prompt</button>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(entry => (
                <PromptCard key={entry.id} entry={entry} onDelete={removeEntry} onAddFile={handleAddFile} onRemoveRef={removeReference} onUpdate={updateEntry} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
