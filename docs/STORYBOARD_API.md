# Storyboard API

Available via `window.electronAPI.storyboard.*` in the renderer or `ipcMain.handle` channels in the main process.

## Board CRUD

Multiple independent boards. Each board contains its own scenes and transitions.

### `storyboard:list`
List all boards with scene count and thumbnail path.

```
params: none
returns: BoardListItem[]
```
- `BoardListItem` extends `Board` with `sceneCount: number` and `thumbnailPath: string | null`.

---

### `storyboard:get(id)`
Get a single board with all its scenes and transitions.

```
params: id: string
returns: { ...Board, scenes: SceneShot[], transitions: SceneTransition[] }
throws: Error if not found
```

---

### `storyboard:create(name)`
Create a new board.

```
params: name: string
returns: { id: string, name: string, createdAt: number, updatedAt: number }
```

---

### `storyboard:delete(id)`
Delete a board and all its scenes and transitions.

```
params: id: string
returns: true
```

---

### `storyboard:updateName(id, name)`
Rename a board.

```
params: id: string, name: string
returns: true
```

---

### `storyboard:updateSettings(id, settings)`
Update board-level settings (models, defaults).

```ts
params:
  id: string
  settings: {
    imageModelId?: string
    videoModelId?: string
    transitionModelId?: string
    defaultDuration?: number
  }
returns: true
```

---

## Scene CRUD

### `storyboard:createScene(storyboardId, data)`
Add a scene to a board. Appended at the end (highest order + 1).

```ts
params:
  storyboardId: string
  data: {
    description?: string
    prompt?: string
    aspectRatio?: string   // default "16:9"
    resolution?: string    // default "1K"
  }
returns: { id: string, order: number, ...data }
```

---

### `storyboard:updateScene(id, data)`
Update scene fields. Only provided keys are updated.

```ts
params:
  id: string
  data: {
    description?: string
    prompt?: string
    aspectRatio?: string
    resolution?: string
  }
returns: true | false (false if no updates provided)
```

---

### `storyboard:setSceneAsset(sceneId, type, assetId)`
Link an asset (image/video) to a scene. Called after generation completes to persist the reference.

```ts
params:
  sceneId: string
  type: 'image' | 'video'
  assetId: string          // Asset ID from the assets table
returns: true
```

---

### `storyboard:deleteScene(id)`
Delete a scene and any transitions referencing it.

```
params: id: string
returns: true | false (false if not found)
```

---

### `storyboard:reorderScenes(storyboardId, sceneIds)`
Reorder all scenes in a board by providing the new sequence of IDs.

```
params:
  storyboardId: string
  sceneIds: string[]       // Ordered array of scene IDs
returns: true
```

---

## Transition CRUD

Transitions sit between two scenes in a board.

### `storyboard:createTransition(data)`
Create a transition between two scenes.

```ts
params:
  data: {
    storyboardId: string   // Required: board this transition belongs to
    fromSceneId: string    // Source scene
    toSceneId: string      // Target scene
    duration?: number      // Default 5 (seconds)
  }
returns: { id: string, ...data }
```

---

### `storyboard:deleteTransition(id)`
Remove a transition.

```
params: id: string
returns: true
```

---

### `storyboard:updateTransition(id, data)`
Update transition properties.

```ts
params:
  id: string
  data: {
    duration?: number
    videoAssetId?: string
  }
returns: true | false
```

---

## Generation

All generation methods enqueue tasks and return immediately. Listen for `openfield:task:completed` to get results.

### `storyboard:generateSceneImage(sceneId, params)`
Generate an image for a scene using the scene's prompt.

```ts
params:
  sceneId: string
  params: {
    prompt: string
    model?: string          // default "gpt-image-2-text-to-image"
    aspectRatio?: string    // default "16:9"
    resolution?: string     // default "1K"
  }
returns: { taskId: string, sceneId: string }
```

---

### `storyboard:generateSceneVideo(sceneId, params)`
Generate a video for a scene (image-to-video, requires an existing image).

```ts
params:
  sceneId: string
  params: {
    prompt?: string
    model?: string          // default "kling-3.0/video"
    duration?: number       // default 5
    imageBase64: string     // Required: base64-encoded PNG
    aspectRatio?: string    // default "16:9"
    resolution?: string     // default "1K"
  }
returns: { taskId: string, sceneId: string }
```

---

### `storyboard:generateTransition(transitionId, params)`
Generate a transition video between two scenes (first-frame → last-frame).

```ts
params:
  transitionId: string
  params: {
    prompt?: string
    model?: string           // default "pixverse-v6/transition"
    duration?: number        // default 5
    firstFrameBase64: string // Required
    lastFrameBase64: string  // Required
    aspectRatio?: string     // default "16:9"
    resolution?: string      // default "1K"
  }
returns: { taskId: string, transitionId: string }
```

---

## Full Example

```ts
const api = (window as any).electronAPI

// 1. Create a board
const board = await api.storyboard.create('My Storyboard')
// { id: "abc-123", name: "My Storyboard", createdAt: 17..., updatedAt: 17... }

// 2. Add scenes
const s1 = await api.storyboard.createScene(board.id, {
  description: 'Opening shot of the city',
  prompt: 'cinematic wide shot of a futuristic city at dawn, 4k',
})
const s2 = await api.storyboard.createScene(board.id, {
  description: 'Protagonist close-up',
  prompt: 'close up portrait, dramatic lighting, cinematic',
})

// 3. Generate images
const img1 = await api.storyboard.generateSceneImage(s1.id, { prompt: s1.prompt })
const img2 = await api.storyboard.generateSceneImage(s2.id, { prompt: s2.prompt })

// 4. Wait for completions (memo: will be called for ANY completed task, match by taskId)
const cleanup = api.on('openfield:task:completed', async (p) => {
  if (p.taskId === img1.taskId) {
    const [result] = await api.assets.readBase64([p.assetId])
    if (result?.base64) {
      api.storyboard.setSceneAsset(s1.id, 'image', p.assetId)
      // Store base64 in app state for display
    }
  }
  if (p.taskId === img2.taskId) {
    // same pattern
  }
  // Once all images are ready, the UI displays them via base64
})

// 5. Generate a transition
const tr = await api.storyboard.createTransition({
  storyboardId: board.id,
  fromSceneId: s1.id,
  toSceneId: s2.id,
  duration: 4,
})

// 6. Fetch thumbnails with fileUrl for display
const fileUrl = (path: string) => 'asset://localhost/' + path.replace(/\\/g, '/')

api.on('openfield:task:completed', async (p) => {
  if (p.taskId === transitionTask.taskId) {
    const [result] = await api.assets.readBase64([p.assetId])
    api.storyboard.updateTransition(tr.id, { videoAssetId: p.assetId })
  }
})

// 7. List all boards
const boards = await api.storyboard.list()
// [{ id: "...", name: "My Storyboard", sceneCount: 2, thumbnailPath: "...", ... }]

// Cleanup listeners when done
cleanup()
```
