import { create } from 'zustand'
import { toast } from 'sonner'

export type ElementKind = 'avatar' | 'character' | 'environment' | 'object'

export interface StudioElement {
  id: string
  name: string
  kind: ElementKind
  description: string
  tags: string[]
  imageBase64: string
  imageAssetId: string
  prompt: string
  voiceId: string
  referenceImages: string[]
  /** Aligned 1:1 with referenceImages ('' while a new image is not stored yet) */
  referenceAssetIds: string[]
  poseRef: string
  poseAssetId: string
  poseTaskId: string
  moodboardTaskId: string
  videoRef: string
  videoAssetId: string
  hdriRef: string
  hdriAssetId: string
  style: string
  properties: Record<string, string>
  createdAt: number
  updatedAt: number
}

export const KIND_CONFIG: Record<ElementKind, { label: string; icon: string; color: string }> = {
  avatar: { label: 'Avatar', icon: 'user-circle', color: 'text-violet-400' },
  character: { label: 'Personaje', icon: 'user', color: 'text-blue-400' },
  environment: { label: 'Entorno', icon: 'mountain', color: 'text-emerald-400' },
  object: { label: 'Objeto', icon: 'box', color: 'text-amber-400' },
}

export const MAX_REFERENCES = 8

/** Where a generation result lands on an element */
export type ElementSlot = 'primary' | 'pose' | 'moodboard'

export interface PendingElementTask {
  taskId: string
  elementId: string
  slot: ElementSlot
}

/** A media value plus the asset that already stores it ('' when it still has to be stored) */
export interface MediaRef {
  base64: string
  assetId: string
}

// Base64 field → asset id field. Sending a base64 without its asset id makes the main
// process store a new asset, so every write carries the id once it is known.
const MEDIA_FIELDS = [
  ['imageBase64', 'imageAssetId'],
  ['poseRef', 'poseAssetId'],
  ['videoRef', 'videoAssetId'],
  ['hdriRef', 'hdriAssetId'],
] as const

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

function electron() {
  return (window as any).electronAPI
}

function api() {
  return electron()?.elements
}

/** Mime type sniffed from base64 magic bytes (stored refs are not always PNG) */
export function b64Mime(b64: string): string {
  if (b64.startsWith('data:')) return b64.slice(5, b64.indexOf(';')) || 'image/png'
  if (b64.startsWith('/9j/')) return 'image/jpeg'
  if (b64.startsWith('UklGR')) return 'image/webp'
  if (b64.startsWith('R0lGOD')) return 'image/gif'
  if (b64.startsWith('AAAA')) return 'video/mp4'
  return 'image/png'
}

/** `<img src>` for a stored base64 value (raw or data URL) */
export function b64Src(b64: string | undefined | null): string | undefined {
  if (!b64) return undefined
  return b64.startsWith('data:') ? b64 : `data:${b64Mime(b64)};base64,${b64}`
}

interface ElementsState {
  elements: StudioElement[]
  loaded: boolean
  pending: PendingElementTask[]

  loadElements: () => Promise<void>
  /** Returns the new element id */
  addElement: (el: Omit<StudioElement, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateElement: (id: string, updates: Partial<StudioElement>) => void
  deleteElement: (id: string) => void

  /** Appends references (up to MAX_REFERENCES), returns how many were added */
  addReferences: (id: string, refs: MediaRef[]) => number
  removeReference: (id: string, index: number) => void

  trackTask: (elementId: string, slot: ElementSlot, taskId: string) => void
  cancelTask: (taskId: string) => void
}

// One write in flight per element, so a second write never re-stores media the first
// one is still importing.
const writeChains = new Map<string, Promise<unknown>>()
// Created locally, row not inserted yet (a reload must not drop them)
const unsynced = new Set<string>()
let loadingElements: Promise<void> | null = null

function queueWrite(id: string, updates: Partial<StudioElement>) {
  const prev = writeChains.get(id) || Promise.resolve()
  const next = prev.then(() => persistUpdate(id, updates)).catch((err) => {
    console.error('[ElementsStore] Failed to update element in DB:', err)
  })
  writeChains.set(id, next)
  next.finally(() => { if (writeChains.get(id) === next) writeChains.delete(id) })
}

async function persistUpdate(id: string, updates: Partial<StudioElement>) {
  const cur = useElementsStore.getState().elements.find((e) => e.id === id)
  if (!cur) return
  const payload: Record<string, any> = { ...updates }

  // Use the latest known asset ids (an earlier write may have resolved them)
  for (const [b64Key, idKey] of MEDIA_FIELDS) {
    if (b64Key in updates && cur[b64Key] === updates[b64Key]) payload[idKey] = cur[idKey]
  }
  const sendsRefs = 'referenceImages' in updates
  if (sendsRefs) {
    payload.referenceImages = cur.referenceImages
    payload.referenceAssetIds = cur.referenceImages.map((_, i) => cur.referenceAssetIds[i] || '')
  }

  const res = await api()?.update(id, payload)
  if (!res || typeof res !== 'object') return

  // Remember the asset ids the main process resolved, unless the value changed meanwhile
  useElementsStore.setState((s) => ({
    elements: s.elements.map((e) => {
      if (e.id !== id) return e
      const merged: Partial<StudioElement> = {}
      for (const [b64Key, idKey] of MEDIA_FIELDS) {
        if (b64Key in payload && e[b64Key] === payload[b64Key] && res[idKey] && e[idKey] !== res[idKey]) {
          merged[idKey] = res[idKey]
        }
      }
      if (sendsRefs && Array.isArray(res.referenceAssetIds)) {
        const byB64 = new Map<string, string>()
        payload.referenceImages.forEach((b64: string, i: number) => {
          if (res.referenceAssetIds[i]) byB64.set(b64, res.referenceAssetIds[i])
        })
        const ids = e.referenceImages.map((b64, i) => e.referenceAssetIds[i] || byB64.get(b64) || '')
        if (ids.some((aid, i) => aid !== (e.referenceAssetIds[i] || ''))) merged.referenceAssetIds = ids
      }
      return Object.keys(merged).length ? { ...e, ...merged } : e
    }),
  }))
}

// ─── Generation results ──────────────────────────────────────────
// Results are applied from here (not from the page) so they land even if the user
// navigated away while the task was running.

let listening = false

function ensureTaskListener() {
  if (listening) return
  const el = electron()
  if (!el?.on) return
  listening = true
  el.on('openfield:task:completed', (data: any) => {
    const assetId = data?.assetId ?? data?.asset?.id
    if (data?.taskId && assetId) void resolveTask(data.taskId, assetId)
  })
  el.on('openfield:task:failed', (data: any) => {
    if (data?.taskId) failTask(data.taskId, data?.error)
  })
}

function takePending(taskId: string): PendingElementTask | undefined {
  const task = useElementsStore.getState().pending.find((p) => p.taskId === taskId)
  if (task) useElementsStore.setState((s) => ({ pending: s.pending.filter((p) => p.taskId !== taskId) }))
  return task
}

function clearPersistedTask(task: PendingElementTask): Partial<StudioElement> {
  const el = useElementsStore.getState().elements.find((e) => e.id === task.elementId)
  if (!el) return {}
  if (task.slot === 'pose' && el.poseTaskId === task.taskId) return { poseTaskId: '' }
  if (task.slot === 'moodboard' && el.moodboardTaskId === task.taskId) return { moodboardTaskId: '' }
  return {}
}

async function resolveTask(taskId: string, assetId: string) {
  if (!useElementsStore.getState().pending.some((p) => p.taskId === taskId)) return
  let base64 = ''
  try {
    const results = await electron()?.assets.readBase64([assetId])
    base64 = results?.[0]?.base64 || ''
  } catch (err) {
    console.error('[ElementsStore] Failed to read generated asset:', err)
  }
  // File not on disk yet: keep it pending, reconcilePending retries later
  if (!base64) return
  const task = takePending(taskId)
  if (!task) return
  const store = useElementsStore.getState()
  const el = store.elements.find((e) => e.id === task.elementId)
  if (!el) return

  const cleared = clearPersistedTask(task)
  if (task.slot === 'primary') {
    store.updateElement(el.id, { ...cleared, imageBase64: base64, imageAssetId: assetId })
  } else if (task.slot === 'pose') {
    store.updateElement(el.id, { ...cleared, poseRef: base64, poseAssetId: assetId })
  } else {
    if (Object.keys(cleared).length) store.updateElement(el.id, cleared)
    if (store.addReferences(el.id, [{ base64, assetId }]) === 0) {
      toast.message(`El moodboard de "${el.name}" está lleno`, { description: 'La imagen quedó en la biblioteca.' })
      return
    }
  }
  const what = task.slot === 'primary' ? 'Render listo' : task.slot === 'pose' ? 'Pose lista' : 'Referencia lista'
  toast.success(`${what} · ${el.name}`)
}

function failTask(taskId: string, error?: string) {
  const task = takePending(taskId)
  if (!task) return
  const cleared = clearPersistedTask(task)
  if (Object.keys(cleared).length) useElementsStore.getState().updateElement(task.elementId, cleared)
  if (error !== 'Canceled by user') toast.error(error || 'La generación falló')
}

/** Catches results that completed while no listener was attached (e.g. app restarted) */
async function reconcilePending() {
  const { pending } = useElementsStore.getState()
  if (pending.length === 0) return
  try {
    const res = await electron()?.assets.list({ type: 'image', limit: 60 })
    for (const task of pending) {
      const match = res?.assets?.find((a: any) => (a.taskId ?? a.task_id) === task.taskId)
      if (!match) continue
      const filePath: string = match.filePath ?? match.file_path ?? ''
      if (filePath.startsWith('__error__')) failTask(task.taskId)
      else if (match.localPath ?? match.local_path) await resolveTask(task.taskId, match.id)
    }
  } catch (err) {
    console.warn('[ElementsStore] Failed to reconcile pending tasks:', err)
  }
}

let reconcileTimer: ReturnType<typeof setInterval> | null = null

function ensureReconcileLoop() {
  if (reconcileTimer) return
  reconcileTimer = setInterval(() => {
    if (useElementsStore.getState().pending.length === 0) {
      clearInterval(reconcileTimer!)
      reconcileTimer = null
      return
    }
    void reconcilePending()
  }, 15000)
}

async function loadFromDb() {
  const set = useElementsStore.setState
  const get = useElementsStore.getState
  ensureTaskListener()
  const elApi = api()
  if (!elApi) {
    set({ loaded: true })
    return
  }
  try {
    const rows = await elApi.list()
    if (!rows || !Array.isArray(rows)) {
      set({ loaded: true })
      return
    }
    const elements = rows as StudioElement[]
    // Load base64 from assets for display
    const assetIds = new Set<string>()
    for (const el of elements) {
      if (el.imageAssetId) assetIds.add(el.imageAssetId)
      if (el.poseAssetId) assetIds.add(el.poseAssetId)
      if (el.videoAssetId) assetIds.add(el.videoAssetId)
      if (el.hdriAssetId) assetIds.add(el.hdriAssetId)
      for (const aid of el.referenceAssetIds || []) assetIds.add(aid)
    }
    if (assetIds.size > 0) {
      try {
        const results = await electron()?.assets.readBase64(Array.from(assetIds))
        if (results?.length) {
          const map = new Map<string, string>(results.map((r: any) => [r.id, r.base64]))
          for (const el of elements) {
            if (el.imageAssetId && map.has(el.imageAssetId)) el.imageBase64 = map.get(el.imageAssetId)!
            if (el.poseAssetId && map.has(el.poseAssetId)) el.poseRef = map.get(el.poseAssetId)!
            if (el.videoAssetId && map.has(el.videoAssetId)) el.videoRef = map.get(el.videoAssetId)!
            if (el.hdriAssetId && map.has(el.hdriAssetId)) el.hdriRef = map.get(el.hdriAssetId)!
            if (el.referenceAssetIds?.length) {
              // Keep images and ids aligned: drop both when a file is missing
              const pairs = el.referenceAssetIds
                .map((aid) => ({ aid, b64: map.get(aid) || '' }))
                .filter((p) => p.b64)
              el.referenceImages = pairs.map((p) => p.b64)
              el.referenceAssetIds = pairs.map((p) => p.aid)
            }
          }
        }
      } catch (err) { console.warn('[ElementsStore] Failed to load asset base64:', err) }
    }
    for (const el of elements) {
      if (el.referenceAssetIds.length !== el.referenceImages.length) {
        el.referenceAssetIds = el.referenceImages.map((_, i) => el.referenceAssetIds[i] || '')
      }
    }

    // Pose / moodboard tasks persist on the element; pick them back up
    const known = new Set(get().pending.map((p) => p.taskId))
    const restored: PendingElementTask[] = []
    for (const el of elements) {
      if (el.poseTaskId && !known.has(el.poseTaskId)) restored.push({ taskId: el.poseTaskId, elementId: el.id, slot: 'pose' })
      if (el.moodboardTaskId && !known.has(el.moodboardTaskId)) restored.push({ taskId: el.moodboardTaskId, elementId: el.id, slot: 'moodboard' })
    }

    set((s) => {
      // The DB can lag behind local state: keep elements still being created and
      // local versions of elements with writes in flight
      const dbIds = new Set(elements.map((e) => e.id))
      const localById = new Map(s.elements.map((e) => [e.id, e]))
      const merged = elements.map((e) => (writeChains.has(e.id) && localById.get(e.id)) || e)
      const creating = s.elements.filter((e) => unsynced.has(e.id) && !dbIds.has(e.id))
      return { elements: [...creating, ...merged], loaded: true, pending: [...s.pending, ...restored] }
    })
    if (get().pending.length > 0) {
      void reconcilePending()
      ensureReconcileLoop()
    }
  } catch (err) {
    console.error('[ElementsStore] Failed to load elements from DB:', err)
    set({ loaded: true })
  }
}

export const useElementsStore = create<ElementsState>()((set, get) => ({
  elements: [],
  loaded: false,
  pending: [],

  loadElements: () => {
    // Composers reload on mount; share one in-flight load
    if (!loadingElements) {
      loadingElements = loadFromDb().finally(() => { loadingElements = null })
    }
    return loadingElements
  },

  addElement: (el) => {
    const id = uid()
    const now = Date.now()
    const referenceImages = el.referenceImages || []
    const element: StudioElement = {
      id,
      name: el.name,
      kind: el.kind,
      description: el.description || '',
      tags: el.tags || [],
      imageBase64: el.imageBase64 || '',
      imageAssetId: el.imageAssetId || '',
      prompt: el.prompt || '',
      voiceId: el.voiceId || '',
      referenceImages,
      referenceAssetIds: referenceImages.map((_, i) => el.referenceAssetIds?.[i] || ''),
      poseRef: el.poseRef || '',
      poseAssetId: el.poseAssetId || '',
      poseTaskId: el.poseTaskId || '',
      moodboardTaskId: el.moodboardTaskId || '',
      videoRef: el.videoRef || '',
      videoAssetId: el.videoAssetId || '',
      hdriRef: el.hdriRef || '',
      hdriAssetId: el.hdriAssetId || '',
      style: el.style || '',
      properties: el.properties || {},
      createdAt: now,
      updatedAt: now,
    }
    set((s) => ({ elements: [element, ...s.elements] }))

    if (!element.imageBase64 && element.imageAssetId) {
      electron()?.assets?.readBase64([element.imageAssetId]).then((results: any) => {
        const b64 = results?.[0]?.base64
        if (b64) {
          set((s) => ({
            elements: s.elements.map((e) => e.id === id ? { ...e, imageBase64: b64 } : e),
          }))
        }
      }).catch(() => {})
    }

    unsynced.add(id)
    const create = api()?.create({ ...element, id }).then((row: any) => {
      if (!row) return
      // Keep the asset ids the main process stored the media under
      set((s) => ({
        elements: s.elements.map((e) => e.id !== id ? e : {
          ...e,
          imageAssetId: e.imageAssetId || row.imageAssetId || '',
          poseAssetId: e.poseAssetId || row.poseAssetId || '',
          videoAssetId: e.videoAssetId || row.videoAssetId || '',
          hdriAssetId: e.hdriAssetId || row.hdriAssetId || '',
          referenceAssetIds: e.referenceImages.length === (row.referenceAssetIds || []).length
            ? e.referenceImages.map((_, i) => e.referenceAssetIds[i] || row.referenceAssetIds[i] || '')
            : e.referenceAssetIds,
        }),
      }))
    }).catch((err: any) => {
      console.error('[ElementsStore] Failed to persist element to DB:', err)
    }).finally(() => unsynced.delete(id))
    // Updates made right after creating wait for the row to exist
    if (create) {
      writeChains.set(id, create)
      create.finally(() => { if (writeChains.get(id) === create) writeChains.delete(id) })
    }
    return id
  },

  updateElement: (id, updates) => {
    set((s) => ({
      elements: s.elements.map((e) =>
        e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e,
      ),
    }))
    queueWrite(id, updates)
  },

  deleteElement: (id) => {
    set((s) => ({
      elements: s.elements.filter((e) => e.id !== id),
      pending: s.pending.filter((p) => p.elementId !== id),
    }))

    api()?.delete(id).catch((err: any) => {
      console.error('[ElementsStore] Failed to delete element from DB:', err)
    })
  },

  addReferences: (id, refs) => {
    const el = get().elements.find((e) => e.id === id)
    if (!el) return 0
    const room = Math.max(0, MAX_REFERENCES - el.referenceImages.length)
    const added = refs.filter((r) => r.base64).slice(0, room)
    if (added.length === 0) return 0
    get().updateElement(id, {
      referenceImages: [...el.referenceImages, ...added.map((r) => r.base64)],
      referenceAssetIds: [
        ...el.referenceImages.map((_, i) => el.referenceAssetIds[i] || ''),
        ...added.map((r) => r.assetId || ''),
      ],
    })
    return added.length
  },

  removeReference: (id, index) => {
    const el = get().elements.find((e) => e.id === id)
    if (!el) return
    get().updateElement(id, {
      referenceImages: el.referenceImages.filter((_, i) => i !== index),
      referenceAssetIds: el.referenceImages
        .map((_, i) => el.referenceAssetIds[i] || '')
        .filter((_, i) => i !== index),
    })
  },

  trackTask: (elementId, slot, taskId) => {
    ensureTaskListener()
    set((s) => ({ pending: [...s.pending, { taskId, elementId, slot }] }))
    if (slot === 'pose') get().updateElement(elementId, { poseTaskId: taskId })
    if (slot === 'moodboard') get().updateElement(elementId, { moodboardTaskId: taskId })
    ensureReconcileLoop()
  },

  cancelTask: (taskId) => {
    const task = takePending(taskId)
    if (!task) return
    const cleared = clearPersistedTask(task)
    if (Object.keys(cleared).length) get().updateElement(task.elementId, cleared)
  },
}))
