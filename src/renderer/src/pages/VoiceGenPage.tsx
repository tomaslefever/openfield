import { useState, useCallback, useEffect, useMemo } from 'react'
import { VoiceGenView } from '../components/voice/VoiceGenView'
import { usePagedAssets } from '../hooks/usePagedAssets'
import { getAudioKind } from '../lib/audio'

export function VoiceGenPage() {
  const [audioStatus, setAudioStatus] = useState<{ status: string; message: string; pct: number } | null>(null)
  const [audioError, setAudioError] = useState('')

  const { assets, reset } = usePagedAssets({ type: 'audio', pageSize: 20, excludeUploads: true })
  const voiceAssets = useMemo(() => assets.filter((a: any) => getAudioKind(a) === 'voice'), [assets])

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api) return
    const unsubComplete = api.on('openfield:task:completed', () => reset())
    const unsubFailed = api.on('openfield:task:failed', () => reset())
    const unsubProgress = api.on('local:audio:progress', (p: any) => {
      if (p?.status === 'completed') {
        setAudioStatus(null)
        reset()
      } else if (p) {
        setAudioStatus({ status: p.status, message: p.message || '', pct: p.pct || 0 })
      }
    })
    const unsubError = api.on('local:audio:error', (e: any) => {
      setAudioStatus(null)
      setAudioError(e?.message || 'Error generando audio')
    })
    return () => { unsubComplete?.(); unsubFailed?.(); unsubProgress?.(); unsubError?.() }
  }, [reset])

  const handleGenerate = useCallback(async (params: any) => {
    try {
      const api = (window as any).electronAPI
      setAudioError('')
      if (params.local && params.voiceId) {
        setAudioStatus({ status: 'starting', message: 'Iniciando...', pct: 0 })
        await api?.local.audioGenerate({ voiceId: params.voiceId, prompt: params.prompt, engine: params.engine, speed: params.speed })
      } else if (params.engine === 'elevenlabs' && params.mode === 'voicechanger') {
        setAudioStatus({ status: 'starting', message: 'Convirtiendo voz con ElevenLabs...', pct: 0 })
        await api?.elevenlabs.voiceChange({
          voiceId: params.voiceId,
          model: params.model,
          audioBase64: params.audioBase64,
          audioMime: params.audioMime,
          fileName: params.fileName,
        })
      } else if (params.engine === 'elevenlabs' && params.voiceId) {
        setAudioStatus({ status: 'starting', message: 'Iniciando ElevenLabs...', pct: 0 })
        await api?.elevenlabs.generate({ voiceId: params.voiceId, prompt: params.prompt, speed: params.speed, model: params.model })
      } else {
        await api?.openfield.generateAudio(params)
      }
      setAudioStatus(null)
      reset()
    } catch (err: any) {
      console.error('Voice generation failed:', err)
      setAudioStatus(null)
      setAudioError(err?.message || 'Error generando audio. Revisa la consola.')
    }
  }, [reset])

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <VoiceGenView
        onGenerate={handleGenerate}
        voiceAssets={voiceAssets}
        isGenerating={!!audioStatus}
        statusMessage={audioStatus?.message || ''}
        statusPct={audioStatus?.pct || 0}
        errorMessage={audioError}
        onClearError={() => setAudioError('')}
      />
    </div>
  )
}
