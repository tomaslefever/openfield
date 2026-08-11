import type { OpenfieldApiClient } from '../client'
import type { GenerateVideoParams } from '../types'
import { uploadFileBase64 } from './upload'
import { createTask } from './create-task'

/**
 * Video generation: builds the per-model input payload (Kling, PixVerse V6,
 * Seedance, OmniHuman, generic) and creates the task.
 */
export async function generateVideo(client: OpenfieldApiClient, params: GenerateVideoParams): Promise<string> {
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

  const input: Record<string, any> = { prompt: params.prompt }

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
    if (params.imageBase64 || params.imageRefs?.length) {
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
      if (urls.length > 0) input.image_urls = urls
    }

    // Kling FF/LF frames
    if (params.firstFrameBase64) {
      const ffUrl = await uploadFileBase64(client, params.firstFrameBase64, 'image/png')
      if (ffUrl) input.first_frame_url = ffUrl
    }
    if (params.lastFrameBase64) {
      const lfUrl = await uploadFileBase64(client, params.lastFrameBase64, 'image/png')
      if (lfUrl) input.last_frame_url = lfUrl
    }
  } else if (isPixverseV6) {
    if (params.resolution) input.quality = params.resolution
    if (params.sound) {
      input.generate_audio_switch = true
    } else {
      input.generate_audio_switch = false
    }

    if (params.model === 'pixverse-v6/image-to-video') {
      if (params.imageBase64 || params.imageRefs?.length) {
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
        if (urls.length > 0) input.image_urls = urls
      }
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
      if (params.imageRefs) allImages.push(...params.imageRefs)
      for (let i = 0; i < allImages.length; i++) {
        const url = await uploadFileBase64(client, allImages[i].base64, allImages[i].mime)
        if (url) imageRefsOut.push({
          image_url: url,
          ref_name: allImages[i].name || `ref_${i}`,
          type: allImages[i].refType || 'subject',
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
        const url = await uploadFileBase64(client, ref.base64, ref.mime)
        if (url) refImageUrls.push(url)
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
        const url = await uploadFileBase64(client, ref.base64, ref.mime)
        if (url) refVideoUrls.push(url)
      }
      if (refVideoUrls.length > 0) input.reference_video_urls = refVideoUrls
    }

    // Upload and set reference audio URLs
    if (params.audioRefs && params.audioRefs.length > 0) {
      const refAudioUrls: string[] = []
      for (const ref of params.audioRefs) {
        const url = await uploadFileBase64(client, ref.base64, ref.mime)
        if (url) refAudioUrls.push(url)
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
    if (params.imageBase64) {
      const imageUrl = await uploadFileBase64(client, params.imageBase64, params.imageMime || 'image/png')
      if (imageUrl) input.image_urls = [imageUrl]
    }
  }

  return createTask(client, params.model, input)
}
