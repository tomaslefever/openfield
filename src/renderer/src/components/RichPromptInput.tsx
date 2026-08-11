import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { StudioElement } from '../stores/elements-store'
import { KIND_CONFIG } from '../stores/elements-store'

export interface RichPromptInputHandle {
  getText: () => string
  setText: (text: string) => void
  insertBadge: (el: StudioElement) => void
  focus: () => void
}

interface Props {
  value: string
  onChange: (text: string) => void
  onAtState: (active: boolean, query: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  onBadgeClick?: (elementName: string, rect: DOMRect) => void
  elements: StudioElement[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

function getTextBeforeCursor(editor: HTMLElement): string {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return ''
  const range = sel.getRangeAt(0).cloneRange()
  range.collapse(true)
  range.setStart(editor, 0)
  return range.toString()
}

function extractText(editor: HTMLElement): string {
  let result = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || ''
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (node.hasAttribute('data-element-name')) {
      result += '@element:' + (node.getAttribute('data-element-name') || '') + '\u200B'
      return
    }
    if (node.tagName === 'BR') {
      result += '\n'
      return
    }
    if (node.tagName === 'DIV' || node.tagName === 'P') {
      if (result && !result.endsWith('\n')) result += '\n'
    }
    for (const c of Array.from(node.childNodes)) walk(c)
  }
  for (const c of Array.from(editor.childNodes)) walk(c)
  return result
}

function renderHTML(editor: HTMLElement, text: string, elements: StudioElement[]) {
  const findElement = (name: string) => elements.find(e => e.name === name)
  const addText = (t: string) => {
    const parts = t.split('\n')
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) editor.appendChild(document.createElement('br'))
      if (parts[i] !== '') editor.appendChild(document.createTextNode(parts[i]))
    }
  }
  editor.innerHTML = ''
  const regex = /@element:([^\u200B]+)\u200B/g
  let lastIdx = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const elName = match[1]
    if (match.index > lastIdx) {
      addText(text.substring(lastIdx, match.index))
    }
    const el = findElement(elName)
    const badge = createBadgeElement(elName, el)
    editor.appendChild(badge)
    lastIdx = regex.lastIndex
  }

  if (lastIdx < text.length) {
    addText(text.substring(lastIdx))
  }
  if (!editor.textContent?.trim()) {
    editor.innerHTML = ''
  }
}

function createBadgeElement(name: string, el?: StudioElement): HTMLElement {
  const span = document.createElement('span')
  span.setAttribute('data-element-name', name)
  span.contentEditable = 'false'
  const cfg = el ? KIND_CONFIG[el.kind] : KIND_CONFIG.character
  const colorMap: Record<string, string> = {
    'text-violet-400': 'violet',
    'text-blue-400': 'blue',
    'text-emerald-400': 'emerald',
    'text-amber-400': 'amber',
  }
  const c = colorMap[cfg.color] || 'blue'
  span.style.cssText = `
    display: inline-flex; align-items: center; gap: 2px; padding: 1px 6px; margin: 0 2px;
    border-radius: 6px; font-size: 13px; vertical-align: middle;
    user-select: none; cursor: default;
    background: ${c === 'violet' ? 'rgba(139,92,246,0.12)' : c === 'blue' ? 'rgba(59,130,246,0.12)' : c === 'emerald' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)'};
    border: 1px solid ${c === 'violet' ? 'rgba(139,92,246,0.3)' : c === 'blue' ? 'rgba(59,130,246,0.3)' : c === 'emerald' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'};
    color: ${c === 'violet' ? '#a78bfa' : c === 'blue' ? '#60a5fa' : c === 'emerald' ? '#34d399' : '#fbbf24'};
  `

  if (el?.imageBase64) {
    const img = document.createElement('img')
    img.src = `data:image/png;base64,${el.imageBase64}`
    img.style.cssText = 'width:16px;height:16px;border-radius:3px;object-fit:cover'
    span.appendChild(img)
  }
  span.appendChild(document.createTextNode(name))
  return span
}

export const RichPromptInput = forwardRef<RichPromptInputHandle, Props>(
  function RichPromptInput({ value, onChange, onAtState, onKeyDown, onBadgeClick, elements, placeholder, disabled, className }, ref) {
    const editorRef = useRef<HTMLDivElement>(null)
    const internalChangeRef = useRef(false)
    const prevValueRef = useRef(value)
    const valueRef = useRef(value)

    valueRef.current = value

    // Sync external value changes into the DOM (one-way: parent → editor)
    useEffect(() => {
      if (internalChangeRef.current) {
        internalChangeRef.current = false
        return
      }
      const editor = editorRef.current
      if (!editor) return
      if (value === prevValueRef.current) return
      prevValueRef.current = value

      // Save cursor position
      const sel = window.getSelection()
      const hadFocus = document.activeElement === editor

      internalChangeRef.current = true
      renderHTML(editor, value, elements)

      if (hadFocus) {
        const newSel = window.getSelection()
        if (newSel) {
          const range = document.createRange()
          const lastChild = editor.lastChild
          if (lastChild) {
            if (lastChild.nodeType === Node.TEXT_NODE) {
              range.setStart(lastChild, lastChild.textContent?.length || 0)
            } else {
              range.setStartAfter(lastChild)
            }
          } else {
            range.setStart(editor, 0)
          }
          range.collapse(true)
          newSel.removeAllRanges()
          newSel.addRange(range)
        }
      }

      internalChangeRef.current = false
    }, [value, elements])

    const handleInput = useCallback(() => {
      if (internalChangeRef.current) return
      const editor = editorRef.current
      if (!editor) return
      const text = extractText(editor)
      if (text === prevValueRef.current) return
      internalChangeRef.current = true
      prevValueRef.current = text
      onChange(text)

      // Defer @ detection to avoid blocking input
      requestAnimationFrame(() => {
        if (!editorRef.current) return
        const before = getTextBeforeCursor(editorRef.current)
        const atMatch = before.match(/@(\S*)$/)
        if (atMatch) {
          onAtState(true, atMatch[1])
        } else {
          onAtState(false, '')
        }
      })
    }, [onChange, onAtState])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === 'Backspace') {
        const sel = window.getSelection()
        if (!sel || !sel.rangeCount) return
        const range = sel.getRangeAt(0)
        if (!range.collapsed) return

        const node = range.startContainer
        const prevSibling = node.previousSibling
        if (prevSibling instanceof HTMLElement && prevSibling.hasAttribute('data-element-name')) {
          e.preventDefault()
          prevSibling.remove()
          if (!internalChangeRef.current) {
            const text = extractText(editorRef.current!)
            internalChangeRef.current = true
            prevValueRef.current = text
            onChange(text)
          }
          return
        }
      }

      if (e.key === 'Delete') {
        const sel = window.getSelection()
        if (!sel || !sel.rangeCount) return
        const range = sel.getRangeAt(0)
        if (!range.collapsed) return

        const node = range.startContainer
        const nextSibling = node.nextSibling
        if (nextSibling instanceof HTMLElement && nextSibling.hasAttribute('data-element-name')) {
          e.preventDefault()
          nextSibling.remove()
          if (!internalChangeRef.current) {
            const text = extractText(editorRef.current!)
            internalChangeRef.current = true
            prevValueRef.current = text
            onChange(text)
          }
          return
        }
      }
      onKeyDown?.(e)
    }, [onChange, onKeyDown])

    useImperativeHandle(ref, () => ({
      getText: () => {
        const editor = editorRef.current
        return editor ? extractText(editor) : ''
      },
      setText: (text: string) => {
        const editor = editorRef.current
        if (!editor) return
        internalChangeRef.current = true
        prevValueRef.current = text
        renderHTML(editor, text, elements)
        onChange(text)
        internalChangeRef.current = false
      },
      insertBadge: (el: StudioElement) => {
        const editor = editorRef.current
        if (!editor) return
        const sel = window.getSelection()
        if (!sel || !sel.rangeCount) return

        const before = getTextBeforeCursor(editor)
        const atMatch = before.match(/@(\S*)$/)
        if (!atMatch) return

        const range = sel.getRangeAt(0)
        const textNode = range.startContainer
        if (textNode.nodeType === Node.TEXT_NODE) {
          const startOffset = range.startOffset - atMatch[0].length
          range.setStart(textNode, Math.max(0, startOffset))
          range.setEnd(textNode, range.endOffset)
          range.deleteContents()
        }

        const badge = createBadgeElement(el.name, el)
        range.insertNode(badge)

        // nbsp + move cursor after
        const space = document.createTextNode('\u00A0')
        range.setStartAfter(badge)
        range.insertNode(space)
        range.setStartAfter(space)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)

        internalChangeRef.current = true
        onAtState(false, '')
        prevValueRef.current = extractText(editor)
        onChange(prevValueRef.current)
        internalChangeRef.current = false
      },
      focus: () => editorRef.current?.focus(),
    }), [elements, onChange, onAtState])

    return (
      <div className={`relative ${className || ''}`}>
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onCompositionEnd={() => {
            // After IME composition, manually trigger input check
            setTimeout(() => {
              const editor = editorRef.current
              if (!editor || internalChangeRef.current) return
              const text = extractText(editor)
              internalChangeRef.current = true
              prevValueRef.current = text
              onChange(text)
            }, 0)
          }}
          onPaste={(e) => {
            e.preventDefault()
            const text = e.clipboardData.getData('text/plain')
            if (!text) return
            const sel = window.getSelection()
            if (!sel || !sel.rangeCount) return
            const range = sel.getRangeAt(0)
            range.deleteContents()
            const parts = text.split('\n')
            const frag = document.createDocumentFragment()
            for (let i = 0; i < parts.length; i++) {
              if (i > 0) frag.appendChild(document.createElement('br'))
              if (parts[i] !== '') frag.appendChild(document.createTextNode(parts[i]))
            }
            range.insertNode(frag)
            range.collapse(false)
            sel.removeAllRanges()
            sel.addRange(range)
            if (!internalChangeRef.current) {
              const editor = editorRef.current!
              internalChangeRef.current = true
              prevValueRef.current = extractText(editor)
              onChange(prevValueRef.current)
            }
          }}
          onBlur={() => onAtState(false, '')}
          onClick={(e) => {
            const target = e.target as HTMLElement
            const badge = target.closest('[data-element-name]') as HTMLElement | null
            if (badge) {
              const name = badge.getAttribute('data-element-name')
              if (name) onBadgeClick?.(name, badge.getBoundingClientRect())
            }
          }}
          data-placeholder={placeholder}
          className="w-full bg-transparent text-sm text-surface-100 resize-none outline-none px-3 py-2.5 min-h-[42px] max-h-[120px] leading-relaxed overflow-y-auto break-words"
          style={{
            caretColor: '#a78bfa',
            wordBreak: 'break-word',
          }}
          role="textbox"
          aria-multiline="true"
        />
        <style>{`
          [data-placeholder]:empty::before {
            content: attr(data-placeholder);
            color: #6b7280;
            pointer-events: none;
          }
        `}</style>
      </div>
    )
  }
)
