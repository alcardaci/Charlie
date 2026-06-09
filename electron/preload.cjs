const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('charlie', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
});
