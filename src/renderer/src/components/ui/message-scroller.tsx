import * as React from "react"
import {
  MessageScroller as MessageScrollerPrimitive,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from "@shadcn/react/message-scroller"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

function MessageScrollerProvider(
  props: React.ComponentProps<typeof MessageScrollerPrimitive.Provider>
) {
  return <MessageScrollerPrimitive.Provider {...props} />
}

function MessageScrollerRoot({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Root>) {
  return (
    <MessageScrollerPrimitive.Root
      className={cn("relative flex flex-1 flex-col overflow-hidden", className)}
      {...props}
    />
  )
}

function MessageScrollerViewport({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Viewport>) {
  return (
    <MessageScrollerPrimitive.Viewport
      className={cn("flex flex-1 flex-col overflow-y-auto", className)}
      {...props}
    />
  )
}

function MessageScrollerContent({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Content>) {
  return (
    <MessageScrollerPrimitive.Content
      className={cn("flex flex-col gap-3 p-3", className)}
      {...props}
    />
  )
}

function MessageScrollerItem({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Item>) {
  return (
    <MessageScrollerPrimitive.Item
      className={cn(className)}
      {...props}
    />
  )
}

function MessageScrollerButton({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Button>) {
  return (
    <MessageScrollerPrimitive.Button
      className={cn(
        "absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full border border-surface-700 bg-surface-800 px-3 py-1 text-xs text-surface-300 shadow-lg hover:bg-surface-700 hover:text-surface-100 transition-all inert:opacity-0",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <ChevronDown size={12} className="mr-1 inline" />
          Ultimo mensaje
        </>
      )}
    </MessageScrollerPrimitive.Button>
  )
}

export {
  MessageScrollerProvider,
  MessageScrollerRoot as MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
}
