import { useState, useEffect } from 'react'
import {
  AudioLines,
  Sparkles,
  RefreshCw,
  Play,
  ArrowRight,
  ArrowLeft,
  Volume2,
  CheckCircle,
  AlertCircle,
  User,
} from 'lucide-react'
import { useShortDramaStore } from '../../../stores/short-drama-store'
import { ModelSelectorDropdown } from '../../models/ModelSelectorDropdown'
import { VoiceSelectorDropdown } from '../../voice/VoiceSelectorDropdown'
import { srcUrl } from '../../../services/file-url'

export function Stage5Voices() {
  const {
    shots,
    characters,
    voiceModel,
    voiceId,
    setVoiceModel,
    updateCharacter,
    updateShot,
    generateShotVoice,
    generateAllVoices,
    syncPendingTasks,
    setStage,
  } = useShortDramaStore()

  useEffect(() => {
    syncPendingTasks()
  }, [])

  const dialogueShots = shots.filter((s) => s.dialogueText && s.dialogueText.trim())
  const isAnyGenerating = dialogueShots.some((s) => s.audioStatus === 'generating')
  const completedCount = dialogueShots.filter((s) => s.audioStatus === 'completed').length

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">
      {/* Header & Global Audio Model */}
      <div className="card p-6 border-surface-800 bg-surface-900/60 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-surface-100 flex items-center gap-2">
            <AudioLines size={16} className="text-accent-400" />
            Etapa 4: Voces y Diálogos (TTS / LipSync Ready)
          </h2>
          <p className="text-xs text-surface-500 mt-0.5">
            Sintetiza las voces de cada personaje antes de generar el video para que los modelos de animación sincronicen los labios (LipSync).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-surface-400 font-medium">Motor TTS:</span>
          <ModelSelectorDropdown
            kind="audio"
            selectedModelId={voiceModel.t2aId || voiceModel.name}
            onSelect={(m) => setVoiceModel(m)}
          />

          <button
            onClick={() => generateAllVoices()}
            disabled={isAnyGenerating || dialogueShots.length === 0}
            className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5 ml-2"
          >
            {isAnyGenerating ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            Sintetizar Todas ({completedCount}/{dialogueShots.length})
          </button>
        </div>
      </div>

      {/* Characters Voice Assignment */}
      <div className="card p-5 border-surface-800 bg-surface-900/40">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 flex items-center gap-1.5">
            <User size={13} className="text-blue-400" /> Asignación de Voces por Personaje (ElevenLabs / KIE)
          </h3>
          <span className="text-[11px] text-surface-500">
            {characters.length} personajes en la historia
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {characters.map((char) => (
            <div
              key={char.id}
              className="bg-surface-950/60 border border-surface-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-surface-700 transition-colors"
            >
              <div className="min-w-0">
                <span className="font-semibold text-xs text-surface-100 block truncate">
                  {char.name}
                </span>
                <span className="text-[10px] text-surface-400">{char.role || 'Personaje'}</span>
              </div>

              <div className="flex-shrink-0 w-full sm:w-52">
                <VoiceSelectorDropdown
                  value={char.voiceId || voiceId}
                  onChange={(vId) => updateCharacter(char.id, { voiceId: vId })}
                  placeholder="Seleccionar voz..."
                  className="w-full"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dialogues Table / Cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
          Líneas de Diálogo ({dialogueShots.length})
        </h3>

        {dialogueShots.length === 0 ? (
          <div className="card p-8 text-center text-surface-500 text-xs">
            No hay líneas de diálogo en el guion de las tomas. Puedes avanzar al ensamblaje final o escribir diálogos en la Etapa 1.
          </div>
        ) : (
          <div className="space-y-3">
            {dialogueShots.map((shot) => {
              const isGenerating = shot.audioStatus === 'generating'
              const isCompleted = shot.audioStatus === 'completed' && shot.audioUrl
              const speakerChar = characters.find((c) => c.name === shot.dialogueSpeaker)
              const assignedVoiceId = speakerChar?.voiceId || voiceId

              return (
                <div
                  key={shot.id}
                  className="bg-surface-950/70 border border-surface-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-surface-700 transition-colors"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="text-xs font-bold text-accent-400 bg-accent-500/10 px-2 py-1 rounded border border-accent-500/20 flex-shrink-0">
                      Toma {shot.order}
                    </span>

                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-surface-200">
                          {shot.dialogueSpeaker || 'Narrador'}
                        </span>
                        <span className="text-[10px] text-surface-500 italic">
                          ({shot.cameraMovement})
                        </span>
                        {speakerChar && (
                          <span className="text-[10px] text-surface-400 bg-surface-900 border border-surface-800 px-1.5 py-0.5 rounded">
                            {speakerChar.role}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-surface-300 font-serif italic bg-surface-900/60 p-2.5 rounded-lg border border-surface-800/80">
                        "{shot.dialogueText}"
                      </p>
                    </div>
                  </div>

                  {/* Audio Player / Action */}
                  <div className="flex items-center gap-2 flex-shrink-0 w-full md:w-auto justify-end flex-wrap">
                    {isCompleted ? (
                      <div className="flex items-center gap-2">
                        <audio src={srcUrl(shot.audioLocalPath || shot.audioUrl)} controls className="h-8 max-w-[200px]" />
                        <span className="flex items-center gap-1 text-emerald-400 text-[10px]" title="Audio listo para LipSync">
                          <CheckCircle size={12} />
                          <span className="hidden sm:inline">Listo</span>
                        </span>
                      </div>
                    ) : isGenerating ? (
                      <div className="flex items-center gap-1.5 text-accent-400 text-xs px-3 py-1.5">
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Sintetizando...</span>
                      </div>
                    ) : null}

                    <button
                      onClick={() => generateShotVoice(shot.id)}
                      disabled={isGenerating}
                      className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5 border border-surface-700 hover:border-accent-500/40"
                    >
                      <Sparkles size={12} className="text-accent-400" />
                      {isCompleted ? 'Regenerar' : 'Sintetizar'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-surface-800">
        <button
          onClick={() => setStage(3)}
          className="btn-ghost text-xs flex items-center gap-1.5"
        >
          <ArrowLeft size={13} /> Volver a Storyboard
        </button>

        <button
          onClick={() => setStage(5)}
          className="btn-primary text-xs flex items-center gap-1.5 px-4 py-2"
        >
          Siguiente: Animación a Video & LipSync <ArrowRight size={13} />
        </button>
      </div>
    </div>
  )
}
