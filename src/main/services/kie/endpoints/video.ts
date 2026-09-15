import type { OpenfieldApiClient } from '../client'
import type { GenerateVideoParams } from '../types'
import { uploadFileBase64 } from './upload'
import { createTask } from './create-task'
import { getRawDb } from '../../../db'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { getFFmpeg } from '../../ffmpeg'

const KIE_AUDIO_MIMES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav'])

async function getAssetBase64(assetId: string): Promise<{ base64: string; mime: string } | null> {
  try {
    const raw = getRawDb()
    const asset = raw.prepare('SELECT local_path, file_path, mime_type FROM assets WHERE id = ?').get(assetId) as any
    const filePath = asset?.local_path || asset?.file_path
    if (filePath) {
      const buffer = await fs.readFile(filePath)
      return { base64: buffer.toString('base64'), mime: asset?.mime_type || 'image/png' }
    }
  } catch (err) {
    console.warn('[OF] Could not read asset from disk:', assetId, err)
  }
  return null
}

async function ensureKieAudioRef(base64: string, mime: string): Promise<{ base64: string; mime: string }> {
  if (KIE_AUDIO_MIMES.has(mime)) return { base64, mime }
  console.log('[OF] Transcoding audio reference to mp3, mime:', mime)
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfield-audio-'))
  const inPath = path.join(tmpDir, 'input.bin')
  const outPath = path.join(tmpDir, 'output.mp3')
  await fs.writeFile(inPath, Buffer.from(base64, 'base64'))
  try {
    await getFFmpeg().extractAudio(inPath, outPath, 'mp3')
    const converted = await fs.readFile(outPath)
    return { base64: converted.toString('base64'), mime: 'audio/mpeg' }
  } finally {
    await getFFmpeg().cleanupTemp(tmpDir)
  }
}

/**
 * Video generation: builds the per-model input payload (Kling, PixVerse V6,
 * Seedance, OmniHuman, generic) and creates the task.
 */
export async function generateVideo(client: OpenfieldApiClient, params: GenerateVideoParams): Promise<string> {
  // Grok Upscale: upscales a previously completed KIE video task (task_id required)
  if (params.model === 'grok-imagine/upscale') {
    if (!params.taskId) throw new Error('Upscale requires the KIE task id of the source video')
    const input: Record<string, any> = { task_id: params.taskId }
    if (params.resolution === '720p' || params.resolution === '1080p') input.resolution = params.resolution
    return createTask(client, params.model, input)
  }

  // OmniHuman 1.5: audio-driven portrait animation (image_url + audio_url required)
  if (params.model === 'omnihuman-1-5') {
    const input: Record<string, any> = {}
    const image = params.imageRefs?.[0]?.base64 || params.imageBase64
    const audio = params.audioRefs?.[0]?.base64
    if (image) {
      console.log('[OF] Uploading portrait image for omnihuman, length:', image.length)
      const url = await uploadFileBase64(client, image, params.imageRefs?.[0]?.mime || params.imageMime || 'image/png')
      if (url) input.image_url = url
    }
    if (audio) {
      console.log('[OF] Uploading audio for omnihuman, length:', audio.length)
      const url = await uploadFileBase64(client, audio, params.audioRefs?.[0]?.mime || 'audio/mpeg')
      if (url) input.audio_url = url
    }
    if (params.resolution === '720' || params.resolution === '1080') input.output_resolution = params.resolution
    if (params.prompt) input.prompt = params.prompt
    return createTask(client, params.model, input)
  }

  // Google Gemini Omni 1.1 Flash: multimodal video generation (text-to-video, FF/LF, image references, video input)
  if (params.model === 'google/gemini-omni-flash-1-1' || params.model === 'gemini-omni-video') {
    const actualModel = 'google/gemini-omni-flash-1-1'
    const omniInput: Record<string, any> = {
      prompt: params.prompt || '',
    }

    if (params.aspectRatio) {
      omniInput.aspect_ratio = params.aspectRatio === '9:16' ? '9:16' : '16:9'
    }
    if (params.resolution) {
      omniInput.resolution = params.resolution.toLowerCase()
    }

    // Check first/last frame mode:
    // first_frame_url is mutually exclusive with image_urls, video_list, audio_ids, character_ids
    const hasFirstFrame = !!(params.firstFrameBase64 || params.firstFrameUrl)
    if (hasFirstFrame) {
      let ffUrl = params.firstFrameUrl
      if (!ffUrl && params.firstFrameBase64) {
        ffUrl = await uploadFileBase64(client, params.firstFrameBase64, 'image/png')
      }
      if (ffUrl) {
        omniInput.first_frame_url = ffUrl
        // last_frame_url must be provided together with first_frame_url
        if (params.lastFrameBase64 || params.lastFrameUrl) {
          let lfUrl = params.lastFrameUrl
          if (!lfUrl && params.lastFrameBase64) {
            lfUrl = await uploadFileBase64(client, params.lastFrameBase64, 'image/png')
          }
          if (lfUrl) omniInput.last_frame_url = lfUrl
        }
      }
      const validDurations = ['4', '6', '8', '10']
      const durStr = String(params.duration || 6)
      omniInput.duration = validDurations.includes(durStr) ? durStr : '6'
    } else {
      // Check video input
      const videoRef = params.videoRefs?.[0]
      if (videoRef?.base64 || videoRef?.url) {
        let videoUrl = videoRef.url
        if (!videoUrl && videoRef.base64) {
          videoUrl = await uploadFileBase64(client, videoRef.base64, videoRef.mime || 'video/mp4')
        }
        if (videoUrl) {
          // Duration must not exceed 30s, end - start <= 10s
          const endSec = Math.min(10, Math.max(1, Math.round(Number(params.duration) || 10)))
          omniInput.video_list = [{
            url: videoUrl,
            start: 0,
            ends: endSec,
          }]
        }
      }

      // If no video input, duration is required (4 | 6 | 8 | 10)
      if (!omniInput.video_list || omniInput.video_list.length === 0) {
        const validDurations = ['4', '6', '8', '10']
        const durStr = String(params.duration || 6)
        omniInput.duration = validDurations.includes(durStr) ? durStr : '6'
      }

      // Image references (up to 7 images)
      const imageUrls: string[] = []
      if (params.imageRefs && params.imageRefs.length > 0) {
        for (const ref of params.imageRefs) {
          if (ref.base64) {
            const url = await uploadFileBase64(client, ref.base64, ref.mime || 'image/png')
            if (url) imageUrls.push(url)
          } else if (ref.url) {
            imageUrls.push(ref.url)
          }
        }
      } else if (params.imageBase64) {
        const url = await uploadFileBase64(client, params.imageBase64, params.imageMime || 'image/png')
        if (url) imageUrls.push(url)
      } else if (params.imageUrl) {
        imageUrls.push(params.imageUrl)
      }

      if (imageUrls.length > 0) {
        omniInput.image_urls = imageUrls.slice(0, 7)
      }
    }

    return createTask(client, actualModel, omniInput)
  }

  // Wan 3.0: multimodal video generation (text-to-video, FF/LF, reference images/videos/audios)
  if (params.model === 'wan/3-0-video' || params.model === 'wan-3-0-video' || params.model === 'wan-3.0') {
    const actualModel = 'wan/3-0-video'
    const wanInput: Record<string, any> = {}
    if (params.prompt) wanInput.prompt = params.prompt

    // Resolution: 480P | 720P | 1080P (default 1080P)
    if (params.resolution) {
      const res = params.resolution.toUpperCase()
      wanInput.resolution = res === '480P' || res === '720P' || res === '1080P' ? res : '1080P'
    } else {
      wanInput.resolution = '1080P'
    }

    // Aspect ratio: adaptive | 16:9 | 4:3 | 1:1 | 3:4 | 9:16 (default adaptive)
    if (params.aspectRatio) {
      wanInput.aspect_ratio = params.aspectRatio
    } else {
      wanInput.aspect_ratio = 'adaptive'
    }

    // Duration: integer (default 5, range [2, 30])
    if (params.duration !== undefined) {
      wanInput.duration = typeof params.duration === 'string' ? parseInt(params.duration) : params.duration
    } else {
      wanInput.duration = 5
    }

    // Audio track: default true
    wanInput.audio = params.sound !== undefined ? !!params.sound : true

    // FF / LF Mode: mutually exclusive with reference_*_urls
    const hasFirstFrame = !!(params.firstFrameBase64 || params.firstFrameUrl)
    if (hasFirstFrame) {
      let ffUrl = params.firstFrameUrl
      if (!ffUrl && params.firstFrameBase64) {
        ffUrl = await uploadFileBase64(client, params.firstFrameBase64, 'image/png')
      }
      if (ffUrl) {
        wanInput.first_frame_url = ffUrl
        if (params.lastFrameBase64 || params.lastFrameUrl) {
          let lfUrl = params.lastFrameUrl
          if (!lfUrl && params.lastFrameBase64) {
            lfUrl = await uploadFileBase64(client, params.lastFrameBase64, 'image/png')
          }
          if (lfUrl) wanInput.last_frame_url = lfUrl
        }
      }
    } else {
      // Reference Images (up to 10)
      const refImageUrls: string[] = []
      if (params.imageRefs && params.imageRefs.length > 0) {
        for (const ref of params.imageRefs) {
          if (ref.base64) {
            const url = await uploadFileBase64(client, ref.base64, ref.mime || 'image/png')
            if (url) refImageUrls.push(url)
          } else if (ref.url) {
            refImageUrls.push(ref.url)
          }
        }
      } else if (params.imageBase64) {
        const url = await uploadFileBase64(client, params.imageBase64, params.imageMime || 'image/png')
        if (url) refImageUrls.push(url)
      } else if (params.imageUrl) {
        refImageUrls.push(params.imageUrl)
      }
      if (refImageUrls.length > 0) {
        wanInput.reference_image_urls = refImageUrls.slice(0, 10)
      }

      // Reference Videos (up to 5 clips)
      if (params.videoRefs && params.videoRefs.length > 0) {
        const refVideoUrls: string[] = []
        for (const ref of params.videoRefs) {
          if (ref.base64) {
            const url = await uploadFileBase64(client, ref.base64, ref.mime || 'video/mp4')
            if (url) refVideoUrls.push(url)
          } else if (ref.url) {
            refVideoUrls.push(ref.url)
          }
        }
        if (refVideoUrls.length > 0) {
          wanInput.reference_video_urls = refVideoUrls.slice(0, 5)
        }
      }

      // Reference Audios (up to 5 clips)
      if (params.audioRefs && params.audioRefs.length > 0) {
        const refAudioUrls: string[] = []
        for (const ref of params.audioRefs) {
          if (ref.base64) {
            const audio = await ensureKieAudioRef(ref.base64, ref.mime || 'audio/mpeg')
            const url = await uploadFileBase64(client, audio.base64, audio.mime)
            if (url) refAudioUrls.push(url)
          } else if (ref.audioUrl) {
            refAudioUrls.push(ref.audioUrl)
          }
        }
        if (refAudioUrls.length > 0) {
          wanInput.reference_audio_urls = refAudioUrls.slice(0, 5)
        }
      }
    }

    return createTask(client, actualModel, wanInput)
  }

  // Grok Imagine: single model routed by attachments — text-to-video, image-to-video or extend
  if (params.model === 'grok-imagine/text-to-video' || params.model === 'grok-imagine/image-to-video' || params.model === 'grok-imagine/extend') {
    const grokInput: Record<string, any> = { prompt: params.prompt, mode: 'normal' }
    if (params.aspectRatio) grokInput.aspect_ratio = params.aspectRatio
    if (params.resolution === '480p' || params.resolution === '720p' || params.resolution === '1080p') grokInput.resolution = params.resolution

    if (params.model === 'grok-imagine/extend') {
      // Extend requires the KIE task id of a previously generated KIE video. Resolve it from the
      // attached video ref's asset id when available.
      let kieTaskId = ''
      const videoRef = params.videoRefs?.[0]
      if (videoRef?.assetId) {
        try {
          const asset = getRawDb().prepare('SELECT * FROM assets WHERE id = ?').get(videoRef.assetId) as any
          if (asset?.taskId) {
            const task = getRawDb().prepare('SELECT * FROM openfield_tasks WHERE task_id = ?').get(asset.taskId) as any
            kieTaskId = task?.openfieldTaskId || task?.kieTaskId || ''
          }
        } catch {}
      }
      if (!kieTaskId) {
        throw new Error('Extend solo funciona con videos generados por KIE.ai. Adjunta un video desde tu biblioteca.')
      }
      grokInput.task_id = kieTaskId
      grokInput.extend_at = '0'
      grokInput.extend_times = String(Number(params.duration) === 10 ? 10 : 6)
      delete grokInput.mode
      delete grokInput.aspect_ratio
    } else if (params.model === 'grok-imagine/image-to-video') {
      const urls: string[] = []
      if (params.imageRefs && params.imageRefs.length > 0) {
        for (const ref of params.imageRefs) {
          const url = await uploadFileBase64(client, ref.base64, ref.mime)
          if (url) urls.push(url)
        }
      } else if (params.imageBase64) {
        const url = await uploadFileBase64(client, params.imageBase64, params.imageMime || 'image/png')
        if (url) urls.push(url)
      }
      if (urls.length === 0) throw new Error('Image-to-video requires at least one image')
      // 1080p only supports a single image (multi-image + aspect_ratio need 480p/720p)
      if (grokInput.resolution === '1080p' && urls.length > 1) {
        throw new Error('1080p solo soporta una imagen de referencia. Usa 720p o 480p para múltiples referencias.')
      }
      grokInput.image_urls = urls.slice(0, 7)
      if (params.duration !== undefined) grokInput.duration = String(Number(params.duration) || 6)
    } else {
      if (params.duration !== undefined) grokInput.duration = Number(params.duration) || 6
    }
    return createTask(client, params.model, grokInput)
  }

  const input: Record<string, any> = { prompt: params.prompt }

  // MiniMax H3 (Hailuo 03): three KIE modes — text-to-video, image-to-video (FF/LF) and
  // reference-to-video (image/video/audio references, up to 9/3/3 files).
  const isMinimaxH3 = params.model.startsWith('minimax-h3/')
  if (isMinimaxH3) {
    const mmInput: Record<string, any> = { prompt: params.prompt }
    if (params.duration !== undefined) {
      mmInput.duration = typeof params.duration === 'string' ? parseInt(params.duration) : params.duration
    }
    if (params.resolution) {
      const resUpper = params.resolution.trim().toUpperCase()
      if (resUpper === '768P' || resUpper === '2K' || resUpper === '4K') {
        mmInput.resolution = resUpper
      } else if (resUpper === '768') {
        mmInput.resolution = '768P'
      } else {
        mmInput.resolution = params.resolution
      }
    }

    if (params.model === 'minimax-h3/text-to-video') {
      mmInput.aspect_ratio = params.aspectRatio && params.aspectRatio !== 'adaptive' ? params.aspectRatio : '16:9'
    } else if (params.model === 'minimax-h3/image-to-video') {
      if (params.firstFrameBase64) {
        const ffUrl = await uploadFileBase64(client, params.firstFrameBase64, 'image/png')
        if (ffUrl) mmInput.first_frame_url = ffUrl
      }
      if (params.lastFrameBase64) {
        const lfUrl = await uploadFileBase64(client, params.lastFrameBase64, 'image/png')
        if (lfUrl) mmInput.last_frame_url = lfUrl
      }
      if (!mmInput.first_frame_url && !mmInput.last_frame_url) {
        const startImage = params.imageRefs?.[0] || (params.imageBase64 ? { base64: params.imageBase64, mime: params.imageMime || 'image/png' } : null)
        if (startImage) {
          const url = await uploadFileBase64(client, startImage.base64, startImage.mime)
          if (url) mmInput.first_frame_url = url
        }
      }
      if (!mmInput.first_frame_url && !mmInput.last_frame_url) {
        throw new Error('MiniMax H3 image-to-video requiere una imagen o frames FF/LF')
      }
    } else if (params.model === 'minimax-h3/reference-to-video') {
      const refImageUrls: string[] = []
      if (params.imageRefs && params.imageRefs.length > 0) {
        for (const ref of params.imageRefs.slice(0, 9)) {
          const url = await uploadFileBase64(client, ref.base64, ref.mime)
          if (url) refImageUrls.push(url)
        }
      } else if (params.imageBase64) {
        const url = await uploadFileBase64(client, params.imageBase64, params.imageMime || 'image/png')
        if (url) refImageUrls.push(url)
      }
      if (refImageUrls.length > 0) mmInput.reference_image_urls = refImageUrls

      if (params.videoRefs && params.videoRefs.length > 0) {
        const refVideoUrls: string[] = []
        for (const ref of params.videoRefs.slice(0, 3)) {
          const url = await uploadFileBase64(client, ref.base64, ref.mime)
          if (url) refVideoUrls.push(url)
        }
        if (refVideoUrls.length > 0) mmInput.reference_video_urls = refVideoUrls
      }

      if (params.audioRefs && params.audioRefs.length > 0) {
        const refAudioUrls: string[] = []
        for (const ref of params.audioRefs.slice(0, 3)) {
          if (ref.base64) {
            const audio = await ensureKieAudioRef(ref.base64, ref.mime || 'audio/mpeg')
            const url = await uploadFileBase64(client, audio.base64, audio.mime)
            if (url) refAudioUrls.push(url)
          }
        }
        if (refAudioUrls.length > 0) mmInput.reference_audio_urls = refAudioUrls
      }

      if (!mmInput.reference_image_urls && !mmInput.reference_video_urls) {
        throw new Error('MiniMax H3 reference-to-video requiere al menos una imagen o video de referencia')
      }
      if (params.aspectRatio && params.aspectRatio !== 'adaptive') {
        mmInput.aspect_ratio = params.aspectRatio
      }
    }

    return createTask(client, params.model, mmInput)
  }


  const isKling = params.model.startsWith('kling')
  const isPixverseV6 = params.model.startsWith('pixverse-v6/')
  if (isKling) {
    if (params.duration !== undefined) input.duration = String(params.duration)
  } else if (isPixverseV6) {
    if (params.duration !== undefined) input.duration = typeof params.duration === 'string' ? parseInt(params.duration) : params.duration
  } else if (params.duration !== undefined) {
    input.duration = typeof params.duration === 'string' ? parseInt(params.duration) : params.duration
  }
  if (isPixverseV6) {
    if (params.model === 'pixverse-v6/text-to-video' || params.model === 'pixverse-v6/reference-to-video') {
      if (params.aspectRatio) input.aspect_ratio = params.aspectRatio
    }
  } else if (params.aspectRatio) {
    input.aspect_ratio = params.aspectRatio
  }
  if (isKling) {
    const res = params.resolution || 'std'
    input.mode = res.replace('-audio', '')
    if (params.sound) {
      input.sound = true
    } else {
      input.sound = false
    }

    // Multi-shot support
    if (params.multiShots && params.multiPrompt?.length) {
      input.multi_shots = true
      input.multi_prompt = params.multiPrompt.map(s => ({ prompt: s.prompt, duration: s.duration }))
    } else {
      input.multi_shots = false
    }

    // Kling i2v: use image_urls for reference/start image
    const urls: string[] = []

    // 1. Check direct HTTP URL
    if (params.firstFrameUrl && params.firstFrameUrl.startsWith('http')) {
      urls.push(params.firstFrameUrl)
    } else if (params.imageUrl && params.imageUrl.startsWith('http')) {
      urls.push(params.imageUrl)
    }

    // 2. Check imageRefs
    if (params.imageRefs && params.imageRefs.length > 0) {
      for (const ref of params.imageRefs) {
        let b64 = ref.base64
        let mime = ref.mime || 'image/png'
        if (!b64 && ref.assetId) {
          const assetData = await getAssetBase64(ref.assetId)
          if (assetData) {
            b64 = assetData.base64
            mime = assetData.mime || mime
          }
        }
        if (b64) {
          const url = await uploadFileBase64(client, b64, mime)
          if (url) urls.push(url)
        } else if (ref.url && ref.url.startsWith('http')) {
          urls.push(ref.url)
        }
      }
    }

    // 3. Check imageBase64 or firstFrameBase64 / firstFrameAssetId
    if (params.imageBase64) {
      const url = await uploadFileBase64(client, params.imageBase64, params.imageMime || 'image/png')
      if (url) urls.push(url)
    } else if (params.firstFrameBase64) {
      const url = await uploadFileBase64(client, params.firstFrameBase64, 'image/png')
      if (url) urls.push(url)
    } else if (params.firstFrameAssetId && urls.length === 0) {
      const assetData = await getAssetBase64(params.firstFrameAssetId)
      if (assetData) {
        const url = await uploadFileBase64(client, assetData.base64, assetData.mime || 'image/png')
        if (url) urls.push(url)
      }
    }

    if (urls.length > 0) {
      input.image_urls = urls
      input.first_frame_url = urls[0]
    }

    // Kling FF/LF frames
    if (params.firstFrameBase64 && !input.first_frame_url) {
      const ffUrl = await uploadFileBase64(client, params.firstFrameBase64, 'image/png')
      if (ffUrl) input.first_frame_url = ffUrl
    }
    if (params.lastFrameBase64) {
      const lfUrl = await uploadFileBase64(client, params.lastFrameBase64, 'image/png')
      if (lfUrl) input.last_frame_url = lfUrl
    }
  } else if (isPixverseV6) {
    if (params.resolution && ['360p', '540p', '720p', '1080p'].includes(params.resolution)) input.quality = params.resolution
    if (params.sound) {
      input.generate_audio_switch = true
    } else {
      input.generate_audio_switch = false
    }

    if (params.model === 'pixverse-v6/image-to-video') {
      // Image-to-video: FF/LF frames (PixVerse FF mode) or attached images, up to 2 (API limit)
      const urls: string[] = []
      const images: { base64: string; mime: string }[] = []
      if (params.firstFrameBase64) images.push({ base64: params.firstFrameBase64, mime: 'image/png' })
      if (params.lastFrameBase64) images.push({ base64: params.lastFrameBase64, mime: 'image/png' })
      if (params.imageRefs && params.imageRefs.length > 0) {
        for (const ref of params.imageRefs) {
          if (ref.base64) images.push({ base64: ref.base64, mime: ref.mime || 'image/png' })
        }
      } else if (params.imageBase64) {
        images.push({ base64: params.imageBase64, mime: params.imageMime || 'image/png' })
      }
      const seen = new Set<string>()
      for (const img of images) {
        if (seen.has(img.base64)) continue
        seen.add(img.base64)
        if (urls.length >= 2) break
        const url = await uploadFileBase64(client, img.base64, img.mime)
        if (url) urls.push(url)
      }
      if (urls.length > 0) input.image_urls = urls
    } else if (params.model === 'pixverse-v6/transition') {
      if (params.firstFrameBase64) {
        const ffUrl = await uploadFileBase64(client, params.firstFrameBase64, 'image/png')
        if (ffUrl) input.first_frame_image_url = ffUrl
      }
      if (params.lastFrameBase64) {
        const lfUrl = await uploadFileBase64(client, params.lastFrameBase64, 'image/png')
        if (lfUrl) input.last_frame_image_url = lfUrl
      }
    } else if (params.model === 'pixverse-v6/reference-to-video') {
      const imageRefsOut: { image_url: string; ref_name: string; type?: string }[] = []
      const allImages: { base64: string; mime: string; name?: string; refType?: string }[] = []
      if (params.imageBase64) allImages.push({ base64: params.imageBase64, mime: params.imageMime || 'image/png' })
      if (params.imageRefs) {
        for (const ref of params.imageRefs) {
          if (ref.base64) allImages.push({ base64: ref.base64, mime: ref.mime || 'image/png', name: ref.name, refType: ref.refType })
        }
      }
      for (let i = 0; i < allImages.length; i++) {
        const url = await uploadFileBase64(client, allImages[i].base64, allImages[i].mime)
        if (url) imageRefsOut.push({
          image_url: url,
          ref_name: allImages[i].name || `ref_${i}`,
          type: allImages[i].refType === 'background' ? 'background' : 'subject',
        })
      }
      if (imageRefsOut.length > 0) input.image_references = imageRefsOut
    }
  } else if (params.resolution) {
    input.resolution = params.resolution
  }

  const isSeedance = params.model.startsWith('bytedance/')

  // Upload and set first/last frame URLs (FF/LF mode) — skip for Kling and PixVerse V6 (handled above)
  if (!isKling && !isPixverseV6) {
    if (params.firstFrameBase64) {
      const ffUrl = await uploadFileBase64(client, params.firstFrameBase64, 'image/png')
      if (ffUrl) input.first_frame_url = ffUrl
    }
    if (params.lastFrameBase64) {
      const lfUrl = await uploadFileBase64(client, params.lastFrameBase64, 'image/png')
      if (lfUrl) input.last_frame_url = lfUrl
    }
  }

  // Upload and set reference image URLs
  if (isSeedance) {
    const refImageUrls: string[] = []
    if (params.imageRefs && params.imageRefs.length > 0) {
      for (const ref of params.imageRefs) {
        if (ref.base64) {
          const url = await uploadFileBase64(client, ref.base64, ref.mime || 'image/png')
          if (url) refImageUrls.push(url)
        }
      }
    } else if (params.imageBase64) {
      const url = await uploadFileBase64(client, params.imageBase64, params.imageMime || 'image/png')
      if (url) refImageUrls.push(url)
    }
    if (refImageUrls.length > 0) input.reference_image_urls = refImageUrls

    // Upload and set reference video URLs
    if (params.videoRefs && params.videoRefs.length > 0) {
      const refVideoUrls: string[] = []
      for (const ref of params.videoRefs) {
        if (ref.base64) {
          const url = await uploadFileBase64(client, ref.base64, ref.mime || 'video/mp4')
          if (url) refVideoUrls.push(url)
        }
      }
      if (refVideoUrls.length > 0) input.reference_video_urls = refVideoUrls
    }

    // Upload and set reference audio URLs
    if (params.audioRefs && params.audioRefs.length > 0) {
      const refAudioUrls: string[] = []
      for (const ref of params.audioRefs) {
        if (ref.base64) {
          const audio = await ensureKieAudioRef(ref.base64, ref.mime || 'audio/mpeg')
          const url = await uploadFileBase64(client, audio.base64, audio.mime)
          if (url) refAudioUrls.push(url)
        }
      }
      if (refAudioUrls.length > 0) input.reference_audio_urls = refAudioUrls
    }

    if (params.model === 'bytedance/seedance-2-5') {
      // Seedance 2.5 uses generate_audio (see KIE createTask schema)
      input.generate_audio = !!params.sound
    } else {
      input.sound = !!params.sound
    }
  } else if (!isKling && !isSeedance && !isPixverseV6) {
    // Non-Seedance, non-Kling, non-PixVerse models use image_urls
    const urls: string[] = []
    if (params.imageRefs && params.imageRefs.length > 0) {
      for (const ref of params.imageRefs) {
        if (ref.base64) {
          const url = await uploadFileBase64(client, ref.base64, ref.mime || 'image/png')
          if (url) urls.push(url)
        }
      }
    } else if (params.imageBase64) {
      const imageUrl = await uploadFileBase64(client, params.imageBase64, params.imageMime || 'image/png')
      if (imageUrl) urls.push(imageUrl)
    }
    if (urls.length > 0) input.image_urls = urls
  }

  return createTask(client, params.model, input)
}
