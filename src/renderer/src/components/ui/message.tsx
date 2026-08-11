import * as React from "react"
import { cn } from "@/lib/utils"

function Message({
  align = "start",
  className,
  ...props
}: React.ComponentProps<"div"> & { align?: "start" | "end" }) {
  return (
    <div
      data-align={align}
      className={cn(
        "flex w-full gap-3",
        align === "end" && "flex-row-reverse",
        className,
      )}
      {...props}
    />
  )
}

function MessageGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />
}

function MessageAvatar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 items-end", className)}
      {...props}
    />
  )
}

function MessageContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-w-0 max-w-[80%] flex-col gap-1", className)}
      {...props}
    />
  )
}

function MessageHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center gap-2 px-1 text-xs font-medium text-foreground", className)} {...props} />
  )
}

function MessageFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center gap-1.5 px-1 text-xs text-muted-foreground", className)} {...props} />
  )
}

export {
  Message,
  MessageGroup,
  MessageAvatar,
  MessageContent,
  MessageHeader,
  MessageFooter,
}
