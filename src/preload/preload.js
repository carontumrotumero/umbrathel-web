const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  newTab: (url) => ipcRenderer.invoke('tabs:new', url),
  closeTab: (id) => ipcRenderer.invoke('tabs:close', id),
  activateTab: (id) => ipcRenderer.invoke('tabs:activate', id),

  go: (input) => ipcRenderer.invoke('nav:go', input),
  back: () => ipcRenderer.invoke('nav:back'),
  forward: () => ipcRenderer.invoke('nav:forward'),
  reload: () => ipcRenderer.invoke('nav:reload'),
  stop: () => ipcRenderer.invoke('nav:stop'),

  listBookmarks: () => ipcRenderer.invoke('bookmarks:list'),
  toggleBookmark: () => ipcRenderer.invoke('bookmarks:toggle'),
  removeBookmark: (url) => ipcRenderer.invoke('bookmarks:remove', url),

  listHistory: () => ipcRenderer.invoke('history:list'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  setContentVisible: (visible) => ipcRenderer.invoke('view:setContentVisible', visible),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  pickImage: (kind) => ipcRenderer.invoke('settings:pickImage', kind),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  getVersion: () => ipcRenderer.invoke('app:version'),

  onSettingsChanged: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on('settings:changed', listener);
    return () => ipcRenderer.removeListener('settings:changed', listener);
  },

  onTabsState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('tabs:state', listener);
    return () => ipcRenderer.removeListener('tabs:state', listener);
  },
});
