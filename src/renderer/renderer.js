const tabsEl = document.getElementById('tabs');
const newTabBtn = document.getElementById('new-tab-btn');

const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const addressForm = document.getElementById('address-form');
const addressInput = document.getElementById('address-input');
const bookmarkBtn = document.getElementById('bookmark-btn');
const bookmarksBtn = document.getElementById('bookmarks-btn');
const historyBtn = document.getElementById('history-btn');

const bookmarksPanel = document.getElementById('bookmarks-panel');
const bookmarksList = document.getElementById('bookmarks-list');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

let addressFocused = false;
let knownTabIds = new Set();

function renderTabs(state) {
  tabsEl.innerHTML = '';
  const currentIds = new Set();
  for (const tab of state.tabs) {
    currentIds.add(tab.id);
    const isNew = !knownTabIds.has(tab.id);

    const el = document.createElement('div');
    el.className =
      'tab' + (tab.id === state.activeTabId ? ' active' : '') + (isNew ? ' tab-in' : '');
    el.title = tab.url;

    if (tab.loading) {
      const spinner = document.createElement('span');
      spinner.className = 'tab-spinner';
      el.appendChild(spinner);
    }

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || tab.url || 'Nueva pestaña';

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.textContent = '×';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      window.api.closeTab(tab.id);
    });

    el.appendChild(title);
    el.appendChild(close);
    el.addEventListener('click', () => window.api.activateTab(tab.id));
    tabsEl.appendChild(el);
  }
  knownTabIds = currentIds;
}

const progressBar = document.getElementById('progress-bar');

function renderToolbar(state) {
  backBtn.disabled = !state.canGoBack;
  forwardBtn.disabled = !state.canGoForward;

  const activeLoading = state.tabs.some((t) => t.id === state.activeTabId && t.loading);
  progressBar.classList.toggle('loading', activeLoading);

  bookmarkBtn.classList.toggle('active-toggle', !!state.bookmarked);
  bookmarkBtn.textContent = state.bookmarked ? '★' : '☆';

  if (!addressFocused) {
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    addressInput.value = activeTab ? activeTab.url : '';
  }
}

window.api.onTabsState((state) => {
  renderTabs(state);
  renderToolbar(state);
});

newTabBtn.addEventListener('click', () => window.api.newTab());

backBtn.addEventListener('click', () => window.api.back());
forwardBtn.addEventListener('click', () => window.api.forward());
reloadBtn.addEventListener('click', () => window.api.reload());

addressInput.addEventListener('focus', () => {
  addressFocused = true;
  addressInput.select();
});
addressInput.addEventListener('blur', () => {
  addressFocused = false;
});

addressForm.addEventListener('submit', (e) => {
  e.preventDefault();
  window.api.go(addressInput.value);
  addressInput.blur();
});

bookmarkBtn.addEventListener('click', () => window.api.toggleBookmark());

const settingsPanel = document.getElementById('settings-panel');

function closeAllPanels() {
  bookmarksPanel.classList.add('hidden');
  historyPanel.classList.add('hidden');
  settingsPanel.classList.add('hidden');
  window.api.setContentVisible(true);
}

async function openBookmarksPanel({ forceRefresh = false } = {}) {
  const wasOpen = !bookmarksPanel.classList.contains('hidden');
  closeAllPanels();
  if (wasOpen && !forceRefresh) return;
  window.api.setContentVisible(false);

  const bookmarks = await window.api.listBookmarks();
  bookmarksList.innerHTML = '';
  if (bookmarks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'panel-empty';
    empty.textContent = 'Sin marcadores todavía';
    bookmarksList.appendChild(empty);
  }
  for (const b of bookmarks) {
    const li = document.createElement('li');

    const text = document.createElement('div');
    text.className = 'panel-item-text';
    const title = document.createElement('div');
    title.className = 'panel-item-title';
    title.textContent = b.title;
    const url = document.createElement('div');
    url.className = 'panel-item-url';
    url.textContent = b.url;
    text.appendChild(title);
    text.appendChild(url);

    const remove = document.createElement('button');
    remove.className = 'panel-item-remove';
    remove.textContent = '×';
    remove.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.api.removeBookmark(b.url);
      openBookmarksPanel({ forceRefresh: true });
    });

    li.appendChild(text);
    li.appendChild(remove);
    li.addEventListener('click', () => {
      window.api.go(b.url);
      closeAllPanels();
    });
    bookmarksList.appendChild(li);
  }
  bookmarksPanel.classList.remove('hidden');
}

async function openHistoryPanel({ forceRefresh = false } = {}) {
  const wasOpen = !historyPanel.classList.contains('hidden');
  closeAllPanels();
  if (wasOpen && !forceRefresh) return;
  window.api.setContentVisible(false);

  const history = await window.api.listHistory();
  historyList.innerHTML = '';
  if (history.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'panel-empty';
    empty.textContent = 'Sin historial todavía';
    historyList.appendChild(empty);
  }
  for (const h of history) {
    const li = document.createElement('li');

    const text = document.createElement('div');
    text.className = 'panel-item-text';
    const title = document.createElement('div');
    title.className = 'panel-item-title';
    title.textContent = h.title;
    const url = document.createElement('div');
    url.className = 'panel-item-url';
    url.textContent = h.url;
    text.appendChild(title);
    text.appendChild(url);

    li.appendChild(text);
    li.addEventListener('click', () => {
      window.api.go(h.url);
      closeAllPanels();
    });
    historyList.appendChild(li);
  }
  historyPanel.classList.remove('hidden');
}

bookmarksBtn.addEventListener('click', openBookmarksPanel);
historyBtn.addEventListener('click', openHistoryPanel);
clearHistoryBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  await window.api.clearHistory();
  openHistoryPanel({ forceRefresh: true });
});

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => closeAllPanels());
});

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === 't') {
    e.preventDefault();
    window.api.newTab();
  }
  if (mod && e.key === 'l') {
    e.preventDefault();
    addressInput.focus();
  }
  if (mod && e.key === 'r') {
    e.preventDefault();
    window.api.reload();
  }
  if (e.key === 'Escape') {
    closeAllPanels();
  }
});

// ---------- Personalización ----------

const settingsBtn = document.getElementById('settings-btn');
const setCloseLast = document.getElementById('set-close-last');
const setAccent = document.getElementById('set-accent');
const setBorderMode = document.getElementById('set-border-mode');
const borderColorsRow = document.getElementById('border-colors-row');
const setBorderC1 = document.getElementById('set-border-c1');
const setBorderC2 = document.getElementById('set-border-c2');
const setBgType = document.getElementById('set-bg-type');
const bgColorRow = document.getElementById('bg-color-row');
const bgGradientRow = document.getElementById('bg-gradient-row');
const bgImageRow = document.getElementById('bg-image-row');
const bgImageName = document.getElementById('bg-image-name');
const setBgColor = document.getElementById('set-bg-color');
const setBgFrom = document.getElementById('set-bg-from');
const setBgTo = document.getElementById('set-bg-to');
const setBgImageBtn = document.getElementById('set-bg-image-btn');
const shortcutsEditor = document.getElementById('shortcuts-editor');
const addShortcutBtn = document.getElementById('add-shortcut-btn');
const versionLabel = document.getElementById('version-label');
const checkUpdatesBtn = document.getElementById('check-updates-btn');
const updateResult = document.getElementById('update-result');

let currentSettings = null;

const SC_GRADIENTS = [
  ['#4285f4', '#34a853'],
  ['#ff0844', '#b80f2e'],
  ['#5c6470', '#2d323b'],
  ['#6e5494', '#3b2e59'],
  ['#ff6a3d', '#d93900'],
  ['#0a84ff', '#5e5ce6'],
  ['#ff9f0a', '#ff375f'],
  ['#30d158', '#0a84ff'],
];

function hexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(10, 132, 255, ${alpha})`;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

function applyChromeSettings(settings) {
  const root = document.documentElement;
  root.style.setProperty('--accent', settings.accent);
  root.style.setProperty('--accent-soft', hexToRgba(settings.accent, 0.22));

  if (settings.borders.mode === 'colors') {
    const [c1, c2] = settings.borders.colors;
    document.body.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
  } else {
    document.body.style.background = '';
  }
}

function saveSettings(partial) {
  return window.api.setSettings(partial);
}

function renderShortcutEditor(shortcuts) {
  shortcutsEditor.innerHTML = '';
  shortcuts.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'shortcut-row';

    const iconBtn = document.createElement('button');
    iconBtn.className = 'sc-icon-preview';
    iconBtn.title = 'Cambiar icono (imagen de tu ordenador)';
    if (s.icon) {
      const img = document.createElement('img');
      img.src = s.icon;
      iconBtn.appendChild(img);
    } else {
      const [from, to] = SC_GRADIENTS[i % SC_GRADIENTS.length];
      iconBtn.style.background = `linear-gradient(135deg, ${from}, ${to})`;
      iconBtn.textContent = (s.title || '?').trim().charAt(0).toUpperCase();
    }
    iconBtn.addEventListener('click', async () => {
      const url = await window.api.pickImage('shortcut');
      if (!url) return;
      const next = currentSettings.newtab.shortcuts.map((sc, idx) =>
        idx === i ? { ...sc, icon: url } : sc
      );
      await saveSettings({ newtab: { shortcuts: next } });
    });

    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'sc-title';
    title.value = s.title || '';
    title.placeholder = 'Título';

    const url = document.createElement('input');
    url.type = 'text';
    url.className = 'sc-url';
    url.value = s.url || '';
    url.placeholder = 'https://…';

    const commit = async () => {
      const next = currentSettings.newtab.shortcuts.map((sc, idx) =>
        idx === i ? { ...sc, title: title.value.trim(), url: url.value.trim() } : sc
      );
      await saveSettings({ newtab: { shortcuts: next } });
    };
    title.addEventListener('change', commit);
    url.addEventListener('change', commit);

    const remove = document.createElement('button');
    remove.className = 'sc-remove';
    remove.textContent = '×';
    remove.title = 'Eliminar';
    remove.addEventListener('click', async () => {
      const next = currentSettings.newtab.shortcuts.filter((_, idx) => idx !== i);
      await saveSettings({ newtab: { shortcuts: next } });
    });

    li.appendChild(iconBtn);
    li.appendChild(title);
    li.appendChild(url);
    li.appendChild(remove);
    shortcutsEditor.appendChild(li);
  });
}

function renderSettingsPanel(settings) {
  setCloseLast.value = settings.closeLastTab;
  setAccent.value = settings.accent;
  setBorderMode.value = settings.borders.mode;
  setBorderC1.value = settings.borders.colors[0];
  setBorderC2.value = settings.borders.colors[1];
  borderColorsRow.classList.toggle('hidden', settings.borders.mode !== 'colors');

  const bg = settings.newtab.background;
  setBgType.value = bg.type;
  setBgColor.value = bg.color || '#16181f';
  setBgFrom.value = bg.from || '#16181f';
  setBgTo.value = bg.to || '#1d1726';
  bgColorRow.classList.toggle('hidden', bg.type !== 'color');
  bgGradientRow.classList.toggle('hidden', bg.type !== 'gradient');
  bgImageRow.classList.toggle('hidden', bg.type !== 'image');
  bgImageName.textContent = bg.image ? 'Imagen seleccionada ✓' : 'Sin imagen';

  renderShortcutEditor(settings.newtab.shortcuts);
}

async function openSettingsPanel() {
  const wasOpen = !settingsPanel.classList.contains('hidden');
  closeAllPanels();
  if (wasOpen) return;
  window.api.setContentVisible(false);

  currentSettings = await window.api.getSettings();
  renderSettingsPanel(currentSettings);
  updateResult.textContent = '';
  settingsPanel.classList.remove('hidden');
}

settingsBtn.addEventListener('click', openSettingsPanel);

setCloseLast.addEventListener('change', () => saveSettings({ closeLastTab: setCloseLast.value }));
setAccent.addEventListener('change', () => saveSettings({ accent: setAccent.value }));

setBorderMode.addEventListener('change', () =>
  saveSettings({ borders: { mode: setBorderMode.value } })
);

const commitBorderColors = () =>
  saveSettings({ borders: { colors: [setBorderC1.value, setBorderC2.value] } });
setBorderC1.addEventListener('change', commitBorderColors);
setBorderC2.addEventListener('change', commitBorderColors);

setBgType.addEventListener('change', async () => {
  if (setBgType.value === 'image' && !currentSettings.newtab.background.image) {
    const url = await window.api.pickImage('background');
    if (!url) {
      setBgType.value = currentSettings.newtab.background.type;
      return;
    }
    await saveSettings({ newtab: { background: { type: 'image', image: url } } });
    return;
  }
  saveSettings({ newtab: { background: { type: setBgType.value } } });
});

setBgColor.addEventListener('change', () =>
  saveSettings({ newtab: { background: { type: 'color', color: setBgColor.value } } })
);

const commitGradient = () =>
  saveSettings({
    newtab: { background: { type: 'gradient', from: setBgFrom.value, to: setBgTo.value } },
  });
setBgFrom.addEventListener('change', commitGradient);
setBgTo.addEventListener('change', commitGradient);

setBgImageBtn.addEventListener('click', async () => {
  const url = await window.api.pickImage('background');
  if (!url) return;
  await saveSettings({ newtab: { background: { type: 'image', image: url } } });
});

addShortcutBtn.addEventListener('click', async () => {
  const next = [
    ...currentSettings.newtab.shortcuts,
    { title: 'Nuevo', url: 'https://', icon: null },
  ];
  await saveSettings({ newtab: { shortcuts: next } });
});

checkUpdatesBtn.addEventListener('click', async () => {
  updateResult.textContent = 'Comprobando…';
  const result = await window.api.checkUpdates();
  if (!result.ok) {
    updateResult.textContent = `No se pudo comprobar: ${result.error}`;
    return;
  }
  if (result.hasUpdate) {
    updateResult.innerHTML = '';
    const text = document.createTextNode(`Nueva versión ${result.latest} disponible — `);
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = 'Descargar';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.api.openExternal(result.url);
    });
    updateResult.appendChild(text);
    updateResult.appendChild(link);
  } else {
    updateResult.textContent = `Estás en la última versión (${result.current}).`;
  }
});

window.api.onSettingsChanged((settings) => {
  currentSettings = settings;
  applyChromeSettings(settings);
  if (!settingsPanel.classList.contains('hidden')) {
    renderSettingsPanel(settings);
  }
});

(async () => {
  currentSettings = await window.api.getSettings();
  applyChromeSettings(currentSettings);
  versionLabel.textContent = `Versión ${await window.api.getVersion()}`;
})();
