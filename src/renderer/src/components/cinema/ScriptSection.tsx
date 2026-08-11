import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useCinemaStore, type CinemaElement, type ElementType, type ScriptType, SCRIPT_TYPE_LABELS, type ScriptVersion } from '../../stores/cinema-store'
import { FileText, Save, History, RotateCcw, Trash2, X, Sparkles, Bot, Send, User, Loader, ChevronDown, Plus, Link, Check, Wrench, ArrowRight, Play, Square, Eye, Camera, PenTool, Clapperboard, Lightbulb, Image, Layout } from 'lucide-react'
import { MessageScrollerProvider, MessageScroller, MessageScrollerViewport, MessageScrollerContent, MessageScrollerItem, MessageScrollerButton } from '../ui/message-scroller'

const TYPE_CONFIG: Record<ElementType, { icon: typeof User; color: string; bg: string; prefix: string; label: string }> = {
  character: { icon: User, color: 'text-blue-400', bg: 'bg-blue-500/10', prefix: 'char', label: 'Personaje' },
  object: { icon: Box, color: 'text-amber-400', bg: 'bg-amber-500/10', prefix: 'obj', label: 'Objeto' },
  scenario: { icon: Box, color: 'text-emerald-400', bg: 'bg-emerald-500/10', prefix: 'scn', label: 'Escenario' },
}

const AGENT_TEAM = [
  { key: 'estratega', icon: Lightbulb, color: 'text-yellow-400', label: 'Estratega' },
  { key: 'guionista', icon: PenTool, color: 'text-blue-400', label: 'Guionista' },
  { key: 'director', icon: Clapperboard, color: 'text-purple-400', label: 'Director' },
  { key: 'foto', icon: Camera, color: 'text-cyan-400', label: 'DF' },
  { key: 'prompteng', icon: Sparkles, color: 'text-amber-400', label: 'Prompt Eng' },
  { key: 'designer', icon: User, color: 'text-pink-400', label: 'Designer' },
  { key: 'storyboard', icon: Image, color: 'text-emerald-400', label: 'Storyboard' },
  { key: 'productor', icon: Layout, color: 'text-slate-400', label: 'Productor' },
  { key: 'editor', icon: Eye, color: 'text-rose-400', label: 'Editor' },
]

interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  toolCall?: { name: string; args: Record<string, any>; id: string; applied: boolean }
  toolResult?: { id: string; name: string; result: string }
}

const AGENT_TOOLS = [
  { name: 'define_concept', description: 'Define logline, tema y resumen de la historia', input_schema: { type: 'object', properties: { logline: { type: 'string' }, theme: { type: 'string' }, storySummary: { type: 'string' } }, required: ['logline'] } },
  { name: 'create_characters', description: 'Crea múltiples personajes con descripción y stylesheet visual', input_schema: { type: 'object', properties: { characters: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, stylesheet: { type: 'string' } }, required: ['name', 'description'] } } }, required: ['characters'] } },
  { name: 'write_script_section', description: 'Escribe sección del guión en markdown (## escenas, ### tomas)', input_schema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] } },
]

function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9) }

export function ScriptSection({ projectId }: { projectId: string }) {
  const script = useCinemaStore(s => s.scripts[projectId] || '')
  const elements = useCinemaStore(s => s.elements[projectId] || [])
  const scriptType = useCinemaStore(s => s.scriptTypes[projectId] || 'free')
  const projectConfig = useCinemaStore(s => s.projectConfigs[projectId])
  const versions = useCinemaStore(s => s.scriptVersions[projectId] || [])
  const setScript = useCinemaStore(s => s.setScript)
  const setScriptType = useCinemaStore(s => s.setScriptType)
  const saveScriptVersion = useCinemaStore(s => s.saveScriptVersion)
  const restoreScriptVersion = useCinemaStore(s => s.restoreScriptVersion)
  const deleteScriptVersion = useCinemaStore(s => s.deleteScriptVersion)
  const addElement = useCinemaStore(s => s.addElement)
  const updateProjectConfig = useCinemaStore(s => s.updateProjectConfig)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showAgent, setShowAgent] = useState(false)
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([])
  const [agentInput, setAgentInput] = useState('')
  const [agentRunning, setAgentRunning] = useState(false)
  const [agentStreaming, setAgentStreaming] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [saveLabel, setSaveLabel] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [showTypes, setShowTypes] = useState(false)
  const [selectionText, setSelectionText] = useState('')
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null)
  const [selectionPopover, setSelectionPopover] = useState<{ x: number; y: number } | null>(null)
  const [popoverMode, setPopoverMode] = useState<'menu' | 'create' | 'connect'>('menu')
  const [newElementType, setNewElementType] = useState<ElementType>('character')
  const [newElementName, setNewElementName] = useState('')
  const [connectSearch, setConnectSearch] = useState('')
  const [connectSelectedIdx, setConnectSelectedIdx] = useState(0)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState(0)
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0)

  const handleChange = useCallback((value: string) => { setScript(projectId, value) }, [projectId, setScript])

  const filteredElements = useMemo(() => mentionQuery ? elements.filter(e => e.name.toLowerCase().includes(mentionQuery.toLowerCase())) : elements, [elements, mentionQuery])
  const groupedElements = useMemo(() => {
    const g: Record<ElementType, CinemaElement[]> = { character: [], object: [], scenario: [] }
    for (const el of filteredElements) g[el.type].push(el)
    return g
  }, [filteredElements])
  const flatFiltered = useMemo(() => [...groupedElements.character, ...groupedElements.object, ...groupedElements.scenario], [groupedElements])
  useEffect(() => { setSelectedMentionIdx(0) }, [mentionQuery])

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value; handleChange(value)
    const ta = textareaRef.current; if (!ta) return
    const cursorPos = ta.selectionStart; const textBefore = value.slice(0, cursorPos)
    const atIdx = textBefore.lastIndexOf('@')
    if (atIdx !== -1 && atIdx >= cursorPos - 30 && !textBefore.slice(atIdx + 1).match(/^(char|obj|scn):/)) {
      setMentionQuery(textBefore.slice(atIdx + 1)); setMentionStart(atIdx); setMentionOpen(true)
    } else { setMentionOpen(false) }
  }
  const insertMention = (el: CinemaElement) => {
    const ta = textareaRef.current; if (!ta) return
    const m = `@${TYPE_CONFIG[el.type].prefix}:${el.name} `
    handleChange(script.slice(0, mentionStart) + m + script.slice(ta.selectionStart)); setMentionOpen(false)
    setTimeout(() => { ta.focus(); ta.setSelectionRange(mentionStart + m.length, mentionStart + m.length) }, 0)
  }
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionOpen) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedMentionIdx(i => Math.min(i + 1, flatFiltered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedMentionIdx(i => Math.max(i - 1, 0)) }
    else if ((e.key === 'Enter' || e.key === 'Tab') && flatFiltered.length > 0) { e.preventDefault(); insertMention(flatFiltered[selectedMentionIdx]) }
    else if (e.key === 'Escape') setMentionOpen(false)
  }
  const handleTextareaMouseUp = () => {
    const ta = textareaRef.current; if (!ta) return
    const s = ta.selectionStart; const e = ta.selectionEnd
    if (s === e) { setSelectionPopover(null); return }
    const sel = ta.value.slice(s, e).trim()
    if (!sel || sel.length > 60 || sel.includes('\n')) { setSelectionPopover(null); return }
    setSelectionText(sel); setSelectionRange({ start: s, end: e }); setNewElementName(sel); setConnectSearch(''); setConnectSelectedIdx(0); setPopoverMode('menu')
    const rect = ta.getBoundingClientRect(); const textBefore = ta.value.slice(0, s); const lines = textBefore.split('\n')
    setSelectionPopover({ x: rect.left + Math.min(lines[lines.length - 1].length * 8, rect.width - 200) + 8, y: rect.top + Math.min((lines.length + 1) * 20, rect.height - 100) })
  }
  const replaceSelectedText = (replacement: string) => {
    if (!selectionRange) return
    const { start, end } = selectionRange; handleChange(script.slice(0, start) + replacement + script.slice(end))
    setTimeout(() => { const t = textareaRef.current; if (t) { t.focus(); t.setSelectionRange(start + replacement.length, start + replacement.length) } }, 0)
  }
  const handleCreateElement = () => {
    if (!newElementName.trim() || !selectionRange) return
    addElement(projectId, { name: newElementName.trim(), type: newElementType, description: '', stylesheet: '', voiceId: '', imageBase64: '' })
    replaceSelectedText(`@${TYPE_CONFIG[newElementType].prefix}:${newElementName.trim()} `); setSelectionPopover(null)
  }
  const handleConnectElement = (el: CinemaElement) => { if (!selectionRange) return; replaceSelectedText(`@${TYPE_CONFIG[el.type].prefix}:${el.name} `); setSelectionPopover(null) }
  useEffect(() => { const h = (e: MouseEvent) => { if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setSelectionPopover(null) }; if (selectionPopover) { document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) } }, [selectionPopover])
  const connectFiltered = useMemo(() => connectSearch ? elements.filter(e => e.name.toLowerCase().includes(connectSearch.toLowerCase())) : elements, [elements, connectSearch])

  const sortedVersions = useMemo(() => [...versions].reverse(), [versions])
  const handleSaveVersion = () => { if (saveLabel.trim()) { saveScriptVersion(projectId, saveLabel.trim()); setSaveLabel(''); setShowSaveInput(false) } }
  const handleRestoreVersion = (v: ScriptVersion) => { if (script.trim() && !confirm('¿Restaurar esta versión?')) return; restoreScriptVersion(projectId, v.id); setShowHistory(false) }

  // ---- Agent ----
  const handleAgentSend = async (text?: string) => {
    const message = (text || agentInput).trim()
    if (!message || agentRunning) return
    const userMsg: AgentMessage = { id: uid(), role: 'user', content: message }
    setAgentInput('')
    setAgentMessages(prev => [...prev, userMsg])
    await runAgent([...agentMessages, userMsg])
  }
  const runAgent = async (messages: AgentMessage[]) => {
    setAgentRunning(true); setAgentStreaming(''); abortRef.current = new AbortController()
    try {
      const teamList = AGENT_TEAM.map((a, i) => `${i + 1}. ${a.label} - ${['Brief y concepto', 'Guion con tiempos', 'Shot list', 'Lentes e iluminación', 'Prompts IA', 'Diseño personajes', 'Storyboard', 'Versiones y entregables', 'Ritmo y montaje'][i]}`).join('\n')
      const configInfo = projectConfig ? `\nProyecto: ${SCRIPT_TYPE_LABELS[scriptType]} | ${projectConfig.genre || 'Drama'} | ${projectConfig.tone || 'Realista'} | ${projectConfig.visualStyle || 'Cinematográfico'}` : ''
      const sysMsg = `Eres un PRODUCTOR CREATIVO de Cinema Studio. Tienes un equipo de 9 especialistas que trabajan para ti. Tú decides quién hace cada tarea.

Tu equipo:
${teamList}

Pipeline: Estrategia → Guion → Personajes → Storyboard → Video → Edición${configInfo}${projectConfig?.logline ? `\nLogline: ${projectConfig.logline}` : ''}

REGLAS: Indica siempre qué especialista está trabajando (ej: "[Guionista] Aquí va el guion..."). Una tarea a la vez. Máximo 250 palabras. Español.`

      const apiMessages = [{ role: 'system', content: sysMsg }, ...messages.map(m => {
        if (m.role === 'tool' && m.toolResult) return { role: 'tool', tool_call_id: m.toolResult.id, content: m.toolResult.result }
        if (m.role === 'assistant' && m.toolCall) return { role: 'assistant', content: m.content || '', tool_calls: [{ id: m.toolCall.id, type: 'function', function: { name: m.toolCall.name, arguments: JSON.stringify(m.toolCall.args) } }] }
        return { role: m.role, content: m.content }
      })]

      const api = (window as any).electronAPI; const useSim = !api?.openfield?.agentChat
      let response: any
      if (useSim) { await new Promise(r => setTimeout(r, 1000)); response = simulateAgentResponse(messages[messages.length - 1].content) }
      else { response = await api.openfield.agentChat({ messages: apiMessages, model: 'claude-opus-4-20250514', tools: AGENT_TOOLS, stream: false }) }

      let assistantContent = response?.content || response?.message?.content || ''
      if (/^[a-z0-9]{8,30}$/.test(assistantContent.trim())) assistantContent = ''
      const toolCalls = response?.tool_calls || response?.message?.tool_calls || []

      const assistantMsg: AgentMessage = { id: uid(), role: 'assistant', content: assistantContent || (toolCalls.length > 0 ? 'Trabajando...' : '¿En qué más te ayudo?') }
      const newMessages = [...messages, assistantMsg]

      if (toolCalls.length > 0) {
        for (const tc of toolCalls) {
          const fn = tc.function || tc; let args: any = {}
          try { args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments } catch { args = {} }
          const result = executeAgentTool(fn.name, args)
          newMessages.push({ id: uid(), role: 'tool', content: '', toolResult: { id: tc.id, name: fn.name, result } })
          assistantMsg.toolCall = { name: fn.name, args, id: tc.id, applied: fn.name !== 'mark_phase_complete' }
        }
      }
      setAgentMessages(newMessages)
    } catch (err: any) { if (err?.name !== 'AbortError') setAgentMessages(prev => [...prev, { id: uid(), role: 'system', content: `Error: ${err?.message || err}` }]) }
    finally { setAgentRunning(false); setAgentStreaming(''); abortRef.current = null }
  }
  const handleStopAgent = () => { abortRef.current?.abort(); setAgentRunning(false); setAgentStreaming('') }

  function executeAgentTool(name: string, args: Record<string, any>): string {
    switch (name) {
      case 'write_script_section': { const c = args.content || ''; setScript(projectId, script ? script + '\n\n' + c : c); return `Guión actualizado (${c.length} caracteres)` }
      case 'define_concept': { updateProjectConfig(projectId, { logline: args.logline || '', theme: args.theme || '', storySummary: args.storySummary || '' }); return `Concepto: "${(args.logline || '').slice(0, 80)}"` }
      case 'create_characters': { for (const c of (args.characters || [])) addElement(projectId, { name: c.name || '?', type: 'character', description: c.description || '', stylesheet: c.stylesheet || '', voiceId: '', imageBase64: '' }); return `${(args.characters || []).length} personajes creados` }
      default: return `"${name}" ejecutado`
    }
  }

  const handleApplyTool = (msg: AgentMessage) => {
    if (!msg.toolCall || msg.toolCall.applied) return
    executeAgentTool(msg.toolCall.name, msg.toolCall.args)
    setAgentMessages(prev => prev.map(m => m.id === msg.id ? { ...m, toolCall: { ...m.toolCall!, applied: true } } : m))
  }

  useEffect(() => {
    if (showAgent && agentMessages.length === 0) {
      setAgentRunning(true)
      setTimeout(() => {
        setAgentMessages([{ id: uid(), role: 'assistant', content: '¡Hola! Soy tu **Productor Creativo**. Tengo un equipo de 9 especialistas listos para ayudarte con todo el pipeline de producción audiovisual.\n\nEmpecemos por el principio. **[Estratega]** Cuéntame: ¿qué proyecto tienes en mente? ¿Género, tono, idea general?' }])
        setAgentRunning(false)
      }, 600)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAgent])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-800">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-accent-400" /><h2 className="text-sm font-semibold text-surface-100">Guión</h2>
          <div className="relative ml-3">
            <button onClick={() => setShowTypes(!showTypes)} className="flex items-center gap-1 px-2.5 py-1 bg-surface-800 hover:bg-surface-700 rounded-lg text-xs text-surface-300"><span className="text-accent-400/80">{SCRIPT_TYPE_LABELS[scriptType]}</span><ChevronDown size={12} /></button>
            {showTypes && (<div className="absolute top-full left-0 mt-1 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[180px] shadow-xl z-50">{(Object.entries(SCRIPT_TYPE_LABELS) as [ScriptType, string][]).map(([k, l]) => (<button key={k} onClick={() => { setScriptType(projectId, k); setShowTypes(false) }} className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between ${scriptType === k ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/50'}`}>{l}{scriptType === k && <Check size={12} />}</button>))}</div>)}
          </div>
          <span className="hidden xl:block text-[10px] text-surface-600 max-w-sm truncate">{projectConfig?.logline || 'Sin logline'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {showSaveInput ? (<div className="flex items-center gap-1"><input value={saveLabel} onChange={e => setSaveLabel(e.target.value)} placeholder="v1.0..." className="bg-surface-800 border border-surface-700 rounded-lg px-2 py-1 text-xs text-surface-100 outline-none w-24" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSaveVersion(); if (e.key === 'Escape') { setShowSaveInput(false); setSaveLabel('') } }} /><button onClick={handleSaveVersion} className="p-1 text-accent-400"><Check size={14} /></button><button onClick={() => { setShowSaveInput(false); setSaveLabel('') }} className="p-1 text-surface-500"><X size={14} /></button></div>) : (<button onClick={() => setShowSaveInput(true)} disabled={!script.trim()} className="btn-ghost text-xs flex items-center gap-1"><Save size={12} /> Guardar</button>)}
          <div className="relative">
            <button onClick={() => setShowHistory(!showHistory)} disabled={versions.length === 0} className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-40"><History size={12} /> v{versions.length}</button>
            {showHistory && versions.length > 0 && (<div className="absolute top-full right-0 mt-1 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[260px] shadow-xl z-50 max-h-[260px] overflow-y-auto"><div className="px-3 py-1.5 text-[10px] text-surface-500 uppercase tracking-wider">Versiones</div>{sortedVersions.map(v => (<div key={v.id} className="flex items-center group px-3 py-1.5 hover:bg-surface-700/50"><div className="flex-1 min-w-0"><p className="text-xs text-surface-300 truncate">{v.label}</p><p className="text-[10px] text-surface-600">{new Date(v.timestamp).toLocaleString()}</p></div><div className="flex items-center gap-1 opacity-0 group-hover:opacity-100"><button onClick={() => handleRestoreVersion(v)} className="p-1 text-surface-500 hover:text-accent-400"><RotateCcw size={12} /></button><button onClick={() => deleteScriptVersion(projectId, v.id)} className="p-1 text-surface-500 hover:text-red-400"><Trash2 size={12} /></button></div></div>))}</div>)}
          </div>
          <button onClick={() => setShowAgent(!showAgent)} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${showAgent ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'btn-ghost text-xs'}`}><Sparkles size={12} /> Productor</button>
        </div>
      </div>

      <div className="flex-1 flex relative">
        <div className="w-full flex flex-col relative overflow-hidden min-h-0">
          <textarea ref={textareaRef} value={script} onChange={handleTextareaChange} onBlur={() => setTimeout(() => { setMentionOpen(false) }, 200)} onKeyDown={handleKeyDown} onMouseUp={handleTextareaMouseUp} placeholder={`## Escena 1: Título\nDescripción... @char:Nombre @scn:Lugar\n\n### Toma 1\nPlano general. @char:Protagonista...`} className="flex-1 bg-transparent text-sm text-surface-200 p-4 resize-none outline-none leading-relaxed font-mono placeholder-surface-600" spellCheck={false} />
          {selectionPopover && (<div ref={popoverRef} className="fixed z-50 bg-surface-800 border border-surface-700 rounded-xl shadow-xl min-w-[220px] overflow-hidden" style={{ left: selectionPopover.x, top: selectionPopover.y }}>
            {popoverMode === 'menu' && (<div className="py-1"><p className="px-3 py-1.5 text-[10px] text-surface-500 uppercase tracking-wider">"{selectionText.slice(0, 25)}{selectionText.length > 25 ? '...' : ''}"</p><button onClick={() => { setPopoverMode('create'); setNewElementName(selectionText) }} className="w-full text-left px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700/50 flex items-center gap-2"><Plus size={12} className="text-accent-400" /> Crear elemento</button><button onClick={() => { setPopoverMode('connect'); setConnectSearch('') }} className="w-full text-left px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700/50 flex items-center gap-2"><Link size={12} className="text-blue-400" /> Conectar elemento</button><button onClick={() => setSelectionPopover(null)} className="w-full text-left px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-700/50 flex items-center gap-2 mt-1 border-t border-surface-700"><X size={12} /> Cancelar</button></div>)}
            {popoverMode === 'create' && (<div className="p-3 space-y-3"><div className="flex items-center justify-between"><span className="text-xs font-medium text-surface-100">Crear elemento</span><button onClick={() => setPopoverMode('menu')} className="p-0.5 text-surface-500"><X size={14} /></button></div><div className="flex gap-1">{(['character', 'object', 'scenario'] as ElementType[]).map(t => { const I = TYPE_CONFIG[t].icon; return <button key={t} onClick={() => setNewElementType(t)} className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] ${newElementType === t ? 'bg-surface-700 text-surface-100' : 'bg-surface-800/50 text-surface-500'}`}><I size={11} className={TYPE_CONFIG[t].color} />{TYPE_CONFIG[t].label}</button> })}</div><input value={newElementName} onChange={e => setNewElementName(e.target.value)} className="input-field text-xs" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleCreateElement(); if (e.key === 'Escape') setPopoverMode('menu') }} placeholder="Nombre" /><div className="flex gap-2"><button onClick={handleCreateElement} disabled={!newElementName.trim()} className="btn-primary text-xs flex-1 justify-center flex items-center gap-1"><Check size={12} /> Crear y taguear</button><button onClick={() => setPopoverMode('menu')} className="btn-ghost text-xs">Volver</button></div></div>)}
            {popoverMode === 'connect' && (<div className="p-3 space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-medium text-surface-100">Conectar</span><button onClick={() => setPopoverMode('menu')} className="p-0.5 text-surface-500"><X size={14} /></button></div><input value={connectSearch} onChange={e => { setConnectSearch(e.target.value); setConnectSelectedIdx(0) }} placeholder="Buscar..." className="input-field text-xs" autoFocus onKeyDown={e => { if (e.key === 'ArrowDown') setConnectSelectedIdx(i => Math.min(i + 1, connectFiltered.length - 1)); if (e.key === 'ArrowUp') { e.preventDefault(); setConnectSelectedIdx(i => Math.max(i - 1, 0)) }; if (e.key === 'Enter' && connectFiltered.length > 0) handleConnectElement(connectFiltered[connectSelectedIdx]); if (e.key === 'Escape') setPopoverMode('menu') }} /><div className="max-h-[160px] overflow-y-auto">{connectFiltered.map((el, i) => { const I = TYPE_CONFIG[el.type].icon; return <button key={el.id} onClick={() => handleConnectElement(el)} onMouseEnter={() => setConnectSelectedIdx(i)} className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 ${i === connectSelectedIdx ? 'bg-accent-500/10 text-accent-300' : 'text-surface-300 hover:bg-surface-700/50'}`}><I size={11} className={TYPE_CONFIG[el.type].color} /><span className="flex-1">{el.name}</span><span className="text-[10px] text-surface-600">@{TYPE_CONFIG[el.type].prefix}:</span></button> })}</div><button onClick={() => setPopoverMode('menu')} className="btn-ghost text-xs w-full text-center">Volver</button></div>)}
          </div>)}
          {mentionOpen && flatFiltered.length > 0 && (<div className="absolute z-40 bottom-0 left-0 bg-surface-800 border border-surface-700 rounded-xl shadow-xl py-1 max-h-[240px] overflow-y-auto min-w-[200px]">{(['character', 'object', 'scenario'] as ElementType[]).map(type => { const items = groupedElements[type]; if (items.length === 0) return null; return (<div key={type}><div className="px-3 py-0.5 text-[10px] text-surface-500 uppercase flex items-center gap-1">{(() => { const I = TYPE_CONFIG[type].icon; return <I size={10} className={TYPE_CONFIG[type].color} /> })()}{' '}{TYPE_CONFIG[type].label}s</div>{items.map(el => { const idx = flatFiltered.indexOf(el); const I = TYPE_CONFIG[el.type].icon; return (<button key={el.id} onClick={() => insertMention(el)} onMouseEnter={() => setSelectedMentionIdx(idx)} className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${idx === selectedMentionIdx ? 'bg-accent-500/10 text-accent-300' : 'text-surface-300 hover:bg-surface-700/50'}`}><I size={11} className={TYPE_CONFIG[el.type].color} /><span className="flex-1">{el.name}</span><span className="text-[10px] text-surface-600">@{TYPE_CONFIG[el.type].prefix}:</span></button>) })})</div>) })})</div>)}
        </div>

        {showAgent && (
          <div className="absolute bottom-4 right-4 z-40 w-[380px] max-h-[550px] bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-3 py-2.5 border-b border-surface-800 flex-shrink-0 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center"><Sparkles size={12} className="text-purple-400" /></div>
                  <div><span className="text-xs font-semibold text-surface-200">Productor Creativo</span><p className="text-[10px] text-surface-500">9 especialistas · Pipeline completo</p></div>
                </div>
                <div className="flex items-center gap-1">
                  {agentRunning && <button onClick={handleStopAgent} className="p-1 text-surface-500 hover:text-red-400"><Square size={12} /></button>}
                  <button onClick={() => setShowAgent(false)} className="p-1 text-surface-500 hover:text-surface-100"><X size={14} /></button>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                {AGENT_TEAM.map(a => {
                  const Icon = a.icon
                  return <div key={a.key} className="flex-1 h-3.5 rounded-sm bg-surface-800 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity" title={a.label}><Icon size={7} className={a.color} /></div>
                })}
              </div>
            </div>

            <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
              <MessageScroller className="flex-1">
                <MessageScrollerViewport>
                  <MessageScrollerContent>
                    {agentMessages.length === 0 && (
                      <MessageScrollerItem>
                        <div className="flex flex-col items-center justify-center text-surface-600 gap-3 px-4 py-6 min-h-[200px]">
                          <Bot size={28} className="opacity-40" />
                          <p className="text-xs text-center max-w-[240px]">Productor con 9 especialistas listos para ayudarte con todo el pipeline.</p>
                          <div className="flex flex-wrap gap-1.5 justify-center">
                            {['Definir la estrategia', 'Escribir el guion', 'Crear personajes', 'Diseñar storyboard'].map(s => (<button key={s} onClick={() => handleAgentSend(s)} className="px-2 py-1 bg-surface-800 hover:bg-surface-700 rounded-lg text-[11px] text-surface-400 hover:text-surface-200 transition-colors">{s}</button>))}
                          </div>
                        </div>
                      </MessageScrollerItem>
                    )}
                    {agentMessages.map((msg) => {
                      const renderContent = () => {
                        if (msg.role === 'system') return <div className="text-center"><p className="text-[11px] text-red-400 bg-red-500/5 rounded-lg px-3 py-1 inline-block">{msg.content}</p></div>
                        if (msg.role === 'tool' && msg.toolResult) return <div className="flex gap-2"><div className="w-5 flex-shrink-0 flex items-center justify-center"><Check size={12} className="text-green-400" /></div><div className="bg-green-500/5 border border-green-500/10 rounded-xl px-3 py-1.5 max-w-[85%]"><p className="text-[11px] text-green-400/80">{msg.toolResult.result}</p></div></div>
                        if (msg.role === 'assistant' && msg.toolCall) {
                          const tc = msg.toolCall
                          const tl: Record<string, string> = { write_script_section: 'Escribir guion', define_concept: 'Definir concepto', create_characters: 'Crear personajes' }
                          return (<div className="space-y-1.5">
                            {msg.content && (<div className="flex gap-2"><AgentAvatar content={msg.content} /><div className="bg-surface-800 rounded-2xl rounded-tl-md px-3 py-2 max-w-[85%]"><p className="text-xs text-surface-200 whitespace-pre-wrap leading-relaxed">{msg.content}</p></div></div>)}
                            <div className="flex gap-2"><div className="w-5 flex-shrink-0 flex items-center justify-center"><Wrench size={12} className="text-amber-400" /></div><div className={`rounded-xl px-3 py-2 max-w-[85%] ${tc.applied ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-surface-800 border border-surface-700'}`}><p className="text-[10px] text-amber-400/80 uppercase tracking-wider mb-1 flex items-center gap-1"><Play size={10} />{' '}{tl[tc.name] || tc.name}</p>{tc.name === 'write_script_section' && <p className="text-xs text-surface-300 line-clamp-3 font-mono">{tc.args.content?.slice(0, 200)}</p>}{tc.name === 'define_concept' && <p className="text-xs text-surface-300">"{tc.args.logline?.slice(0, 100)}"</p>}{tc.name === 'create_characters' && <p className="text-xs text-surface-300">{(tc.args.characters || []).map((c: any) => c.name).join(', ')}</p>}{!tc.applied ? (<button onClick={() => handleApplyTool(msg)} className="mt-1.5 flex items-center gap-1 text-[10px] text-accent-400 hover:text-accent-300"><ArrowRight size={10} /> Aplicar</button>) : (<p className="mt-1 text-[10px] text-green-400/70 flex items-center gap-1"><Check size={10} /> Aplicado</p>)}</div></div>
                          </div>)
                        }
                        if (msg.role === 'assistant' || msg.role === 'user') {
                          const isUser = msg.role === 'user'
                          return (<div className={`flex gap-2 ${isUser ? 'justify-end' : ''}`}>{!isUser && <AgentAvatar content={msg.content} />}<div className={`max-w-[85%] rounded-2xl px-3 py-2 ${isUser ? 'bg-accent-600/20 border border-accent-500/30 rounded-tr-md' : 'bg-surface-800 rounded-tl-md'}`}><p className="text-xs text-surface-200 whitespace-pre-wrap leading-relaxed">{msg.content}</p></div>{isUser && <div className="w-5 h-5 rounded-full bg-surface-700 flex items-center justify-center flex-shrink-0 mt-0.5"><User size={10} className="text-surface-400" /></div>}</div>)
                        }
                        return null
                      }
                      return (
                        <MessageScrollerItem key={msg.id} messageId={msg.id} scrollAnchor={msg.role === 'user'}>
                          {renderContent()}
                        </MessageScrollerItem>
                      )
                    })}
                    {agentRunning && (
                      <MessageScrollerItem>
                        <div className="flex gap-2"><div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5"><Bot size={10} className="text-purple-400" /></div><div className="bg-surface-800 rounded-2xl rounded-tl-md px-3 py-2">{agentStreaming ? <p className="text-xs text-surface-200 whitespace-pre-wrap">{agentStreaming}<span className="animate-pulse">▌</span></p> : <Loader size={14} className="animate-spin text-purple-400" />}</div></div>
                      </MessageScrollerItem>
                    )}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </MessageScrollerProvider>

            <div className="p-3 border-t border-surface-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <input value={agentInput} onChange={e => setAgentInput(e.target.value)} placeholder="Habla con el productor..." className="input-field text-xs flex-1" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAgentSend() } }} disabled={agentRunning} />
                <button onClick={() => handleAgentSend()} disabled={!agentInput.trim() || agentRunning} className="p-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-lg text-white transition-colors flex-shrink-0"><Send size={14} /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AgentAvatar({ content }: { content: string }) {
  for (const a of AGENT_TEAM) {
    if (content.includes(`[${a.label}]`)) {
      const Icon = a.icon
      return <div className={`w-5 h-5 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0 mt-0.5 border border-purple-500/20`}><Icon size={10} className={a.color} /></div>
    }
  }
  return <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5"><Bot size={10} className="text-purple-400" /></div>
}

function simulateAgentResponse(userMsg: string): any {
  const lower = userMsg.toLowerCase()
  if (lower.includes('definir') || lower.includes('estrategia') || lower.includes('empez') || lower.includes('concepto') || lower.includes('idea') || lower.includes('historia') || lower.includes('contar') || lower.includes('proyecto')) {
    return { content: '**[Estratega]** Perfecto, analicemos el brief.\n\nPara definir la campaña necesito tres cosas:\n1. ¿Cuál es el mensaje central que quieres comunicar?\n2. ¿Quién es tu audiencia objetivo?\n3. ¿Qué emoción o acción debe generar el video?\n\nCuéntame y armamos el concepto creativo.' }
  }
  if (lower.includes('guion') || lower.includes('escrib') || lower.includes('escena') || lower.includes('script') || lower.includes('toma')) {
    const c = `## Escena 1: Apertura\nEl mundo se presenta ante el espectador. @char:Protagonista enfrenta el conflicto inicial que define la historia.\n\n### Toma 1\nPlano general del entorno. Cámara lenta. @char:Protagonista aparece en el horizonte.\n\n### Toma 2\nPlano medio. @char:Protagonista reacciona al evento desencadenante. Expresión de determinación.`
    return { content: '**[Guionista]** Perfecto, aquí tienes la primera escena siguiendo la estrategia que definimos.\n\nEstructura:\n- Escena 1: Apertura y presentación del conflicto\n- Toma 1: Plano general de ambientación\n- Toma 2: Plano medio del protagonista\n\n¿Ajustamos algo o pasamos a la siguiente escena?', tool_calls: [{ id: 'tc_' + uid(), type: 'function', function: { name: 'write_script_section', arguments: JSON.stringify({ content: c }) } }] }
  }
  if (lower.includes('personaje') || lower.includes('character') || lower.includes('diseñ') || lower.includes('crear personaje')) {
    return { content: '**[Character Designer]** Excelente, voy a crear los personajes principales con sus fichas de identidad visual para mantener consistencia en todas las generaciones.', tool_calls: [{ id: 'tc_' + uid(), type: 'function', function: { name: 'create_characters', arguments: JSON.stringify({ characters: [{ name: 'Protagonista', description: 'Personaje principal. Determinado/a, complejo/a, con un pasado que define sus acciones presentes. Mirada intensa, presencia magnética.', stylesheet: 'cinematic lighting, sharp facial features, modern textured clothing, late 20s-30s, expressive eyes' }, { name: 'Antagonista', description: 'Fuerza opositora. Elegante, calculador/a, motivaciones profundas y justificadas desde su perspectiva.', stylesheet: 'dark aesthetic, structured silhouette, cold gaze, 35-45, power presence, high contrast' }] }) } }] }
  }
  if (lower.includes('storyboard') || lower.includes('imagen') || lower.includes('visual')) {
    return { content: '**[Storyboard Artist]** Para el storyboard necesito trabajar sobre el guion ya escrito. Asegúrate de tener las escenas definidas en el editor y luego ve a la pestaña **Storyboard** para generar las imágenes de cada toma.\n\n¿Ya tienes el guion completo? Si no, pídele al Guionista que lo termine primero.' }
  }
  return { content: '**[Estratega]** ¿En qué fase del pipeline necesitas ayuda?\n\nPuedo trabajar con:\n- **Estratega** — Brief y concepto\n- **Guionista** — Guion y diálogos\n- **Director** — Shot list y planos\n- **Character Designer** — Personajes\n- **Storyboard Artist** — Imágenes\n- **Editor** — Montaje final\n\nDime por dónde empezamos.' }
}

function Box(props: { size?: number; className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 16} height={props.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
}
