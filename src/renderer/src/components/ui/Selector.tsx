import * as React from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectorGroup<T> {
  id?: string
  label: React.ReactNode
  items: T[]
}

export interface SelectorProps<T> {
  /** Optional field label above the trigger */
  label?: React.ReactNode
  /** Options list (flat or if groups is not used) */
  options?: T[]
  /** Grouped options */
  groups?: SelectorGroup<T>[]
  /** Current selected value */
  value?: string
  /** Callback on value change */
  onChange?: (value: string, option: T) => void
  /** Function to extract unique value key from option */
  getOptionValue?: (option: T) => string
  /** Function to extract display label from option */
  getOptionLabel?: (option: T) => string
  /** Custom renderer for each option (compatible with SelectorOption) */
  renderOption?: (option: T, state: { selected: boolean }) => React.ReactNode
  /** Custom renderer for the trigger button */
  renderTrigger?: (selectedOption?: T, isOpen?: boolean) => React.ReactNode
  /** Placeholder text */
  placeholder?: string
  /** Search enabled in popover */
  searchable?: boolean
  /** Search input placeholder */
  searchPlaceholder?: string
  /** Custom search filter */
  filterOption?: (option: T, query: string) => boolean
  /** Disabled state */
  disabled?: boolean
  /** Force drop up or drop down */
  dropUp?: boolean
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Wrapper class */
  className?: string
  /** Trigger button class */
  triggerClassName?: string
  /** Dropdown content class */
  contentClassName?: string
  /** Empty state message */
  emptyMessage?: string
}

export function Selector<T>({
  label,
  options = [],
  groups,
  value,
  onChange,
  getOptionValue = (opt: any) => opt?.value || opt?.id || String(opt),
  getOptionLabel = (opt: any) => opt?.label || opt?.name || String(opt),
  renderOption,
  renderTrigger,
  placeholder = 'Select an option...',
  searchable = true,
  searchPlaceholder = 'Search...',
  filterOption,
  disabled = false,
  dropUp = false,
  size = 'md',
  className,
  triggerClassName,
  contentClassName,
  emptyMessage = 'No options found',
}: SelectorProps<T>) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const containerRef = React.useRef<HTMLDivElement>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  // Flatten all items for lookup
  const allItems = React.useMemo(() => {
    if (groups && groups.length > 0) {
      return groups.flatMap((g) => g.items)
    }
    return options
  }, [groups, options])

  // Selected item lookup
  const selectedItem = React.useMemo(() => {
    return allItems.find((opt) => getOptionValue(opt) === value)
  }, [allItems, value, getOptionValue])

  // Click outside to dismiss
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Focus search when opened
  React.useEffect(() => {
    if (isOpen && searchable) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    } else {
      setSearchQuery('')
    }
  }, [isOpen, searchable])

  // Filter options based on search query
  const defaultFilter = (item: T, query: string) => {
    const q = query.toLowerCase().trim()
    const itemLabel = getOptionLabel(item).toLowerCase()
    return itemLabel.includes(q)
  }

  const effectiveFilter = filterOption || defaultFilter

  const filteredGroups = React.useMemo(() => {
    if (groups && groups.length > 0) {
      return groups
        .map((g, idx) => ({
          id: g.id || `grp-${idx}`,
          label: g.label,
          items: searchQuery.trim() ? g.items.filter((item) => effectiveFilter(item, searchQuery)) : g.items,
        }))
        .filter((g) => g.items.length > 0)
    }
    return null
  }, [groups, searchQuery, effectiveFilter])

  const filteredOptions = React.useMemo(() => {
    if (groups) return []
    if (!searchQuery.trim()) return options
    return options.filter((item) => effectiveFilter(item, searchQuery))
  }, [groups, options, searchQuery, effectiveFilter])

  const totalResults = filteredGroups
    ? filteredGroups.reduce((acc, g) => acc + g.items.length, 0)
    : filteredOptions.length

  const handleSelect = (item: T) => {
    const val = getOptionValue(item)
    onChange?.(val, item)
    setIsOpen(false)
    setSearchQuery('')
  }

  const triggerSizeClasses = {
    sm: 'h-7 px-2.5 text-xs rounded-md',
    md: 'h-8 px-3 text-xs rounded-lg',
    lg: 'h-10 px-3.5 text-sm rounded-xl',
  }

  return (
    <div className={cn('astryx-selector relative inline-block text-left', className)} ref={containerRef}>
      {/* Optional Label */}
      {label && (
        <label className="block text-[11px] font-medium text-surface-400 uppercase tracking-wider mb-1">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      {renderTrigger ? (
        <div onClick={() => !disabled && setIsOpen(!isOpen)}>{renderTrigger(selectedItem, isOpen)}</div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={cn(
            'flex items-center justify-between gap-2 w-full bg-surface-900/90 hover:bg-surface-800/90 border border-surface-700/80 hover:border-surface-600 text-surface-200 transition-all duration-150 shadow-sm',
            triggerSizeClasses[size],
            isOpen && 'ring-2 ring-accent-500/40 border-accent-500',
            disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
            triggerClassName
          )}
        >
          <span className="truncate font-medium">
            {selectedItem ? getOptionLabel(selectedItem) : placeholder}
          </span>
          <span className="text-surface-400 flex-shrink-0 ml-1">
            {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </span>
        </button>
      )}

      {/* Popover Dropdown */}
      {isOpen && (
        <div
          className={cn(
            'astryx-selector-popup absolute z-50 min-w-[240px] w-max max-w-[360px] bg-surface-900/95 backdrop-blur-xl border border-surface-700/90 rounded-xl shadow-2xl overflow-hidden flex flex-col',
            dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            'animate-in fade-in zoom-in-95 duration-150',
            contentClassName
          )}
          style={{ maxHeight: '360px' }}
        >
          {/* Search Box */}
          {searchable && (
            <div className="astryx-selector-search p-2 border-b border-surface-800 bg-surface-950/50 flex-shrink-0">
              <div className="relative flex items-center">
                <Search size={13} className="absolute left-2.5 text-surface-500 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full bg-surface-800/90 text-xs text-surface-200 pl-7 pr-7 py-1.5 rounded-lg border border-surface-700/80 outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30 placeholder:text-surface-500 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 text-surface-500 hover:text-surface-300 p-0.5"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Options List */}
          <div className="overflow-y-auto max-h-[280px] p-1 space-y-0.5 divide-y divide-surface-800/40">
            {totalResults === 0 ? (
              <div className="astryx-selector-empty-state p-4 text-center text-xs text-surface-500">
                {emptyMessage}
              </div>
            ) : filteredGroups ? (
              filteredGroups.map((group) => (
                <div key={group.id} className="py-1">
                  <div className="astryx-selector-section-heading px-2.5 pt-1.5 pb-1 text-[10px] uppercase tracking-wider text-surface-500 font-semibold flex items-center justify-between">
                    <span>{group.label}</span>
                    <span className="text-[9px] font-mono text-surface-600">
                      {group.items.length}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const itemVal = getOptionValue(item)
                      const isSelected = itemVal === value
                      return (
                        <div key={itemVal} onClick={() => handleSelect(item)}>
                          {renderOption ? (
                            renderOption(item, { selected: isSelected })
                          ) : (
                            <div
                              className={cn(
                                'px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors',
                                isSelected
                                  ? 'bg-accent-500/15 text-accent-400 font-medium'
                                  : 'text-surface-300 hover:bg-surface-800/80 hover:text-surface-100'
                              )}
                            >
                              {getOptionLabel(item)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-0.5">
                {filteredOptions.map((item) => {
                  const itemVal = getOptionValue(item)
                  const isSelected = itemVal === value
                  return (
                    <div key={itemVal} onClick={() => handleSelect(item)}>
                      {renderOption ? (
                        renderOption(item, { selected: isSelected })
                      ) : (
                        <div
                          className={cn(
                            'px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors',
                            isSelected
                              ? 'bg-accent-500/15 text-accent-400 font-medium'
                              : 'text-surface-300 hover:bg-surface-800/80 hover:text-surface-100'
                          )}
                        >
                          {getOptionLabel(item)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
