import { useState, useEffect, useMemo } from 'react'
import { Terminal, Trash2, RefreshCw, X, ChevronRight, ChevronDown } from 'lucide-react'

export function LogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchLogs = async () => {
    setLoading(true)
    try { setLogs(await (window as any).electronAPI?.logs.list() || []) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchLogs() }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const log of logs) {
      const key = log.taskId || '_orphan'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(log)
    }
    return Array.from(map.entries())
  }, [logs])

  const toggleGroup = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const stepBadge = (step: string) => {
    const colors: Record<string, string> = {
      error: 'bg-red-500/10 text-red-400',
      completed: 'bg-green-500/10 text-green-400',
      'api-request': 'bg-yellow-500/10 text-yellow-400',
      'api-response': 'bg-blue-500/10 text-blue-400',
    }
    return `text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[step] || 'bg-surface-800 text-surface-400'}`
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-accent-400" />
          <h1 className="text-lg font-semibold text-surface-100">Run Logs</h1>
          <span className="text-xs text-surface-600 ml-2">{grouped.length} tasks</span>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchLogs} className="btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={async () => { await (window as any).electronAPI?.logs.clear(); setLogs([]) }}
            className="btn-ghost text-xs text-red-400 flex items-center gap-1.5">
            <Trash2 size={12} /> Clear
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-surface-600">
            <Terminal size={48} className="mb-4 opacity-50" />
            <p className="text-sm">No logs yet. Generation requests will appear here.</p>
          </div>
        )}

        {grouped.map(([taskId, entries]) => {
          const last = entries[entries.length - 1]
          const isExpanded = expanded.has(taskId)
          const isError = last?.level === 'error'
          const prompt = entries[0]?.payload?.prompt || entries[0]?.message?.substring(0, 60) || taskId

          return (
            <div key={taskId} className="border-b border-surface-800/50">
              {/* Group header */}
              <div
                onClick={() => toggleGroup(taskId)}
                className="flex items-center gap-3 px-6 py-2.5 hover:bg-surface-900/30 cursor-pointer transition-colors"
              >
                <button className="text-surface-500">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-surface-300 font-medium truncate">{prompt}</span>
                    <span className={stepBadge(last?.step || 'enqueue')}>
                      {last?.step === 'error' ? 'FAILED' : last?.step || 'pending'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-surface-600 font-mono">{taskId === '_orphan' ? 'no task' : taskId?.substring(0, 8)}</span>
                    <span className="text-[10px] text-surface-600">{entries.length} steps</span>
                    <span className="text-[10px] text-surface-600">
                      {new Date(entries[0]?.createdAt).toLocaleTimeString()}
                    </span>
                    {isError && <span className="text-[10px] text-red-400 truncate">{last?.message}</span>}
                  </div>
                </div>
              </div>

              {/* Expanded entries */}
              {isExpanded && (
                <div className="bg-surface-950/50">
                  {entries.map((log: any) => (
                    <div
                      key={log.id}
                      onClick={(e) => { e.stopPropagation(); setSelected(log) }}
                      className="flex items-center gap-3 pl-14 pr-6 py-1.5 hover:bg-surface-900/50 cursor-pointer transition-colors border-t border-surface-800/20"
                    >
                      <span className={stepBadge(log.step)}>{log.step}</span>
                      <span className="text-[11px] text-surface-400 flex-1 truncate">{log.message}</span>
                      <span className="text-[10px] text-surface-600 font-mono flex-shrink-0">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Detail sheet */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div className="relative w-[480px] h-full bg-surface-950 border-l border-surface-800 shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-surface-950 border-b border-surface-800 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-sm font-semibold text-surface-100">Log Detail</h2>
              <button onClick={() => setSelected(null)} className="text-surface-500 hover:text-surface-100">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Step</p>
                <p className={`${stepBadge(selected.step)} inline-block`}>{selected.step}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Timestamp</p>
                <p className="text-sm text-surface-200">{new Date(selected.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Task ID</p>
                <p className="text-xs font-mono text-surface-400">{selected.taskId || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Message</p>
                <p className="text-sm text-surface-200">{selected.message}</p>
              </div>
              {selected.payload && (
                <div>
                  <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Payload</p>
                  <pre className="text-xs text-surface-300 bg-surface-900 rounded-lg p-3 overflow-x-auto border border-surface-800">
                    {typeof selected.payload === 'string' ? selected.payload : JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
