const { contextBridge, ipcRenderer } = require('electron');

function registerListener(channel, callback) {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, callback);
}

contextBridge.exposeInMainWorld('api', {
  startBot: () => ipcRenderer.send('start-bot'),
  stopBot: () => ipcRenderer.send('stop-bot'),
  signalReady: () => ipcRenderer.send('renderer-ready'),
  getHardwareInfo: () => ipcRenderer.invoke('get-hardware-info'),
  evaluateModelImpact: (fileSizeGB) => ipcRenderer.invoke('evaluate-model-impact', fileSizeGB),

  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  selectModelFile: () => ipcRenderer.invoke('select-model-file'),

  listDownloadedModels: () => ipcRenderer.invoke('list-downloaded-models'),
  loadAiModel: (modelPath) => ipcRenderer.invoke('load-ai-model', modelPath),
  unloadAiModel: () => ipcRenderer.invoke('unload-ai-model'),

  downloadModel: (url, filename) => ipcRenderer.send('download-model', { url, filename }),
  cancelDownload: (filename) => ipcRenderer.send('cancel-download', filename),

  onLog: (cb) => registerListener('log', (_e, msg) => cb(msg)),
  onErrorLog: (cb) => registerListener('log-error', (_e, msg) => cb(msg)),
  onStatusUpdate: (cb) => registerListener('status-update', (_e, status) => cb(status)),
  onEngineStatus: (cb) => registerListener('engine-status', (_e, engine, status) => cb(engine, status)),
  onDownloadProgress: (cb) => registerListener('download-progress', (_e, data) => cb(data)),
  onDownloadComplete: (cb) => registerListener('download-complete', (_e, data) => cb(data)),
  onDownloadError: (cb) => registerListener('download-error', (_e, data) => cb(data)),
  deleteModel: (modelPath) => ipcRenderer.invoke('delete-model', modelPath),

  // ============================================================
  // DEV PORTAL 
  // ============================================================
  discordPortalOpen: () => ipcRenderer.invoke('discord-portal-open'),
  discordPortalClose: () => ipcRenderer.invoke('discord-portal-close'),
  getTokenStatus: () => ipcRenderer.invoke('get-token-status'),
  saveDiscordToken: (token) => ipcRenderer.invoke('save-discord-token', token),
  validarTokenDiscord: (token) => ipcRenderer.invoke('validar-token-discord', token),
  onDiscordPortalClosed: (cb) => registerListener('discord-portal-closed', () => cb()),
  offDiscordPortalClosed: () => ipcRenderer.removeAllListeners('discord-portal-closed'),

  // ============================================================
  // LLAMA MANAGER
  // ============================================================
  llamaDetect: () => ipcRenderer.invoke('llama-detect'),
  llamaDownload: (buildTipo) => ipcRenderer.invoke('llama-download', buildTipo),
  llamaUninstall: () => ipcRenderer.invoke('llama-uninstall'),
  onLlamaDownloadStatus: (cb) => registerListener('llama-download-status', (_e, status) => cb(status)),
  offLlamaDownloadStatus: () => ipcRenderer.removeAllListeners('llama-download-status'),

  // ============================================================
  // AI PROVIDER (OpenAI-compatible)
  // ============================================================
  getAiConfig: () => ipcRenderer.invoke('get-ai-config'),
  saveAiConfig: (payload) => ipcRenderer.invoke('save-ai-config', payload),
  validateApiKey: (payload) => ipcRenderer.invoke('validate-api-key', payload),
  switchProvider: () => ipcRenderer.invoke('switch-provider'),

  // ============================================================
  // AUTO UPDATER
  // ============================================================
  checkForUpdates: () => ipcRenderer.invoke('update-check'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  getAppVersion: () => ipcRenderer.invoke('update-get-version'),
  onUpdateStatus: (cb) => registerListener('update-status', (_e, data) => cb(data)),
  offUpdateStatus: () => ipcRenderer.removeAllListeners('update-status'),

  toggleExtension: (filename, enabled) => ipcRenderer.invoke('toggle-extension', filename, enabled),
  listExtensions: () => ipcRenderer.invoke('list-extensions'),
  offLog: () => ipcRenderer.removeAllListeners('log'),
  offErrorLog: () => ipcRenderer.removeAllListeners('log-error'),
  offStatusUpdate: () => ipcRenderer.removeAllListeners('status-update'),
  offEngineStatus: () => ipcRenderer.removeAllListeners('engine-status'),
  offDownloadProgress: () => ipcRenderer.removeAllListeners('download-progress'),
  offDownloadComplete: () => ipcRenderer.removeAllListeners('download-complete'),
  offDownloadError: () => ipcRenderer.removeAllListeners('download-error'),
});