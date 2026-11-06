import { notifyAssetsChanged } from '../../ipc/assets'
import { USD_PER_1K_CHARS, CLONE_LANGUAGES, hasFalKey, listClonedVoices, synthesizeClonedSpeech } from '../voice-clone-service'
import { transcribeFile } from '../transcription-service'
import { assetMediaPath } from '../../ipc/transcription'
import { type McpTool, ToolInputError, READ_ONLY, GENERATE, str, optStr } from './types'

/*
 * Lines in the user's cloned voices (Voice Studio → Clonar voz, fal Qwen3-TTS 1.7B) for agents.
 * Cloning itself stays in the app: the user picks the reference and confirms who it belongs to.
 */

const MAX_LINES = 40

function requireKey() {
  if (!hasFalKey()) throw new ToolInputError('fal.ai has no API key in the app: add it in Providers.')
}

export function getVoiceCloneTools(): McpTool[] {
  return [
    {
      name: 'audio_transcribe',
      title: 'Transcribe an audio or video asset',
      description: "Speech to text for a library audio or video asset with fal Whisper (the user's fal.ai key): full text, timed segments and an .srt version. Use it to read what a clip says, prepare a cloned voice's reference transcript, or make subtitles.",
      inputSchema: {
        type: 'object',
        properties: {
          asset_id: { type: 'string', description: 'Library asset id (audio or video)' },
          language: { type: 'string', enum: [...CLONE_LANGUAGES], description: 'Language spoken; Auto (default) detects it' },
          include_srt: { type: 'boolean', description: 'Also return the .srt text (default false)' },
        },
        required: ['asset_id'],
        additionalProperties: false,
      },
      annotations: { ...READ_ONLY, openWorldHint: true },
      handler: async (args) => {
        requireKey()
        const res = await transcribeFile(assetMediaPath(str(args.asset_id).trim()), { language: optStr(args.language) })
        return {
          text: res.text,
          language: res.language,
          durationSeconds: res.durationSeconds,
          segments: res.segments,
          ...(args.include_srt === true ? { srt: res.srt } : {}),
        }
      },
    },
    {
      name: 'cloned_voice_list',
      title: 'List cloned voices',
      description: 'List the voices the user cloned in Voice Studio (fal.ai Qwen3-TTS 1.7B). Use the id as voice_id in cloned_voice_generate. New voices are cloned by the user in the app (Voice Studio → Clonar voz).',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: READ_ONLY,
      handler: async () => {
        const voices = listClonedVoices().map((v) => ({
          id: v.id,
          name: v.name,
          language: v.language,
          referenceSeconds: v.referenceSeconds,
          referenceText: v.referenceText,
        }))
        return { count: voices.length, voices, usdPer1kChars: USD_PER_1K_CHARS }
      },
    },
    {
      name: 'cloned_voice_generate',
      title: 'Generate voice lines (cloned voice)',
      description: `Text-to-speech in one of the user's cloned voices (cloned_voice_list) with fal.ai Qwen3-TTS 1.7B, one library audio asset per line (prompt = the line; the Timeline treats them as voices for autoducking). Several lines per call, generated in order; a failing line is reported and the rest still run. Costs about $${USD_PER_1K_CHARS} per 1,000 characters on the user's fal.ai account: call with estimate_only: true first.`,
      inputSchema: {
        type: 'object',
        properties: {
          voice_id: { type: 'string', description: 'Cloned voice id (cloned_voice_list)' },
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
          language: { type: 'string', enum: [...CLONE_LANGUAGES], description: "Defaults to the voice's language" },
          estimate_only: { type: 'boolean', description: 'Only return characters and estimated cost; nothing is generated or charged' },
        },
        required: ['voice_id', 'lines'],
        additionalProperties: false,
      },
      annotations: GENERATE,
      handler: async (args) => {
        const voiceId = str(args.voice_id).trim()
        const voice = listClonedVoices().find((v) => v.id === voiceId)
        if (!voice) throw new ToolInputError(`No cloned voice '${voiceId}'; find one with cloned_voice_list`)
        const lines: { text: string; name?: string }[] = args.lines
        if (lines.length > MAX_LINES) throw new ToolInputError(`cloned_voice_generate takes at most ${MAX_LINES} lines per call`)
        lines.forEach((l, i) => { if (!str(l.text).trim()) throw new ToolInputError(`lines[${i}].text is empty`) })
        const language = optStr(args.language) || voice.language

        const characters = lines.reduce((n, l) => n + l.text.trim().length, 0)
        const estimate = { lines: lines.length, characters, estimatedUsd: Math.round((characters / 1000) * USD_PER_1K_CHARS * 10000) / 10000 }
        if (args.estimate_only === true) {
          return { voice: { id: voice.id, name: voice.name }, language, ...estimate, note: 'Nothing was generated. Call again without estimate_only to run it.' }
        }
        requireKey()

        const results: any[] = []
        for (const [i, line] of lines.entries()) {
          try {
            const r = await synthesizeClonedSpeech({ voiceId, text: line.text, language, name: optStr(line.name), source: 'mcp' })
            results.push({ index: i, text: line.text, ...r })
          } catch (err: any) {
            results.push({ index: i, text: line.text, error: err?.message || String(err) })
            if (/API key|401|403/i.test(String(err?.message))) break
          }
        }
        try { notifyAssetsChanged() } catch {}
        const ok = results.filter((r) => r.assetId)
        return {
          voice: { id: voice.id, name: voice.name },
          language,
          generated: ok.length,
          failed: results.length - ok.length + (lines.length - results.length),
          totalSeconds: Math.round(ok.reduce((s, r) => s + (r.durationSeconds ?? 0), 0) * 1000) / 1000,
          estimatedUsd: Math.round(ok.reduce((s, r) => s + r.estimatedUsd, 0) * 10000) / 10000,
          results,
          next: 'Place them with timeline_add_clips (asset_id per line); timeline_autoducking ducks the music under them.',
        }
      },
    },
  ]
}
