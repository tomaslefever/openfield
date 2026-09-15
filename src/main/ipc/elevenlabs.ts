import crypto from 'crypto'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import type { IpcContext } from './context'
import { readSetting } from './helpers'
import { getAssetManager } from '../services/asset-manager'
import { getRawDb } from '../db'

const ELEVENLABS_BASE = 'https://api.elevenlabs.io'
const DEFAULT_MODEL = 'eleven_multilingual_v3'

// Fallback list when the models endpoint is unavailable (v3 models included)
const ELEVENLABS_MODELS_FALLBACK = [
  { id: 'eleven_v3_flash', name: 'Eleven v3 Flash (fastest)' },
  { id: 'eleven_v3', name: 'Eleven v3 (flagship)' },
  { id: 'eleven_multilingual_v3_flash', name: 'Eleven Multilingual v3 Flash' },
  { id: 'eleven_multilingual_v3', name: 'Eleven Multilingual v3' },
  { id: 'eleven_turbo_v2_5', name: 'Eleven Turbo v2.5' },
  { id: 'eleven_flash_v2_5', name: 'Eleven Flash v2.5' },
  { id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2' },
  { id: 'eleven_turbo_v2', name: 'Eleven Turbo v2' },
  { id: 'eleven_flash_v2', name: 'Eleven Flash v2' },
  { id: 'eleven_monolingual_v1', name: 'Eleven Monolingual v1' },
  { id: 'eleven_multilingual_v1', name: 'Eleven Multilingual v1' },
]

function requireElevenLabsKey(): string {
  const key = readSetting('elevenlabsApiKey')
  if (!key) throw new Error('ElevenLabs API key not configured. Add it in Settings → Providers.')
  return key
}

async function request<T>(endpoint: string, options: RequestInit = {}, apiKey?: string, timeoutMs = 120000): Promise<T> {
  const key = apiKey || requireElevenLabsKey()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${ELEVENLABS_BASE}${endpoint}`, {
      ...options,
      headers: {
        'xi-api-key': key,
        ...(options.body && typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      let detail = `ElevenLabs API Error (${response.status})`
      try {
        const body = await response.json()
        if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
      } catch { /* non-JSON error body */ }
      if (response.status === 401) detail = 'Unauthorized - invalid ElevenLabs API key'
      if (response.status === 422) detail = 'Validation error: check the voice and text'
      throw new Error(detail)
    }

    const contentType = response.headers.get('content-type') || ''
    if (
      contentType.includes('application/json') ||
      endpoint.includes('/v1/voices') ||
      endpoint.includes('/v2/voices') ||
      endpoint.includes('/v1/shared-voices') ||
      endpoint.includes('/v1/models') ||
      endpoint.includes('/v1/user')
    ) {
      return await response.json()
    }
    return await response.arrayBuffer() as unknown as T
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') throw new Error('ElevenLabs request timed out')
    throw err
  }
}

export function registerElevenLabsHandlers({ handle }: IpcContext) {
  handle('elevenlabs:models', async () => {
    try {
      const models = await request<Array<{ model_id: string; name: string; description?: string }>>('/v1/models')
      if (models.length === 0) return ELEVENLABS_MODELS_FALLBACK
      return models.map((m) => ({
        id: m.model_id,
        label: m.name,
        detail: m.description,
      }))
    } catch {
      return ELEVENLABS_MODELS_FALLBACK
    }
  })

  handle('elevenlabs:voices', async (_e, opts?: { pageSize?: number; nextPageToken?: string; search?: string; searchLibrary?: boolean }) => {
    interface VoiceLike {
      voice_id: string
      name?: string
      category?: string
      labels?: Record<string, string>
      preview_url?: string
      verified_languages?: Array<{ language?: string; accent?: string; locale?: string }>
      voice_verification?: { language?: string }
      accent?: string
      gender?: string
      age?: string
      descriptive?: string
      use_case?: string
      language?: string
    }

    const pageSize = Math.min(100, Math.max(1, opts?.pageSize || 50))
    const searchQuery = opts?.search?.trim() || ''
    const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : undefined)

    // 1. Fetch from /v2/voices (Account & default catalog voices)
    const query = new URLSearchParams({ page_size: String(pageSize) })
    if (opts?.nextPageToken) query.set('next_page_token', opts.nextPageToken)
    if (searchQuery) query.set('search', searchQuery)

    let v2Voices: VoiceLike[] = []
    let hasMore = false
    let nextPageToken: string | undefined

    try {
      const data = await request<{ voices: VoiceLike[]; has_more?: boolean; next_page_token?: string }>(`/v2/voices?${query.toString()}`)
      v2Voices = data.voices || []
      hasMore = !!data.has_more
      nextPageToken = data.has_more ? data.next_page_token : undefined
    } catch (v2Err) {
      console.warn('[ElevenLabs] /v2/voices query failed, trying /v1/voices:', v2Err)
      try {
        const v1Data = await request<{ voices: VoiceLike[] }>('/v1/voices')
        v2Voices = v1Data.voices || []
      } catch (v1Err) {
        console.error('[ElevenLabs] Failed fetching voices:', v1Err)
      }
    }

    // 2. If searching, also query ElevenLabs public Voice Library (/v1/shared-voices)
    let sharedVoices: VoiceLike[] = []
    if (searchQuery && opts?.searchLibrary !== false) {
      try {
        const sharedQuery = new URLSearchParams({
          page_size: String(pageSize),
          search: searchQuery,
        })
        const sharedData = await request<{ voices: VoiceLike[] }>(`/v1/shared-voices?${sharedQuery.toString()}`)
        if (Array.isArray(sharedData?.voices)) {
          sharedVoices = sharedData.voices
        }
      } catch (sharedErr) {
        console.warn('[ElevenLabs] /v1/shared-voices query notice:', sharedErr)
      }
    }

    // 3. Merge & Deduplicate
    const seenIds = new Set<string>()
    const allRawVoices = [...v2Voices, ...sharedVoices]

    const voices = []
    for (const v of allRawVoices) {
      if (!v.voice_id || seenIds.has(v.voice_id)) continue
      seenIds.add(v.voice_id)

      const verified = v.verified_languages?.[0]
      const language = v.language || verified?.language || v.voice_verification?.language || undefined
      const accent = v.accent || v.labels?.accent || cap(verified?.accent) || undefined
      const gender = v.gender || v.labels?.gender || undefined
      const category = v.category || (v.use_case ? `${v.use_case}` : undefined)

      voices.push({
        id: v.voice_id,
        label: v.name,
        language,
        accent,
        gender: gender ? cap(gender) : undefined,
        category,
        detail: [category, accent || gender || language, v.descriptive].filter(Boolean).join(' · ') || undefined,
        previewUrl: v.preview_url || undefined,
      })
    }

    return {
      voices,
      hasMore,
      nextPageToken,
    }
  })

  handle('elevenlabs:generate', async (event, params) => {
    const startTime = Date.now()
    const sender = event.sender
    const apiKey = requireElevenLabsKey()
    const voiceId: string = params?.voiceId
    const text: string = params?.prompt
    if (!voiceId) throw new Error('Select a voice first')
    if (!text || !text.trim()) throw new Error('Text is required')

    const clamp01 = (v: any, d = 0) => Math.max(0, Math.min(1, Number.isFinite(Number(v)) ? Number(v) : d))
    // ElevenLabs only accepts speed between 0.7 and 1.2
    const speed = Math.max(0.7, Math.min(1.2, Number(params?.speed) || 1))
    const stability = clamp01(params?.stability, 0.5)
    const similarityBoost = clamp01(params?.similarityBoost, 0.75)
    const style = clamp01(params?.style, 0)
    const useSpeakerBoost = params?.useSpeakerBoost !== false
    const modelId = params?.model || DEFAULT_MODEL

    sender.send('local:audio:progress', { status: 'generating', message: 'Generando audio con ElevenLabs...', pct: 40 })
    const buffer = await request<ArrayBuffer>(
      `/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            style,
            use_speaker_boost: useSpeakerBoost,
            speed,
          },
        }),
      },
      apiKey,
    )

    const tmpPath = path.join(os.tmpdir(), `openfield-elevenlabs-${crypto.randomUUID()}.mp3`)
    await fs.writeFile(tmpPath, Buffer.from(buffer))
    try {
      sender.send('local:audio:progress', { status: 'saving', message: 'Guardando audio...', pct: 90 })
      const asset = await getAssetManager().importFile(tmpPath, 'audio')
      const db = getRawDb()
      const elapsedMs = Math.max(0, Date.now() - startTime)
      const genTimeSeconds = Number((elapsedMs / 1000).toFixed(1))
      const storedParams = JSON.stringify({
        engine: 'elevenlabs',
        voiceId,
        model: modelId,
        speed,
        stability,
        similarityBoost,
        style,
        useSpeakerBoost,
        generationTimeSeconds: genTimeSeconds,
        generationTime: `${genTimeSeconds}s`,
        generationTimeMs: elapsedMs,
      })
      db.prepare(
        'UPDATE assets SET prompt = ?, model_used = ?, parameters = ?, credits_used = 0 WHERE id = ?'
      ).run(text, `elevenlabs:${voiceId}`, storedParams, asset.id)
      db.saveSync()
      sender.send('local:audio:progress', { status: 'completed', message: 'Audio generado', pct: 100 })
      return asset
    } finally {
      fs.unlink(tmpPath).catch(() => {})
    }
  })

  handle('elevenlabs:generateDialogue', async (event, params: {
    inputs: Array<{ text: string; voiceId: string }>
    model?: string
    languageCode?: string
  }) => {
    const startTime = Date.now()
    const sender = event.sender
    const apiKey = requireElevenLabsKey()
    const rawInputs = params?.inputs || []
    if (!Array.isArray(rawInputs) || rawInputs.length === 0) {
      throw new Error('Dialogue inputs are required')
    }

    const inputs = rawInputs
      .map((item) => ({
        text: (item.text || '').trim(),
        voice_id: item.voiceId,
      }))
      .filter((item) => item.text && item.voice_id)

    if (inputs.length === 0) {
      throw new Error('At least one dialogue line with a valid voiceId is required')
    }

    const modelId = params?.model || 'eleven_v3'

    sender.send('local:audio:progress', { status: 'generating', message: 'Generando diálogo multi-voz con ElevenLabs...', pct: 40 })

    const buffer = await request<ArrayBuffer>(
      '/v1/text-to-dialogue',
      {
        method: 'POST',
        body: JSON.stringify({
          inputs,
          model_id: modelId.startsWith('eleven_') ? modelId : 'eleven_v3',
          ...(params?.languageCode ? { language_code: params.languageCode } : {}),
        }),
      },
      apiKey,
    )

    const tmpPath = path.join(os.tmpdir(), `openfield-elevenlabs-dialogue-${crypto.randomUUID()}.mp3`)
    await fs.writeFile(tmpPath, Buffer.from(buffer))
    try {
      sender.send('local:audio:progress', { status: 'saving', message: 'Guardando diálogo...', pct: 90 })
      const asset = await getAssetManager().importFile(tmpPath, 'audio')
      const db = getRawDb()
      const elapsedMs = Math.max(0, Date.now() - startTime)
      const genTimeSeconds = Number((elapsedMs / 1000).toFixed(1))
      const combinedText = inputs.map((i) => i.text).join(' ')
      const storedParams = JSON.stringify({
        engine: 'elevenlabs:dialogue',
        inputs,
        model: modelId,
        generationTimeSeconds: genTimeSeconds,
        generationTime: `${genTimeSeconds}s`,
        generationTimeMs: elapsedMs,
      })
      db.prepare(
        'UPDATE assets SET prompt = ?, model_used = ?, parameters = ?, credits_used = 0 WHERE id = ?'
      ).run(combinedText, `elevenlabs:dialogue:${modelId}`, storedParams, asset.id)
      db.saveSync()
      sender.send('local:audio:progress', { status: 'completed', message: 'Diálogo generado', pct: 100 })
      return asset
    } finally {
      fs.unlink(tmpPath).catch(() => {})
    }
  })

  handle('elevenlabs:voiceChange', async (event, params) => {
    const sender = event.sender
    const apiKey = requireElevenLabsKey()
    const voiceId: string = params?.voiceId
    if (!voiceId) throw new Error('Select a target voice first')
    const audioBase64: string = params?.audioBase64
    if (!audioBase64) throw new Error('No audio provided. Insert, upload, drop or record an audio clip.')
    const mime: string = params?.audioMime || 'audio/wav'
    const fileName: string = params?.fileName || `voicechanger-${Date.now()}.wav`

    sender.send('local:audio:progress', { status: 'generating', message: 'Convirtiendo la voz con ElevenLabs...', pct: 40 })

    const form = new FormData()
    form.append('audio', new Blob([Buffer.from(audioBase64, 'base64')], { type: mime }), fileName)
    // Speech-to-speech conversion model (the TTS models are not valid here)
    const stsModel = params?.model && String(params.model).includes('sts') ? params.model : 'eleven_multilingual_sts_v2'
    form.append('model_id', stsModel)
    form.append('output_format', 'mp3_44100_128')

    let response: Response
    try {
      response = await fetch(`${ELEVENLABS_BASE}/v1/speech-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: form,
        signal: AbortSignal.timeout(120000),
      })
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new Error('ElevenLabs request timed out')
      throw err
    }

    if (!response.ok) {
      let detail = `ElevenLabs API Error (${response.status})`
      try {
        const body = await response.json()
        if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
      } catch { /* non-JSON error body */ }
      if (response.status === 401) detail = 'Unauthorized - invalid ElevenLabs API key'
      if (response.status === 422) detail = 'Validation error: check the audio format and the target voice'
      throw new Error(detail)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const tmpPath = path.join(os.tmpdir(), `openfield-elevenlabs-vc-${crypto.randomUUID()}.mp3`)
    await fs.writeFile(tmpPath, buffer)
    try {
      sender.send('local:audio:progress', { status: 'saving', message: 'Guardando audio...', pct: 90 })
      const asset = await getAssetManager().importFile(tmpPath, 'audio')
      const db = getRawDb()
      db.prepare(
        'UPDATE assets SET prompt = ?, model_used = ?, credits_used = 0 WHERE id = ?'
      ).run(params?.prompt || `Voice changer → ${voiceId}`, `elevenlabs:vc:${voiceId}`, asset.id)
      db.saveSync()
      sender.send('local:audio:progress', { status: 'completed', message: 'Audio generado', pct: 100 })
      return asset
    } finally {
      fs.unlink(tmpPath).catch(() => {})
    }
  })

  handle('elevenlabs:music', async (event, params) => {
    const sender = event.sender
    const apiKey = requireElevenLabsKey()
    const prompt: string = params?.prompt
    if (!prompt || !prompt.trim()) throw new Error('Prompt is required')

    const durationSec = Number(params?.duration) || 30
    const musicLengthMs = Math.max(3000, Math.min(600000, Math.round(durationSec * 1000)))
    const modelId = params?.modelId || 'music_v2'

    sender.send('local:audio:progress', { status: 'generating', message: 'Generando música con ElevenLabs...', pct: 30 })
    const buffer = await request<ArrayBuffer>(
      '/v1/music',
      {
        method: 'POST',
        body: JSON.stringify({
          prompt: prompt.trim(),
          music_length_ms: musicLengthMs,
          model_id: modelId,
        }),
      },
      apiKey,
      300000, // 5 min timeout for music generation
    )

    const tmpPath = path.join(os.tmpdir(), `openfield-elevenlabs-music-${crypto.randomUUID()}.mp3`)
    await fs.writeFile(tmpPath, Buffer.from(buffer))
    try {
      sender.send('local:audio:progress', { status: 'saving', message: 'Guardando música...', pct: 90 })
      const asset = await getAssetManager().importFile(tmpPath, 'audio')
      const db = getRawDb()
      const storedParams = JSON.stringify({
        kind: 'music',
        duration: Math.round(musicLengthMs / 1000),
        music_length_ms: musicLengthMs,
        model_id: modelId,
      })
      db.prepare(
        'UPDATE assets SET prompt = ?, model_used = ?, parameters = ?, credits_used = 0 WHERE id = ?'
      ).run(prompt.trim(), 'elevenlabs:music', storedParams, asset.id)
      db.saveSync()
      sender.send('local:audio:progress', { status: 'completed', message: 'Música generada', pct: 100 })
      return asset
    } finally {
      fs.unlink(tmpPath).catch(() => {})
    }
  })

  handle('elevenlabs:sfx', async (event, params) => {
    const sender = event.sender
    const apiKey = requireElevenLabsKey()
    const text: string = params?.prompt
    if (!text || !text.trim()) throw new Error('Text is required')
    const duration = Math.max(1, Math.min(22, Number(params?.duration) || 5))

    sender.send('local:audio:progress', { status: 'generating', message: 'Generando efecto de sonido con ElevenLabs...', pct: 40 })
    const buffer = await request<ArrayBuffer>(
      '/v1/sound-generation',
      {
        method: 'POST',
        body: JSON.stringify({ text, duration_seconds: duration }),
      },
      apiKey,
    )

    const tmpPath = path.join(os.tmpdir(), `openfield-elevenlabs-sfx-${crypto.randomUUID()}.mp3`)
    await fs.writeFile(tmpPath, Buffer.from(buffer))
    try {
      sender.send('local:audio:progress', { status: 'saving', message: 'Guardando audio...', pct: 90 })
      const asset = await getAssetManager().importFile(tmpPath, 'audio')
      const db = getRawDb()
      db.prepare(
        'UPDATE assets SET prompt = ?, model_used = ?, credits_used = 0 WHERE id = ?'
      ).run(text, 'elevenlabs:sfx', asset.id)
      db.saveSync()
      sender.send('local:audio:progress', { status: 'completed', message: 'Audio generado', pct: 100 })
      return asset
    } finally {
      fs.unlink(tmpPath).catch(() => {})
    }
  })

  handle('elevenlabs:account', async () => {
    try {
      const data = await request<{ first_name?: string; last_name?: string; email?: string; subscription?: { tier?: string } }>('/v1/user')
      return {
        name: [data.first_name, data.last_name].filter(Boolean).join(' '),
        email: data.email,
        tier: data.subscription?.tier,
      }
    } catch { return null }
  })
}
