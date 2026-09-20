"use client";
// beui.dev/components/agents/image-generation

import { Check, CircleAlert, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { EASE_IN_OUT, EASE_OUT, SPRING_PRESS } from "@/lib/ease";
import { useHoverCapable } from "@/lib/hooks/use-hover-capable";
import { cn } from "@/lib/utils";

export type ImageGenerationStatus =
  | "queued"
  | "generating"
  | "refining"
  | "complete"
  | "error";

export interface ImageGenerationProps {
  /** The completed media. Pass an img, Next Image, canvas, video, or custom preview. */
  children?: ReactNode;
  status?: ImageGenerationStatus;
  /** Accessible description. Defaults to a description derived from prompt. */
  label?: string;
  prompt?: string;
  resolution?: string;
  /** CSS aspect ratio reserved before generated media is available. Supports '1/1', '16/9', '16:9', etc. */
  aspectRatio?: CSSProperties["aspectRatio"] | string;
  size?: "compact" | "fluid" | "fill";
  /** Lets the active dither cluster follow fine-pointer movement. */
  interactive?: boolean;
  statusText?: string;
  showStatus?: boolean;
  /** Renders the status and prompt as an overlay at the bottom inside the aspect container. Useful for grid cards. */
  overlayStatus?: boolean;
  onRetry?: () => void;
  className?: string;
  mediaClassName?: string;
  statusClassName?: string;
}

const STATUS_TEXT: Record<ImageGenerationStatus, string> = {
  queued: "En cola para generar...",
  generating: "Generando...",
  refining: "Refinando detalles...",
  complete: "Completado",
  error: "Error de generación",
};

const MEDIA_STATE: Record<
  ImageGenerationStatus,
  { filter: string; opacity: number; scale: number }
> = {
  queued: { filter: "blur(4px) saturate(0.75)", opacity: 0, scale: 1.02 },
  generating: { filter: "blur(3px) saturate(0.85)", opacity: 0, scale: 1.015 },
  refining: { filter: "blur(1.5px) saturate(0.95)", opacity: 0.62, scale: 1.005 },
  complete: { filter: "blur(0px) saturate(1)", opacity: 1, scale: 1 },
  error: { filter: "blur(2px) saturate(0.5)", opacity: 0.28, scale: 1 },
};

const OVERLAY_OPACITY: Record<ImageGenerationStatus, number> = {
  queued: 1,
  generating: 1,
  refining: 0.48,
  complete: 0,
  error: 0,
};

const DOT_GAP = 10;
const TWO_PI = Math.PI * 2;

function DitherMark({
  status,
  reduce,
}: {
  status: ImageGenerationStatus;
  reduce: boolean;
}) {
  if (status === "complete") {
    return <Check aria-hidden="true" className="size-3.5 text-emerald-400 flex-shrink-0" />;
  }

  if (status === "error") {
    return <CircleAlert aria-hidden="true" className="size-3.5 text-red-400 flex-shrink-0" />;
  }

  return (
    <motion.span
      aria-hidden="true"
      animate={reduce ? undefined : { rotate: 360 }}
      transition={{
        duration: 2.4,
        ease: EASE_IN_OUT,
        repeat: Number.POSITIVE_INFINITY,
      }}
      className="grid size-3.5 grid-cols-2 place-items-center gap-0.5 flex-shrink-0"
    >
      <span className="size-1 rounded-[1px] bg-accent-400" />
      <span className="size-1 rounded-[1px] bg-accent-400/50" />
      <span className="size-1 rounded-[1px] bg-accent-400/50" />
      <span className="size-1 rounded-[1px] bg-accent-400" />
    </motion.span>
  );
}

function DitherField({
  interactive,
  reduce,
  status,
}: {
  interactive: boolean;
  reduce: boolean;
  status: ImageGenerationStatus;
}) {
  const canHover = useHoverCapable();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let dotColor = "rgba(165, 180, 252, 0.75)"; // soft accent tint
    const pointer = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      inside: false,
    };
    const pointerEnabled = interactive && canHover && !reduce;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width || canvas.clientWidth || 208;
      height = rect.height || canvas.clientHeight || 208;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      dotColor = window.getComputedStyle(canvas).color || "rgba(165, 180, 252, 0.75)";

      pointer.x = width / 2;
      pointer.y = height / 2;
      pointer.targetX = pointer.x;
      pointer.targetY = pointer.y;
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);

      if (!pointer.inside) {
        pointer.targetX =
          width / 2 + (reduce ? 0 : Math.sin(time / 1700) * width * 0.12);
        pointer.targetY =
          height / 2 + (reduce ? 0 : Math.cos(time / 2100) * height * 0.1);
      }

      const follow = reduce ? 1 : pointer.inside ? 0.16 : 0.045;
      pointer.x += (pointer.targetX - pointer.x) * follow;
      pointer.y += (pointer.targetY - pointer.y) * follow;

      const radius = Math.min(width, height) * 0.38;
      const columns = Math.ceil(width / DOT_GAP) + 1;
      const rows = Math.ceil(height / DOT_GAP) + 1;
      const offsetX = (width - (columns - 1) * DOT_GAP) / 2;
      const offsetY = (height - (rows - 1) * DOT_GAP) / 2;

      context.fillStyle = dotColor;

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const anchorX = offsetX + column * DOT_GAP;
          const anchorY = offsetY + row * DOT_GAP;
          const deltaX = anchorX - pointer.x;
          const deltaY = anchorY - pointer.y;
          const distance = Math.hypot(deltaX, deltaY);
          const proximity = Math.max(0, 1 - distance / radius);
          const influence = proximity * proximity * (3 - 2 * proximity);
          const displacement = influence * influence * 9;
          const directionX = distance > 0 ? deltaX / distance : 0;
          const directionY = distance > 0 ? deltaY / distance : 0;
          const x = anchorX + directionX * displacement;
          const y = anchorY + directionY * displacement;
          const dotRadius = 0.65 + influence * 0.85;

          context.globalAlpha = 0.17 + influence * 0.72;
          context.beginPath();
          context.arc(x, y, dotRadius, 0, TWO_PI);
          context.fill();
        }
      }

      context.globalAlpha = 1;
      if (!reduce) frame = window.requestAnimationFrame(draw);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerEnabled) return;
      const rect = canvas.getBoundingClientRect();
      pointer.inside = true;
      pointer.targetX = event.clientX - rect.left;
      pointer.targetY = event.clientY - rect.top;
    };

    const handlePointerLeave = () => {
      pointer.inside = false;
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(resize);

    resize();
    resizeObserver?.observe(canvas);
    canvas.addEventListener("pointermove", handlePointerMove, { passive: true });
    canvas.addEventListener("pointerleave", handlePointerLeave);
    draw(0);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [canHover, interactive, reduce, status]);

  return (
    <motion.div
      aria-hidden="true"
      initial={false}
      animate={{ opacity: OVERLAY_OPACITY[status] }}
      transition={{ duration: reduce ? 0 : 0.4, ease: EASE_OUT }}
      className="absolute inset-0 overflow-hidden bg-surface-900/90"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full text-accent-300"
      />
    </motion.div>
  );
}

export function ImageGeneration({
  children,
  status = "generating",
  label,
  prompt,
  resolution,
  aspectRatio = "1 / 1",
  size = "compact",
  interactive = true,
  statusText,
  showStatus = true,
  overlayStatus = false,
  onRetry,
  className,
  mediaClassName,
  statusClassName,
}: ImageGenerationProps) {
  const reduce = useReducedMotion() ?? false;
  const active =
    status === "queued" || status === "generating" || status === "refining";
  const mediaState = MEDIA_STATE[status];
  const resolvedStatusText = statusText ?? STATUS_TEXT[status];
  const resolvedLabel =
    label ?? (prompt ? `${resolvedStatusText}: ${prompt}` : resolvedStatusText);

  const normalizedAspectRatio = useMemo(() => {
    if (!aspectRatio) return "1 / 1";
    if (typeof aspectRatio === "string") {
      return aspectRatio.replace(":", " / ");
    }
    return aspectRatio;
  }, [aspectRatio]);

  return (
    <div
      data-slot="image-generation"
      data-state={status}
      aria-busy={active}
      className={cn(
        "w-full h-full",
        size === "fill" ? "self-stretch" : "flex flex-col justify-center",
        className,
      )}
    >
      <div
        className={cn(
          "w-full",
          size === "fill"
            ? "h-full"
            : size === "compact" && !overlayStatus
              ? "mx-auto max-w-52"
              : "",
        )}
      >
        <div
          role="img"
          aria-label={resolvedLabel}
          style={size === "fill" ? undefined : { aspectRatio: normalizedAspectRatio }}
          className={cn(
            "relative isolate w-full h-full overflow-hidden bg-surface-900",
            size !== "fill" && "rounded-xl border border-surface-800/80",
          )}
        >
          <motion.div
            aria-hidden={children ? undefined : true}
            initial={false}
            animate={
              reduce
                ? { opacity: mediaState.opacity }
                : {
                    filter: mediaState.filter,
                    opacity: mediaState.opacity,
                    scale: mediaState.scale,
                  }
            }
            transition={
              reduce ? { duration: 0 } : { duration: 0.4, ease: EASE_OUT }
            }
            className={cn(
              "absolute inset-0 [&>*]:size-full [&>*]:object-cover [&_img]:size-full [&_img]:object-cover",
              mediaClassName,
            )}
          >
            {children}
          </motion.div>

          <AnimatePresence initial={false}>
            {active ? (
              <motion.div
                key="dither-field"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.25, ease: EASE_OUT }}
                className="absolute inset-0"
              >
                <DitherField
                  interactive={interactive}
                  reduce={reduce}
                  status={status}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {size !== "fill" && resolution ? (
            <span className="absolute top-2 right-2 z-10 rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5 font-mono text-[10px] tabular-nums text-surface-300 border border-surface-700/50">
              {resolution}
            </span>
          ) : null}

          {/* Overlay status inside aspect ratio box (used for grid cards) */}
          {size !== "fill" && overlayStatus && (showStatus || prompt) ? (
            <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2.5 pt-6 flex flex-col gap-1 pointer-events-none">
              {showStatus ? (
                <div
                  aria-live="polite"
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium text-surface-100",
                    status === "error" && "text-red-400",
                    statusClassName,
                  )}
                >
                  <DitherMark status={status} reduce={reduce} />
                  <span className="truncate">{resolvedStatusText}</span>
                </div>
              ) : null}
              {prompt ? (
                <p className="text-[11px] text-surface-300 line-clamp-1 leading-tight">
                  “{prompt}”
                </p>
              ) : null}
            </div>
          ) : null}

          {status === "error" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-4 text-center bg-surface-900/95 z-10">
              <CircleAlert className="size-7 text-red-400 flex-shrink-0" />
              <div className="space-y-1 max-w-sm px-2">
                <p className="text-xs font-semibold text-red-400">Error de generación</p>
                <p className="text-[11px] text-red-400/80 leading-relaxed line-clamp-4">
                  {resolvedStatusText}
                </p>
              </div>
              {onRetry && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry();
                  }}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-surface-200 bg-surface-800 hover:bg-surface-700 border border-surface-700 transition-colors"
                >
                  <RotateCcw className="size-3.5 text-accent-400" />
                  Reintentar
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* Standard status below media (used for detail modal and fluid containers) */}
        {size !== "fill" && !overlayStatus && (showStatus || prompt) ? (
          <div className="mt-3 text-left">
            {showStatus ? (
              <div
                aria-live="polite"
                className={cn(
                  "flex min-h-5 items-center gap-2 text-sm font-medium text-surface-200",
                  status === "error" && "text-red-400",
                  statusClassName,
                )}
              >
                <DitherMark status={status} reduce={reduce} />
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={resolvedStatusText}
                    initial={reduce ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, y: -4 }}
                    transition={{
                      duration: reduce ? 0 : 0.15,
                      ease: EASE_OUT,
                    }}
                  >
                    {resolvedStatusText}
                  </motion.span>
                </AnimatePresence>
              </div>
            ) : null}
            {prompt ? (
              <p className="mt-1 line-clamp-2 text-xs text-surface-400">
                “{prompt}”
              </p>
            ) : null}
          </div>
        ) : null}

        {size !== "fill" && !overlayStatus && status === "error" && onRetry ? (
          <motion.button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            transition={SPRING_PRESS}
            className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-surface-200 bg-surface-800 hover:bg-surface-700 border border-surface-700 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <RotateCcw aria-hidden="true" className="size-3.5 text-accent-400" />
            Reintentar generación
          </motion.button>
        ) : null}
      </div>
    </div>
  );
}
