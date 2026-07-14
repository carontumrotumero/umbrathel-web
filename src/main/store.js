const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const ROOT_DIR = app.getPath('userData');
const PROFILES_FILE = path.join(ROOT_DIR, 'profiles.json');
const HISTORY_LIMIT = 500;

const PROFILE_COLORS = ['#0a84ff', '#ff375f', '#30d158', '#ff9f0a', '#bf5af2', '#64d2ff'];

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function deepMerge(base, extra) {
  if (Array.isArray(base) || Array.isArray(extra)) return extra !== undefined ? extra : base;
  if (typeof base === 'object' && base && typeof extra === 'object' && extra) {
    const out = { ...base };
    for (const key of Object.keys(extra)) out[key] = deepMerge(base[key], extra[key]);
    return out;
  }
  return extra !== undefined ? extra : base;
}

function profileDir(id) {
  return path.join(ROOT_DIR, 'profiles', id);
}

function partitionFor(id) {
  return `persist:umbrathel-${id}`;
}

// ---- Migración de datos de versiones anteriores (sin perfiles) hacia el
// perfil "default" recién creado ----

function migrateLegacyDataInto(profileId) {
  try {
    const dest = profileDir(profileId);
    // 1) Ficheros sueltos en la raíz de esta misma instalación (<0.5.0)
    for (const file of ['bookmarks.json', 'history.json', 'settings.json']) {
      const from = path.join(ROOT_DIR, file);
      const to = path.join(dest, file);
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.mkdirSync(dest, { recursive: true });
        fs.copyFileSync(from, to);
      }
    }
    const rootImages = path.join(ROOT_DIR, 'images');
    const destImages = path.join(dest, 'images');
    if (fs.existsSync(rootImages) && !fs.existsSync(destImages)) {
      fs.cpSync(rootImages, destImages, { recursive: true });
    }

    // 2) Directorios de datos de nombres de app anteriores ("Umbrathel web", "Navegador")
    for (const oldName of ['Umbrathel web', 'Navegador']) {
      const oldDir = path.join(path.dirname(ROOT_DIR), oldName);
      if (oldDir === ROOT_DIR || !fs.existsSync(oldDir)) continue;
      for (const file of ['bookmarks.json', 'history.json', 'settings.json']) {
        const from = path.join(oldDir, file);
        const to = path.join(dest, file);
        if (fs.existsSync(from) && !fs.existsSync(to)) {
          fs.mkdirSync(dest, { recursive: true });
          fs.copyFileSync(from, to);
        }
      }
      const oldImages = path.join(oldDir, 'images');
      if (fs.existsSync(oldImages) && !fs.existsSync(destImages)) {
        fs.cpSync(oldImages, destImages, { recursive: true });
      }
    }
  } catch {
    // la migración es best-effort
  }
}

// ---- Registro de perfiles ----

function loadRegistry() {
  const reg = readJson(PROFILES_FILE, null);
  if (reg && Array.isArray(reg.profiles) && reg.profiles.length > 0) return reg;

  const defaultProfile = { id: 'default', name: 'Principal', color: PROFILE_COLORS[0] };
  const fresh = { profiles: [defaultProfile], activeProfileId: 'default' };
  migrateLegacyDataInto('default');
  writeJson(PROFILES_FILE, fresh);
  return fresh;
}

function saveRegistry(reg) {
  writeJson(PROFILES_FILE, reg);
}

function listProfiles() {
  return loadRegistry().profiles;
}

function getActiveProfileId() {
  const reg = loadRegistry();
  if (!reg.profiles.some((p) => p.id === reg.activeProfileId)) {
    return reg.profiles[0].id;
  }
  return reg.activeProfileId;
}

function setActiveProfileId(id) {
  const reg = loadRegistry();
  if (!reg.profiles.some((p) => p.id === id)) return reg;
  reg.activeProfileId = id;
  saveRegistry(reg);
  return reg;
}

function createProfile(name) {
  const reg = loadRegistry();
  const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`;
  const color = PROFILE_COLORS[reg.profiles.length % PROFILE_COLORS.length];
  reg.profiles.push({ id, name: (name || 'Nuevo perfil').trim() || 'Nuevo perfil', color });
  saveRegistry(reg);
  return reg.profiles;
}

function renameProfile(id, name) {
  const reg = loadRegistry();
  const profile = reg.profiles.find((p) => p.id === id);
  if (profile && name && name.trim()) {
    profile.name = name.trim();
    saveRegistry(reg);
  }
  return reg.profiles;
}

function recolorProfile(id, color) {
  const reg = loadRegistry();
  const profile = reg.profiles.find((p) => p.id === id);
  if (profile && color) {
    profile.color = color;
    saveRegistry(reg);
  }
  return reg.profiles;
}

function deleteProfile(id) {
  const reg = loadRegistry();
  if (reg.profiles.length <= 1) return reg.profiles;
  reg.profiles = reg.profiles.filter((p) => p.id !== id);
  if (reg.activeProfileId === id) reg.activeProfileId = reg.profiles[0].id;
  saveRegistry(reg);
  try {
    fs.rmSync(profileDir(id), { recursive: true, force: true });
  } catch {
    // ignorar: el directorio puede no existir
  }
  return reg.profiles;
}

// ---- API con estado por perfil ----

const DEFAULT_SETTINGS = {
  // 'ask' | 'quit' | 'newtab'
  closeLastTab: 'ask',
  accent: '#0a84ff',
  // mode: 'glass' (por defecto) | 'colors'
  borders: { mode: 'glass', colors: ['#0a84ff', '#bf5af2'] },
  newtab: {
    // type: 'default' (escudo) | 'color' | 'gradient' | 'image'
    background: { type: 'default', color: '#16181f', from: '#16181f', to: '#1d1726', image: null },
    shortcuts: [
      { title: 'Google', url: 'https://www.google.com', icon: null },
      { title: 'YouTube', url: 'https://www.youtube.com', icon: null },
      { title: 'Wikipedia', url: 'https://es.wikipedia.org', icon: null },
      { title: 'GitHub', url: 'https://github.com', icon: null },
      { title: 'Reddit', url: 'https://www.reddit.com', icon: null },
    ],
    mcServers: [],
  },
  pinnedApps: [
    { id: 'discord', title: 'Discord', url: 'https://discord.com/app', icon: null, builtin: true },
  ],
  // Cuando Google (u otros) rechaza el login por exigir WebAuthn (llave de
  // seguridad / iCloud Keychain), que Electron no puede hacer: abrirlo en un
  // navegador de verdad en vez de dejar al usuario en un callejón sin salida.
  externalAuth: { enabled: true, browser: null },
};

const HISTORY_LIMIT_PER_PROFILE = HISTORY_LIMIT;

function forProfile(profileId) {
  const dir = profileDir(profileId);
  const BOOKMARKS_FILE = path.join(dir, 'bookmarks.json');
  const HISTORY_FILE = path.join(dir, 'history.json');
  const SETTINGS_FILE = path.join(dir, 'settings.json');
  const NOTES_FILE = path.join(dir, 'notes.json');
  const IMAGES_DIR = path.join(dir, 'images');

  function getBookmarks() {
    return readJson(BOOKMARKS_FILE, []);
  }

  function isBookmarked(url) {
    return getBookmarks().some((b) => b.url === url);
  }

  function addBookmark({ url, title }) {
    const bookmarks = getBookmarks();
    if (bookmarks.some((b) => b.url === url)) return bookmarks;
    bookmarks.unshift({ url, title: title || url, createdAt: Date.now() });
    writeJson(BOOKMARKS_FILE, bookmarks);
    return bookmarks;
  }

  function removeBookmark(url) {
    const bookmarks = getBookmarks().filter((b) => b.url !== url);
    writeJson(BOOKMARKS_FILE, bookmarks);
    return bookmarks;
  }

  function getHistory() {
    return readJson(HISTORY_FILE, []);
  }

  function addHistoryEntry({ url, title }) {
    if (!url || url.startsWith('about:') || url.startsWith('chrome-error://') || url.startsWith('file:'))
      return getHistory();
    const history = getHistory();
    history.unshift({ url, title: title || url, visitedAt: Date.now() });
    writeJson(HISTORY_FILE, history.slice(0, HISTORY_LIMIT_PER_PROFILE));
    return getHistory();
  }

  function clearHistory() {
    writeJson(HISTORY_FILE, []);
    return [];
  }

  function getSettings() {
    return deepMerge(DEFAULT_SETTINGS, readJson(SETTINGS_FILE, {}));
  }

  function saveSettings(partial) {
    const merged = deepMerge(getSettings(), partial);
    writeJson(SETTINGS_FILE, merged);
    return merged;
  }

  function getNotes() {
    return readJson(NOTES_FILE, []);
  }

  function saveNote(note) {
    const notes = getNotes();
    const idx = notes.findIndex((n) => n.id === note.id);
    const entry = {
      id: note.id || `n${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`,
      title: note.title || '',
      body: note.body || '',
      updatedAt: Date.now(),
    };
    if (idx >= 0) notes[idx] = entry;
    else notes.unshift(entry);
    writeJson(NOTES_FILE, notes);
    return notes;
  }

  function deleteNote(id) {
    const notes = getNotes().filter((n) => n.id !== id);
    writeJson(NOTES_FILE, notes);
    return notes;
  }

  return {
    id: profileId,
    dataDir: dir,
    imagesDir: IMAGES_DIR,
    getBookmarks,
    isBookmarked,
    addBookmark,
    removeBookmark,
    getHistory,
    addHistoryEntry,
    clearHistory,
    getSettings,
    saveSettings,
    getNotes,
    saveNote,
    deleteNote,
  };
}

module.exports = {
  listProfiles,
  getActiveProfileId,
  setActiveProfileId,
  createProfile,
  renameProfile,
  recolorProfile,
  deleteProfile,
  partitionFor,
  forProfile,
  PROFILE_COLORS,
};
