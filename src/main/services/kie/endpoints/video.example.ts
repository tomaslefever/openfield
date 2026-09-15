/**
 * Example usage for KIE video generation endpoint.
 * Demonstrates multiple models: Kling 3.0, PixVerse V6, Seedance 2, Wan 3.0, and Gemini Omni Flash.
 */

import { generateVideo } from './video'
import type { OpenfieldApiClient } from '../client'

// 1. Text-to-Video with Kling 3.0
export async function exampleKlingVideo(client: OpenfieldApiClient) {
  const taskId = await generateVideo(client, {
    model: 'kling-3.0/video',
    prompt: 'Cinematic tracking shot of an astronaut walking on Mars, sunset, 4k, ultra detailed',
    duration: 5,
    aspectRatio: '16:9',
  })
  console.log('Kling video task created:', taskId)
  return taskId
}

// 2. Image-to-Video with PixVerse V6
export async function examplePixVerseImageToVideo(client: OpenfieldApiClient, imageBase64: string) {
  const taskId = await generateVideo(client, {
    model: 'pixverse-v6/image-to-video',
    prompt: 'Camera slowly pans around the character with soft wind blowing',
    imageBase64,
    duration: 5,
  })
  console.log('PixVerse video task created:', taskId)
  return taskId
}

// 3. Transition Video (First Frame + Last Frame) with PixVerse or Wan 3.0
export async function exampleTransitionVideo(
  client: OpenfieldApiClient,
  firstFrameBase64: string,
  lastFrameBase64: string
) {
  const taskId = await generateVideo(client, {
    model: 'pixverse-v6/transition',
    prompt: 'Seamless cinematic morphing transition between scene A and scene B',
    firstFrameBase64,
    lastFrameBase64,
    duration: 5,
  })
  console.log('Transition task created:', taskId)
  return taskId
}

// 4. Multimodal Generation with Google Gemini Omni Flash 1.1
export async function exampleGeminiOmniFlash(client: OpenfieldApiClient) {
  const taskId = await generateVideo(client, {
    model: 'google/gemini-omni-flash-1-1',
    prompt: 'Drone shot zooming out from an ancient temple in the jungle, cinematic lighting',
    aspectRatio: '16:9',
    resolution: '1080p',
    duration: 6,
  })
  console.log('Gemini Omni task created:', taskId)
  return taskId
}

// 5. Grok Upscale of an existing KIE video task
export async function exampleGrokUpscale(client: OpenfieldApiClient, sourceKieTaskId: string) {
  const taskId = await generateVideo(client, {
    model: 'grok-imagine/upscale',
    prompt: '',
    taskId: sourceKieTaskId,
    resolution: '1080p',
  })
  console.log('Grok upscale task created:', taskId)
  return taskId
}
