import { useState, useRef, useMemo } from 'react'
import { Plus, Trash2, Edit3, X, Upload, Image, Video, Search, Copy, Check, FileText, Sparkles } from 'lucide-react'
import { usePromptLibraryStore, type PromptEntry, type PromptReference } from '../../stores/prompt-library-store'
import { useAppStore } from '../../stores/app-store'

function PromptCard({
  entry,
  onEdit,
  onDelete,
  onUploadRef,
  onRemoveRef,
}: {
  entry: PromptEntry
  onEdit: (entry: PromptEntry) => void
  onDelete: (id: string) => void
  onUploadRef: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void
  onRemoveRef: (entryId: string, refId: string) => void
}) {
  const [modal, setModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const firstRef = entry.references[0]
  const setPage = useAppStore(s => s.setPage)
  const setComposerPayload = useAppStore(s => s.setComposerPayload)

  const handleRegenerate = () => {
    const refs = entry.references.map(r => ({
      base64: r.base64,
      mime: r.mime,
      name: r.name,
      refType: 'prompt_library' as const,
    }))
    setComposerPayload({
      prompt: entry.prompt,
      mode: entry.kind,
      aspectRatio: refs.length > 0 ? 'auto' : '3:4',
      resolution: '1K',
      imageRefs: refs.length > 0 ? refs : undefined,
    })
    setPage(entry.kind === 'video' ? 'video' : 'image')
    setModal(false)
  }

  return (
    <>
      {/* Card */}
      <div
        className="card group relative overflow-hidden p-0 cursor-pointer hover:border-accent-500/40 transition-colors"
        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 280px' }}
        onClick={() => setModal(true)}
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
              onClick={e => { e.stopPropagation(); fileRef.current?.click() }}
              className="opacity-0 group-hover:opacity-100 p-2 rounded-lg bg-surface-800/80 hover:bg-surface-700 text-surface-200 transition-all"
            >
              <Upload size={14} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); if (firstRef) onRemoveRef(entry.id, firstRef.id) }}
              className="opacity-0 group-hover:opacity-100 p-2 rounded-lg bg-red-500/70 hover:bg-red-500 text-white transition-all"
            >
              <Trash2 size={14} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={e => onUploadRef(e, entry.id)}
            />
          </div>

          {/* Kind badge */}
          <div className="absolute top-2 right-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${entry.kind === 'video' ? 'bg-blue-500/20 text-blue-400 border-blue-500/20' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20'}`}>
              {entry.kind === 'video' ? 'Video' : 'Image'}
            </span>
          </div>

          {entry.references.length > 1 && (
            <div className="absolute bottom-2 right-2 bg-black/60 rounded-md px-1.5 py-0.5 text-[10px] text-surface-300">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setModal(false)}>
          <div
            className="bg-surface-900 border border-surface-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col m-4 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {entry.kind === 'video' ? (
                  <Video size={16} className="text-blue-400 flex-shrink-0" />
                ) : (
                  <Image size={16} className="text-emerald-400 flex-shrink-0" />
                )}
                <h2 className="text-sm font-semibold text-surface-100 truncate">{entry.name}</h2>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={handleRegenerate}
                  className="btn-primary text-xs flex items-center gap-1"
                >
                  <Sparkles size={12} /> Regenerate
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(entry.prompt); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  className="btn-ghost text-xs flex items-center gap-1"
                >
                  {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  Copy
                </button>
                <button onClick={() => { onEdit(entry); setModal(false) }} className="btn-ghost text-xs flex items-center gap-1">
                  <Edit3 size={12} />
                </button>
                <button onClick={() => { onDelete(entry.id); setModal(false) }} className="btn-ghost text-xs flex items-center gap-1 text-red-400">
                  <Trash2 size={12} />
                </button>
                <button onClick={() => setModal(false)} className="btn-ghost p-1">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Image */}
            <div className="flex-shrink-0 max-h-64 bg-surface-950 flex items-center justify-center overflow-hidden">
              {firstRef ? (
                firstRef.type === 'image' ? (
                  <img
                    src={`data:${firstRef.mime};base64,${firstRef.base64}`}
                    alt={entry.name}
                    className="w-full max-h-64 object-contain"
                  />
                ) : (
                  <video
                    src={`data:${firstRef.mime};base64,${firstRef.base64}`}
                    className="w-full max-h-64 object-contain"
                    controls
                  />
                )
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-surface-600">
                  {entry.kind === 'video' ? <Video size={32} className="opacity-40" /> : <Image size={32} className="opacity-40" />}
                  <span className="text-sm text-surface-500">No reference image</span>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                  >
                    <Upload size={12} /> Add reference
                  </button>
                </div>
              )}
            </div>

            {/* Prompt - scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-surface-500 uppercase tracking-wider">Prompt</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(entry.prompt); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  className="text-[10px] text-accent-400 hover:text-accent-300 flex items-center gap-1"
                >
                  {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                  Copy
                </button>
              </div>
              <p className="text-sm text-surface-200 leading-relaxed whitespace-pre-wrap">{entry.prompt}</p>

              {entry.tags.length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-2">Tags</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {entry.tags.map(t => (
                      <span key={t} className="text-[10px] px-2 py-1 rounded bg-surface-800 text-surface-400">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {entry.references.length > 1 && (
                <div className="mt-4">
                  <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-2">More references ({entry.references.length - 1})</p>
                  <div className="grid grid-cols-3 gap-2">
                    {entry.references.slice(1).map(ref => (
                      <div key={ref.id} className="group relative">
                        {ref.type === 'image' ? (
                          <img src={`data:${ref.mime};base64,${ref.base64}`} alt={ref.name} className="w-full aspect-video object-cover rounded-lg border border-surface-700" />
                        ) : (
                          <video src={`data:${ref.mime};base64,${ref.base64}`} className="w-full aspect-video object-cover rounded-lg border border-surface-700" controls />
                        )}
                        <button
                          onClick={() => onRemoveRef(entry.id, ref.id)}
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

            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={e => onUploadRef(e, entry.id)}
            />
          </div>
        </div>
      )}
    </>
  )
}

export function PromptLibrary() {
  const {
    entries, addEntry, updateEntry, removeEntry,
    addReference, removeReference,
  } = usePromptLibraryStore()

  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'image' | 'video'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [editingEntry, setEditingEntry] = useState<PromptEntry | null>(null)

  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [newKind, setNewKind] = useState<'image' | 'video'>('image')
  const [newTags, setNewTags] = useState('')

  const [editName, setEditName] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [editKind, setEditKind] = useState<'image' | 'video'>('image')
  const [editTags, setEditTags] = useState('')

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

  const handleAddRef = (e: React.ChangeEvent<HTMLInputElement>, targetId: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      addReference(targetId, {
        id: crypto.randomUUID(),
        base64: result.split(',')[1],
        mime: file.type,
        type: file.type.startsWith('video/') ? 'video' : 'image',
        name: file.name,
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
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

  const startEdit = (entry: PromptEntry) => {
    setEditingEntry(entry)
    setEditName(entry.name); setEditPrompt(entry.prompt); setEditKind(entry.kind); setEditTags(entry.tags.join(', '))
  }

  const handleSubmitEdit = () => {
    if (!editingEntry || !editName.trim() || !editPrompt.trim()) return
    updateEntry(editingEntry.id, {
      name: editName.trim(), prompt: editPrompt.trim(), kind: editKind,
      tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
    })
    setEditingEntry(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-800 flex-shrink-0">
        <h1 className="text-sm font-semibold text-surface-100 flex items-center gap-2">
          <FileText size={16} className="text-accent-400" />
          Prompt Library
        </h1>
        <span className="text-[10px] text-surface-600">{filtered.length} prompts</span>

        <div className="flex items-center gap-1 ml-4">
          {(['all', 'image', 'video'] as const).map(k => (
            <button key={k} onClick={() => setKindFilter(k)}
              className={`text-[10px] px-2 py-1 rounded-lg transition-all capitalize ${kindFilter === k ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30' : 'bg-surface-800 text-surface-500 border border-surface-700 hover:text-surface-300'}`}>
              {k === 'all' ? 'All' : k}
            </button>
          ))}
        </div>

        <div className="relative ml-auto mr-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="input-field pl-8 text-xs w-[180px]" />
        </div>

        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-xs flex items-center gap-1.5">
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
                  <button key={k} onClick={() => setNewKind(k)} className={`text-[10px] px-2 py-1 rounded-lg transition-all flex items-center gap-1 capitalize ${newKind === k ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30' : 'bg-surface-800 text-surface-500 border border-surface-700'}`}>
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

      {/* Edit modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditingEntry(null)}>
          <div className="bg-surface-900 border border-surface-800 rounded-2xl w-full max-w-lg m-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-100">Edit Prompt</h2>
              <button onClick={() => setEditingEntry(null)} className="text-surface-500 hover:text-surface-200"><X size={14} /></button>
            </div>
            <input value={editName} onChange={e => setEditName(e.target.value)} className="input-field text-sm" placeholder="Name" />
            <textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)} className="input-field h-28 resize-none text-sm" placeholder="Prompt text" />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {(['image', 'video'] as const).map(k => (
                  <button key={k} onClick={() => setEditKind(k)} className={`text-[10px] px-2 py-1 rounded-lg transition-all capitalize ${editKind === k ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30' : 'bg-surface-800 text-surface-500 border border-surface-700'}`}>{k}</button>
                ))}
              </div>
              <input value={editTags} onChange={e => setEditTags(e.target.value)} className="input-field text-xs flex-1" placeholder="Tags" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleSubmitEdit} className="btn-primary text-xs">Save</button>
              <button onClick={() => setEditingEntry(null)} className="btn-ghost text-xs">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-surface-600">
            <FileText size={48} className="mb-4 opacity-50" />
            <p className="text-sm">No prompts yet</p>
            <button onClick={() => setShowAdd(true)} className="text-xs text-accent-400 hover:text-accent-300 mt-2">Create your first prompt</button>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(entry => (
                <PromptCard key={entry.id} entry={entry} onEdit={startEdit} onDelete={removeEntry} onUploadRef={handleAddRef} onRemoveRef={removeReference} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
