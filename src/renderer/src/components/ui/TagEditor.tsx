import { useState, useRef, useCallback, KeyboardEvent } from 'react'
import { Tag, X } from 'lucide-react'

interface TagEditorProps {
  tags: string[]
  onChange: (tags: string[]) => void
  editable?: boolean
  className?: string
}

export function TagEditor({ tags, onChange, editable = true, className = '' }: TagEditorProps) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addTag = useCallback(() => {
    const tag = inputValue.trim().toLowerCase()
    if (!tag || tags.includes(tag)) return
    onChange([...tags, tag])
    setInputValue('')
  }, [inputValue, tags, onChange])

  const removeTag = useCallback((tag: string) => {
    onChange(tags.filter(t => t !== tag))
  }, [tags, onChange])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag() }
    if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  if (tags.length === 0 && !editable) return null

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      <Tag size={12} className="text-surface-500" />
      {tags.map(tag => (
        <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-accent-500/10 text-accent-400 text-[10px] font-medium">
          {tag}
          {editable && (
            <button onClick={() => removeTag(tag)} className="text-accent-400/60 hover:text-red-400 transition-colors">
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      {editable && (
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          placeholder={tags.length === 0 ? '+ tag' : '+'}
          className="bg-transparent border border-dashed border-surface-700 rounded px-1.5 py-0.5 text-[10px] text-surface-400 placeholder-surface-600 focus:outline-none focus:border-accent-500 min-w-[40px]"
          size={8}
        />
      )}
    </div>
  )
}
