import { cn } from '../../lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface TabItem {
  id: string
  label: string
  icon: LucideIcon
  count?: number
}

interface TabsProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (id: string) => void
  className?: string
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex items-center gap-1 p-1 bg-surface-900/60 rounded-xl border border-surface-800', className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-surface-800 text-accent-400 shadow-sm shadow-black/20'
                : 'text-surface-500 hover:text-surface-300 hover:bg-surface-800/50'
            )}
          >
            <Icon size={16} />
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={cn(
                'text-[11px] px-1.5 py-0.5 rounded-md font-medium',
                isActive ? 'bg-accent-500/15 text-accent-400' : 'bg-surface-700/60 text-surface-500'
              )}>
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
