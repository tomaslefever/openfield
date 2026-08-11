import React from 'react'
import { User, MapPin, Package } from 'lucide-react'
import { ELEMENT_TYPE_CONFIG } from '../../utils/script-elements'
import type { StoryboardElementType } from '../../stores/storyboard-store'

const INLINE_RE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|@(?:char|scn|obj):[A-Za-zÁ-Úá-úÑñ0-9 _.-]+)/g

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(INLINE_RE)
  const nodes: React.ReactNode[] = []
  parts.forEach((part, i) => {
    if (!part) return
    if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`} className="font-semibold text-surface-100">{part.slice(2, -2)}</strong>)
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      nodes.push(<em key={`${keyPrefix}-i${i}`} className="italic text-surface-300">{part.slice(1, -1)}</em>)
    } else if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(<code key={`${keyPrefix}-c${i}`} className="px-1 py-0.5 rounded bg-surface-800 text-[0.9em] text-accent-300 font-mono">{part.slice(1, -1)}</code>)
    } else if (part.startsWith('@')) {
      const m = part.match(/^@(char|scn|obj):(.+)$/)
      if (m) {
        const prefix = m[1]
        const type: StoryboardElementType = prefix === 'char' ? 'character' : prefix === 'scn' ? 'scenario' : 'object'
        const cfg = ELEMENT_TYPE_CONFIG[type]
        const name = m[2]
        nodes.push(
          <span key={`${keyPrefix}-m${i}`} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[0.85em] font-medium ${cfg.bg} ${cfg.color} border ${cfg.border} mx-0.5`}>
            {type === 'character' ? <User size={10} /> : type === 'scenario' ? <MapPin size={10} /> : <Package size={10} />}
            <span className="max-w-[160px] truncate">{name}</span>
          </span>
        )
      } else {
        nodes.push(part)
      }
    } else {
      nodes.push(part)
    }
  })
  return nodes
}

const SLUGLINE_RE = /^(?:INT\.?|EXT\.?|INT\/EXT\.?|INT-EXT\.?)[\s–—-]/i
const DIALOGUE_RE = /^([A-ZÁ-ÚÑ][A-ZÁ-ÚÑ0-9\s'.-]{1,40}):\s+(.+)$/

function isDialogue(line: string): boolean {
  const l = line.trimStart()
  if (l.startsWith('#') || l.startsWith('>') || l.startsWith('-') || l.startsWith('*') || /^\d+\./.test(l)) return false
  return DIALOGUE_RE.test(l)
}

export function ScriptMarkdown({ text, className }: { text: string; className?: string }) {
  if (!text.trim()) {
    return <p className="text-surface-600 italic">El guión está vacío. Escríbelo en la pestaña de edición o pídele al asistente.</p>
  }

  const lines = text.split('\n')
  const rows: React.ReactNode[] = []
  let listItems: { type: 'ul' | 'ol'; items: string[] } | null = null

  const flushList = () => {
    if (!listItems) return
    const Tag = listItems.type === 'ul' ? 'ul' : 'ol'
    const itemClass = listItems.type === 'ul'
      ? 'list-disc ml-5 text-sm text-surface-300 py-0.5'
      : 'list-decimal ml-5 text-sm text-surface-300 py-0.5'
    rows.push(
      <Tag key={`list-${rows.length}`} className={listItems.type === 'ol' ? 'list-decimal ml-5 text-sm text-surface-300 space-y-0.5' : 'list-disc ml-5 text-sm text-surface-300 space-y-0.5'}>
        {listItems.items.map((item, i) => <li key={i} className={itemClass}>{renderInline(item, `li-${i}`)}</li>)}
      </Tag>
    )
    listItems = null
  }

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd()
    if (!line.trim()) { flushList(); return }

    if (/^#{1,6}\s/.test(line)) {
      flushList()
      const level = line.match(/^(#{1,6})/)?.[1].length || 0
      const content = line.replace(/^#{1,6}\s/, '')
      const key = `h${idx}`
      if (level === 1) {
        rows.push(<h2 key={key} className="text-base font-bold text-surface-100 mt-4 mb-1.5">{renderInline(content, key)}</h2>)
      } else if (level === 2) {
        rows.push(<h3 key={key} className="flex items-center gap-2 text-sm font-semibold text-accent-300 mt-4 mb-1.5"><span className="w-1 h-4 rounded-full bg-accent-500/60 inline-block" />{renderInline(content, key)}</h3>)
      } else if (level === 3) {
        rows.push(<h4 key={key} className="text-xs font-semibold uppercase tracking-wider text-surface-400 mt-3 mb-1">{renderInline(content, key)}</h4>)
      } else {
        rows.push(<h5 key={key} className="text-xs font-medium text-surface-500 mt-2 mb-1">{renderInline(content, key)}</h5>)
      }
      return
    }

    if (/^[-*•]\s+/.test(line) && !SLUGLINE_RE.test(line)) {
      const item = line.replace(/^[-*•]\s+/, '')
      if (!listItems) listItems = { type: 'ul', items: [] }
      listItems.items.push(item)
      return
    }
    if (/^\d+\.\s+/.test(line)) {
      const item = line.replace(/^\d+\.\s+/, '')
      if (!listItems) listItems = { type: 'ol', items: [] }
      listItems.items.push(item)
      return
    }

    flushList()

    if (line.trimStart().startsWith('>')) {
      rows.push(<blockquote key={`q${idx}`} className="border-l-2 border-accent-500/40 pl-3 py-0.5 text-sm text-surface-400 italic">{renderInline(line.trimStart().replace(/^>\s?/, ''), `q${idx}`)}</blockquote>)
      return
    }

    if (SLUGLINE_RE.test(line.trimStart())) {
      rows.push(<p key={`s${idx}`} className="text-xs font-bold uppercase tracking-widest text-surface-200 bg-surface-800/60 rounded-lg px-3 py-1.5 my-1.5 border-l-2 border-emerald-500/50">{renderInline(line.trim(), `s${idx}`)}</p>)
      return
    }

    const dialogue = line.trim().match(DIALOGUE_RE)
    if (isDialogue(line)) {
      rows.push(
        <div key={`d${idx}`} className="pl-6 my-1">
          <p className="text-xs font-bold text-surface-100">{dialogue ? dialogue[1] : ''}</p>
          <p className="text-sm text-surface-300">{dialogue ? renderInline(dialogue[2], `d${idx}`) : renderInline(line.trim(), `d${idx}`)}</p>
        </div>
      )
      return
    }

    rows.push(<p key={`p${idx}`} className="text-sm text-surface-300 leading-relaxed py-0.5">{renderInline(line, `p${idx}`)}</p>)
  })
  flushList()

  return <div className={className}>{rows}</div>
}
