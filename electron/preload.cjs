// App (web) aur Windows ke beech chhota sa pul: theme ka rang, notification par window kholna
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('khrDesktop', {
  isDesktop: true,
  setTheme: (dark) => ipcRenderer.send('khr-theme', !!dark),
  // v11: background ke rang wali upar ki patti
  setBar: (color, dark) => ipcRenderer.send('khr-bar', { color: String(color || ''), dark: !!dark }),
  attention: () => ipcRenderer.send('khr-attention'),
  show: () => ipcRenderer.send('khr-show')
});
