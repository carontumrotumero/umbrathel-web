const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  shell,
  dialog,
  nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const store = require('./store');
const pkg = require('../../package.json');

const TOOLBAR_HEIGHT = 96;
const CONTENT_GAP = 10;
const CONTENT_RADIUS = 12;
const NEW_TAB_URL = pathToFileURL(path.join(__dirname, '..', 'renderer', 'newtab.html')).href;
const ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'icon.png');
const ICON_URL = pathToFileURL(ICON_PATH).href;
const GITHUB_REPO = (pkg.repository && pkg.repository.github) || '';

let win = null;
/** @type {Map<number, WebContentsView>} */
const tabs = new Map();
let activeTabId = null;
let nextTabId = 1;

function normalizeUrl(input) {
  const value = input.trim();
  if (!value) return NEW_TAB_URL;

  const looksLikeUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
  if (looksLikeUrl) return value;

  const looksLikeDomain =
    !/\s/.test(value) &&
    (/^localhost(:\d+)?(\/.*)?$/.test(value) ||
      /^[^\s]+\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/.test(value));

  if (looksLikeDomain) return `https://${value}`;

  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function sendToolbarUpdate() {
  if (!win || win.isDestroyed()) return;
  const list = [...tabs.entries()].map(([id, view]) => {
    const rawUrl = view.webContents.getURL();
    return {
      id,
      title: view.webContents.getTitle() || 'Nueva pestaña',
      url: rawUrl === NEW_TAB_URL ? '' : rawUrl,
      loading: view.webContents.isLoading(),
    };
  });
  const activeView = activeTabId ? tabs.get(activeTabId) : null;
  const activeWc = activeView ? activeView.webContents : null;
  win.webContents.send('tabs:state', {
    tabs: list,
    activeTabId,
    canGoBack: activeWc ? activeWc.navigationHistory.canGoBack() : false,
    canGoForward: activeWc ? activeWc.navigationHistory.canGoForward() : false,
    bookmarked: activeWc ? store.isBookmarked(activeWc.getURL()) : false,
  });
}

let contentHidden = false;

function layoutActiveView() {
  if (!win || win.isDestroyed() || !activeTabId) return;
  const view = tabs.get(activeTabId);
  if (!view) return;
  if (contentHidden) {
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }
  const bounds = win.getContentBounds();
  view.setBounds({
    x: CONTENT_GAP,
    y: TOOLBAR_HEIGHT,
    width: Math.max(0, bounds.width - CONTENT_GAP * 2),
    height: Math.max(0, bounds.height - TOOLBAR_HEIGHT - CONTENT_GAP),
  });
}

function setContentVisible(visible) {
  contentHidden = !visible;
  layoutActiveView();
}

function createTab(url = NEW_TAB_URL, { activate = true } = {}) {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'tab-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  const id = nextTabId++;
  tabs.set(id, view);

  if (typeof view.setBorderRadius === 'function') {
    view.setBorderRadius(CONTENT_RADIUS);
  }
  view.setBackgroundColor('#ffffffff');

  const wc = view.webContents;
  wc.on('did-start-loading', sendToolbarUpdate);
  wc.on('did-stop-loading', sendToolbarUpdate);
  wc.on('page-title-updated', sendToolbarUpdate);
  wc.on('did-navigate', () => {
    sendToolbarUpdate();
    store.addHistoryEntry({ url: wc.getURL(), title: wc.getTitle() });
  });
  wc.on('did-navigate-in-page', sendToolbarUpdate);
  wc.setWindowOpenHandler(({ url: targetUrl }) => {
    createTab(targetUrl);
    return { action: 'deny' };
  });

  wc.loadURL(url);

  if (activate) activateTab(id);
  sendToolbarUpdate();
  return id;
}

function activateTab(id) {
  const view = tabs.get(id);
  if (!view) return;
  for (const [otherId, otherView] of tabs) {
    if (otherId !== id) win.contentView.removeChildView(otherView);
  }
  win.contentView.addChildView(view);
  activeTabId = id;
  layoutActiveView();
  sendToolbarUpdate();
}

function destroyTab(id) {
  const view = tabs.get(id);
  if (!view) return;
  win.contentView.removeChildView(view);
  tabs.delete(id);
  if (activeTabId === id) activeTabId = null;
  view.webContents.close();
}

async function closeTab(id) {
  const view = tabs.get(id);
  if (!view) return;

  if (tabs.size === 1) {
    await handleLastTabClose(id);
    return;
  }

  const ids = [...tabs.keys()];
  const closingIndex = ids.indexOf(id);
  const wasActive = activeTabId === id;

  destroyTab(id);

  if (wasActive) {
    const remaining = [...tabs.keys()];
    const nextId = remaining[Math.min(closingIndex, remaining.length - 1)];
    activateTab(nextId);
  } else {
    sendToolbarUpdate();
  }
}

async function handleLastTabClose(id) {
  const pref = store.getSettings().closeLastTab;

  let action = pref; // 'quit' | 'newtab' | 'ask'
  if (pref === 'ask') {
    const { response, checkboxChecked } = await dialog.showMessageBox(win, {
      type: 'question',
      title: 'Última pestaña',
      message: 'Es la última pestaña abierta',
      detail: '¿Qué quieres hacer?',
      buttons: ['Cerrar navegador', 'Abrir pestaña de inicio', 'Cancelar'],
      defaultId: 1,
      cancelId: 2,
      checkboxLabel: 'Recordar mi elección',
      checkboxChecked: false,
    });

    if (response === 2) return; // Cancelar
    action = response === 0 ? 'quit' : 'newtab';
    if (checkboxChecked) {
      store.saveSettings({ closeLastTab: action });
      broadcastSettings();
    }
  }

  if (action === 'quit') {
    app.quit();
    return;
  }

  // 'newtab': crear la pestaña de inicio primero y cerrar la vieja después,
  // así nunca hay un estado sin pestañas.
  destroyTab(id);
  createTab(NEW_TAB_URL);
}

function getActiveWebContents() {
  if (!activeTabId) return null;
  const view = tabs.get(activeTabId);
  return view ? view.webContents : null;
}

function broadcastSettings() {
  const settings = store.getSettings();
  if (win && !win.isDestroyed()) win.webContents.send('settings:changed', settings);
  // Recargar las pestañas de inicio para que reflejen la nueva personalización
  for (const view of tabs.values()) {
    if (view.webContents.getURL() === NEW_TAB_URL) view.webContents.reload();
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 480,
    minHeight: 360,
    title: 'Umbrathel web',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.on('resize', layoutActiveView);
  win.on('closed', () => {
    win = null;
    tabs.clear();
    activeTabId = null;
  });

  win.webContents.on('did-finish-load', () => {
    if (tabs.size === 0) createTab();
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock && fs.existsSync(ICON_PATH)) {
    app.dock.setIcon(nativeImage.createFromPath(ICON_PATH));
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- Actualizaciones (GitHub Releases) ----

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function checkForUpdates() {
  if (!GITHUB_REPO) {
    return { ok: false, error: 'Repositorio no configurado', current: app.getVersion() };
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'User-Agent': 'umbrathel-web', Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: res.status === 404 ? 'Aún no hay versiones publicadas' : `HTTP ${res.status}`,
        current: app.getVersion(),
      };
    }
    const release = await res.json();
    const latest = String(release.tag_name || '').replace(/^v/, '');
    const current = app.getVersion();
    return {
      ok: true,
      current,
      latest,
      hasUpdate: latest !== '' && compareVersions(latest, current) > 0,
      url: release.html_url,
    };
  } catch (err) {
    return { ok: false, error: 'Sin conexión con GitHub', current: app.getVersion() };
  }
}

// ---- IPC ----

ipcMain.handle('tabs:new', (_e, url) => createTab(url ? normalizeUrl(url) : NEW_TAB_URL));
ipcMain.handle('tabs:close', (_e, id) => closeTab(id));
ipcMain.handle('tabs:activate', (_e, id) => activateTab(id));

ipcMain.handle('nav:go', (_e, input) => {
  const wc = getActiveWebContents();
  if (!wc) return;
  wc.loadURL(normalizeUrl(input));
});

ipcMain.handle('nav:back', () => {
  const wc = getActiveWebContents();
  if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
});

ipcMain.handle('nav:forward', () => {
  const wc = getActiveWebContents();
  if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
});

ipcMain.handle('nav:reload', () => {
  const wc = getActiveWebContents();
  if (wc) wc.reload();
});

ipcMain.handle('nav:stop', () => {
  const wc = getActiveWebContents();
  if (wc) wc.stop();
});

ipcMain.handle('bookmarks:list', () => store.getBookmarks());

ipcMain.handle('bookmarks:toggle', () => {
  const wc = getActiveWebContents();
  if (!wc) return store.getBookmarks();
  const url = wc.getURL();
  if (!url || url.startsWith('file:')) return store.getBookmarks();
  const result = store.isBookmarked(url)
    ? store.removeBookmark(url)
    : store.addBookmark({ url, title: wc.getTitle() });
  sendToolbarUpdate();
  return result;
});

ipcMain.handle('bookmarks:remove', (_e, url) => {
  const result = store.removeBookmark(url);
  sendToolbarUpdate();
  return result;
});

ipcMain.handle('history:list', () => store.getHistory());
ipcMain.handle('history:clear', () => store.clearHistory());

ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url));

ipcMain.handle('view:setContentVisible', (_e, visible) => setContentVisible(visible));

// ---- Personalización ----

ipcMain.handle('settings:get', () => store.getSettings());

ipcMain.handle('settings:set', (_e, partial) => {
  const merged = store.saveSettings(partial);
  broadcastSettings();
  return merged;
});

ipcMain.handle('settings:pickImage', async (_e, kind) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Elegir imagen',
    properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
  });
  if (canceled || filePaths.length === 0) return null;

  const src = filePaths[0];
  const destDir = path.join(store.DATA_DIR, 'images');
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(
    destDir,
    `${kind}-${Date.now()}${path.extname(src).toLowerCase() || '.png'}`
  );
  fs.copyFileSync(src, dest);
  return pathToFileURL(dest).href;
});

ipcMain.handle('updates:check', () => checkForUpdates());
ipcMain.handle('app:version', () => app.getVersion());

// API para la página de nueva pestaña (validada: solo responde a newtab.html)
ipcMain.handle('newtab:data', (event) => {
  if (event.senderFrame.url !== NEW_TAB_URL) return null;
  const settings = store.getSettings();
  return {
    newtab: settings.newtab,
    accent: settings.accent,
    iconUrl: fs.existsSync(ICON_PATH) ? ICON_URL : null,
  };
});
