const { contextBridge, ipcRenderer } = require('electron');

// API mínima para la página de nueva pestaña. El proceso principal valida
// que quien llama sea exactamente newtab.html; en cualquier web devuelve null.
if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('umbrathel', {
    getNewTabData: () => ipcRenderer.invoke('newtab:data'),
    checkMcServer: (address) => ipcRenderer.invoke('mcservers:status', address),
  });
}
