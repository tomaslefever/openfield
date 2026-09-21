import type { IpcContext } from './context'
import { requireApiKey, readSetting } from './helpers'
import { OpenfieldApiClient, IMAGE_MODELS, VIDEO_MODELS, AUDIO_MODELS } from '../services/kie'
import { getTaskQueue } from '../services/task-queue'
import { requireMachgenKey } from './machgen'
import { getMachgenQueue } from '../services/machgen-queue'
import { getMachgenModel } from '../services/machgen'
import { requireFalKey } from './fal'
import { getFalQueue } from '../services/fal-queue'
import { getFalModel } from '../services/fal'
import { requireHiggsfieldKey } from './higgsfield'
import { getHiggsfieldQueue } from '../services/higgsfield-queue'
import { requireReplicateKey } from './replicate'
import { getReplicateQueue } from '../services/replicate-queue'
import { getReplicateModel } from '../services/replicate'

function detectProvider(params: any): 'machgen' | 'fal' | 'higgsfield' | 'replicate' | 'kie' {
  if (!params) return 'kie'
  if (params.provider === 'kie') return 'kie'
  if (params.provider === 'machgen' || params.model?.startsWith('machgen/') || (params.model && getMachgenModel(params.model))) {
    return 'machgen'
  }
  if (
    params.provider === 'higgsfield' ||
    params.model?.startsWith('higgsfield/') ||
    params.model?.startsWith('bytedance/seedance-2.0') ||
    params.model?.startsWith('bytedance/seedance-2.5') ||
    params.model?.startsWith('kling-video/')
  ) {
    return 'higgsfield'
  }
  if (
    params.provider === 'fal' ||
    params.model?.startsWith('fal-ai/') ||
    params.model?.startsWith('minimax/') ||
    params.model?.startsWith('imagineart/') ||
    (params.model && getFalModel(params.model))
  ) {
    return 'fal'
  }
  if (
    params.provider === 'replicate' ||
    params.model?.startsWith('prunaai/') ||
    params.model?.startsWith('philz1337x/') ||
    params.model?.startsWith('black-forest-labs/') ||
    params.model?.startsWith('ideogram-ai/') ||
    (params.model && getReplicateModel(params.model))
  ) {
    return 'replicate'
  }
  return 'kie'
}

function forwardQueueEvents(sender: any, queue: any, taskId: string, prefix = 'openfield') {
  const cleanup = () => {
    queue.off('task:progress', onProgress)
    queue.off('task:completed', onComplete)
    queue.off('task:failed', onFailed)
  }
  const onProgress = (p: any) => { if (p.taskId === taskId) sender.send(`${prefix}:task:progress`, p) }
  const onComplete = (p: any) => { if (p.taskId === taskId) { sender.send(`${prefix}:task:completed`, p); cleanup() } }
  const onFailed = (p: any) => { if (p.taskId === taskId) { sender.send(`${prefix}:task:failed`, p); cleanup() } }

  queue.on('task:progress', onProgress)
  queue.on('task:completed', onComplete)
  queue.on('task:failed', onFailed)
}

export function registerOpenfieldHandlers({ raw, handle }: IpcContext) {
  const ensureKieModel = (params: any) => {
    if (params?.model?.startsWith('prunaai/')) {
      throw new Error('This model runs on Replicate, not KIE.ai. Use the Replicate queue.')
    }
    if (params?.model?.startsWith('minimax/')) {
      throw new Error('This model runs on fal.ai, not KIE.ai. Use the fal.ai queue.')
    }
    if (params?.model?.startsWith('machgen/')) {
      throw new Error('This model runs on MachGen, not KIE.ai. Use the MachGen queue.')
    }
    return params
  }

  handle('openfield:generate:image', async (event, params) => {
    const provider = detectProvider(params)
    if (provider === 'machgen') {
      const apiKey = requireMachgenKey()
      const queue = getMachgenQueue(apiKey)
      const taskId = await queue.enqueue('image', params)
      forwardQueueEvents(event.sender, queue, taskId, 'openfield')
      return taskId
    }
    if (provider === 'fal') {
      const apiKey = requireFalKey()
      const queue = getFalQueue(apiKey)
      const taskId = await queue.enqueue('image', params)
      forwardQueueEvents(event.sender, queue, taskId, 'openfield')
      return taskId
    }
    if (provider === 'higgsfield') {
      const apiKey = requireHiggsfieldKey()
      const queue = getHiggsfieldQueue(apiKey)
      const taskId = await queue.enqueue('image', params)
      forwardQueueEvents(event.sender, queue, taskId, 'openfield')
      return taskId
    }
    if (provider === 'replicate') {
      const apiKey = requireReplicateKey()
      const queue = getReplicateQueue(apiKey)
      const taskId = await queue.enqueue('image', params)
      forwardQueueEvents(event.sender, queue, taskId, 'openfield')
      return taskId
    }
    const apiKey = requireApiKey()
    const queue = getTaskQueue(apiKey)
    return queue.enqueue('image', ensureKieModel(params))
  })

  handle('openfield:generate:video', async (event, params) => {
    const provider = detectProvider(params)
    if (provider === 'machgen') {
      const apiKey = requireMachgenKey()
      const queue = getMachgenQueue(apiKey)
      const taskId = await queue.enqueue('video', params)
      forwardQueueEvents(event.sender, queue, taskId, 'openfield')
      return taskId
    }
    if (provider === 'fal') {
      const apiKey = requireFalKey()
      const queue = getFalQueue(apiKey)
      const taskId = await queue.enqueue('video', params)
      forwardQueueEvents(event.sender, queue, taskId, 'openfield')
      return taskId
    }
    if (provider === 'higgsfield') {
      const apiKey = requireHiggsfieldKey()
      const queue = getHiggsfieldQueue(apiKey)
      const taskId = await queue.enqueue('video', params)
      forwardQueueEvents(event.sender, queue, taskId, 'openfield')
      return taskId
    }
    if (provider === 'replicate') {
      const apiKey = requireReplicateKey()
      const queue = getReplicateQueue(apiKey)
      const taskId = await queue.enqueue('video', params)
      forwardQueueEvents(event.sender, queue, taskId, 'openfield')
      return taskId
    }
    const apiKey = requireApiKey()
    const queue = getTaskQueue(apiKey)
    return queue.enqueue('video', ensureKieModel(params))
  })

  handle('openfield:generate:audio', async (event, params) => {
    const provider = detectProvider(params)
    if (provider === 'machgen') {
      const apiKey = requireMachgenKey()
      const queue = getMachgenQueue(apiKey)
      const taskId = await queue.enqueue('audio', params)
      forwardQueueEvents(event.sender, queue, taskId, 'openfield')
      return taskId
    }
    if (provider === 'fal') {
      const apiKey = requireFalKey()
      const queue = getFalQueue(apiKey)
      const taskId = await queue.enqueue('audio', params)
      forwardQueueEvents(event.sender, queue, taskId, 'openfield')
      return taskId
    }
    const apiKey = requireApiKey()
    const queue = getTaskQueue(apiKey)
    return queue.enqueue('audio', params)
  })

  // Grok Upscale: re-runs a completed KIE video task through grok-imagine/upscale.
  // The KIE task id (openfield_task_id) of the source asset is passed to the API.
  handle('openfield:upscale:video', async (event, assetId: string, resolution?: string) => {
    const asset = raw.prepare('SELECT * FROM assets WHERE id = ?').get(assetId) as any
    if (!asset) throw new Error('Asset not found')
    if (asset.type !== 'video') throw new Error('Only video assets can be upscaled')
    if (!asset.taskId) throw new Error('Source video has no generation task')
    const sourceTask = (raw.prepare('SELECT * FROM tasks WHERE task_id = ?').get(asset.taskId) || raw.prepare('SELECT * FROM openfield_tasks WHERE task_id = ?').get(asset.taskId)) as any
    let kieTaskId: string | null = sourceTask?.openfieldTaskId || sourceTask?.openfield_task_id || sourceTask?.external_id || sourceTask?.kieTaskId || null
    if (!kieTaskId && sourceTask?.payload) {
      try {
        const p = JSON.parse(sourceTask.payload)
        kieTaskId = p?.kieTaskId || null
      } catch {}
    }
    // Fallback: recover the KIE task id from run_logs for assets generated before openfield_task_id existed
    if (!kieTaskId) {
      const logRow = raw.prepare(
        "SELECT message FROM run_logs WHERE task_id = ? AND message LIKE 'Task created:%' ORDER BY created_at ASC LIMIT 1"
      ).get(asset.taskId) as any
      const match = logRow?.message?.match(/Task created:\s*(.+)$/)
      if (match) kieTaskId = match[1]
    }
    if (!kieTaskId) throw new Error('Source video was not generated via KIE.ai')
    if (sourceTask?.status !== 'completed') throw new Error('Source video task is not completed yet')
    // grok-imagine/upscale only accepts videos generated with grok-imagine models
    let sourceModel = ''
    try {
      const p = typeof sourceTask.payload === 'string' ? JSON.parse(sourceTask.payload) : (sourceTask.payload || {})
      sourceModel = p.model || ''
    } catch {}
    if (!sourceModel.startsWith('grok-imagine')) {
      throw new Error('Upscale only works on videos generated with Grok Imagine')
    }

    const apiKey = requireApiKey()
    const queue = getTaskQueue(apiKey)
    return queue.enqueue('video', {
      model: 'grok-imagine/upscale',
      taskId: kieTaskId,
      resolution: resolution === '720p' ? '720p' : '1080p',
      prompt: asset.prompt ? `Upscale: ${asset.prompt}` : 'Video upscale',
      upscaleSourceAssetId: assetId,
    })
  })

  handle('openfield:task:status', async (_e, taskId: string) => {
    if (!taskId) return null
    let task = raw.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any
    if (!task) {
      task = raw.prepare('SELECT * FROM openfield_tasks WHERE task_id = ?').get(taskId) as any
    }
    if (!task) {
      task = raw.prepare('SELECT * FROM machgen_tasks WHERE task_id = ?').get(taskId) as any
    }
    if (!task) {
      task = raw.prepare('SELECT * FROM fal_tasks WHERE task_id = ?').get(taskId) as any
    }
    if (!task) {
      task = raw.prepare('SELECT * FROM higgsfield_tasks WHERE task_id = ?').get(taskId) as any
    }
    if (!task) {
      task = raw.prepare('SELECT * FROM replicate_tasks WHERE task_id = ?').get(taskId) as any
    }
    if (!task) return null

    let assetId = task.assetId || task.asset_id
    let localPath = task.localPath || task.local_path
    let outputUrl = task.outputUrl || task.output_url || task.resultUrl || task.result_url

    if (task.status === 'completed') {
      const asset = raw.prepare('SELECT * FROM assets WHERE task_id = ? ORDER BY created_at DESC LIMIT 1').get(taskId) as any
      if (asset) {
        assetId = asset.id
        const aPath = asset.localPath || asset.local_path
        if (aPath) {
          localPath = aPath
          outputUrl = `file://${aPath.replace(/\\/g, '/')}`
        } else if (asset.filePath || asset.file_path) {
          outputUrl = asset.filePath || asset.file_path
        }
      }

      if (!outputUrl && (task.resultJson || task.result_json)) {
        try {
          const rawP = task.resultJson || task.result_json
          const p = typeof rawP === 'string' ? JSON.parse(rawP) : rawP
          outputUrl = p.url || p.resultUrls?.[0] || p.imageUrl || p.videoUrl || p.audioUrl
        } catch {}
      }
    }

    return {
      ...task,
      assetId,
      localPath,
      outputUrl,
    }
  })

  handle('openfield:task:cancel', (_e, taskId: string) => {
    const taskRow = raw.prepare('SELECT provider FROM tasks WHERE task_id = ?').get(taskId) as any
    const provider = taskRow?.provider
    if (provider === 'machgen' || raw.prepare('SELECT 1 FROM machgen_tasks WHERE task_id = ?').get(taskId)) {
      return getMachgenQueue(requireMachgenKey()).cancelTask(taskId)
    }
    if (provider === 'fal' || raw.prepare('SELECT 1 FROM fal_tasks WHERE task_id = ?').get(taskId)) {
      return getFalQueue(requireFalKey()).cancelTask(taskId)
    }
    if (provider === 'higgsfield' || raw.prepare('SELECT 1 FROM higgsfield_tasks WHERE task_id = ?').get(taskId)) {
      return getHiggsfieldQueue(requireHiggsfieldKey()).cancelTask(taskId)
    }
    if (provider === 'replicate' || raw.prepare('SELECT 1 FROM replicate_tasks WHERE task_id = ?').get(taskId)) {
      return getReplicateQueue(requireReplicateKey()).cancelTask(taskId)
    }
    const apiKey = requireApiKey()
    return getTaskQueue(apiKey).cancelTask(taskId)
  })

  handle('openfield:task:retry', (_e, taskId: string) => {
    const apiKey = requireApiKey()
    return getTaskQueue(apiKey).retryTask(taskId)
  })

  handle('openfield:models:list', () => ({ image: IMAGE_MODELS, video: VIDEO_MODELS, audio: AUDIO_MODELS }))

  handle('openfield:account:info', async () => {
    try {
      const apiKey = requireApiKey()
      const api = new OpenfieldApiClient(apiKey)
      return { credits: await api.getAccountCredits() }
    } catch { return { credits: -1 } }
  })

  handle('openfield:credit:balance', async () => {
    try {
      const apiKey = requireApiKey()
      return await new OpenfieldApiClient(apiKey).getAccountCredits()
    } catch { return -1 }
  })

  handle('openfield:cost:estimate', (_e, modelId: string, opts?: any) => {
    try {
      const apiKey = requireApiKey()
      const options = typeof opts === 'number' ? { duration: opts } : (opts || {})
      return new OpenfieldApiClient(apiKey).getEstimatedCost(modelId, options)
    } catch { return 0 }
  })

  handle('openfield:agent:chat', async (_e, params: any) => {
    const kieApiKey = readSetting('openfieldApiKey') || readSetting('kieApiKey')
    const openaiApiKey = readSetting('openaiApiKey')
    const anthropicApiKey = readSetting('anthropicApiKey')
    const openrouterApiKey = readSetting('openrouterApiKey')

    const messages = params?.messages || []
    const requestedModel = params?.model || 'claude-3-7-sonnet'

    const formattedMessages = messages.map((m: any) => ({
      role: m.role === 'tool' ? 'user' : m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }))

    // 1. Try KIE.ai API with current KIE credentials
    if (kieApiKey) {
      const isClaude = requestedModel.toLowerCase().includes('claude')
      let lastError = ''

      // For Claude models (Claude Opus 4.7, Claude Opus 4.8, Claude Fable 5, Claude 3.7 Sonnet),
      // prioritize the official KIE Claude Messages endpoint
      if (isClaude) {
        const sysMsg = formattedMessages.find((m: any) => m.role === 'system')?.content || ''
        const userMsgs = formattedMessages.filter((m: any) => m.role !== 'system')
        const messagesPayload = userMsgs.length > 0 ? userMsgs : [{ role: 'user', content: 'Hola' }]

        const claudeUrls = [
          'https://api.kie.ai/claude/v1/messages',
          `https://api.kie.ai/${requestedModel}/v1/messages`,
          'https://api.kie.ai/claude-3-7-sonnet/v1/messages',
        ]

        for (const cUrl of claudeUrls) {
          try {
            const bodyPayload: Record<string, any> = {
              model: requestedModel,
              messages: messagesPayload,
              max_tokens: 4096,
              stream: !!params?.stream,
              thinkingFlag: true,
            }
            if (sysMsg) {
              bodyPayload.system = sysMsg
            }

            const res = await fetch(cUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${kieApiKey}`,
                'X-Api-Key': kieApiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(bodyPayload),
            })

            if (res.ok) {
              const contentType = res.headers.get('content-type') || ''
              if (contentType.includes('text/event-stream') || params?.stream) {
                const rawStreamText = await res.text()
                let accumulated = ''
                const lines = rawStreamText.split('\n')
                for (const line of lines) {
                  const trimmed = line.trim()
                  if (!trimmed.startsWith('data:')) continue
                  const dataStr = trimmed.slice(5).trim()
                  if (dataStr === '[DONE]') continue
                  try {
                    const parsed = JSON.parse(dataStr)
                    const deltaText =
                      parsed.delta?.text ||
                      parsed.delta?.content ||
                      parsed.content_block?.text ||
                      parsed.choices?.[0]?.delta?.content ||
                      ''
                    if (deltaText) {
                      accumulated += deltaText
                      if (_e?.sender && !(_e.sender as any).isDestroyed?.()) {
                        _e.sender.send('openfield:agent:chunk', { delta: deltaText, content: accumulated })
                      }
                    }
                  } catch {}
                }
                if (accumulated) {
                  return {
                    content: accumulated,
                    message: { role: 'assistant', content: accumulated },
                  }
                }
              }

              const data = await res.json()
              const text =
                data.content?.[0]?.text ||
                data.choices?.[0]?.message?.content ||
                data.text ||
                ''
              if (text) {
                return {
                  content: text,
                  message: { role: 'assistant', content: text },
                }
              }
            } else {
              const errBody = await res.text()
              lastError = `[HTTP ${res.status}] ${errBody.slice(0, 160)}`
              console.warn(`[KIE Claude Messages] ${cUrl} error (${res.status}):`, errBody)
            }
          } catch (err: any) {
            lastError = err?.message || String(err)
            console.warn(`[KIE Claude Messages] ${cUrl} connection error:`, err)
          }
        }
      }

      // OpenAI-compatible Chat Completions endpoints
      const sanitizedModel = requestedModel.replace(/\./g, '-').replace(/\//g, '-')
      const endpoints = [
        `https://api.kie.ai/${sanitizedModel}/v1/chat/completions`,
        `https://api.kie.ai/v1/chat/completions`,
        `https://api.kie.ai/${requestedModel}/v1/chat/completions`,
        `https://api.kie.ai/gemini-2-5-pro/v1/chat/completions`,
        `https://api.kie.ai/gpt-5-2/v1/chat/completions`,
        `https://api.kie.ai/deepseek-r1/v1/chat/completions`,
        `https://api.kie.ai/grok-4-5/v1/chat/completions`,
      ]

      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${kieApiKey}`,
              'X-Api-Key': kieApiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: requestedModel,
              messages: formattedMessages,
              temperature: 0.7,
              max_tokens: 4000,
            }),
          })

          if (res.ok) {
            const data = await res.json()
            const text =
              data.choices?.[0]?.message?.content ||
              data.choices?.[0]?.text ||
              data.content?.[0]?.text ||
              data.text ||
              ''
            if (text) {
              return {
                content: text,
                message: { role: 'assistant', content: text },
              }
            }
          } else {
            const errBody = await res.text()
            lastError = `[HTTP ${res.status}] ${errBody.slice(0, 160)}`
            console.warn(`[KIE Agent Chat] ${url} error (${res.status}):`, errBody)
          }
        } catch (err: any) {
          lastError = err?.message || String(err)
          console.warn(`[KIE Agent Chat] ${url} connection error:`, err)
        }
      }

      if (lastError && !openrouterApiKey && !openaiApiKey && !anthropicApiKey) {
        throw new Error(`KIE.ai Chat Error: ${lastError}`)
      }
    }

    // 2. Try OpenRouter
    if (openrouterApiKey) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openrouterApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'anthropic/claude-3.5-sonnet',
            messages: formattedMessages,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          const text = data.choices?.[0]?.message?.content || ''
          if (text) {
            return { content: text, message: { role: 'assistant', content: text } }
          }
        }
      } catch {}
    }

    // 3. Try OpenAI
    if (openaiApiKey) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: formattedMessages,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          const text = data.choices?.[0]?.message?.content || ''
          if (text) {
            return { content: text, message: { role: 'assistant', content: text } }
          }
        }
      } catch {}
    }

    throw new Error('No se pudo conectar a ningún servicio de IA para el chat o desglose. Configura tus API Keys de KIE en Ajustes.')
  })
}
