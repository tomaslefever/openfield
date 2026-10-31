import { notifyAssetsChanged } from '../../ipc/assets'
import {
  USD_PER_LINE,
  VOICE_DEFAULTS,
  creditsPerChar,
  hasElevenLabsKey,
  lastVoiceSettings,
  listVoices,
  synthesizeSpeech,
  type VoiceSettings,
} from '../voice-service'
import { type McpTool, ToolInputError, READ_ONLY, GENERATE, str, num, optStr } from './types'

/*
 * Voice lines through ElevenLabs (the app's Voice Studio integration) for agents: list the voices,
 * estimate a batch, and generate it into the library, one asset per line.
 */

const ELEVEN_VOICE_ID = /^[A-Za-z0-9]{16,32}$/
const MAX_LINES = 40

function requireKey() {
  if (!hasElevenLabsKey()) throw new ToolInputError('ElevenLabs has no API key in the app: add it in Providers.')
}

const unit = (v: any, name: string, min = 0, max = 1) => {
  if (v === undefined) return undefined
  const n = num(v, NaN)
  if (!Number.isFinite(n) || n < min || n > max) throw new ToolInputError(`${name} must be between ${min} and ${max}`)
  return n
}

export function getVoiceTools(): McpTool[] {
  return [
    {
      name: 'voice_list',
      title: 'List ElevenLabs voices',
      description: 'List the ElevenLabs voices this account can use (its custom, designed, cloned and saved voices), optionally searching the public Voice Library too. Use the id as voice_id in voice_generate.',
      inputSchema: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Name or description text' },
          language: { type: 'string', description: 'ISO-639-1, e.g. es' },
          gender: { type: 'string', enum: ['female', 'male', 'neutral'] },
          include_library: { type: 'boolean', description: 'Also search the public Voice Library (default false)' },
          page_size: { type: 'number', minimum: 1, description: 'Default 50, max 100' },
        },
        additionalProperties: false,
      },
      annotations: { ...READ_ONLY, openWorldHint: true },
      handler: async (args) => {
        requireKey()
        const voices = await listVoices({
          search: optStr(args.search),
          language: optStr(args.language),
          gender: optStr(args.gender),
          includeLibrary: args.include_library === true,
          pageSize: args.page_size !== undefined ? num(args.page_size, 50) : undefined,
        })
        return { count: voices.length, voices }
      },
    },
    {
      name: 'voice_generate',
      title: 'Generate voice lines (ElevenLabs)',
      description: 'Text-to-speech with ElevenLabs, one library audio asset per line (prompt = the line, model_used = elevenlabs:<voice_id>, so the Timeline treats them as voices for autoducking). Several lines per call, generated in order; a failing line is reported and the rest still run. Settings default to those of the latest line made with the same voice (else eleven_v4, stability 0.5, similarity 0.75, style 0, speed 1). Spends the user\'s ElevenLabs credits: call with estimate_only: true first to get characters, credits and the estimated cost without generating. Audio tags like [pause] or [firmly] work with eleven_v3/v4.',
      inputSchema: {
        type: 'object',
        properties: {
          voice_id: { type: 'string', description: 'ElevenLabs voice id (voice_list)' },
          lines: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                name: { type: 'string', description: 'Optional file name for the asset, e.g. reel_l03' },
              },
              required: ['text'],
              additionalProperties: false,
            },
            description: `Up to ${MAX_LINES} lines`,
          },
          model: { type: 'string', description: 'ElevenLabs model id, e.g. eleven_v4, eleven_v3, eleven_multilingual_v2, eleven_flash_v2_5' },
          language_code: { type: 'string', description: 'ISO-639-1 language to enforce (models that support it)' },
          stability: { type: 'number', minimum: 0, description: '0..1' },
          similarity_boost: { type: 'number', minimum: 0, description: '0..1' },
          style: { type: 'number', minimum: 0, description: '0..1 (style exaggeration)' },
          speed: { type: 'number', minimum: 0.7, description: '0.7..1.2' },
          use_speaker_boost: { type: 'boolean' },
          estimate_only: { type: 'boolean', description: 'Only return characters, credits and estimated cost; nothing is generated or charged' },
        },
        required: ['voice_id', 'lines'],
        additionalProperties: false,
      },
      annotations: GENERATE,
      handler: async (args) => {
        const voiceId = str(args.voice_id).trim()
        if (!ELEVEN_VOICE_ID.test(voiceId)) throw new ToolInputError(`'${voiceId}' does not look like an ElevenLabs voice id; find one with voice_list`)
        const lines: { text: string; name?: string }[] = args.lines
        if (lines.length > MAX_LINES) throw new ToolInputError(`voice_generate takes at most ${MAX_LINES} lines per call`)
        lines.forEach((l, i) => { if (!str(l.text).trim()) throw new ToolInputError(`lines[${i}].text is empty`) })

        const inherited = lastVoiceSettings(voiceId)
        const settings: VoiceSettings = {
          ...VOICE_DEFAULTS,
          ...(inherited ?? {}),
          ...(optStr(args.model) ? { model: str(args.model) } : {}),
          ...(args.stability !== undefined ? { stability: unit(args.stability, 'stability')! } : {}),
          ...(args.similarity_boost !== undefined ? { similarityBoost: unit(args.similarity_boost, 'similarity_boost')! } : {}),
          ...(args.style !== undefined ? { style: unit(args.style, 'style')! } : {}),
          ...(args.speed !== undefined ? { speed: unit(args.speed, 'speed', 0.7, 1.2)! } : {}),
          ...(typeof args.use_speaker_boost === 'boolean' ? { useSpeakerBoost: args.use_speaker_boost } : {}),
        }
        const characters = lines.reduce((n, l) => n + l.text.length, 0)
        const estimate = {
          lines: lines.length,
          characters,
          estimatedCredits: Math.ceil(characters * creditsPerChar(settings.model)),
          estimatedUsd: Math.round(lines.length * USD_PER_LINE * 1000) / 1000,
        }
        if (args.estimate_only === true) {
          return { voiceId, settings, settingsFrom: inherited ? 'latest line with this voice' : 'defaults', ...estimate, note: 'Nothing was generated. Call again without estimate_only to run it.' }
        }
        requireKey()

        const results: any[] = []
        for (const [i, line] of lines.entries()) {
          try {
            const r = await synthesizeSpeech({ text: line.text, voiceId, languageCode: optStr(args.language_code), settings, name: optStr(line.name) })
            results.push({ index: i, text: line.text, ...r, estimatedUsd: USD_PER_LINE })
          } catch (err: any) {
            results.push({ index: i, text: line.text, error: err?.message || String(err) })
            // A bad key or voice fails every line the same way: stop instead of repeating it
            if (/API key|voice_not_found|not found|401/i.test(String(err?.message))) break
          }
        }
        try { notifyAssetsChanged() } catch {}
        const ok = results.filter((r) => r.assetId)
        return {
          voiceId,
          settings,
          generated: ok.length,
          failed: results.length - ok.length + (lines.length - results.length),
          totalSeconds: Math.round(ok.reduce((s, r) => s + (r.durationSeconds ?? 0), 0) * 1000) / 1000,
          creditsUsed: ok.every((r) => r.creditsUsed !== null) ? ok.reduce((s, r) => s + r.creditsUsed, 0) : null,
          estimate,
          results,
          next: 'Place them with timeline_add_clips (asset_id per line); timeline_autoducking ducks the music under them.',
        }
      },
    },
  ]
}
