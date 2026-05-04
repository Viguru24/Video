const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-min'),
  maximize: () => ipcRenderer.send('window-max'),
  close: () => ipcRenderer.send('window-close'),
  getFolderVideos: (filePath) => ipcRenderer.invoke('get-folder-videos', filePath),
  openFolder: (filePath) => ipcRenderer.send('open-folder', filePath),
  setAlwaysOnTop: (flag) => ipcRenderer.send('set-always-on-top', flag),
  saveSnapshot: (data) => ipcRenderer.invoke('save-snapshot', data),
  popOut: (data) => ipcRenderer.send('pop-out', data),
  selectFolder: () => ipcRenderer.invoke('select-folder')
});
