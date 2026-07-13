const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DATA_DIR = app.getPath('userData');
const BOOKMARKS_FILE = path.join(DATA_DIR, 'bookmarks.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const HISTORY_LIMIT = 500;

// Migración desde el directorio de datos anterior ("Navegador")
(function migrateOldData() {
  try {
    const oldDir = path.join(path.dirname(DATA_DIR), 'Navegador');
    if (!fs.existsSync(oldDir)) return;
    for (const file of ['bookmarks.json', 'history.json']) {
      const from = path.join(oldDir, file);
      const to = path.join(DATA_DIR, file);
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.copyFileSync(from, to);
      }
    }
  } catch {
    // la migración es best-effort
  }
})();

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
  },
};

function deepMerge(base, extra) {
  if (Array.isArray(base) || Array.isArray(extra)) return extra !== undefined ? extra : base;
  if (typeof base === 'object' && base && typeof extra === 'object' && extra) {
    const out = { ...base };
    for (const key of Object.keys(extra)) out[key] = deepMerge(base[key], extra[key]);
    return out;
  }
  return extra !== undefined ? extra : base;
}

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
  writeJson(HISTORY_FILE, history.slice(0, HISTORY_LIMIT));
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

module.exports = {
  getBookmarks,
  isBookmarked,
  addBookmark,
  removeBookmark,
  getHistory,
  addHistoryEntry,
  clearHistory,
  getSettings,
  saveSettings,
  DATA_DIR,
};
