import * as React from "react"
import { cn } from "@/lib/utils"

function Bubble({
 align = "start",
 className,
 ...props
}: React.ComponentProps<"div"> & { align?: "start" | "end" }) {
 return (
 <div
 data-align={align}
 className={cn(
 "w-fit max-w-full rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
 align === "end"
 ? "bg-primary text-primary-foreground"
 : "bg-muted text-foreground",
 className,
 )}
 {...props}
 />
 )
}

function BubbleContent({
 className,
 ...props
}: React.ComponentProps<"div">) {
 return (
 <div
 className={cn("whitespace-pre-wrap", className)}
 {...props}
 />
 )
}

export { Bubble, BubbleContent }
