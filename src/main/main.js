const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  shell,
  dialog,
  nativeImage,
  session,
  Menu,
  MenuItem,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const store = require('./store');
const updater = require('./updater');

const TOOLBAR_HEIGHT = 96;
const CONTENT_GAP = 10;
const CONTENT_RADIUS = 12;
// Modo "compacto": panel acoplado estrecho, pensado para vistazos rápidos (voz, mapa…).
const DOCK_WIDTH = 400;
// Modo "amplio" (⌘⇧D): panel acoplado ancho para leer/escribir con comodidad.
const DOCK_WRITE_WIDTH = 760;
// Discord solo muestra el login con código QR cuando la página tiene ~896px+
// de ancho; por debajo la oculta y deja solo el formulario. Ensanchamos el
// panel automáticamente mientras cualquier app anclada esté en esa pantalla.
const DOCK_LOGIN_WIDTH = 960;
const LOGIN_WIDE_HOSTS = { 'discord.com': ['/login', '/register'] };
const NEW_TAB_URL = pathToFileURL(path.join(__dirname, '..', 'renderer', 'newtab.html')).href;
const ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'icon.png');
const ICON_URL = pathToFileURL(ICON_PATH).href;
const GROUP_COLORS = ['#ff375f', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#bf5af2'];

let win = null;

// ---- Estado de perfil activo ----
let activeProfile = null;
let activeStore = null;

function currentPartition() {
  return store.partitionFor(activeProfile.id);
}

/** @type {Map<number, WebContentsView>} */
const tabs = new Map();
let activeTabId = null;
let nextTabId = 1;
const tabGroupOf = new Map(); // tabId -> groupId
const tabGroups = new Map(); // groupId -> { id, name, color }
let nextGroupId = 1;

// Apps ancladas (Discord, Dynmap, wikis…): vistas persistentes que siguen
// vivas (voz incluida) aunque su panel esté oculto o se navegue por pestañas.
/** @type {Map<string, WebContentsView>} */
const pinnedViews = new Map();
let openPinnedIds = [];
const pinnedLoginWideIds = new Set();
let dockWriteMode = false;

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
      groupId: tabGroupOf.get(id) || null,
    };
  });
  const activeView = activeTabId ? tabs.get(activeTabId) : null;
  const activeWc = activeView ? activeView.webContents : null;
  win.webContents.send('tabs:state', {
    tabs: list,
    activeTabId,
    groups: [...tabGroups.values()],
    canGoBack: activeWc ? activeWc.navigationHistory.canGoBack() : false,
    canGoForward: activeWc ? activeWc.navigationHistory.canGoForward() : false,
    bookmarked: activeWc ? activeStore.isBookmarked(activeWc.getURL()) : false,
    openPinnedIds: [...openPinnedIds],
    pinnedActiveIds: [...pinnedViews.keys()],
    dockWriteMode,
  });
}

let contentHidden = false;

function layoutActiveView() {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getContentBounds();
  const contentHeight = Math.max(0, bounds.height - TOOLBAR_HEIGHT - CONTENT_GAP);
  const anyLoginWide = openPinnedIds.some((id) => pinnedLoginWideIds.has(id));
  const dockWidth = anyLoginWide ? DOCK_LOGIN_WIDTH : dockWriteMode ? DOCK_WRITE_WIDTH : DOCK_WIDTH;
  const dockSpace = openPinnedIds.length > 0 ? dockWidth + CONTENT_GAP : 0;

  if (openPinnedIds.length > 0) {
    const n = openPinnedIds.length;
    const each = Math.max(0, Math.floor((contentHeight - CONTENT_GAP * (n - 1)) / n));
    openPinnedIds.forEach((id, i) => {
      const view = pinnedViews.get(id);
      if (!view) return;
      view.setBounds(
        contentHidden
          ? { x: 0, y: 0, width: 0, height: 0 }
          : {
              x: Math.max(0, bounds.width - CONTENT_GAP - dockWidth),
              y: TOOLBAR_HEIGHT + i * (each + CONTENT_GAP),
              width: Math.min(dockWidth, Math.max(0, bounds.width - CONTENT_GAP * 2)),
              height: each,
            }
      );
    });
  }

  const view = activeTabId ? tabs.get(activeTabId) : null;
  if (!view) return;
  if (contentHidden) {
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }
  view.setBounds({
    x: CONTENT_GAP,
    y: TOOLBAR_HEIGHT,
    width: Math.max(0, bounds.width - CONTENT_GAP * 2 - dockSpace),
    height: contentHeight,
  });
}

function setContentVisible(visible) {
  contentHidden = !visible;
  layoutActiveView();
  // Al abrir un panel (marcadores, notas…) las vistas nativas ancladas quedan
  // con tamaño cero pero pueden conservar el foco de teclado (son NSView/
  // WebContentsView aparte), dejando el panel sordo a Escape y demás atajos.
  // Forzamos el primer respondedor de vuelta a la ventana base en ambos
  // niveles (BrowserWindow y su webContents).
  if (contentHidden && win && !win.isDestroyed()) {
    win.focus();
    win.webContents.focus();
  }
}

function createTab(url = NEW_TAB_URL, { activate = true } = {}) {
  ensureSessionCompatHooks(currentPartition());
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'tab-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      partition: currentPartition(),
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
    activeStore.addHistoryEntry({ url: wc.getURL(), title: wc.getTitle() });
  });
  wc.on('did-navigate-in-page', sendToolbarUpdate);
  wc.setWindowOpenHandler(({ url: targetUrl }) => {
    createTab(targetUrl);
    return { action: 'deny' };
  });
  setupExternalAuthRedirect(wc);

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
  tabGroupOf.delete(id);
  cleanupEmptyGroups();
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
  const pref = activeStore.getSettings().closeLastTab;

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
      activeStore.saveSettings({ closeLastTab: action });
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

// ---- Grupos de pestañas ----

function cleanupEmptyGroups() {
  const used = new Set(tabGroupOf.values());
  for (const id of [...tabGroups.keys()]) {
    if (!used.has(id)) tabGroups.delete(id);
  }
}

function showTabContextMenu(tabId) {
  if (!tabs.has(tabId)) return;
  const menu = new Menu();
  const currentGroupId = tabGroupOf.get(tabId);

  menu.append(
    new MenuItem({
      label: 'Nuevo grupo con esta pestaña',
      click: () => {
        const id = `g${nextGroupId++}`;
        const color = GROUP_COLORS[tabGroups.size % GROUP_COLORS.length];
        tabGroups.set(id, { id, name: 'Nuevo grupo', color });
        tabGroupOf.set(tabId, id);
        sendToolbarUpdate();
      },
    })
  );

  if (tabGroups.size > 0) {
    const submenu = new Menu();
    for (const g of tabGroups.values()) {
      if (g.id === currentGroupId) continue;
      submenu.append(
        new MenuItem({
          label: g.name,
          click: () => {
            tabGroupOf.set(tabId, g.id);
            sendToolbarUpdate();
          },
        })
      );
    }
    if (submenu.items.length > 0) {
      menu.append(new MenuItem({ label: 'Añadir a grupo existente', submenu }));
    }
  }

  if (currentGroupId) {
    menu.append(
      new MenuItem({
        label: 'Quitar del grupo',
        click: () => {
          tabGroupOf.delete(tabId);
          cleanupEmptyGroups();
          sendToolbarUpdate();
        },
      })
    );
  }

  menu.append(new MenuItem({ type: 'separator' }));
  menu.append(new MenuItem({ label: 'Cerrar pestaña', click: () => closeTab(tabId) }));

  menu.popup({ window: win });
}

// ---- Apps ancladas (panel acoplado generalizado) ----

function findPinnedConfig(id) {
  const settings = activeStore.getSettings();
  return (settings.pinnedApps || []).find((a) => a.id === id) || null;
}

function checkLoginWide(id, wc) {
  try {
    const { hostname, pathname } = new URL(wc.getURL());
    const authPaths = LOGIN_WIDE_HOSTS[hostname.replace(/^www\./, '')];
    const isWide = !!authPaths && authPaths.includes(pathname);
    if (isWide) pinnedLoginWideIds.add(id);
    else pinnedLoginWideIds.delete(id);
    layoutActiveView();
  } catch {
    // URL inválida (about:blank durante la carga inicial): ignorar
  }
}

function ensurePinnedView(id) {
  if (pinnedViews.has(id)) return pinnedViews.get(id);
  const config = findPinnedConfig(id);
  if (!config) return null;

  ensureSessionCompatHooks(currentPartition());
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      partition: currentPartition(),
    },
  });
  pinnedViews.set(id, view);

  if (typeof view.setBorderRadius === 'function') view.setBorderRadius(CONTENT_RADIUS);
  view.setBackgroundColor('#ff1c1d21');

  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    createTab(url);
    return { action: 'deny' };
  });
  wc.on('did-navigate', () => checkLoginWide(id, wc));
  wc.on('did-navigate-in-page', () => checkLoginWide(id, wc));
  setupExternalAuthRedirect(wc);
  wc.loadURL(config.url);

  return view;
}

function togglePinnedApp(id) {
  const idx = openPinnedIds.indexOf(id);
  if (idx >= 0) {
    openPinnedIds.splice(idx, 1);
    const view = pinnedViews.get(id);
    if (view) win.contentView.removeChildView(view);
  } else {
    const view = ensurePinnedView(id);
    if (!view) return;
    openPinnedIds.push(id);
    win.contentView.addChildView(view);
  }
  layoutActiveView();
  sendToolbarUpdate();
}

function destroyAllPinnedViews() {
  for (const id of openPinnedIds) {
    const view = pinnedViews.get(id);
    if (view) win.contentView.removeChildView(view);
  }
  for (const view of pinnedViews.values()) view.webContents.close();
  pinnedViews.clear();
  openPinnedIds = [];
  pinnedLoginWideIds.clear();
}

function toggleDockWidth() {
  if (openPinnedIds.length === 0) return;
  dockWriteMode = !dockWriteMode;
  layoutActiveView();
  sendToolbarUpdate();
}

function broadcastSettings() {
  const settings = activeStore.getSettings();
  if (win && !win.isDestroyed()) win.webContents.send('settings:changed', settings);
  // Recargar las pestañas de inicio para que reflejen la nueva personalización
  for (const view of tabs.values()) {
    if (view.webContents.getURL() === NEW_TAB_URL) view.webContents.reload();
  }
}

// ---- Perfiles ----

function sendProfilesState() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('profiles:state', {
    profiles: store.listProfiles(),
    activeProfileId: activeProfile.id,
  });
}

function loadActiveProfile() {
  const id = store.getActiveProfileId();
  activeProfile = store.listProfiles().find((p) => p.id === id) || store.listProfiles()[0];
  activeStore = store.forProfile(activeProfile.id);
}

function switchProfile(id) {
  if (!store.listProfiles().some((p) => p.id === id) || id === activeProfile.id) return;
  store.setActiveProfileId(id);
  loadActiveProfile();

  for (const view of tabs.values()) {
    win.contentView.removeChildView(view);
    view.webContents.close();
  }
  tabs.clear();
  activeTabId = null;
  tabGroupOf.clear();
  tabGroups.clear();

  destroyAllPinnedViews();

  createTab(NEW_TAB_URL);
  broadcastSettings();
  sendProfilesState();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 480,
    minHeight: 360,
    title: 'Umbrathel Web',
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

  if (process.platform !== 'darwin') updater.setupAutoUpdater(win);

  win.on('resize', layoutActiveView);
  win.on('closed', () => {
    win = null;
    tabs.clear();
    activeTabId = null;
    pinnedViews.clear();
    openPinnedIds = [];
  });

  win.webContents.on('did-finish-load', () => {
    if (tabs.size === 0) createTab();
  });
}

function setupWebAuthn() {
  // Touch ID / passkeys (Secure Enclave): Apple exige que la app esté firmada
  // con un Team ID y el entitlement keychain-access-groups. Solo se activa si
  // hay Team ID configurado (UMBRATHEL_TEAM_ID o build firmado).
  const teamId = process.env.UMBRATHEL_TEAM_ID || '';
  if (process.platform === 'darwin' && teamId && typeof app.configureWebAuthn === 'function') {
    try {
      app.configureWebAuthn({
        touchID: { keychainAccessGroup: `${teamId}.com.umbrathel.web.webauthn` },
      });
    } catch (err) {
      console.warn('WebAuthn Touch ID no disponible:', err.message);
    }
  }
}

function setupWebAuthnAccountPicker(ses) {
  // Cuando un sitio pide una credencial y hay varias en la llave de seguridad,
  // Chromium necesita que el navegador muestre un selector. Sin este handler la
  // petición se cancela en silencio y parece que "no funciona".
  if (!ses.listenerCount || ses.listenerCount('select-webauthn-account') > 0) return;
  ses.on('select-webauthn-account', (event, details, callback) => {
    const accounts = details.accounts || [];
    if (accounts.length === 0) {
      callback();
      return;
    }
    if (accounts.length === 1) {
      callback(accounts[0].credentialId);
      return;
    }
    const labels = accounts.map((a) => a.userName || a.userDisplayName || 'Cuenta');
    dialog
      .showMessageBox(win, {
        type: 'question',
        title: 'Llave de seguridad',
        message: 'Elige la cuenta para identificarte',
        buttons: [...labels, 'Cancelar'],
        cancelId: accounts.length,
      })
      .then(({ response }) => {
        if (response >= 0 && response < accounts.length) {
          callback(accounts[response].credentialId);
        } else {
          callback();
        }
      })
      .catch(() => callback());
  });
}

// ---- Login externo para cuentas con llave de seguridad / passkey ----
//
// Electron no implementa el ciclo de WebAuthn (navigator.credentials), así
// que las cuentas de Google que EXIGEN llave de seguridad o iCloud Keychain
// (sin opción de solo contraseña) nunca podrán completar el login dentro de
// la app — Google directamente redirige a una página de rechazo. En vez de
// dejar al usuario en un callejón sin salida, detectamos esa página y
// abrimos el login en un navegador de verdad, donde WebAuthn sí funciona.
//
// Importante: esto NO trae la sesión de vuelta a Umbrathel Web (eso exigiría
// leer el almacén de cookies de otra app, que está fuera de lo que se puede
// hacer aquí) — el usuario completa el login en la ventana externa y sigue
// usando esa cuenta ahí para lo que la necesite.

const KNOWN_BROWSERS = [
  { name: 'Safari', path: '/Applications/Safari.app' },
  { name: 'Google Chrome', path: '/Applications/Google Chrome.app' },
  { name: 'Microsoft Edge', path: '/Applications/Microsoft Edge.app' },
  { name: 'Brave Browser', path: '/Applications/Brave Browser.app' },
  { name: 'Vivaldi', path: '/Applications/Vivaldi.app' },
  { name: 'Opera', path: '/Applications/Opera.app' },
  { name: 'Arc', path: '/Applications/Arc.app' },
  { name: 'Firefox', path: '/Applications/Firefox.app' },
];

function detectInstalledBrowsers() {
  if (process.platform !== 'darwin') {
    // Windows/Linux: sin detección específica todavía, solo el navegador
    // predeterminado del sistema vía shell.openExternal.
    return [];
  }
  return KNOWN_BROWSERS.filter((b) => fs.existsSync(b.path));
}

function openInExternalBrowser(url, browserName) {
  const browsers = detectInstalledBrowsers();
  const target = browsers.find((b) => b.name === browserName) || browsers[0];

  if (process.platform !== 'darwin' || !target) {
    shell.openExternal(url);
    return;
  }

  // "open -a <App> <url>" es el mecanismo estándar de macOS para "abre esta
  // URL con esta app" (lo mismo que hace Finder) — funciona tanto si el
  // navegador ya está abierto como si no. La alternativa con --args --app=
  // (ventana sin pestañas, estilo popup) solo respeta la URL al LANZAR el
  // proceso desde cero: si el navegador ya estaba abierto, macOS se limita a
  // traerlo al frente e ignora la URL por completo — así que se descarta esa
  // vía en favor de que el login se abra siempre de verdad.
  execFile('open', ['-a', target.name, url], (err) => {
    if (err) shell.openExternal(url); // último recurso si algo falla
  });
}

function isGoogleRejectedSignin(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'accounts.google.com' && u.pathname.includes('/signin/rejected');
  } catch {
    return false;
  }
}

function extractContinueUrl(rejectedUrl) {
  try {
    return new URL(rejectedUrl).searchParams.get('continue') || 'https://accounts.google.com/';
  } catch {
    return 'https://accounts.google.com/';
  }
}

function setupExternalAuthRedirect(wc) {
  let lastHandledUrl = null;

  const handle = () => {
    const url = wc.getURL();
    if (!isGoogleRejectedSignin(url)) return;
    if (url === lastHandledUrl) return; // did-navigate y did-navigate-in-page pueden coincidir
    lastHandledUrl = url;

    const settings = activeStore.getSettings();
    if (!settings.externalAuth || !settings.externalAuth.enabled) return;

    const continueUrl = extractContinueUrl(url);
    openInExternalBrowser(continueUrl, settings.externalAuth.browser);

    // Dejar la pestaña en un estado limpio en vez del callejón sin salida
    if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else wc.loadURL(NEW_TAB_URL);

    const browsers = detectInstalledBrowsers();
    const usedName =
      (browsers.find((b) => b.name === settings.externalAuth.browser) || browsers[0] || {}).name ||
      'tu navegador';
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Login abierto en otro navegador',
      message: `Esta cuenta exige llave de seguridad o passkey, algo que Umbrathel Web todavía no soporta.`,
      detail: `Se abrió el inicio de sesión en ${usedName}. Complétalo ahí y vuelve cuando termines.`,
    });
  };

  // Google reescribe a la página de rechazo tanto con una navegación
  // completa como, en algunas variantes, con enrutado en el cliente (SPA) —
  // hay que vigilar los dos tipos de evento para no perderla.
  wc.on('did-navigate', handle);
  wc.on('did-navigate-in-page', handle);
}

// Chromium (no "Google Chrome") es lo que Electron trae de fábrica. Sitios
// como accounts.google.com bloquean el login ("This browser or app may not
// be secure") en cuanto detectan un user-agent embebido: comprueban tanto la
// cabecera User-Agent como los Client Hints (Sec-CH-UA), y estos últimos por
// defecto solo listan "Chromium", nunca "Google Chrome". Lo mismo hacen
// Brave, Vivaldi u Opera para que Google los acepte como navegador válido.
const CHROME_MAJOR = process.versions.chrome.split('.')[0];

function platformClientHint() {
  if (process.platform === 'darwin') return '"macOS"';
  if (process.platform === 'win32') return '"Windows"';
  return '"Linux"';
}

function setupBrowserCompatSpoofing(ses) {
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (/^https?:/.test(details.url)) {
      details.requestHeaders['sec-ch-ua'] =
        `"Not)A;Brand";v="8", "Chromium";v="${CHROME_MAJOR}", "Google Chrome";v="${CHROME_MAJOR}"`;
      details.requestHeaders['sec-ch-ua-mobile'] = '?0';
      details.requestHeaders['sec-ch-ua-platform'] = platformClientHint();
    }
    callback({ requestHeaders: details.requestHeaders });
  });
}

// Cada perfil navega en su propia partition/Session (aislamiento de cookies),
// no en session.defaultSession — así que los hooks de compatibilidad hay que
// aplicarlos por partition, no una sola vez al arrancar. Memoizado para no
// registrar el mismo listener dos veces si se llama varias veces.
const hookedPartitions = new Set();

function ensureSessionCompatHooks(partitionName) {
  if (hookedPartitions.has(partitionName)) return;
  hookedPartitions.add(partitionName);
  const ses = session.fromPartition(partitionName);
  setupBrowserCompatSpoofing(ses);
  setupWebAuthnAccountPicker(ses);
}

app.whenReady().then(() => {
  // UA sin las marcas de Electron: evita que Discord, Google y otros
  // servicios bloqueen el navegador por "no soportado".
  app.userAgentFallback = app.userAgentFallback
    .replace(/\sElectron\/[\d.]+/, '')
    .replace(/\sUmbrathel[- ]?[Ww]eb\/[\d.]+/, '');

  setupWebAuthn();

  if (process.platform === 'darwin' && app.dock && fs.existsSync(ICON_PATH)) {
    app.dock.setIcon(nativeImage.createFromPath(ICON_PATH));
  }

  loadActiveProfile();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC ----

ipcMain.handle('tabs:new', (_e, url) => createTab(url ? normalizeUrl(url) : NEW_TAB_URL));
ipcMain.handle('tabs:close', (_e, id) => closeTab(id));
ipcMain.handle('tabs:activate', (_e, id) => activateTab(id));
ipcMain.handle('tabs:contextMenu', (_e, id) => showTabContextMenu(id));
ipcMain.handle('tabs:renameGroup', (_e, { groupId, name }) => {
  const group = tabGroups.get(groupId);
  if (group && name && name.trim()) {
    group.name = name.trim();
    sendToolbarUpdate();
  }
});

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

ipcMain.handle('bookmarks:list', () => activeStore.getBookmarks());

ipcMain.handle('bookmarks:toggle', () => {
  const wc = getActiveWebContents();
  if (!wc) return activeStore.getBookmarks();
  const url = wc.getURL();
  if (!url || url.startsWith('file:')) return activeStore.getBookmarks();
  const result = activeStore.isBookmarked(url)
    ? activeStore.removeBookmark(url)
    : activeStore.addBookmark({ url, title: wc.getTitle() });
  sendToolbarUpdate();
  return result;
});

ipcMain.handle('bookmarks:remove', (_e, url) => {
  const result = activeStore.removeBookmark(url);
  sendToolbarUpdate();
  return result;
});

ipcMain.handle('history:list', () => activeStore.getHistory());
ipcMain.handle('history:clear', () => activeStore.clearHistory());

ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url));

ipcMain.handle('view:setContentVisible', (_e, visible) => setContentVisible(visible));

ipcMain.handle('pinned:toggle', (_e, id) => togglePinnedApp(id));
ipcMain.handle('pinned:toggleWidth', () => toggleDockWidth());

// ---- Notas ----

ipcMain.handle('notes:list', () => activeStore.getNotes());
ipcMain.handle('notes:save', (_e, note) => activeStore.saveNote(note));
ipcMain.handle('notes:delete', (_e, id) => activeStore.deleteNote(id));

// ---- Servidores de Minecraft ----

ipcMain.handle('mcservers:status', async (_e, address) => {
  try {
    const res = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`, {
      headers: { 'User-Agent': 'umbrathel-web' },
    });
    if (!res.ok) return { online: false };
    const data = await res.json();
    return {
      online: !!data.online,
      players: data.players ? data.players.online : null,
      maxPlayers: data.players ? data.players.max : null,
      motd: data.motd && data.motd.clean ? data.motd.clean.join(' ') : '',
      version: data.version || '',
    };
  } catch {
    return { online: false };
  }
});

// ---- Perfiles ----

ipcMain.handle('profiles:list', () => ({
  profiles: store.listProfiles(),
  activeProfileId: activeProfile.id,
}));
ipcMain.handle('profiles:switch', (_e, id) => switchProfile(id));
ipcMain.handle('profiles:create', (_e, name) => {
  const profiles = store.createProfile(name);
  sendProfilesState();
  return profiles;
});
ipcMain.handle('profiles:rename', (_e, { id, name }) => {
  const profiles = store.renameProfile(id, name);
  sendProfilesState();
  return profiles;
});
ipcMain.handle('profiles:recolor', (_e, { id, color }) => {
  const profiles = store.recolorProfile(id, color);
  sendProfilesState();
  return profiles;
});
ipcMain.handle('profiles:delete', (_e, id) => {
  const wasActive = id === activeProfile.id;
  const profiles = store.deleteProfile(id);
  if (wasActive) switchProfile(store.getActiveProfileId());
  else sendProfilesState();
  return profiles;
});

// ---- Personalización ----

ipcMain.handle('settings:get', () => activeStore.getSettings());

ipcMain.handle('settings:set', (_e, partial) => {
  const merged = activeStore.saveSettings(partial);
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
  const destDir = activeStore.imagesDir;
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(
    destDir,
    `${kind}-${Date.now()}${path.extname(src).toLowerCase() || '.png'}`
  );
  fs.copyFileSync(src, dest);
  return pathToFileURL(dest).href;
});

ipcMain.handle('externalAuth:listBrowsers', () => detectInstalledBrowsers().map((b) => b.name));

ipcMain.handle('updates:check', () => updater.checkForUpdates());
ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('updates:start', () => {
  if (process.platform === 'darwin') {
    updater.startMacUpdate(win);
  } else {
    updater.startNativeUpdate();
  }
});
ipcMain.handle('updates:install', () => updater.installNativeUpdate());
ipcMain.handle('updates:openMacInstaller', (_e, filePath) => updater.openMacInstaller(filePath));

// API para la página de nueva pestaña (validada: solo responde a newtab.html)
ipcMain.handle('newtab:data', (event) => {
  if (event.senderFrame.url !== NEW_TAB_URL) return null;
  const settings = activeStore.getSettings();
  return {
    newtab: settings.newtab,
    accent: settings.accent,
    iconUrl: fs.existsSync(ICON_PATH) ? ICON_URL : null,
  };
});
