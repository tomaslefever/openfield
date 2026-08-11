import { useRef, useState, useEffect } from 'react'
import { Eye, PenLine, Sparkles, Send, Bot, User, Loader, Square, Wrench, Play, Check, ArrowRight, X, Wand2, Users } from 'lucide-react'
import { MessageScrollerProvider, MessageScroller, MessageScrollerViewport, MessageScrollerContent, MessageScrollerItem, MessageScrollerButton } from '../ui/message-scroller'
import { ScriptMarkdown } from './ScriptMarkdown'
import { extractScriptElements } from '../../utils/script-elements'
import type { StoryboardElement } from '../../stores/storyboard-store'

interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  toolCall?: { name: string; args: Record<string, any>; id: string; applied: boolean }
  toolResult?: { id: string; name: string; result: string }
}

const AGENT_TOOLS = [
  { name: 'write_script_section', description: 'Escribe o reemplaza una sección del guión en markdown (## escenas, ### tomas, diálogos)', input_schema: { type: 'object', properties: { content: { type: 'string', description: 'Contenido markdown de la sección de guión' } }, required: ['content'] } },
  { name: 'create_elements', description: 'Crea elementos de la historia: personajes, locaciones y objetos', input_schema: { type: 'object', properties: { characters: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] } }, scenarios: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] } }, objects: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] } } }, required: [] } },
]

function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9) }

interface ScriptTabProps {
  script: string
  onScriptChange: (script: string) => void
  elements: StoryboardElement[]
  onCreateElements: (els: Omit<StoryboardElement, 'id'>[]) => number
  onSwitchToElements: () => void
}

export function ScriptTab({ script, onScriptChange, elements, onCreateElements, onSwitchToElements }: ScriptTabProps) {
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [showAgent, setShowAgent] = useState(true)
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([])
  const [agentInput, setAgentInput] = useState('')
  const [agentRunning, setAgentRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [extractResult, setExtractResult] = useState<{ created: number; total: number } | null>(null)

  const handleExtractElements = () => {
    const extracted = extractScriptElements(script)
    if (extracted.length === 0) {
      setExtractResult({ created: 0, total: 0 })
      return
    }
    const created = onCreateElements(extracted)
    setExtractResult({ created, total: extracted.length })
  }

  const handleAgentSend = async (text?: string) => {
    const message = (text || agentInput).trim()
    if (!message || agentRunning) return
    const userMsg: AgentMessage = { id: uid(), role: 'user', content: message }
    setAgentInput('')
    setAgentMessages(prev => [...prev, userMsg])
    await runAgent([...agentMessages, userMsg])
  }

  const runAgent = async (messages: AgentMessage[]) => {
    setAgentRunning(true)
    abortRef.current = new AbortController()
    try {
      const sysMsg = `Eres un GUIONISTA experto de storyboards. Escribes guiones en markdown español.
Formato:
## Escena 1: Título
Descripción breve de la escena.

### Toma 1
Plano medio. Acción...

PERSONAJE: diálogo

Usa @char:Nombre para personajes, @scn:Lugar para locaciones y @obj:Nombre para objetos.
Reglas: máximo 200 palabras por respuesta. Una tarea a la vez. Escribe el guión directamente con la herramienta write_script_section.`
      const apiMessages = [{ role: 'system', content: sysMsg }, ...messages.map(m => {
        if (m.role === 'tool' && m.toolResult) return { role: 'tool', tool_call_id: m.toolResult.id, content: m.toolResult.result }
        if (m.role === 'assistant' && m.toolCall) return { role: 'assistant', content: m.content || '', tool_calls: [{ id: m.toolCall.id, type: 'function', function: { name: m.toolCall.name, arguments: JSON.stringify(m.toolCall.args) } }] }
        return { role: m.role, content: m.content }
      })]

      const api = (window as any).electronAPI
      const useSim = !api?.openfield?.agentChat
      let response: any
      if (useSim) { await new Promise(r => setTimeout(r, 900)); response = simulateScriptAgent(messages[messages.length - 1].content) }
      else { response = await api.openfield.agentChat({ messages: apiMessages, model: 'claude-opus-4-20250514', tools: AGENT_TOOLS, stream: false }) }

      let assistantContent = response?.content || response?.message?.content || ''
      if (/^[a-z0-9]{8,30}$/.test(assistantContent.trim())) assistantContent = ''
      const toolCalls = response?.tool_calls || response?.message?.tool_calls || []

      const assistantMsg: AgentMessage = { id: uid(), role: 'assistant', content: assistantContent || (toolCalls.length > 0 ? 'Trabajando...' : '¿Qué más necesitas?') }
      const newMessages = [...messages, assistantMsg]

      if (toolCalls.length > 0) {
        for (const tc of toolCalls) {
          const fn = tc.function || tc
          let args: any = {}
          try { args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments } catch { args = {} }
          const result = executeAgentTool(fn.name, args)
          newMessages.push({ id: uid(), role: 'tool', content: '', toolResult: { id: tc.id, name: fn.name, result } })
          assistantMsg.toolCall = { name: fn.name, args, id: tc.id, applied: true }
        }
      }
      setAgentMessages(newMessages)
    } catch (err: any) {
      if (err?.name !== 'AbortError') setAgentMessages(prev => [...prev, { id: uid(), role: 'system', content: `Error: ${err?.message || err}` }])
    } finally {
      setAgentRunning(false)
      abortRef.current = null
    }
  }

  const handleStopAgent = () => { abortRef.current?.abort(); setAgentRunning(false) }

  function executeAgentTool(name: string, args: Record<string, any>): string {
    switch (name) {
      case 'write_script_section': {
        const content = (args.content || '').trim()
        if (!content) return 'Contenido vacío'
        onScriptChange(script ? `${script.replace(/\s+$/, '')}\n\n${content}` : content)
        return `Guión actualizado (${content.length} caracteres)`
      }
      case 'create_elements': {
        const els: Omit<StoryboardElement, 'id'>[] = [
          ...(args.characters || []).map((c: any) => ({ name: c.name || '', type: 'character' as const, description: c.description || '' })),
          ...(args.scenarios || []).map((c: any) => ({ name: c.name || '', type: 'scenario' as const, description: c.description || '' })),
          ...(args.objects || []).map((c: any) => ({ name: c.name || '', type: 'object' as const, description: c.description || '' })),
        ].filter(e => e.name.trim())
        const created = onCreateElements(els)
        return `${created} elementos creados`
      }
      default:
        return `"${name}" ejecutado`
    }
  }

  useEffect(() => {
    if (showAgent && agentMessages.length === 0) {
      setAgentRunning(true)
      setTimeout(() => {
        setAgentMessages([{ id: uid(), role: 'assistant', content: '¡Hola! Soy tu **asistente de guión**. Dame una idea, un logline o una historia y escribo las escenas (`## Escena`) y tomas (`### Toma`) en markdown.\n\nTambién puedo **crear los elementos** (personajes, locaciones, objetos) directamente desde el guión.' }])
        setAgentRunning(false)
      }, 500)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAgent])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-surface-800 flex-shrink-0">
        <div className="flex items-center gap-1 bg-surface-800/60 rounded-lg p-0.5">
          <button onClick={() => setView('edit')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${view === 'edit' ? 'bg-surface-700 text-surface-100' : 'text-surface-500 hover:text-surface-300'}`}>
            <PenLine size={11} /> Editar
          </button>
          <button onClick={() => setView('preview')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${view === 'preview' ? 'bg-surface-700 text-surface-100' : 'text-surface-500 hover:text-surface-300'}`}>
            <Eye size={11} /> Vista
          </button>
        </div>

        <button
          onClick={handleExtractElements}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-600 hover:bg-accent-500 text-white transition-colors"
        >
          <Wand2 size={12} /> Crear elements
        </button>

        {extractResult && (
          <div className="flex items-center gap-2 text-[11px]">
            {extractResult.total === 0 ? (
              <span className="text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-2.5 py-1">No se encontraron elementos en el guión</span>
            ) : (
              <span className={`rounded-lg px-2.5 py-1 border ${extractResult.created > 0 ? 'text-green-400 bg-green-500/10 border-green-500/30' : 'text-surface-500 bg-surface-800 border-surface-700'}`}>
                {extractResult.created > 0
                  ? `${extractResult.created} elementos creados de ${extractResult.total} detectados`
                  : `${extractResult.total} detectados (ya existen)`}
              </span>
            )}
            <button onClick={() => onSwitchToElements()} className="text-accent-400 hover:text-accent-300 flex items-center gap-1">
              <Users size={12} /> Ver elements <ArrowRight size={10} />
            </button>
            <button onClick={() => setExtractResult(null)} className="text-surface-600 hover:text-surface-300"><X size={12} /></button>
          </div>
        )}

        <div className="flex-1" />
        <span className="text-[10px] text-surface-600">{elements.length} elements · {script.length} chars</span>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Script area */}
        <div className="flex-1 min-w-0 relative">
          {view === 'edit' ? (
            <textarea
              value={script}
              onChange={e => onScriptChange(e.target.value)}
              placeholder={`## Escena 1: Apertura\nDescripción de la escena...\n\n### Toma 1\nPlano general del entorno. @char:Protagonista aparece en escena.\n\nPROTAGONISTA: diálogo de apertura.\n\n### Toma 2\nPlano medio. Reacción.`}
              className="w-full h-full bg-transparent text-sm text-surface-200 p-4 resize-none outline-none leading-relaxed font-mono placeholder-surface-600"
              spellCheck={false}
            />
          ) : (
            <div className="w-full h-full overflow-y-auto p-4">
              <ScriptMarkdown text={script} className="max-w-3xl mx-auto space-y-1" />
            </div>
          )}
        </div>

        {/* Assistant panel */}
        {showAgent && (
          <div className="w-[340px] border-l border-surface-800 flex flex-col min-h-0 flex-shrink-0">
            <div className="px-3 py-2.5 border-b border-surface-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center"><Sparkles size={12} className="text-purple-400" /></div>
                <div>
                  <span className="text-xs font-semibold text-surface-200">Asistente de guión</span>
                  <p className="text-[10px] text-surface-500">Escribe escenas y crea elementos</p>
                </div>
              </div>
              <button onClick={() => setShowAgent(false)} className="p-1 text-surface-500 hover:text-surface-100"><X size={14} /></button>
            </div>

            <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
              <MessageScroller className="flex-1">
                <MessageScrollerViewport>
                  <MessageScrollerContent>
                    {agentMessages.map((msg) => {
                      const renderContent = () => {
                        if (msg.role === 'system') return <div className="text-center"><p className="text-[11px] text-red-400 bg-red-500/5 rounded-lg px-3 py-1 inline-block">{msg.content}</p></div>
                        if (msg.role === 'tool' && msg.toolResult) return <div className="flex gap-2"><div className="w-5 flex-shrink-0 flex items-center justify-center"><Check size={12} className="text-green-400" /></div><div className="bg-green-500/5 border border-green-500/10 rounded-xl px-3 py-1.5 max-w-[85%]"><p className="text-[11px] text-green-400/80">{msg.toolResult.result}</p></div></div>
                        if (msg.role === 'assistant' && msg.toolCall) {
                          const tc = msg.toolCall
                          const tl: Record<string, string> = { write_script_section: 'Escribir en el guión', create_elements: 'Crear elements' }
                          return (
                            <div className="space-y-1.5">
                              {msg.content && (
                                <div className="flex gap-2">
                                  <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5"><Bot size={10} className="text-purple-400" /></div>
                                  <div className="bg-surface-800 rounded-2xl rounded-tl-md px-3 py-2 max-w-[85%]"><p className="text-xs text-surface-200 whitespace-pre-wrap leading-relaxed">{msg.content}</p></div>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <div className="w-5 flex-shrink-0 flex items-center justify-center"><Wrench size={12} className="text-amber-400" /></div>
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 max-w-[85%]">
                                  <p className="text-[10px] text-amber-400/80 uppercase tracking-wider mb-1 flex items-center gap-1"><Play size={10} /> {tl[tc.name] || tc.name}</p>
                                  {tc.name === 'write_script_section' && <p className="text-xs text-surface-300 line-clamp-3 font-mono">{tc.args.content?.slice(0, 200)}</p>}
                                  {tc.name === 'create_elements' && (
                                    <p className="text-xs text-surface-300">
                                      {[
                                        ...(tc.args.characters || []).map((c: any) => `${c.name} (personaje)`),
                                        ...(tc.args.scenarios || []).map((c: any) => `${c.name} (locación)`),
                                        ...(tc.args.objects || []).map((c: any) => `${c.name} (objeto)`),
                                      ].join(', ')}
                                    </p>
                                  )}
                                  <p className="mt-1 text-[10px] text-green-400/70 flex items-center gap-1"><Check size={10} /> Aplicado</p>
                                </div>
                              </div>
                            </div>
                          )
                        }
                        if (msg.role === 'assistant' || msg.role === 'user') {
                          const isUser = msg.role === 'user'
                          return (
                            <div className={`flex gap-2 ${isUser ? 'justify-end' : ''}`}>
                              {!isUser && <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5"><Bot size={10} className="text-purple-400" /></div>}
                              <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${isUser ? 'bg-accent-600/20 border border-accent-500/30 rounded-tr-md' : 'bg-surface-800 rounded-tl-md'}`}>
                                <p className="text-xs text-surface-200 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                              </div>
                              {isUser && <div className="w-5 h-5 rounded-full bg-surface-700 flex items-center justify-center flex-shrink-0 mt-0.5"><User size={10} className="text-surface-400" /></div>}
                            </div>
                          )
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
                        <div className="flex gap-2">
                          <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5"><Bot size={10} className="text-purple-400" /></div>
                          <div className="bg-surface-800 rounded-2xl rounded-tl-md px-3 py-2"><Loader size={14} className="animate-spin text-purple-400" /></div>
                        </div>
                      </MessageScrollerItem>
                    )}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </MessageScrollerProvider>

            <div className="p-3 border-t border-surface-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <input
                  value={agentInput}
                  onChange={e => setAgentInput(e.target.value)}
                  placeholder="Escribe tu idea para el guión..."
                  className="input-field text-xs flex-1"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAgentSend() } }}
                  disabled={agentRunning}
                />
                {agentRunning ? (
                  <button onClick={handleStopAgent} className="p-2 bg-red-600/20 hover:bg-red-600/30 rounded-lg text-red-400 transition-colors flex-shrink-0"><Square size={14} /></button>
                ) : (
                  <button onClick={() => handleAgentSend()} disabled={!agentInput.trim()} className="p-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-lg text-white transition-colors flex-shrink-0"><Send size={14} /></button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function simulateScriptAgent(userMsg: string): any {
  const lower = userMsg.toLowerCase()
  if (lower.includes('personaje') || lower.includes('elemento') || lower.includes('element')) {
    return {
      content: 'Perfecto, extraigo los elementos de la historia y los creo en la pestaña Elements.',
      tool_calls: [{ id: 'tc_' + uid(), type: 'function', function: { name: 'create_elements', arguments: JSON.stringify({ characters: [{ name: 'Protagonista', description: 'Personaje principal de la historia.' }], scenarios: [{ name: 'Ciudad', description: 'Ambientación urbana de la historia.' }], objects: [{ name: 'Relicario', description: 'Objeto clave del argumento.' }] }) } }],
    }
  }
  if (lower.includes('escena') || lower.includes('toma') || lower.includes('guion') || lower.includes('guión') || lower.includes('escrib')) {
    const c = `## Escena 1: Apertura\nEl mundo se presenta ante el espectador. @scn:Ciudad amanece mientras @char:Protagonista cruza la calle vacía.\n\n### Toma 1\nPlano general de la ciudad al amanecer. Cámara lenta.\n\n### Toma 2\nPlano medio de @char:Protagonista caminando, determinado.`
    return {
      content: 'Claro, aquí tienes la primera escena. La escribo directamente en el guión:',
      tool_calls: [{ id: 'tc_' + uid(), type: 'function', function: { name: 'write_script_section', arguments: JSON.stringify({ content: c }) } }],
    }
  }
  return { content: 'Puedo ayudarte a escribir el guión (escenas con `##` y tomas con `###`) y a crear los elementos de la historia. Cuéntame qué escena quieres desarrollar.' }
}
