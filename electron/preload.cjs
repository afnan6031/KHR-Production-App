// App (web) aur Windows ke beech chhota sa pul: theme ka rang, notification par window kholna
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('khrDesktop', {
  isDesktop: true,
  setTheme: (dark) => ipcRenderer.send('khr-theme', !!dark),
  // v11: background ke rang wali upar ki patti
  setBar: (color, dark) => ipcRenderer.send('khr-bar', { color: String(color || ''), dark: !!dark }),
  attention: () => ipcRenderer.send('khr-attention'),
  show: () => ipcRenderer.send('khr-show'),
  // v13: Catbox upload / download app ke andar se (browser ki CORS / Origin rukawat nahi)
  catboxUpload: (bytes, name, type, userhash) => ipcRenderer.invoke('khr-catbox-upload', { bytes, name, type, userhash }),
  fetchBytes: (url) => ipcRenderer.invoke('khr-fetch-bytes', url)
});
