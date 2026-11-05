import type { OpenfieldApiClient } from '../client'
import type { GenerateImageParams } from '../types'
import { uploadFileBase64 } from './upload'
import { createTask } from './create-task'

/**
 * Image generation: builds the per-model input payload (text-to-image,
 * image-to-image, refs, remove-background) and creates the task.
 */
export async function generateImage(client: OpenfieldApiClient, params: GenerateImageParams): Promise<string> {
  const ar = params.aspectRatio || (params as any).aspect_ratio || '1:1'
  const res = params.resolution || (params as any).resolution || '1K'

  // Model name normalizer: KIE expects specific slash or prefix formats
  let model = params.model
  if (model === 'seedream-5-pro-text-to-image' || model === 'seedream-5-pro') {
    model = 'seedream/5-pro-text-to-image'
  } else if (model === 'seedream-5-pro-image-to-image' || model === 'seedream-v4-edit' || model === 'seedream-5-pro-edit' || model === 'seedream-v4') {
    model = 'seedream/5-pro-image-to-image'
  } else if (model === 'seedream-5-lite-text-to-image') {
    model = 'seedream/5-lite-text-to-image'
  } else if (model === 'seedream-5-lite-image-to-image') {
    model = 'seedream/5-lite-image-to-image'
  } else if (model === 'flux2-pro-text-to-image' || model === 'flux-2-pro') {
    model = 'flux-2/pro-text-to-image'
  } else if (model === 'flux2-pro-image-to-image') {
    model = 'flux-2/pro-image-to-image'
  } else if (model === 'imagen4-fast') {
    model = 'google/imagen4-fast'
  } else if (model === 'nano-banana-2') {
    model = 'google/nano-banana-2'
  } else if (model === 'ideogram-2-0' || model === 'ideogram-2' || model === 'ideogram') {
    model = 'ideogram/v3-text-to-image'
  } else if (model === 'qwen-image-3' || model === 'qwen-image' || model === 'qwen-3' || model === 'qwen3' || model === 'alibaba/qwen-image-3') {
    model = 'qwen3/text-to-image'
  }

  const hasImages = Boolean(
    params.imageBase64 ||
    (params.imageRefs && params.imageRefs.length > 0) ||
    ((params as any).imageUrl && typeof (params as any).imageUrl === 'string' && (params as any).imageUrl.startsWith('http')) ||
    ((params as any).image_url && typeof (params as any).image_url === 'string' && (params as any).image_url.startsWith('http'))
  )
  // GPT Image 2.6 (Flare / Sunburst / Economy) and FLUX 3 Klein: one model, endpoint picked by input
  const isGpt26 = model.startsWith('gpt-image-2-6/')
  const isFlux3Klein = model === 'flux-3/klein-text-to-image' || model === 'flux-3/klein-edit-image'
  if (isGpt26) {
    model = hasImages ? model.replace(/-text-to-image$/, '-image-to-image') : model.replace(/-image-to-image$/, '-text-to-image')
  } else if (isFlux3Klein) {
    model = hasImages ? 'flux-3/klein-edit-image' : 'flux-3/klein-text-to-image'
  }

  if (hasImages) {
    if (model === 'seedream/5-pro-text-to-image') model = 'seedream/5-pro-image-to-image'
    else if (model === 'seedream/5-lite-text-to-image') model = 'seedream/5-lite-image-to-image'
    else if (model === 'flux-2/pro-text-to-image') model = 'flux-2/pro-image-to-image'
    else if (model === 'gpt-image-2-text-to-image') model = 'gpt-image-2-image-to-image'
    else if (model === 'gpt-image-2-5-flare-text-to-image') model = 'gpt-image-2-5-flare-image-to-image'
    else if (model === 'gpt-image-2-5-sunburst-text-to-image') model = 'gpt-image-2-5-sunburst-image-to-image'
    else if (model === 'qwen3/text-to-image' || model.startsWith('qwen') || model === 'qwen-image-3') model = 'qwen3/image-to-image'
  } else {
    if (model === 'gpt-image-2-image-to-image') model = 'gpt-image-2-text-to-image'
    else if (model === 'gpt-image-2-5-flare-image-to-image') model = 'gpt-image-2-5-flare-text-to-image'
    else if (model === 'gpt-image-2-5-sunburst-image-to-image') model = 'gpt-image-2-5-sunburst-text-to-image'
    else if (model === 'flux-2/pro-image-to-image') model = 'flux-2/pro-text-to-image'
    else if (model === 'seedream/5-pro-image-to-image') model = 'seedream/5-pro-text-to-image'
    else if (model === 'seedream/5-lite-image-to-image') model = 'seedream/5-lite-text-to-image'
    else if (model === 'qwen3/image-to-image') model = 'qwen3/text-to-image'
  }

  console.log('[OF] generateImage:', {
    model,
    originalModel: params.model,
    prompt: params.prompt?.substring(0, 50),
    hasImage: hasImages,
    aspectRatio: ar,
    resolution: res,
  })

  const isGptImage = model.startsWith('gpt-image')
  const isSeedream = model.startsWith('seedream')
  const isQwen = model.startsWith('qwen') || model.startsWith('alibaba/qwen')
  const isFlux = model.startsWith('flux-2') || model.startsWith('flux2')
  const imageKey = (isGptImage || isFlux) ? 'input_urls' : (isSeedream || isQwen || isFlux3Klein) ? 'image_urls' : 'image_input'

  const input: Record<string, any> = {
    prompt: params.prompt,
    aspect_ratio: ar,
  }

  if (isSeedream) {
    const validAspectRatios = ['1:1', '16:9', '21:9', '2:3', '3:2', '3:4', '4:3', '9:16']
    input.aspect_ratio = validAspectRatios.includes(ar) ? ar : '1:1'
    input.quality = (res === '2K' || res === '4K') ? 'high' : 'basic'
    input.output_format = 'png'
    input.nsfw_checker = true
  } else if (isQwen) {
    const validAspectRatios = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']
    const finalAr = validAspectRatios.includes(ar) ? ar : '1:1'
    input.aspect_ratio = finalAr
    input.image_size = finalAr
    input.resolution = (res === '2K' || res === '4K') ? '2K' : '1K'
  } else if (isGpt26) {
    // Strict schemas (no extra fields). Economy is 1K only, with no resolution field and fewer ratios.
    const isEconomy = model.startsWith('gpt-image-2-6/economy-')
    const validAspectRatios = isEconomy
      ? ['auto', '1:1', '16:9', '9:16', '3:2', '2:3', '21:9', '4:3']
      : ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '2:1', '1:2', '21:9', '9:21', '3:1', '1:3']
    input.aspect_ratio = validAspectRatios.includes(ar) ? ar : 'auto'
    if (!isEconomy) input.resolution = (res === '2K' || res === '4K') ? res : '1K'
  } else if (isFlux3Klein) {
    // Edit adds "auto" (matches the first input image)
    const validAspectRatios = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9', '9:21']
    if (model === 'flux-3/klein-edit-image') validAspectRatios.push('auto')
    input.aspect_ratio = validAspectRatios.includes(ar) ? ar : (model === 'flux-3/klein-edit-image' ? 'auto' : '1:1')
    input.resolution = (res === '2K' || res === '4K') ? res : '1K'
  } else {
    input.resolution = res
  }

  if (model === 'recraft/remove-background') {
    // Recraft remove-background: input is a single uploaded image URL (spec: only `image`)
    const src = params.imageRefs?.[0]?.base64 || params.imageBase64
    if (src) {
      console.log('[OF] Uploading image for remove-background, length:', src.length)
      const url = await uploadFileBase64(client, src, params.imageRefs?.[0]?.mime || params.imageMime || 'image/png')
      if (url) {
        delete input.prompt
        delete input.aspect_ratio
        delete input.resolution
        delete input.quality
        delete input.output_format
        delete input.nsfw_checker
        input.image = url
      }
    }
  } else if (params.imageRefs && params.imageRefs.length > 0) {
    console.log('[OF] Uploading', params.imageRefs.length, 'reference images')
    const urls: string[] = []
    for (const ref of params.imageRefs) {
      if ((ref as any).url && typeof (ref as any).url === 'string' && (ref as any).url.startsWith('http')) {
        urls.push((ref as any).url)
      } else if (ref.base64) {
        const url = await uploadFileBase64(client, ref.base64, ref.mime)
        if (url) urls.push(url)
      }
    }
    if (urls.length > 0) input[imageKey] = urls
  } else if (params.imageBase64) {
    console.log('[OF] Uploading image, length:', params.imageBase64.length)
    const imageUrl = await uploadFileBase64(client, params.imageBase64, params.imageMime || 'image/png')
    console.log('[OF] Uploaded, url:', imageUrl)
    if (imageUrl) input[imageKey] = [imageUrl]
  } else if ((params as any).imageUrl && typeof (params as any).imageUrl === 'string' && (params as any).imageUrl.startsWith('http')) {
    input[imageKey] = [(params as any).imageUrl]
  } else if ((params as any).image_url && typeof (params as any).image_url === 'string' && (params as any).image_url.startsWith('http')) {
    input[imageKey] = [(params as any).image_url]
  }

  // Safety fallback: if image-to-image requires image_urls but none was uploaded/provided, fall back to text-to-image
  if (model === 'seedream/5-pro-image-to-image' && (!input.image_urls || input.image_urls.length === 0)) {
    model = 'seedream/5-pro-text-to-image'
  }
  if (model === 'seedream/5-lite-image-to-image' && (!input.image_urls || input.image_urls.length === 0)) {
    model = 'seedream/5-lite-text-to-image'
  }
  if (model === 'qwen3/image-to-image' && (!input.image_urls || input.image_urls.length === 0)) {
    model = 'qwen3/text-to-image'
  }
  if (model === 'flux-3/klein-edit-image') {
    if (!input.image_urls || input.image_urls.length === 0) {
      model = 'flux-3/klein-text-to-image'
      if (input.aspect_ratio === 'auto') input.aspect_ratio = '1:1'
    } else {
      input.image_urls = input.image_urls.slice(0, 10)
    }
  }
  if (isGpt26 && model.endsWith('-image-to-image')) {
    if (!input.input_urls || input.input_urls.length === 0) model = model.replace(/-image-to-image$/, '-text-to-image')
    else input.input_urls = input.input_urls.slice(0, 16)
  }

  console.log('[OF] createTask:', model, JSON.stringify(input).substring(0, 250))
  return createTask(client, model, input)
}
