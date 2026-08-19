import { useState, useRef, KeyboardEvent } from 'react'
import { X, Tag } from 'lucide-react'

interface BulkTagModalProps {
 count: number
 onApply: (tags: string[]) => Promise<void>
 onClose: () => void
}

export function BulkTagModal({ count, onApply, onClose }: BulkTagModalProps) {
 const [tags, setTags] = useState<string[]>([])
 const [inputValue, setInputValue] = useState('')
 const inputRef = useRef<HTMLInputElement>(null)

 const addTag = () => {
 const tag = inputValue.trim().toLowerCase()
 if (!tag || tags.includes(tag)) return
 setTags([...tags, tag])
 setInputValue('')
 }

 const removeTag = (tag: string) => setTags(tags.filter(t => t !== tag))

 const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
 if (e.key === 'Enter') { e.preventDefault(); addTag() }
 if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
 removeTag(tags[tags.length - 1])
 }
 if (e.key === 'Escape') onClose()
 }

 const handleApply = async () => {
 if (tags.length === 0) return
 await onApply(tags)
 onClose()
 }

 return (
 <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={onClose}>
 <div className="bg-surface-900 border border-surface-800 rounded-2xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
 <div className="flex justify-between items-start mb-4">
 <h2 className="text-lg font-semibold text-surface-100">Add Tags to {count} Assets</h2>
 <button onClick={onClose} className="text-surface-500 hover:text-surface-100">
 <X size={18} />
 </button>
 </div>

 <div className="flex flex-wrap gap-1.5 mb-3 min-h-[36px] p-2 bg-surface-800 rounded-lg border border-surface-700">
 <Tag size={14} className="text-surface-500 mt-0.5" />
 {tags.map(tag => (
 <span key={tag} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-accent-500/10 text-accent-400 text-xs font-medium">
 {tag}
 <button onClick={() => removeTag(tag)} className="text-accent-400/60 hover:text-red-400">
 <X size={10} />
 </button>
 </span>
 ))}
 <input
 ref={inputRef}
 value={inputValue}
 onChange={(e) => setInputValue(e.target.value)}
 onKeyDown={handleKeyDown}
 placeholder={tags.length === 0 ? 'Type a tag and press Enter...' : 'Add more...'}
 className="bg-transparent border-none outline-none text-xs text-surface-200 placeholder-surface-600 flex-1 min-w-[100px] py-0.5"
 autoFocus
 />
 </div>

 <div className="flex gap-2 mt-4">
 <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
 <button onClick={handleApply} disabled={tags.length === 0} className="btn-primary flex-1 disabled:opacity-40">
 Add {tags.length > 0 ? `${tags.length} Tag${tags.length > 1 ? 's' : ''}` : ''}
 </button>
 </div>
 </div>
 </div>
 )
}
