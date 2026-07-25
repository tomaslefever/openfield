export function AssetBadge({ value, position = 'bottom-right' }: { value: string; position?: 'bottom-right' | 'bottom-left' }) {
  const posClass = position === 'bottom-right' ? 'bottom-2 right-2' : 'bottom-2 left-2'
  return (
    <div className={`absolute ${posClass} p-1 bg-black/60 rounded-md leading-none flex items-center justify-center`}>
      <span className="text-[10px] text-surface-300 font-medium">{value}</span>
    </div>
  )
}
