import { useState } from 'react'
import { Plus, Play, Save, Trash2, Workflow } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspaceStore } from '../stores/workspace-store'

export function WorkflowsPage() {
  const queryClient = useQueryClient()
  const [selectedWorkflow, setSelectedWorkflow] = useState<any>(null)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId)

  const { data: workflows } = useQuery({
    queryKey: ['workflows', activeWorkspaceId],
    queryFn: () => (window as any).electronAPI?.workflows.list() ?? [],
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => (window as any).electronAPI?.workflows.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-lg font-semibold text-surface-100">Workflows</h1>
            <button className="btn-primary flex items-center gap-2"><Plus size={16} /> New Workflow</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.isArray(workflows) && workflows.map((wf: any) => (
              <div key={wf.id} className="card hover:border-accent-500/50 transition-colors cursor-pointer group" onClick={() => setSelectedWorkflow(wf)}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-medium text-surface-100">{wf.name}</h3>
                    {wf.description && <p className="text-xs text-surface-500 mt-1">{wf.description}</p>}
                  </div>
                  <Workflow size={20} className="text-accent-500/50" />
                </div>
                <div className="flex items-center gap-2 text-xs text-surface-500 mb-3">
                  <span>{wf.nodes?.length || 0} nodes</span>
                  <span>·</span>
                  <span>{new Date(wf.updatedAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="btn-ghost text-xs flex items-center gap-1"><Play size={12} /> Run</button>
                  <button className="btn-ghost text-xs flex items-center gap-1"><Save size={12} /> Edit</button>
                  <button onClick={() => deleteMutation.mutate(wf.id)} className="btn-ghost text-xs text-red-400 flex items-center gap-1 ml-auto"><Trash2 size={12} /> Delete</button>
                </div>
              </div>
            ))}
          </div>

          {(!Array.isArray(workflows) || workflows.length === 0) && (
            <div className="flex flex-col items-center justify-center py-20 text-surface-600">
              <Workflow size={48} className="mb-4 opacity-50" />
              <p className="text-sm">No workflows yet. Create one to chain multiple generation steps.</p>
              <button className="btn-primary flex items-center gap-2 mt-4"><Plus size={16} /> Create Workflow</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
