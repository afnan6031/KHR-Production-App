// App (web) aur Windows ke beech chhota sa pul: theme ka rang, notification par window kholna
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('khrDesktop', {
  isDesktop: true,
  setTheme: (dark) => ipcRenderer.send('khr-theme', !!dark),
  // v11: background ke rang wali upar ki patti
  setBar: (color, dark) => ipcRenderer.send('khr-bar', { color: String(color || ''), dark: !!dark }),
  attention: () => ipcRenderer.send('khr-attention'),
  show: () => ipcRenderer.send('khr-show'),
  // v16: Pixeldrain upload app ke andar se (progress ke saath) + offline download
  pdUpload: (o) => ipcRenderer.invoke('khr-pd-upload', o),
  // chuni hui file ka PC par rasta (bari video disk se seedhi upload)
  pathOf: (file) => { try { return (webUtils && webUtils.getPathForFile(file)) || ''; } catch { return ''; } },
  pdCancel: (id) => ipcRenderer.send('khr-pd-cancel', String(id)),
  onPdProgress: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('khr-pd-progress', h);
    return () => ipcRenderer.removeListener('khr-pd-progress', h);
  },
  fetchBytes: (url) => ipcRenderer.invoke('khr-fetch-bytes', url)
});
