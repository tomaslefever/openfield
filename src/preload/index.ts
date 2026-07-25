import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  assets: {
    list: (query?: any) => ipcRenderer.invoke('assets:list', query),
    get: (id: string) => ipcRenderer.invoke('assets:get', id),
    delete: (id: string) => ipcRenderer.invoke('assets:delete', id),
    toggleFavorite: (id: string) => ipcRenderer.invoke('assets:toggleFavorite', id),
    updateTags: (id: string, tags: string[]) => ipcRenderer.invoke('assets:updateTags', id, tags),
    recent: (limit?: number) => ipcRenderer.invoke('assets:recent', limit),
    stats: () => ipcRenderer.invoke('assets:stats'),
    import: (filePaths: string[]) => ipcRenderer.invoke('assets:import', filePaths),
    importFromDialog: () => ipcRenderer.invoke('assets:importFromDialog'),
    refresh: (id: string) => ipcRenderer.invoke('assets:refresh', id),
    downloadToLocal: (id: string) => ipcRenderer.invoke('assets:downloadToLocal', id),
    showInFolder: (id: string) => ipcRenderer.invoke('assets:showInFolder', id),
  },
  kie: {
    generateImage: (params: any) => ipcRenderer.invoke('kie:generate:image', params),
    generateVideo: (params: any) => ipcRenderer.invoke('kie:generate:video', params),
    taskStatus: (taskId: string) => ipcRenderer.invoke('kie:task:status', taskId),
    cancelTask: (taskId: string) => ipcRenderer.invoke('kie:task:cancel', taskId),
    retryTask: (taskId: string) => ipcRenderer.invoke('kie:task:retry', taskId),
    models: () => ipcRenderer.invoke('kie:models:list'),
    accountInfo: () => ipcRenderer.invoke('kie:account:info'),
    creditBalance: () => ipcRenderer.invoke('kie:credit:balance'),
    costEstimate: (modelId: string, duration?: number) => ipcRenderer.invoke('kie:cost:estimate', modelId, duration),
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    get: (id: string) => ipcRenderer.invoke('projects:get', id),
    create: (name: string) => ipcRenderer.invoke('projects:create', name),
    update: (id: string, data: any) => ipcRenderer.invoke('projects:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id),
    export: (id: string, outputPath: string) => ipcRenderer.invoke('projects:export', id, outputPath),
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
      'kie:task:progress', 'kie:task:completed', 'kie:task:failed',
      'export:progress', 'export:complete', 'export:error',
      'error', 'notification',
    ];
    if (validChannels.includes(channel)) {
      const subscription = (_event: any, ...args: any[]) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },
  isDev: () => ipcRenderer.invoke('app:isDev'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
