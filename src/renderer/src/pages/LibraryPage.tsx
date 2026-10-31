import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Search, Trash2, Star, Cloud, CheckSquare, Square, Loader, AlertCircle, X, FolderOpen, Clock, Tag, RefreshCw, Inbox, Upload, Image as ImageIcon, Video, Eraser, Clapperboard, Box, Archive, LayoutGrid } from 'lucide-react'
import { toast } from 'sonner'
import { srcUrl, fileUrl, posterUrl } from '../services/file-url'
import { usePagedAssets } from '../hooks/usePagedAssets'
import { useGridFlip } from '../hooks/useGridFlip'
import { useAppStore } from '../stores/app-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { PromptComposer, type PromptComposerHandle } from '../components/PromptComposer'
import { BulkActionBar } from '../components/ui/BulkActionBar'
import { ConfirmDeleteModal } from '../components/ui/ConfirmDeleteModal'
import { BulkTagModal } from '../components/ui/BulkTagModal'
import { ImageGeneration } from '../components/agents/image-generation'
import { ElementWizard } from '../components/ElementWizard'
import { referencesFromAsset } from '../lib/element-references'
import type { MediaRef } from '../stores/elements-store'
import { copyImage } from '../lib/clipboard'
import { downscaleImage } from '../lib/image'
import { getAudioKind } from '../lib/audio'
import { cleanModelName, getAssetProvider } from '../lib/models'
import { isSeedanceDraft } from '../components/models/DraftFinalizeButton'
import { RetryGenerationButton } from '../components/ui/RetryGenerationButton'
import { AssetDetailModal } from '../components/assets/AssetDetailModal'

// Cards per row in the Playground grid, adjustable from the top bar slider.
const GRID_COLS_KEY = 'openfield-playground-cols'
const GRID_COLS_MIN = 2
const GRID_COLS_MAX = 8
const GRID_COLS_DEFAULT = 5

const MODEL_NAMES: Record<string, string> = {
  'gpt-image-2-text-to-image': 'GPT Image 2',
  'gpt-image-2-image-to-image': 'GPT Image 2 I2I',
  'gpt-image-2-5-flare-text-to-image': 'GPT Image 2.5 Flare',
  'gpt-image-2-5-flare-image-to-image': 'GPT Image 2.5 Flare I2I',
  'gpt-image-2-5-sunburst-text-to-image': 'GPT Image 2.5 Sunburst',
  'gpt-image-2-5-sunburst-image-to-image': 'GPT Image 2.5 Sunburst I2I',
  'recraft/remove-background': 'Remove Background',
  'nano-banana-2': 'Nano Banana 2',
  'nano-banana-2-1': 'Nano Banana 2.1',
  'seedream/5-pro-text-to-image': 'Seedream 5 Pro',
  'seedream/5-pro-image-to-image': 'Seedream 5 Pro I2I',
  'seedream-5-pro-text-to-image': 'Seedream 5 Pro',
  'seedream-5-pro-image-to-image': 'Seedream 5 Pro I2I',
  'flux2-pro-text-to-image': 'Flux 2 Pro',
  'grok-imagine/text-to-image': 'Grok Imagine',
  'imagen4-fast': 'Imagen 4 Fast',
  'openai/gpt-image-2': 'GPT Image 2 (Fal)',
  'openai/gpt-image-2/edit': 'GPT Image 2 Edit (Fal)',
  'google/nano-banana-2.1': 'Nano Banana 2.1',
  'google/nano-banana-2.1/edit': 'Nano Banana 2.1 Edit',
  'replicate/google/nano-banana-2.1': 'Nano Banana 2.1',
  'fal-ai/nano-banana-pro': 'Nano Banana Pro',
  'fal-ai/nano-banana-pro/edit': 'Nano Banana Pro Edit',
  'fal-ai/recraft/v4/text-to-image': 'Recraft V4',
  'fal-ai/recraft/v4/pro/text-to-image': 'Recraft V4 Pro',
  'fal-ai/recraft/v3/text-to-image': 'Recraft V3',
  'imagineart/imagineart-2.0-preview/text-to-image': 'ImagineArt 2.0',
  'fal-ai/flux-pro/kontext': 'FLUX.1 Kontext [pro]',
  'fal-ai/flux-krea-lora/stream': 'FLUX Krea LoRA stream',
  'bria/fibo/generate': 'Bria FIBO',
  'kling-3.0/video': 'Kling 3.0',
  'kling/v25-turbo-text-to-video-pro': 'Kling 2.5 Turbo',
  'kling/v25-turbo-image-to-video-pro': 'Kling 2.5 Turbo',
  'grok-imagine/text-to-video': 'Grok Imagine',
  'grok-imagine/image-to-video': 'Grok Imagine',
  'bytedance/seedance-2': 'Seedance 2',
  'bytedance/seedance-2-5': 'Seedance 2.5',
  'bytedance/seedance-2-fast': 'Seedance 2 Fast',
  'bytedance/seedance-2-mini': 'Seedance 2 Mini',
  'bytedance/seedance-2.0/text-to-video': 'Seedance 2.0',
  'bytedance/seedance-2.0/image-to-video': 'Seedance 2.0 I2V',
  'bytedance/seedance-2.0/reference-to-video': 'Seedance 2.0 Ref',
  'bytedance/seedance-2.5/text-to-video': 'Seedance 2.5',
  'bytedance/seedance-2.5/image-to-video': 'Seedance 2.5 I2V',
  'bytedance/seedance-2.5/reference-to-video': 'Seedance 2.5 Ref',
  'kling-video/v3.0/std/text-to-video': 'Kling 3.0 Standard',
  'kling-video/v3.0/std/image-to-video': 'Kling 3.0 Standard I2V',
  'alibaba/wan-3.0/text-to-video': 'Wan 3.0',
  'alibaba/wan-3.0/image-to-video': 'Wan 3.0 I2V',
  'alibaba/wan-3.0/reference-to-video': 'Wan 3.0 Ref',
  'alibaba/wan-3.0-prime/text-to-video': 'Wan 3.0 Prime',
  'alibaba/wan-3.0-prime/image-to-video': 'Wan 3.0 Prime I2V',
  'alibaba/wan-3.0-prime/reference-to-video': 'Wan 3.0 Prime Ref',
  'minimax/h3/text-to-video': 'MiniMax H3',
  'minimax/h3/image-to-video': 'MiniMax H3 I2V',
  'higgsfield/cinema-studio/4.0': 'Cinema Studio 4.0',
  'higgsfield-ai/soul/cinema': 'Soul Cinema',
  'higgsfield-ai/soul/standard': 'Soul v1',
  'higgsfield-ai/soul/v2/standard': 'Soul Image 2.0',
  'flux-pro/kontext/max/text-to-image': 'FLUX.1 Pro',
  'xai/grok-imagine-image-2.0': 'Grok Image 2.0',
  'marketing-studio/image': 'Graphic Ads',
  'marketing-studio/image/graphic-ads': 'Graphic Ads',
  'marketing-studio/image/marketplace': 'Marketplace Design',
  'wan-2-7-text-to-video': 'Wan 2.7',
  'wan-2-7-image-to-video': 'Wan 2.7',
  'wan/3-0-video': 'Wan 3.0',
  'wan-3-0-video': 'Wan 3.0',
  'hailuo/02-text-to-video-pro': 'Hailuo 2 Pro',
  'google/gemini-omni-flash-1-1': 'Gemini Omni 1.1 Flash',
  'gemini-omni-video': 'Gemini Omni 1.1 Flash',
  'prunaai/p-video-avatar': 'P-Video Avatar',
  'prunaai/p-video': 'P-Video',
  'prunaai/p-video-2': 'P-Video 2',
  'prunaai/p-video-2-pro': 'P-Video 2 Pro',
  'prunaai/p-video-2-pro-reference': 'P-Video 2 Pro',
  'pruna/p-video-2': 'P-Video 2',
  'pruna/p-video-2-pro': 'P-Video 2 Pro',
  'pruna/p-video-2-pro-reference': 'P-Video 2 Pro',
  'minimax-h3/text-to-video': 'MiniMax H3',
  'minimax-h3/image-to-video': 'MiniMax H3',
  'minimax-h3/reference-to-video': 'MiniMax H3',
  'minimax/h3/reference-to-video': 'MiniMax H3',
  'minimax/h3-max-turbo/text-to-video': 'MiniMax H3 Max Turbo',
  'minimax/h3-max/text-to-video': 'MiniMax H3 Max',
  'minimax/h3-max/reference-to-video': 'MiniMax H3 Max Ref',
  'kling-4.0/reference-to-video': 'Kling 4.0',
  'kling-4.0/keyframe-to-video': 'Kling 4.0',
  'kling/v4/text-to-video': 'Kling 4.0',
  'kling/v4/image-to-video': 'Kling 4.0',
  'kling/v4/reference-to-video': 'Kling 4.0',
  'klingai/kling-4.0': 'Kling 4.0',
  'machgen/MiniMax-H3/t2v': 'MiniMax H3',
  'machgen/MiniMax-H3/i2v': 'MiniMax H3',
  'machgen/MiniMax-H3/fflf': 'MiniMax H3',
  'machgen/MiniMax-H3/ref': 'MiniMax H3',
  'machgen/MiniMax-H3': 'MiniMax H3',
  'machgen/MiniMax-H3-Turbo/t2v': 'MiniMax H3 Turbo',
  'machgen/MiniMax-H3-Turbo': 'MiniMax H3 Turbo',
  'MiniMax-H3-Turbo': 'MiniMax H3 Turbo',
  'MiniMax-H3': 'MiniMax H3',
  'machgen/Wan2.2-A14B/t2v': 'Wan2.2-A14B',
  'machgen/Wan2.2-A14B/i2v': 'Wan2.2-A14B',
  'machgen/Wan2.2-A14B': 'Wan2.2-A14B',
  'machgen/LTX-2.3-Pro/t2v': 'LTX-2.3-Pro',
  'machgen/LTX-2.3-Pro/i2v': 'LTX-2.3-Pro',
  'machgen/LTX-2.3-Pro/fflf': 'LTX-2.3-Pro',
  'machgen/LTX-2.3-Pro': 'LTX-2.3-Pro',
  'machgen/Vidu-Q3-Turbo/t2v': 'Vidu-Q3-Turbo',
  'machgen/Vidu-Q3-Turbo/i2v': 'Vidu-Q3-Turbo',
  'machgen/Vidu-Q3-Turbo/fflf': 'Vidu-Q3-Turbo',
  'machgen/Vidu-Q3-Turbo/ref': 'Vidu-Q3-Turbo',
  'machgen/Vidu-Q3-Turbo': 'Vidu-Q3-Turbo',
  'machgen/Vidu-Q3-Pro/t2v': 'Vidu-Q3-Pro',
  'machgen/Vidu-Q3-Pro/i2v': 'Vidu-Q3-Pro',
  'machgen/Vidu-Q3-Pro/fflf': 'Vidu-Q3-Pro',
  'machgen/Vidu-Q3-Pro/ref': 'Vidu-Q3-Pro',
  'machgen/Vidu-Q3-Pro': 'Vidu-Q3-Pro',
  'machgen/Seedance-2.5/t2v': 'Seedance 2.5',
  'machgen/Seedance-2.5/i2v': 'Seedance 2.5',
  'machgen/Seedance-2.5/fflf': 'Seedance 2.5',
  'machgen/Seedance-2.5/ref': 'Seedance 2.5',
  'machgen/Seedance-2.5': 'Seedance 2.5',
  'machgen/Seedance-2.0/t2v': 'Seedance 2.0',
  'machgen/Seedance-2.0/i2v': 'Seedance 2.0',
  'machgen/Seedance-2.0/fflf': 'Seedance 2.0',
  'machgen/Seedance-2.0/ref': 'Seedance 2.0',
  'machgen/Seedance-2.0': 'Seedance 2.0',
  'machgen/Seedance-2.0-Fast/t2v': 'Seedance 2.0 Fast',
  'machgen/Seedance-2.0-Fast/i2v': 'Seedance 2.0 Fast',
  'machgen/Seedance-2.0-Fast/fflf': 'Seedance 2.0 Fast',
  'machgen/Seedance-2.0-Fast/ref': 'Seedance 2.0 Fast',
  'machgen/Seedance-2.0-Fast': 'Seedance 2.0 Fast',
  'machgen/Seedance-2.0-Mini/t2v': 'Seedance 2.0 Mini',
  'machgen/Seedance-2.0-Mini/i2v': 'Seedance 2.0 Mini',
  'machgen/Seedance-2.0-Mini/fflf': 'Seedance 2.0 Mini',
  'machgen/Seedance-2.0-Mini/ref': 'Seedance 2.0 Mini',
  'machgen/Seedance-2.0-Mini': 'Seedance 2.0 Mini',
  'machgen/Kling-v3/t2v': 'Kling-v3',
  'machgen/Kling-v3/i2v': 'Kling-v3',
  'machgen/Kling-v3/fflf': 'Kling-v3',
  'machgen/Kling-v3': 'Kling-v3',
  'machgen/Kling-o3/t2v': 'Kling-o3',
  'machgen/Kling-o3/ref': 'Kling-o3',
  'machgen/Kling-o3': 'Kling-o3',
  'machgen/Vidu-Q3/ref': 'Vidu-Q3',
  'machgen/Vidu-Q3': 'Vidu-Q3',
  'machgen/Vidu-Q3-Pro-Fast/i2v': 'Vidu-Q3-Pro-Fast',
  'machgen/Vidu-Q3-Pro-Fast': 'Vidu-Q3-Pro-Fast',
  'machgen/Vidu-Q4-Preview/ref': 'Vidu-Q4-Preview',
  'machgen/Vidu-Q4-Preview/i2v': 'Vidu-Q4-Preview',
  'machgen/Vidu-Q4-Preview': 'Vidu-Q4-Preview',
  'machgen/Alibaba-Wan-3.0/t2v': 'Alibaba-Wan-3.0',
  'machgen/Alibaba-Wan-3.0/i2v': 'Alibaba-Wan-3.0',
  'machgen/Alibaba-Wan-3.0/fflf': 'Alibaba-Wan-3.0',
  'machgen/Alibaba-Wan-3.0/ref': 'Alibaba-Wan-3.0',
  'machgen/Alibaba-Wan-3.0': 'Alibaba-Wan-3.0',
  'machgen/Veo-3.1/t2v': 'Veo-3.1',
  'machgen/Veo-3.1': 'Veo-3.1',
  'machgen/Veo-3.1-Fast/t2v': 'Veo-3.1-Fast',
  'machgen/Veo-3.1-Fast': 'Veo-3.1-Fast',
  'machgen/Pixverse-V6/t2v': 'Pixverse-V6',
  'machgen/Pixverse-V6/i2v': 'Pixverse-V6',
  'machgen/Pixverse-V6/ref': 'Pixverse-V6',
  'machgen/Pixverse-V6': 'Pixverse-V6',
  'machgen/Pixverse-C1/t2v': 'Pixverse-C1',
  'machgen/Pixverse-C1/i2v': 'Pixverse-C1',
  'machgen/Pixverse-C1/ref': 'Pixverse-C1',
  'machgen/Pixverse-C1': 'Pixverse-C1',
  'machgen/HappyHorse-1.1/t2v': 'HappyHorse-1.1',
  'machgen/HappyHorse-1.1/i2v': 'HappyHorse-1.1',
  'machgen/HappyHorse-1.1/ref': 'HappyHorse-1.1',
  'machgen/HappyHorse-1.1': 'HappyHorse-1.1',
  'machgen/HappyHorse-1.0/t2v': 'HappyHorse-1.0',
  'machgen/HappyHorse-1.0/i2v': 'HappyHorse-1.0',
  'machgen/HappyHorse-1.0/ref': 'HappyHorse-1.0',
  'machgen/HappyHorse-1.0': 'HappyHorse-1.0',
  'machgen/Grok-Imagine-Video/t2v': 'Grok-Imagine-Video',
  'machgen/Grok-Imagine-Video': 'Grok-Imagine-Video',
  'machgen/Grok-Imagine-Video-1.5/i2v': 'Grok-Imagine-Video-1.5',
  'machgen/Grok-Imagine-Video-1.5': 'Grok-Imagine-Video-1.5',
  'machgen/Topaz-Video-Precision/upscale': 'Topaz-Video-Precision',
  'machgen/Topaz-Video-Precision': 'Topaz-Video-Precision',
  'machgen/Topaz-Video-Precision-Animation/upscale': 'Topaz-Video-Precision-Animation',
  'machgen/Topaz-Video-Precision-Animation': 'Topaz-Video-Precision-Animation',
  'machgen/Topaz-Video-Generative/upscale': 'Topaz-Video-Generative',
  'machgen/Topaz-Video-Generative': 'Topaz-Video-Generative',
  'machgen/Topaz-Video-Generative-Fast/upscale': 'Topaz-Video-Generative-Fast',
  'machgen/Topaz-Video-Generative-Fast': 'Topaz-Video-Generative-Fast',
  'elevenlabs/text-to-speech-multilingual-v2': 'ElevenLabs Multilingual v2 (KIE)',
  'elevenlabs/text-to-speech-turbo-2-5': 'ElevenLabs Turbo 2.5 (KIE)',
  'google/gemini-3-1-flash-tts': 'Gemini 3.1 Flash TTS (KIE)',
  'google/gemini-3-8-flash-tts': 'Gemini 3.8 Flash TTS (KIE)',
  'gpt-tts-1': 'GPT TTS',
  'minimax-text-to-speech': 'MiniMax TTS',
  'suno/V6': 'Suno V6',
  'suno/V6_MINI': 'Suno V6 Mini',
  'suno/V6_WILD': 'Suno V6 Wild',
  'openaudio-text-to-music': 'OpenAudio Music',
  'mucat-text-to-music': 'MuCat Music',
  'elevenlabs:sfx': 'ElevenLabs Music',
}

// Files dragged in from the OS. Dragging a grid asset also reports 'Files' in Chromium,
// but those carry our own types and are already in the project.
function isExternalFileDrag(dt: DataTransfer | null | undefined): boolean {
  const types = dt?.types
  if (!types?.includes('Files')) return false
  return !types.includes('application/x-openfield-asset') && !types.includes('application/x-openfield-assets')
}

function modelLabel(model: string | undefined): string {
  if (!model) return '—'
  if (model.startsWith('piper:')) return `Piper · ${model.slice(6)}`
  if (model.startsWith('kokoro:')) return `Kokoro · ${model.slice(7)}`
  if (model.startsWith('elevenlabs:vc:')) return `ElevenLabs VC · ${model.slice(13)}`
  if (model.startsWith('elevenlabs:') && model !== 'elevenlabs:sfx') return `ElevenLabs · ${model.slice(11)}`
  return cleanModelName(MODEL_NAMES[model] || model)
}

// ─── Grid cards ─────────────────────────────────────────────────────────────────
// Memoized: grid-wide state (hover, selection, durations) re-renders only the card it touches.
// Thumbnails come from main already downscaled to the render scale in Settings and fade in
// once decoded; a video card shows a poster frame and only mounts a <video> while hovered.

function formatDuration(secs: number) {
  if (!isFinite(secs) || secs <= 0) return ''
  const s = Math.round(secs)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface AssetCardActions {
  click: (e: React.MouseEvent, asset: any) => void
  toggleSelect: (id: string, shift: boolean) => void
  toggleFavorite: (id: string) => void
  remove: (id: string) => void
  dragStart: (e: React.DragEvent, asset: any) => void
  dragEnd: () => void
  duration: (id: string, secs: number) => void
}

function ImageThumb({ src }: { src: string }) {
  const scale = useAppStore((s) => s.gridRenderScale)
  const url = fileUrl(src, { thumb: true, scale })
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  useEffect(() => {
    setLoaded(false)
    const el = imgRef.current
    if (el?.complete && el.naturalWidth > 0) setLoaded(true)
  }, [url])
  return (
    <img
      ref={imgRef}
      src={url}
      alt=""
      draggable={false}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      className={`w-full h-full object-cover select-none transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}

function VideoThumb({ src, assetId, onDuration }: { src: string; assetId: string; onDuration: (id: string, secs: number) => void }) {
  const scale = useAppStore((s) => s.gridRenderScale)
  const [hover, setHover] = useState(false)
  const [loaded, setLoaded] = useState(false)
  if (/^https?:/i.test(src)) {
    // Cloud-only asset (not downloaded yet): no poster can be rendered, stream its metadata
    return (
      <video
        src={srcUrl(src)}
        muted
        loop
        playsInline
        preload="metadata"
        draggable={false}
        className="w-full h-full object-cover select-none"
        onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}) }}
        onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0 }}
        onLoadedMetadata={(e) => onDuration(assetId, e.currentTarget.duration)}
      />
    )
  }
  return (
    <div className="relative w-full h-full" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <img
        src={posterUrl(src, scale)}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover select-none transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
      {hover && (
        <video
          src={srcUrl(src)}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover select-none"
          onLoadedMetadata={(e) => onDuration(assetId, e.currentTarget.duration)}
        />
      )}
    </div>
  )
}

const AssetCard = memo(function AssetCard({ asset, selected, dragging, duration, actions }: {
  asset: any
  selected: boolean
  dragging: boolean
  duration?: number
  actions: AssetCardActions
}) {
  const src: string | null = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
  const isError = !!asset.filePath?.startsWith('__error__')
  const isLoading = !asset.localPath && asset.modelUsed && asset.modelUsed !== 'import' && !isError
  const cardParams = useMemo(() => {
    try { return JSON.parse(asset.parameters || '{}') || {} } catch { return {} }
  }, [asset.parameters])
  const storedDuration = Number(asset.duration) > 0 ? Number(asset.duration) : (Number(cardParams.duration) > 0 ? Number(cardParams.duration) : null)
  const dur = duration ?? storedDuration
  const res = asset.type === 'video' && cardParams.resolution ? String(cardParams.resolution) : null
  const isDraft = res != null && isSeedanceDraft(asset, cardParams)
  return (
    <div
      data-asset-card={asset.id}
      className={`card group relative overflow-hidden p-0 cursor-pointer aspect-square ${dragging ? 'opacity-40 scale-[0.98]' : ''}`}
      draggable={!isError && !!src}
      onDragStart={(e) => actions.dragStart(e, asset)}
      onDragEnd={actions.dragEnd}
      onClick={(e) => actions.click(e, asset)}
    >
      <div className="w-full h-full bg-surface-800 flex items-center justify-center overflow-hidden">
        {src ? (
          asset.type === 'video'
            ? <VideoThumb src={src} assetId={asset.id} onDuration={actions.duration} />
            : <ImageThumb src={src} />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-1.5 text-red-600 dark:text-red-400 p-3 text-center w-full h-full">
            <AlertCircle size={20} className="flex-shrink-0" />
            <span className="text-[10px] text-red-600/80 dark:text-red-400/80 line-clamp-3 leading-tight">{asset.filePath?.replace('__error__:', '')}</span>
            <RetryGenerationButton assetId={asset.id} />
          </div>
        ) : isLoading ? (
          <ImageGeneration
            status="generating"
            size="fill"
            showStatus={false}
            prompt={undefined}
            resolution={undefined}
            className="w-full h-full"
          />
        ) : (
          <div className="text-surface-600 text-sm">No preview</div>
        )}
      </div>
      {!isLoading && ((asset.type === 'video' && dur != null) || res) && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1 z-10">
          {asset.type === 'video' && dur != null && (
            <div className="bg-black/60 rounded px-1.5 py-0.5 text-[9px] text-white/90 font-medium flex items-center gap-1">
              <Clock size={9} /> {formatDuration(dur)}
            </div>
          )}
          {res && (
            <div
              className={isDraft
                ? 'bg-amber-400 rounded px-1.5 py-0.5 text-[9px] text-amber-950 font-semibold'
                : 'bg-black/60 rounded px-1.5 py-0.5 text-[9px] text-white/90 font-medium'}
              title={isDraft ? 'Draft de Seedance 2.5' : undefined}
            >
              {res}
            </div>
          )}
        </div>
      )}
      {!isLoading && (
        <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
          {!asset.localPath && asset.filePath?.startsWith('http') && (
            <div className="bg-black/60 rounded-md p-1">
              <Cloud size={12} className="text-blue-400" />
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); actions.toggleFavorite(asset.id) }}
            title={asset.isFavorite ? 'Remove favorite' : 'Add to favorites'}
            className={`p-1 rounded-md transition-colors ${asset.isFavorite ? 'text-amber-400 bg-black/60' : 'text-white/80 bg-black/60 opacity-0 group-hover:opacity-100 hover:text-amber-400'}`}
          >
            <Star size={12} fill={asset.isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); actions.toggleSelect(asset.id, e.shiftKey) }}
        className={`absolute top-2 left-2 z-10 p-0.5 rounded transition-all ${selected ? 'opacity-100 bg-accent-500 text-on-accent' : 'opacity-0 group-hover:opacity-100 bg-black/50 text-white hover:bg-black/70'}`}
      >
        {selected ? <CheckSquare size={16} /> : <Square size={16} />}
      </button>
      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
        <button onClick={(e) => { e.stopPropagation(); actions.remove(asset.id) }} className="p-1.5 rounded-full bg-black/50 text-white hover:text-red-400 transition-colors">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
})

export function LibraryPage() {
  const setPage = useAppStore((s) => s.setPage)
  const composerPayload = useAppStore((s) => s.composerPayload)
  const setComposerPayload = useAppStore((s) => s.setComposerPayload)
  const composerRef = useRef<PromptComposerHandle>(null)

  const assetSearch = useAppStore((s) => s.assetSearch)
  const setAssetSearch = useAppStore((s) => s.setAssetSearch)
  const search = assetSearch.query
  const showFavorites = assetSearch.featured

  // The Playground grid only shows visual media; audio lives in the library picker.
  const activeTypes = useMemo(() => {
    const visual = (['image', 'video'] as const).filter((t) => assetSearch.types[t])
    return visual.length > 0 ? visual : (['image', 'video'] as const)
  }, [assetSearch.types.image, assetSearch.types.video])
  const typeFilter: 'all' | 'image' | 'video' =
    activeTypes.length === 1 ? activeTypes[0] : 'all'
  const [composerMode, setComposerMode] = useState<'image' | 'video' | 'audio'>('image')
  const [selectedAsset, setSelectedAsset] = useState<any>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkTag, setShowBulkTag] = useState(false)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [allTags, setAllTags] = useState<string[]>([])
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId)
  const [orphans, setOrphans] = useState<any[]>([])
  const [organizing, setOrganizing] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [importingFiles, setImportingFiles] = useState(false)
  const [gridCols, setGridCols] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(GRID_COLS_KEY))
      if (saved >= GRID_COLS_MIN && saved <= GRID_COLS_MAX) return saved
    } catch {}
    return GRID_COLS_DEFAULT
  })
  useEffect(() => {
    try { localStorage.setItem(GRID_COLS_KEY, String(gridCols)) } catch {}
  }, [gridCols])

  // Close the import overlay whenever a drag ends, even if a child (e.g. the composer)
  // handled the drop and stopped propagation. Capture phase runs before any child handler.
  useEffect(() => {
    const reset = () => setDropActive(false)
    window.addEventListener('drop', reset, true)
    window.addEventListener('dragend', reset, true)
    return () => {
      window.removeEventListener('drop', reset, true)
      window.removeEventListener('dragend', reset, true)
    }
  }, [])
  const [durations, setDurations] = useState<Record<string, number>>({})
  const { gridRef, capture, fadeOut, animate } = useGridFlip()
  const dragStartedRef = useRef(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const registerDuration = useCallback((id: string, d: number) => {
    if (!isFinite(d) || d <= 0) return
    setDurations(prev => {
      const cur = prev[id]
      if (cur != null && Math.abs(cur - d) < 0.5) return prev
      return { ...prev, [id]: d }
    })
  }, [])


  const refreshOrphans = useCallback(async () => {
    try {
      const api = (window as any).electronAPI
      const result = await api?.assets.scanOrphans()
      setOrphans(Array.isArray(result) ? result : [])
    } catch { setOrphans([]) }
  }, [])

  useEffect(() => {
    refreshOrphans()
  }, [refreshOrphans, activeWorkspaceId])

  const activeOrphans = orphans.find((o: any) => o.workspaceId === activeWorkspaceId)

  const handleOrganize = async () => {
    if (organizing) return
    setOrganizing(true)
    try {
      const api = (window as any).electronAPI
      await api?.assets.adoptOrphans(activeWorkspaceId || undefined)
      reset()
      await refreshOrphans()
    } finally {
      setOrganizing(false)
    }
  }

  const handleDropFiles = async (files: FileList | File[]) => {
    if (importingFiles || files.length === 0) return
    setImportingFiles(true)
    try {
      const api = (window as any).electronAPI
      for (const file of Array.from(files)) {
        if (file.size === 0) continue
        const base64 = await new Promise<string | null>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            resolve(result?.split(',')[1] || null)
          }
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(file)
        })
        if (!base64) continue
        await api?.assets.importBase64(base64, file.type || 'application/octet-stream', file.name, undefined, 'import')
      }
      reset()
      await refreshOrphans()
    } catch (err) {
      console.error('[Library] File import failed:', err)
    } finally {
      setImportingFiles(false)
    }
  }

  const pagedTypes = useMemo(() => [...activeTypes], [activeTypes])

  const { assets, total, hasMore, initialLoading, loadingMore, sentinelRef, reset, loadMore, updateAsset, removeAssets } = usePagedAssets({
    types: pagedTypes,
    search,
    isFavorite: showFavorites,
    isArchived: showArchived ? true : undefined,
    aspectRatio: assetSearch.aspectRatio,
    pageSize: 20,
    excludeUploads: true,
  })

  const pendingNextRef = useRef(false)

  // Preload next batch when near the end of loaded assets
  useEffect(() => {
    if (!selectedAsset) return
    const idx = assets.findIndex((a: any) => a.id === selectedAsset.id)
    if (idx >= 0 && idx >= assets.length - 2 && hasMore) {
      loadMore()
    }
  }, [selectedAsset?.id, assets.length, hasMore, loadMore])

  // Advance to next asset if pending from hitting next at the end of the previous batch
  useEffect(() => {
    if (pendingNextRef.current && selectedAsset) {
      const idx = assets.findIndex((a: any) => a.id === selectedAsset.id)
      if (idx >= 0 && idx < assets.length - 1) {
        setSelectedAsset(assets[idx + 1])
        pendingNextRef.current = false
      }
    }
  }, [assets, selectedAsset])

  const handleAssetsMoved = (ids: string[]) => {
    fadeOut(ids)
    setTimeout(() => {
      capture()
      removeAssets(ids)
      requestAnimationFrame(() => requestAnimationFrame(animate))
    }, 180)
  }



  const resetRef = useRef(reset)
  resetRef.current = reset

  const refreshTags = useCallback(async () => {
    try {
      const tags = await (window as any).electronAPI?.assets?.tags?.()
      if (Array.isArray(tags)) setAllTags(tags)
    } catch {}
  }, [])

  useEffect(() => {
    refreshTags()
  }, [refreshTags, activeWorkspaceId])

  // Recover generations stuck in "generating" whose polling died (e.g. app restart), for every
  // provider. Completed ones are downloaded and assigned; the task:completed broadcast refreshes the grid.
  useEffect(() => {
    ;(window as any).electronAPI?.tasks?.reconcile?.().catch((err: any) => {
      console.warn('[Playground] Task reconcile failed:', err)
    })
  }, [activeWorkspaceId])

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api) return
    const onDone = () => {
      resetRef.current()
      refreshTags()
    }
    const unsubComplete = api.on('openfield:task:completed', onDone)
    const unsubFailed = api.on('openfield:task:failed', onDone)
    const unsubRpComplete = api.on('replicate:task:completed', onDone)
    const unsubRpFailed = api.on('replicate:task:failed', onDone)
    const unsubFalComplete = api.on('fal:task:completed', onDone)
    const unsubFalFailed = api.on('fal:task:failed', onDone)
    const unsubMgComplete = api.on('machgen:task:completed', onDone)
    const unsubMgFailed = api.on('machgen:task:failed', onDone)
    const unsubHfComplete = api.on('higgsfield:task:completed', onDone)
    const unsubHfFailed = api.on('higgsfield:task:failed', onDone)
    return () => {
      unsubComplete?.()
      unsubFailed?.()
      unsubRpComplete?.()
      unsubRpFailed?.()
      unsubFalComplete?.()
      unsubFalFailed?.()
      unsubMgComplete?.()
      unsubMgFailed?.()
      unsubHfComplete?.()
      unsubHfFailed?.()
    }
  }, [refreshTags])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setTagMenuOpen(false)
    }
    window.addEventListener('mousedown', onDocClick)
    return () => window.removeEventListener('mousedown', onDocClick)
  }, [])

  const handleDelete = useCallback(async (assetId: string) => {
    await (window as any).electronAPI?.assets.delete(assetId)
    reset()
    if (selectedAsset?.id === assetId) setSelectedAsset(null)
  }, [reset, selectedAsset])

  const handleToggleFavorite = useCallback(async (id: string) => {
    const updated = await (window as any).electronAPI?.assets.toggleFavorite(id)
    if (updated) {
      updateAsset(updated)
      setSelectedAsset((prev: any) => prev?.id === updated.id ? updated : prev)
    }
  }, [updateAsset])

  const lastSelectedRef = useRef<string | null>(null)

  const toggleSelect = useCallback((id: string, shift = false) => {
    setSelectedIds(prev => {
      if (shift && lastSelectedRef.current && lastSelectedRef.current !== id) {
        const idxs = assets.map(a => a.id)
        const start = idxs.indexOf(lastSelectedRef.current)
        const end = idxs.indexOf(id)
        if (start >= 0 && end >= 0) {
          const [lo, hi] = start < end ? [start, end] : [end, start]
          const next = new Set(prev)
          for (let i = lo; i <= hi; i++) next.add(idxs[i])
          return next
        }
      }
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      lastSelectedRef.current = id
      return next
    })
  }, [assets])

  // Card callbacks stay referentially stable (the cards are memoized) and read the latest
  // handlers through a ref.
  const latestRef = useRef({ assets, selectedIds, toggleSelect, handleToggleFavorite, handleDelete })
  latestRef.current = { assets, selectedIds, toggleSelect, handleToggleFavorite, handleDelete }
  const cardActions = useMemo<AssetCardActions>(() => ({
    click: (e, asset) => {
      if (dragStartedRef.current) return
      if (e.shiftKey) latestRef.current.toggleSelect(asset.id, true)
      else setSelectedAsset(asset)
    },
    toggleSelect: (id, shift) => latestRef.current.toggleSelect(id, shift),
    toggleFavorite: (id) => { void latestRef.current.handleToggleFavorite(id) },
    remove: (id) => { void latestRef.current.handleDelete(id) },
    dragStart: (e, asset) => {
      const { assets: all, selectedIds: sel } = latestRef.current
      const draggedAssets = sel.has(asset.id) && sel.size > 1 ? all.filter((a: any) => sel.has(a.id)) : [asset]
      e.dataTransfer.setData('application/x-openfield-assets', JSON.stringify(draggedAssets))
      e.dataTransfer.setData('application/x-openfield-asset', JSON.stringify(asset))
      e.dataTransfer.setData('text/plain', asset.id)
      e.dataTransfer.effectAllowed = 'copy'
      dragStartedRef.current = true
      setDraggingId(asset.id)
    },
    dragEnd: () => {
      setDraggingId(null)
      setTimeout(() => { dragStartedRef.current = false }, 100)
    },
    duration: registerDuration,
  }), [registerDuration])

  // Row virtualization: only the rows in (and just around) the viewport exist in the DOM, so a
  // long session does not pile up hundreds of <img>/<video> elements as pages load.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [gridWidth, setGridWidth] = useState(0)
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setGridWidth(w)
    })
    ro.observe(el)
    setGridWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [gridRef])
  const gridGap = gridCols >= 7 ? 8 : 16
  const cardSize = gridWidth > 0 ? Math.max(1, (gridWidth - gridGap * (gridCols - 1)) / gridCols) : 220
  const rowHeight = cardSize + gridGap
  const rowCount = Math.ceil(assets.length / gridCols)
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 2,
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { rowVirtualizer.measure() }, [rowHeight])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  useEffect(() => {
    if (composerPayload) {
      setTimeout(() => {
        composerRef.current?.loadFromParams(composerPayload)
        setComposerPayload(null)
      }, 100)
    }
  }, [composerPayload, setComposerPayload])

  useEffect(() => {
    setSelectedAsset((prev: any) => {
      if (!prev || assets.length === 0) return prev
      const updated = assets.find((a: any) => a.id === prev.id)
      if (!updated) return prev
      if (updated.localPath === prev.localPath && updated.filePath === prev.filePath && updated.status === prev.status) return prev
      return updated
    })
  }, [assets])

  const handleGenerate = useCallback(async (params: any) => {
    try {
      const api = (window as any).electronAPI
      const isVideo = params?.mode === 'video' || params?.duration !== undefined || params?.fps !== undefined || params?.firstFrameBase64 !== undefined || params?.videoRefs?.length > 0 || params?.model?.includes('video') || params?.model?.startsWith('wan') || params?.model?.startsWith('kling') || params?.model?.startsWith('bytedance/') || params?.model?.startsWith('hailuo/') || params?.model?.startsWith('minimax') || params?.model?.startsWith('prunaai/') || params?.model?.startsWith('pruna/') || params?.model?.startsWith('pixverse-v6/') || params?.model === 'omnihuman-1-5' || params?.model === 'google/gemini-omni-flash-1-1' || params?.model === 'philz1337x/crystal-video-upscaler'
      const isApimartModel = params?.provider === 'apimart' || params?.model?.startsWith('apimart/')
      const isKlingModel = params?.provider === 'klingai' || params?.model?.startsWith('klingai/')
      const isPrunaModel = params?.provider === 'pruna' || params?.model?.startsWith('pruna/')
      const isMachgenModel = params?.provider === 'machgen' || params?.model?.startsWith('machgen/') || params?.model?.includes('MachGen') || params?.model?.includes('MiniMax-H3') || params?.model?.includes('Wan2.2') || params?.model?.includes('LTX-2.3') || params?.model?.includes('Vidu-Q3') || params?.model?.includes('Topaz-')
      const isHiggsfieldModel = params?.provider === 'higgsfield' ||
        params?.model?.startsWith('higgsfield/') ||
        params?.model?.startsWith('bytedance/seedance-2.0') ||
        params?.model?.startsWith('bytedance/seedance-2.5') ||
        params?.model?.startsWith('kling-video/') ||
        params?.model?.startsWith('minimax/h3/') ||
        params?.model?.startsWith('alibaba/wan-3.0') ||
        params?.model?.startsWith('higgsfield-ai/') ||
        params?.model?.startsWith('flux-pro/') ||
        params?.model?.startsWith('xai/grok-imagine') ||
        params?.model?.startsWith('marketing-studio/')
      const isReplicateModel = params?.provider === 'replicate' || params?.model?.startsWith('prunaai/') || params?.model?.startsWith('philz1337x/') || params?.model?.startsWith('black-forest-labs/') || params?.model?.startsWith('ideogram-ai/')
      const isFalModel = params?.provider === 'fal' || params?.model?.startsWith('minimax/') || params?.model?.startsWith('fal-ai/') || params?.model?.startsWith('kling/v4/') || params?.model?.startsWith('imagineart/') || params?.model?.startsWith('bria/')

      if (isVideo) {
        if (!assetSearch.types.video) {
          setAssetSearch({ types: { ...assetSearch.types, video: true } })
        }
        if (isKlingModel) {
          await api?.kling.generate(params)
        } else if (isPrunaModel) {
          await api?.pruna.generate(params)
        } else if (isApimartModel) {
          await api?.apimart.generate(params)
        } else if (isHiggsfieldModel) {
          await api?.higgsfield.generate(params)
        } else if (isMachgenModel) {
          await api?.machgen.generate(params)
        } else if (isFalModel) {
          await api?.fal.generate(params)
        } else if (isReplicateModel) {
          await api?.replicate.generate(params)
        } else {
          await api?.openfield.generateVideo(params)
        }
      } else {
        if (!assetSearch.types.image) {
          setAssetSearch({ types: { ...assetSearch.types, image: true } })
        }
        if (isApimartModel) {
          await api?.apimart.generate(params)
        } else if (isHiggsfieldModel) {
          await api?.higgsfield.generate(params)
        } else if (isFalModel) {
          await api?.fal.generate(params)
        } else if (isMachgenModel) {
          await api?.machgen.generate(params)
        } else if (isReplicateModel) {
          await api?.replicate.generate(params)
        } else if (params.local && params.modelId) {
          await api?.local.imageGenerate({
            modelId: params.modelId,
            prompt: params.prompt,
            width: params.resolution === '2K' ? 2048 : params.resolution === '4K' ? 4096 : 1024,
            height: params.resolution === '2K' ? 2048 : params.resolution === '4K' ? 4096 : 1024,
            steps: 4,
            guidance: 0,
            seed: -1,
          })
        } else {
          await api?.openfield.generateImage(params)
        }
      }
      reset()
    } catch (err) {
      console.error('Generation failed:', err)
    }
  }, [reset, assetSearch.types, setAssetSearch])

  // References from the library go in by asset: the composer reads images itself and videos
  // stay on disk (the queue uploads them from the asset file, never as base64 over IPC).
  const handleBulkAddToComposer = useCallback(async () => {
    const picked = assets.filter((a: any) => selectedIds.has(a.id))
    const missing = Array.from(selectedIds).filter((id) => !picked.some((a: any) => a.id === id))
    await composerRef.current?.addAssets?.([...picked, ...missing])
    clearSelection()
  }, [assets, selectedIds, clearSelection])

  const handleBulkDelete = useCallback(async () => {
    const api = (window as any).electronAPI
    await api?.assets.deleteMultiple(Array.from(selectedIds))
    setShowBulkDelete(false)
    clearSelection()
    reset()
  }, [selectedIds, clearSelection, reset])

  const handleBulkArchive = useCallback(async () => {
    const api = (window as any).electronAPI
    const count = selectedIds.size
    if (count === 0) return
    const shouldArchive = !showArchived
    try {
      await api?.assets.archiveMultiple(Array.from(selectedIds), shouldArchive)
      toast.success(
        shouldArchive
          ? `${count} ${count === 1 ? 'asset archivado' : 'assets archivados'}`
          : `${count} ${count === 1 ? 'asset desarchivado' : 'assets desarchivados'}`
      )
      clearSelection()
      reset()
    } catch (err) {
      console.error('[LibraryPage] Bulk archive failed:', err)
      toast.error(shouldArchive ? 'Error al archivar assets' : 'Error al desarchivar assets')
    }
  }, [selectedIds, showArchived, clearSelection, reset])

  const handleBulkAddTags = useCallback(async (tags: string[]) => {
    const api = (window as any).electronAPI
    await api?.assets.addTagsMultiple(Array.from(selectedIds), tags)
    setShowBulkTag(false)
    reset()
    refreshTags()
  }, [selectedIds, reset, refreshTags])

  const params = selectedAsset ? (() => { try { return JSON.parse(selectedAsset.parameters || '{}') } catch { return {} } })() : {}

  const handleRecreate = async () => {
    if (!selectedAsset) return
    try {
      const api = (window as any).electronAPI
      const p = JSON.parse(selectedAsset.parameters || '{}')
      const loadRefs = async (refs: any[]) => {
        if (!refs?.length) return undefined
        const ids = refs.map(r => r.assetId).filter(Boolean)
        if (ids.length > 0) {
          const results = await api?.assets.readBase64(ids)
          const map = new Map((results || []).map((r: any) => [r.id, r.base64]))
          return refs.map(r => ({ ...r, base64: r.assetId ? (map.get(r.assetId) || '') : (r.base64 || '') })).filter((r: any) => r.base64?.length > 20)
        }
        return refs.filter((r: any) => r.base64?.length > 50)
      }
      const loadImg = async (key: string) => {
        const assetKey = key === 'imageBase64' ? 'imageAssetId' : key === 'firstFrameBase64' ? 'firstFrameAssetId' : key === 'lastFrameBase64' ? 'lastFrameAssetId' : (key + 'AssetId')
        const assetId = p[assetKey] || p[key + 'AssetId']
        if (assetId) { const r = await api?.assets.readBase64([assetId]); return r?.[0]?.base64 || undefined }
        if (typeof p[key] === 'string' && p[key].length > 50) return p[key]
        return undefined
      }

      const base = {
        prompt: selectedAsset.prompt || '',
        model: selectedAsset.modelUsed || '',
        aspectRatio: p.aspectRatio || p.aspect_ratio || undefined,
        resolution: p.resolution || undefined,
      }

      if (selectedAsset.type === 'audio') {
        if (getAudioKind(selectedAsset) === 'music') {
          setComposerPayload({ ...base, mode: 'audio', duration: p.duration ?? undefined })
          setPage('music')
        } else {
          setPage('voice')
        }
      } else if (selectedAsset.type === 'image') {
        composerRef.current?.loadFromParams({
          ...base,
          mode: 'image',
          provider: getAssetProvider(selectedAsset) ?? undefined,
          imageBase64: await loadImg('imageBase64'),
          imageMime: p.imageMime || 'image/png',
          imageRefs: await loadRefs(p.imageRefs),
          firstFrameBase64: await loadImg('firstFrameBase64'),
          lastFrameBase64: await loadImg('lastFrameBase64'),
        })
      } else {
        composerRef.current?.loadFromParams({
          ...base,
          mode: 'video',
          provider: getAssetProvider(selectedAsset) ?? undefined,
          duration: p.duration ?? undefined,
          fps: p.fps ?? undefined,
          draft: p.draft ?? undefined,
          sound: p.sound ?? undefined,
          imageBase64: await loadImg('imageBase64'),
          imageMime: p.imageMime || 'image/png',
          imageRefs: await loadRefs(p.imageRefs),
          videoRefs: await loadRefs(p.videoRefs),
          audioRefs: await loadRefs(p.audioRefs),
          firstFrameBase64: await loadImg('firstFrameBase64'),
          lastFrameBase64: await loadImg('lastFrameBase64'),
          multiShots: p.multiShots,
          upscaleEngine: p.upscaleEngine,
          multiPrompt: p.multiPrompt,
          voice: p.voice,
          voiceLanguage: p.voiceLanguage,
        })
      }
    } catch (err) { console.error('Recreate failed:', err) }
    setSelectedAsset(null)
  }

  const [creatingFromAsset, setCreatingFromAsset] = useState<{ base64: string; prompt: string; assetId?: string; refs: MediaRef[] } | null>(null)
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null)

  const handleCopyImage = useCallback(async (asset: any) => {
    if (!asset) return
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64([asset.id])
      const b64 = results?.[0]?.base64 || ''
      const mime = results?.[0]?.mime || 'image/png'
      const ok = await copyImage(b64, mime)
      if (ok) {
        setCopiedAssetId(asset.id)
        setTimeout(() => setCopiedAssetId(null), 1500)
      }
    } catch (err) {
      console.error('Copy image failed:', err)
    }
  }, [])

  const handleAddReference = useCallback(async (asset: any) => {
    if (!asset) return
    try {
      await composerRef.current?.addAssets?.([asset])
      setSelectedAsset(null)
    } catch (err) {
      console.error('Reference failed:', err)
    }
  }, [])

  const handleRemoveBackground = useCallback(async (asset: any) => {
    if (!asset) return
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64([asset.id])
      let b64 = results?.[0]?.base64 || ''
      const mime = results?.[0]?.mime || 'image/png'
      if (b64.length > 6990508) b64 = await downscaleImage(b64, mime)
      setComposerMode('image')
      setComposerPayload({
        mode: 'image',
        prompt: 'Remove background',
        model: 'recraft/remove-background',
        imageBase64: b64,
        imageMime: 'image/jpeg',
      })
    } catch (err) {
      console.error('Remove background failed:', err)
    }
    setSelectedAsset(null)
  }, [setComposerPayload])

  const handleAnimate = useCallback(async (asset: any) => {
    if (!asset) return
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64([asset.id])
      const b64 = results?.[0]?.base64 || ''
      const mime = results?.[0]?.mime || 'image/png'
      setComposerMode('video')
      setComposerPayload({
        mode: 'video',
        prompt: asset.prompt || '',
        imageBase64: b64,
        imageMime: mime,
      })
    } catch (err) {
      console.error('Animate failed:', err)
    }
    setSelectedAsset(null)
  }, [setComposerPayload])

  const handleCreateElement = useCallback(async (asset: any) => {
    if (!asset) return
    try {
      const api = (window as any).electronAPI
      const [results, refs] = await Promise.all([api?.assets.readBase64([asset.id]), referencesFromAsset(asset)])
      const b64 = results?.[0]?.base64 || ''
      const assetId = asset.id
      setSelectedAsset(null)
      setTimeout(() => {
        setCreatingFromAsset({ base64: b64, prompt: asset.prompt || '', assetId, refs })
      }, 100)
    } catch (err) {
      console.error('Failed to create element:', err)
    }
  }, [])

  const filteredTags = allTags.filter(t => t.toLowerCase().includes(search.trim().toLowerCase()))

  const modalSrc = selectedAsset && (selectedAsset.localPath || (selectedAsset.filePath && !selectedAsset.filePath.startsWith('__error__') ? selectedAsset.filePath : ''))
  const closeModal = () => setSelectedAsset(null)
  const selectedIdx = selectedAsset ? assets.findIndex((a: any) => a.id === selectedAsset.id) : -1
  const modalPrev = selectedIdx > 0 ? () => setSelectedAsset(assets[selectedIdx - 1]) : undefined
  const modalNext = selectedIdx < 0 ? undefined
    : selectedIdx < assets.length - 1 ? () => {
      setSelectedAsset(assets[selectedIdx + 1])
      if (selectedIdx + 1 >= assets.length - 2 && hasMore) loadMore()
    }
    : hasMore ? () => { pendingNextRef.current = true; loadMore() }
    : undefined

  return (
    <div
      className="flex flex-col h-full relative"
      data-library-dropzone
      onDragOverCapture={(e) => {
        // The composer card has its own dropzone and stops dragover from bubbling here
        if ((e.target as HTMLElement).closest?.('[data-composer-dropzone]')) setDropActive(false)
      }}
      onDragOver={(e) => {
        if (isExternalFileDrag(e.dataTransfer)) {
          e.preventDefault()
          setDropActive(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false)
      }}
      onDrop={(e) => {
        if (!isExternalFileDrag(e.dataTransfer)) return
        e.preventDefault()
        e.stopPropagation()
        setDropActive(false)
        handleDropFiles(e.dataTransfer.files)
      }}
    >
      {/* Top bar stays fixed: it sits outside the scrolling grid. z-20 keeps the tag menu above the grid. */}
      <div className="flex-shrink-0 relative z-20 flex items-center gap-2 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-surface-200">Playground</span>
          <span className="text-[10px] text-surface-500">({total})</span>
        </div>
        {selectedIds.size > 0 ? (
          <div className="ml-auto flex items-center min-w-0">
            <BulkActionBar
              inline
              selectedCount={selectedIds.size}
              selectedIds={Array.from(selectedIds)}
              onAddTags={() => setShowBulkTag(true)}
              onDelete={() => setShowBulkDelete(true)}
              onArchive={handleBulkArchive}
              archiveTitle={showArchived ? 'Desarchivar' : 'Archivar'}
              onAddToComposer={handleBulkAddToComposer}
              onClearSelection={clearSelection}
              onAssetsMoved={handleAssetsMoved}
            />
          </div>
        ) : (
          <>
            <div className="relative flex-1 max-w-xs ml-auto" ref={searchRef}>
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
              <input
                value={search}
                onChange={(e) => { setAssetSearch({ query: e.target.value }); setTagMenuOpen(true) }}
                onFocus={() => setTagMenuOpen(true)}
                placeholder="Search by tag, prompt, model..."
                className="input-field pl-8 text-xs w-full"
              />
              {search && (
                <button onClick={() => { setAssetSearch({ query: '' }); setTagMenuOpen(true) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                  <X size={12} />
                </button>
              )}
              {tagMenuOpen && filteredTags.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 popover-surface rounded-2xl py-1 z-50 max-h-[240px] overflow-y-auto">
                  {filteredTags.map((t) => (
                    <button
                      key={t}
                      onClick={() => { setAssetSearch({ query: t }); setTagMenuOpen(false) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-surface-300 hover:bg-ink/5 hover:text-surface-100 flex items-center gap-2"
                    >
                      <Tag size={11} className="text-surface-500" />
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => reset()}
              title="Reload assets"
              className="flex-shrink-0 p-1.5 rounded-full border border-surface-800 text-surface-500 hover:text-surface-100 hover:border-surface-600 transition-colors"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => setAssetSearch({ featured: !assetSearch.featured })}
              title={showFavorites ? 'Show all assets' : 'Show favorites only'}
              className={`flex-shrink-0 p-1.5 rounded-full border transition-colors ${showFavorites ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400' : 'border-surface-800 text-surface-500 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/30'}`}
            >
              <Star size={14} fill={showFavorites ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => setShowArchived(v => !v)}
              title={showArchived ? 'Ver activos' : 'Ver archivados'}
              className={`flex-shrink-0 p-1.5 rounded-full border transition-colors ${showArchived ? 'bg-purple-500/15 border-purple-500/40 text-purple-600 dark:text-purple-400' : 'border-surface-800 text-surface-500 hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-500/30'}`}
            >
              <Archive size={14} />
            </button>
            <label
              title="Elementos por fila"
              className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-pill border border-surface-800 text-surface-500"
            >
              <LayoutGrid size={14} />
              <input
                type="range"
                min={GRID_COLS_MIN}
                max={GRID_COLS_MAX}
                step={1}
                value={gridCols}
                onChange={(e) => setGridCols(Number(e.target.value))}
                className="w-20 accent-accent-500"
                aria-label="Elementos por fila"
              />
              <span className="text-xs font-mono text-surface-300 w-3 text-right">{gridCols}</span>
            </label>
            <div className="flex gap-1 bg-surface-900/40 rounded-pill p-1 border border-surface-800/60">
              <button
                onClick={() => {
                  setAssetSearch({
                    types: { image: true, video: true, audio: false },
                  })
                }}
                className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${typeFilter === 'all' ? 'bg-surface-800 text-surface-100' : 'text-surface-500 hover:text-surface-100'}`}
              >
                Todos
              </button>
              <button
                onClick={() => {
                  setAssetSearch({
                    types: { image: true, video: false, audio: false },
                  })
                  setComposerMode('image')
                }}
                className={`px-3 py-1.5 rounded-pill text-xs font-medium flex items-center gap-1.5 transition-colors ${typeFilter === 'image' ? 'bg-surface-800 text-surface-100' : 'text-surface-500 hover:text-surface-100'}`}
              >
                <ImageIcon size={13} />
                <span>Imágenes</span>
              </button>
              <button
                onClick={() => {
                  setAssetSearch({
                    types: { image: false, video: true, audio: false },
                  })
                  setComposerMode('video')
                }}
                className={`px-3 py-1.5 rounded-pill text-xs font-medium flex items-center gap-1.5 transition-colors ${typeFilter === 'video' ? 'bg-surface-800 text-surface-100' : 'text-surface-500 hover:text-surface-100'}`}
              >
                <Video size={13} />
                <span>Videos</span>
              </button>
            </div>
          </>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-28">
        <div>
          {activeOrphans && activeOrphans.count > 0 && (
            <div className="block-cream mb-3 flex items-center gap-3 pl-4 pr-2 py-2 rounded-2xl">
              <Inbox size={14} className="flex-shrink-0" />
              <p className="text-xs font-emphasis flex-1">
                {activeOrphans.count} files on disk are not registered in this project
              </p>
              <button
                onClick={handleOrganize}
                disabled={organizing}
                className="px-3 py-1 rounded-pill bg-accent-600 text-on-accent hover:bg-accent-500 disabled:opacity-50 text-[11px] font-emphasis flex items-center gap-1.5 transition-colors"
              >
                {organizing ? <Loader size={11} className="animate-spin" /> : <FolderOpen size={11} />}
                {organizing ? 'Organizing...' : 'Organize'}
              </button>
            </div>
          )}

          <div ref={gridRef} className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((row) => {
              const start = row.index * gridCols
              const rowAssets = assets.slice(start, start + gridCols)
              return (
                <div
                  key={row.key}
                  className="absolute left-0 top-0 w-full grid"
                  style={{
                    transform: `translateY(${row.start}px)`,
                    height: cardSize,
                    gap: gridGap,
                    gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                  }}
                >
                  {rowAssets.map((asset: any) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      selected={selectedIds.has(asset.id)}
                      dragging={draggingId === asset.id}
                      duration={durations[asset.id]}
                      actions={cardActions}
                    />
                  ))}
                </div>
              )
            })}
          </div>

          {initialLoading && assets.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-16 text-surface-500">
              <Loader size={20} className="animate-spin text-accent-400" />
              <span className="text-xs">Loading...</span>
            </div>
          )}

          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center py-6">
              {loadingMore && <Loader size={16} className="animate-spin text-surface-500" />}
            </div>
          )}

          {assets.length === 0 && !initialLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-surface-600">
              <svg xmlns="http://www.w3.org/2000/svg" width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <p className="text-sm">No assets found. Generate images/videos or import files.</p>
            </div>
          )}
        </div>
      </div>

      <PromptComposer
        ref={composerRef}
        onGenerate={handleGenerate}
        mode={composerMode}
        onModeChange={(newMode) => {
          setComposerMode(newMode)
          if (newMode === 'video' && !assetSearch.types.video) {
            setAssetSearch({ types: { ...assetSearch.types, video: true } })
          } else if (newMode === 'image' && !assetSearch.types.image) {
            setAssetSearch({ types: { ...assetSearch.types, image: true } })
          }
        }}
        floating
      />

      {showBulkTag && (
        <BulkTagModal
          count={selectedIds.size}
          onApply={handleBulkAddTags}
          onClose={() => setShowBulkTag(false)}
        />
      )}

      {showBulkDelete && (
        <ConfirmDeleteModal
          count={selectedIds.size}
          onConfirm={handleBulkDelete}
          onClose={() => setShowBulkDelete(false)}
        />
      )}

      {selectedAsset && (
        <AssetDetailModal
          asset={selectedAsset}
          src={modalSrc || ''}
          params={params}
          modelLabel={modelLabel(selectedAsset.modelUsed)}
          onClose={closeModal}
          onPrev={modalPrev}
          onNext={modalNext}
          onAssetChange={setSelectedAsset}
          onToggleFavorite={() => handleToggleFavorite(selectedAsset.id)}
          onDelete={() => handleDelete(selectedAsset.id)}
          onRecreate={handleRecreate}
          onCopyImage={() => handleCopyImage(selectedAsset)}
          copiedImage={copiedAssetId === selectedAsset.id}
          actions={selectedAsset.type === 'image' ? [
            { icon: ImageIcon, label: 'Referencia', onClick: () => handleAddReference(selectedAsset) },
            { icon: Eraser, label: 'Quitar fondo', onClick: () => handleRemoveBackground(selectedAsset) },
            { icon: Clapperboard, label: 'Animar', onClick: () => handleAnimate(selectedAsset) },
            { icon: Box, label: 'Crear elemento', onClick: () => handleCreateElement(selectedAsset) },
          ] : selectedAsset.type === 'video' ? [
            { icon: Video, label: 'Referencia', onClick: () => handleAddReference(selectedAsset) },
          ] : []}
          onDraftFinalQueued={() => resetRef.current()}
          onUpscaleQueued={() => resetRef.current()}
        />
      )}

      {creatingFromAsset && (
        <ElementWizard
          initialData={{
            imageBase64: creatingFromAsset.base64,
            imageAssetId: creatingFromAsset.assetId,
            prompt: creatingFromAsset.prompt,
            referenceImages: creatingFromAsset.refs,
          }}
          onClose={() => setCreatingFromAsset(null)}
        />
      )}

      {dropActive && (
        <div className="absolute inset-0 z-40 bg-surface-950/80 backdrop-blur-sm flex items-center justify-center pointer-events-none border-2 border-dashed border-accent-400 rounded-xl m-2">
          <div className="flex flex-col items-center gap-2 text-accent-300">
            {importingFiles ? <Loader size={28} className="animate-spin" /> : <Upload size={28} />}
            <p className="text-sm font-medium">{importingFiles ? 'Importing files...' : 'Drop files to import to this project'}</p>
            <p className="text-[11px] text-surface-500">Images, videos and audio will be added to the Library</p>
          </div>
        </div>
      )}
    </div>
  )
}
