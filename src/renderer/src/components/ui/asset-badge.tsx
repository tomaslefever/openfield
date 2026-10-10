import type { ReactNode } from 'react'

export function AssetBadge({ value, icon }: { value: string; icon?: ReactNode }) {
 return (
 <div className="p-1 bg-black/60 rounded-md flex items-center justify-center gap-1 leading-none text-white/80">
 <div className="flex items-center gap-1">
 {icon}
 <span className="text-[10px] text-white/80 font-medium">{value}</span>
 </div>
 </div>
 )
}
