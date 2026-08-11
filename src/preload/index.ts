import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  assets: {
    list: (query?: any) => ipcRenderer.invoke('assets:list', query),
    get: (id: string) => ipcRenderer.invoke('assets:get', id),
    delete: (id: string) => ipcRenderer.invoke('assets:delete', id),
    toggleFavorite: (id: string) => ipcRenderer.invoke('assets:toggleFavorite', id),
    updateTags: (id: string, tags: string[]) => ipcRenderer.invoke('assets:updateTags', id, tags),
    deleteMultiple: (ids: string[]) => ipcRenderer.invoke('assets:deleteMultiple', ids),
    addTagsMultiple: (ids: string[], tags: string[]) => ipcRenderer.invoke('assets:addTagsMultiple', ids, tags),
    readBase64: (ids: string[]) => ipcRenderer.invoke('assets:readBase64', ids),
    recent: (limit?: number) => ipcRenderer.invoke('assets:recent', limit),
    tags: () => ipcRenderer.invoke('assets:tags'),
    stats: () => ipcRenderer.invoke('assets:stats'),
    webpStats: () => ipcRenderer.invoke('assets:webpStats'),
    convertAllToWebp: () => ipcRenderer.invoke('assets:convertAllToWebp'),
    import: (filePaths: string[]) => ipcRenderer.invoke('assets:import', filePaths),
    importFromDialog: () => ipcRenderer.invoke('assets:importFromDialog'),
    refresh: (id: string) => ipcRenderer.invoke('assets:refresh', id),
    downloadToLocal: (id: string) => ipcRenderer.invoke('assets:downloadToLocal', id),
    saveAs: (id: string) => ipcRenderer.invoke('assets:saveAs', id),
    showInFolder: (id: string) => ipcRenderer.invoke('assets:showInFolder', id),
    importBase64: (base64: string, mime: string, fileName: string) => ipcRenderer.invoke('assets:importBase64', base64, mime, fileName),
    saveRef: (base64: string, mime: string, name: string) => ipcRenderer.invoke('assets:saveRef', base64, mime, name),
  },
  openfield: {
    generateImage: (params: any) => ipcRenderer.invoke('openfield:generate:image', params),
    generateVideo: (params: any) => ipcRenderer.invoke('openfield:generate:video', params),
    generateAudio: (params: any) => ipcRenderer.invoke('openfield:generate:audio', params),
    taskStatus: (taskId: string) => ipcRenderer.invoke('openfield:task:status', taskId),
    cancelTask: (taskId: string) => ipcRenderer.invoke('openfield:task:cancel', taskId),
    retryTask: (taskId: string) => ipcRenderer.invoke('openfield:task:retry', taskId),
    models: () => ipcRenderer.invoke('openfield:models:list'),
    accountInfo: () => ipcRenderer.invoke('openfield:account:info'),
    creditBalance: () => ipcRenderer.invoke('openfield:credit:balance'),
    costEstimate: (modelId: string, duration?: number) => ipcRenderer.invoke('openfield:cost:estimate', modelId, duration),
    agentChat: (params: any) => ipcRenderer.invoke('openfield:agent:chat', params),
  },
  replicate: {
    generate: (params: any) => ipcRenderer.invoke('replicate:generate', params),
    taskStatus: (taskId: string) => ipcRenderer.invoke('replicate:task:status', taskId),
    cancelTask: (taskId: string) => ipcRenderer.invoke('replicate:task:cancel', taskId),
    models: () => ipcRenderer.invoke('replicate:models:list'),
    account: () => ipcRenderer.invoke('replicate:account'),
  },
  fal: {
    generate: (params: any) => ipcRenderer.invoke('fal:generate', params),
    taskStatus: (taskId: string) => ipcRenderer.invoke('fal:task:status', taskId),
    cancelTask: (taskId: string) => ipcRenderer.invoke('fal:task:cancel', taskId),
    models: () => ipcRenderer.invoke('fal:models:list'),
  },
  balances: {
    list: () => ipcRenderer.invoke('balances:list'),
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    get: (id: string) => ipcRenderer.invoke('projects:get', id),
    create: (name: string) => ipcRenderer.invoke('projects:create', name),
    update: (id: string, data: any) => ipcRenderer.invoke('projects:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id),
    export: (id: string, outputPath: string) => ipcRenderer.invoke('projects:export', id, outputPath),
  },
  elements: {
    list: () => ipcRenderer.invoke('elements:list'),
    create: (data: any) => ipcRenderer.invoke('elements:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('elements:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('elements:delete', id),
  },
  ffmpeg: {
    probe: (filePath: string) => ipcRenderer.invoke('ffmpeg:probe', filePath),
    thumbnail: (filePath: string, time?: number) => ipcRenderer.invoke('ffmpeg:thumbnail', filePath, time),
  },
  tasks: {
    list: (filters?: any) => ipcRenderer.invoke('tasks:list', filters),
  },
  workflows: {
    list: () => ipcRenderer.invoke('workflows:list'),
    create: (data: any) => ipcRenderer.invoke('workflows:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('workflows:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('workflows:delete', id),
    run: (workflowId: string) => ipcRenderer.invoke('workflows:run', workflowId),
  },
  logs: {
    list: (taskId?: string) => ipcRenderer.invoke('logs:list', taskId),
    clear: () => ipcRenderer.invoke('logs:clear'),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'openfield:task:progress', 'openfield:task:completed', 'openfield:task:failed',
      'replicate:task:progress', 'replicate:task:completed', 'replicate:task:failed',
      'fal:task:progress', 'fal:task:completed', 'fal:task:failed',
      'export:progress', 'export:complete', 'export:error',
      'error', 'notification',
      'models:download:progress', 'models:download:completed', 'models:download:error',
      'local:image:progress', 'local:image:completed', 'local:image:error',
      'local:audio:progress', 'local:audio:error',
    ];
    if (validChannels.includes(channel)) {
      const subscription = (_event: any, ...args: any[]) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },
  isDev: () => ipcRenderer.invoke('app:isDev'),

  // ─── Storyboard ───────────────────────────────────
  storyboard: {
    list: () => ipcRenderer.invoke('storyboard:list'),
    get: (id: string) => ipcRenderer.invoke('storyboard:get', id),
    create: (name: string, style?: string) => ipcRenderer.invoke('storyboard:create', name, style),
    listStyles: () => ipcRenderer.invoke('storyboard:listStyles'),
    delete: (id: string) => ipcRenderer.invoke('storyboard:delete', id),
    updateName: (id: string, name: string) => ipcRenderer.invoke('storyboard:updateName', id, name),
    updateSettings: (id: string, settings: any) => ipcRenderer.invoke('storyboard:updateSettings', id, settings),
    createScene: (storyboardId: string, data: any) => ipcRenderer.invoke('storyboard:createScene', storyboardId, data),
    updateScene: (id: string, data: any) => ipcRenderer.invoke('storyboard:updateScene', id, data),
    setSceneAsset: (sceneId: string, type: 'image' | 'video', assetId: string) => ipcRenderer.invoke('storyboard:setSceneAsset', sceneId, type, assetId),
    deleteScene: (id: string) => ipcRenderer.invoke('storyboard:deleteScene', id),
    reorderScenes: (storyboardId: string, sceneIds: string[]) => ipcRenderer.invoke('storyboard:reorderScenes', storyboardId, sceneIds),
    createTransition: (data: any) => ipcRenderer.invoke('storyboard:createTransition', data),
    deleteTransition: (id: string) => ipcRenderer.invoke('storyboard:deleteTransition', id),
    updateTransition: (id: string, data: any) => ipcRenderer.invoke('storyboard:updateTransition', id, data),
    generateSceneImage: (sceneId: string, params: any) => ipcRenderer.invoke('storyboard:generateSceneImage', sceneId, params),
    generateSceneVideo: (sceneId: string, params: any) => ipcRenderer.invoke('storyboard:generateSceneVideo', sceneId, params),
    generateTransition: (transitionId: string, params: any) => ipcRenderer.invoke('storyboard:generateTransition', transitionId, params),
  },

  // ─── MCP Bridge ───────────────────────────────────
  bridge: {
    getStatus: () => ipcRenderer.invoke('bridge:getStatus'),
  },

  // ─── Marketplace ──────────────────────────────────
  marketplace: {
    search: (params: any) => ipcRenderer.invoke('marketplace:search', params),
    getModel: (modelId: string) => ipcRenderer.invoke('marketplace:getModel', modelId),
    getReadme: (modelId: string) => ipcRenderer.invoke('marketplace:getReadme', modelId),
    getCurated: () => ipcRenderer.invoke('marketplace:getCurated'),
  },

  // ─── Models ───────────────────────────────────────
  models: {
    list: (filters?: any) => ipcRenderer.invoke('models:list', filters),
    listByPipeline: () => ipcRenderer.invoke('models:listByPipeline'),
    get: (id: string) => ipcRenderer.invoke('models:get', id),
    download: (modelId: string, options?: any) => ipcRenderer.invoke('models:download', modelId, options),
    cancelDownload: (modelId: string) => ipcRenderer.invoke('models:cancelDownload', modelId),
    getActiveDownloads: () => ipcRenderer.invoke('models:getActiveDownloads'),
    uninstall: (id: string) => ipcRenderer.invoke('models:uninstall', id),
    isInstalled: (id: string) => ipcRenderer.invoke('models:isInstalled', id),
    getTotalSize: () => ipcRenderer.invoke('models:getTotalSize'),
    reset: (id: string) => ipcRenderer.invoke('models:reset', id),
  },

  // ─── Local Server ─────────────────────────────────
  local: {
    serverStatus: () => ipcRenderer.invoke('local:server:status'),
    serverStart: () => ipcRenderer.invoke('local:server:start'),
    serverStop: () => ipcRenderer.invoke('local:server:stop'),
    serverPanic: () => ipcRenderer.invoke('local:server:panic'),
    detectPython: () => ipcRenderer.invoke('local:detectPython'),
    detectHardware: () => ipcRenderer.invoke('local:detectHardware'),
    piperIsInstalled: () => ipcRenderer.invoke('local:piper:isInstalled'),
    piperInstall: () => ipcRenderer.invoke('local:piper:install'),
    piperGetVoices: () => ipcRenderer.invoke('local:piper:getVoices'),
    piperIsVoiceDownloaded: (voiceId: string) => ipcRenderer.invoke('local:piper:isVoiceDownloaded', voiceId),
    piperDownloadVoice: (voiceId: string) => ipcRenderer.invoke('local:piper:downloadVoice', voiceId),
    piperGenerate: (params: any) => ipcRenderer.invoke('local:piper:generate', params),
    kokoroIsInstalled: () => ipcRenderer.invoke('local:kokoro:isInstalled'),
    kokoroGetVoices: () => ipcRenderer.invoke('local:kokoro:getVoices'),
    kokoroInstall: () => ipcRenderer.invoke('local:kokoro:install'),
    audioGenerate: (params: any) => ipcRenderer.invoke('local:audio:generate', params),
    imageGenerate: (params: any) => ipcRenderer.invoke('local:image:generate', params),
    serverLoadModel: (modelId: string, device?: string) => ipcRenderer.invoke('local:server:loadModel', modelId, device),
    serverUnloadModel: () => ipcRenderer.invoke('local:server:unloadModel'),
    serverModelInfo: () => ipcRenderer.invoke('local:server:modelInfo'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
