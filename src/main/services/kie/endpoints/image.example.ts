/**
 * Example usage for KIE image generation endpoint.
 * Demonstrates GPT Image 2, Seedream 5 Pro, and Recraft Background Removal.
 */

import { generateImage } from './image'
import type { OpenfieldApiClient } from '../client'

// 1. Text-to-Image with GPT Image 2
export async function exampleGptImage2(client: OpenfieldApiClient) {
  const taskId = await generateImage(client, {
    model: 'gpt-image-2-text-to-image',
    prompt: 'Hyperrealistic portrait of an elderly watchmaker in his workshop, ray-traced lighting',
    aspectRatio: '16:9',
    resolution: '2K',
  })
  console.log('GPT Image task created:', taskId)
  return taskId
}

// 2. Text-to-Image with Seedream 5 Pro
export async function exampleSeedream5Pro(client: OpenfieldApiClient) {
  const taskId = await generateImage(client, {
    model: 'seedream/5-pro-text-to-image',
    prompt: 'Cyberpunk street vendor stall at night in neo-Tokyo, neon reflections, cinematic 4k',
    aspectRatio: '16:9',
    resolution: '4K',
  })
  console.log('Seedream task created:', taskId)
  return taskId
}

// 3. Image-to-Image with Seedream 5 Pro
export async function exampleSeedreamImageToImage(client: OpenfieldApiClient, imageBase64: string) {
  const taskId = await generateImage(client, {
    model: 'seedream/5-pro-image-to-image',
    prompt: 'Transform into watercolor style illustration, vibrant colors',
    imageBase64,
  })
  console.log('Seedream I2I task created:', taskId)
  return taskId
}

// 4. Background Removal with Recraft
export async function exampleRemoveBackground(client: OpenfieldApiClient, imageBase64: string) {
  const taskId = await generateImage(client, {
    model: 'recraft/remove-background',
    prompt: '',
    imageBase64,
  })
  console.log('Remove background task created:', taskId)
  return taskId
}
