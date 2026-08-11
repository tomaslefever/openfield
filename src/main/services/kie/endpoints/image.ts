import type { OpenfieldApiClient } from '../client'
import type { GenerateImageParams } from '../types'
import { uploadFileBase64 } from './upload'
import { createTask } from './create-task'

/**
 * Image generation: builds the per-model input payload (text-to-image,
 * image-to-image, refs, remove-background) and creates the task.
 */
export async function generateImage(client: OpenfieldApiClient, params: GenerateImageParams): Promise<string> {
  console.log('[OF] generateImage:', { model: params.model, prompt: params.prompt?.substring(0, 50), hasImage: !!(params.imageBase64 || params.imageRefs?.length) })

  const input: Record<string, any> = {
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio || 'auto',
    resolution: params.resolution || '1K',
  }

  const isGptImage = params.model?.startsWith('gpt-image')
  const imageKey = isGptImage ? 'input_urls' : 'image_input'

  if (params.model === 'recraft/remove-background') {
    // Recraft remove-background: input is a single uploaded image URL (spec: only `image`)
    const src = params.imageRefs?.[0]?.base64 || params.imageBase64
    if (src) {
      console.log('[OF] Uploading image for remove-background, length:', src.length)
      const url = await uploadFileBase64(client, src, params.imageRefs?.[0]?.mime || params.imageMime || 'image/png')
      if (url) {
        delete input.prompt
        delete input.aspect_ratio
        delete input.resolution
        input.image = url
      }
    }
  } else if (params.imageRefs && params.imageRefs.length > 0) {
    console.log('[OF] Uploading', params.imageRefs.length, 'reference images')
    const urls: string[] = []
    for (const ref of params.imageRefs) {
      const url = await uploadFileBase64(client, ref.base64, ref.mime)
      if (url) urls.push(url)
    }
    if (urls.length > 0) input[imageKey] = urls
  } else if (params.imageBase64) {
    console.log('[OF] Uploading image, length:', params.imageBase64.length)
    const imageUrl = await uploadFileBase64(client, params.imageBase64, params.imageMime || 'image/png')
    console.log('[OF] Uploaded, url:', imageUrl)
    if (imageUrl) input[imageKey] = [imageUrl]
  }

  console.log('[OF] createTask:', params.model, JSON.stringify(input).substring(0, 200))
  return createTask(client, params.model, input)
}
