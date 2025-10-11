const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('clipAPI', {
  getHistory: () => ipcRenderer.invoke('get-history'),
  setClip: (item) => ipcRenderer.invoke('set-clip', item),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  onHistoryUpdated: (fn) => {
    const handler = (_e, data) => fn(data);
    ipcRenderer.on('history-updated', handler);
    return () => ipcRenderer.removeListener('history-updated', handler);
  },
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (payload) => ipcRenderer.invoke('set-settings', payload),
  onSettingsUpdated: (fn) => {
    const handler = (_e, data) => fn(data);
    ipcRenderer.on('settings-updated', handler);
    return () => ipcRenderer.removeListener('settings-updated', handler);
  }
});
