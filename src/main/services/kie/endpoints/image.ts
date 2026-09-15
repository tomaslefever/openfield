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

  // Model name normalizer: KIE expects 'seedream/5-pro-...' with a slash
  let model = params.model
  if (model === 'seedream-5-pro-text-to-image' || model === 'seedream-5-pro') {
    model = 'seedream/5-pro-text-to-image'
  } else if (model === 'seedream-5-pro-image-to-image' || model === 'seedream-v4-edit' || model === 'seedream-5-pro-edit' || model === 'seedream-v4') {
    model = 'seedream/5-pro-image-to-image'
  } else if (model === 'seedream-5-lite-text-to-image') {
    model = 'seedream/5-lite-text-to-image'
  } else if (model === 'seedream-5-lite-image-to-image') {
    model = 'seedream/5-lite-image-to-image'
  }

  const hasImages = Boolean(params.imageBase64 || (params.imageRefs && params.imageRefs.length > 0))
  if (hasImages) {
    if (model === 'seedream/5-pro-text-to-image') model = 'seedream/5-pro-image-to-image'
    else if (model === 'gpt-image-2-text-to-image') model = 'gpt-image-2-image-to-image'
    else if (model === 'gpt-image-2-5-flare-text-to-image') model = 'gpt-image-2-5-flare-image-to-image'
    else if (model === 'gpt-image-2-5-sunburst-text-to-image') model = 'gpt-image-2-5-sunburst-image-to-image'
  } else {
    if (model === 'gpt-image-2-image-to-image') model = 'gpt-image-2-text-to-image'
    else if (model === 'gpt-image-2-5-flare-image-to-image') model = 'gpt-image-2-5-flare-text-to-image'
    else if (model === 'gpt-image-2-5-sunburst-image-to-image') model = 'gpt-image-2-5-sunburst-text-to-image'
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
  const imageKey = isGptImage ? 'input_urls' : isSeedream ? 'image_urls' : 'image_input'

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
  }

  // Safety fallback for Seedream: image-to-image requires image_urls; if none, use text-to-image
  if (model === 'seedream/5-pro-image-to-image' && (!input.image_urls || input.image_urls.length === 0)) {
    model = 'seedream/5-pro-text-to-image'
  }

  console.log('[OF] createTask:', model, JSON.stringify(input).substring(0, 250))
  return createTask(client, model, input)
}
