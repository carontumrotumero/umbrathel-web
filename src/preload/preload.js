const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  newTab: (url) => ipcRenderer.invoke('tabs:new', url),
  closeTab: (id) => ipcRenderer.invoke('tabs:close', id),
  activateTab: (id) => ipcRenderer.invoke('tabs:activate', id),
  tabContextMenu: (id) => ipcRenderer.invoke('tabs:contextMenu', id),
  renameGroup: (groupId, name) => ipcRenderer.invoke('tabs:renameGroup', { groupId, name }),

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

  togglePinned: (id) => ipcRenderer.invoke('pinned:toggle', id),
  toggleDockWidth: () => ipcRenderer.invoke('pinned:toggleWidth'),

  listNotes: () => ipcRenderer.invoke('notes:list'),
  saveNote: (note) => ipcRenderer.invoke('notes:save', note),
  deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),

  mcServerStatus: (address) => ipcRenderer.invoke('mcservers:status', address),

  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  switchProfile: (id) => ipcRenderer.invoke('profiles:switch', id),
  createProfile: (name) => ipcRenderer.invoke('profiles:create', name),
  renameProfile: (id, name) => ipcRenderer.invoke('profiles:rename', { id, name }),
  recolorProfile: (id, color) => ipcRenderer.invoke('profiles:recolor', { id, color }),
  deleteProfile: (id) => ipcRenderer.invoke('profiles:delete', id),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  pickImage: (kind) => ipcRenderer.invoke('settings:pickImage', kind),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  startUpdate: () => ipcRenderer.invoke('updates:start'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  openMacInstaller: (filePath) => ipcRenderer.invoke('updates:openMacInstaller', filePath),
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:version'),

  onSettingsChanged: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on('settings:changed', listener);
    return () => ipcRenderer.removeListener('settings:changed', listener);
  },

  onUpdateProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },

  onTabsState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('tabs:state', listener);
    return () => ipcRenderer.removeListener('tabs:state', listener);
  },

  onProfilesState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('profiles:state', listener);
    return () => ipcRenderer.removeListener('profiles:state', listener);
  },
});
