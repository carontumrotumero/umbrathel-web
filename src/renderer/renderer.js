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
let lastTabsState = null;
const collapsedGroups = new Set();

function buildTabEl(tab, state) {
  const isNew = !knownTabIds.has(tab.id);
  const el = document.createElement('div');
  el.className = 'tab' + (tab.id === state.activeTabId ? ' active' : '') + (isNew ? ' tab-in' : '');
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
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.api.tabContextMenu(tab.id);
  });
  return el;
}

function buildGroupEl(group, groupTabs, state) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tab-group';

  const pill = document.createElement('div');
  pill.className = 'tab-group-pill';
  pill.style.background = group.color;
  pill.textContent = group.name;
  pill.title = 'Clic: colapsar · doble clic: renombrar';

  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'tab-group-tabs';
  let collapsed = collapsedGroups.has(group.id);
  tabsContainer.classList.toggle('collapsed', collapsed);

  pill.addEventListener('click', () => {
    if (pill.isContentEditable) return;
    collapsed = !collapsed;
    if (collapsed) collapsedGroups.add(group.id);
    else collapsedGroups.delete(group.id);
    tabsContainer.classList.toggle('collapsed', collapsed);
  });
  pill.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    pill.contentEditable = 'true';
    pill.focus();
    document.execCommand('selectAll', false, null);
  });
  pill.addEventListener('blur', () => {
    pill.contentEditable = 'false';
    const name = pill.textContent.trim() || group.name;
    if (name !== group.name) window.api.renameGroup(group.id, name);
  });
  pill.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      pill.blur();
    }
  });

  groupTabs.forEach((t) => tabsContainer.appendChild(buildTabEl(t, state)));

  wrapper.appendChild(pill);
  wrapper.appendChild(tabsContainer);
  return wrapper;
}

function renderTabs(state) {
  tabsEl.innerHTML = '';
  const currentIds = new Set();
  const groupsById = new Map((state.groups || []).map((g) => [g.id, g]));
  const rendered = new Set();

  for (const tab of state.tabs) {
    if (rendered.has(tab.id)) continue;
    currentIds.add(tab.id);

    if (tab.groupId && groupsById.has(tab.groupId)) {
      const group = groupsById.get(tab.groupId);
      const groupTabs = state.tabs.filter((t) => t.groupId === tab.groupId);
      groupTabs.forEach((t) => {
        rendered.add(t.id);
        currentIds.add(t.id);
      });
      tabsEl.appendChild(buildGroupEl(group, groupTabs, state));
    } else {
      rendered.add(tab.id);
      tabsEl.appendChild(buildTabEl(tab, state));
    }
  }
  knownTabIds = currentIds;
}

const progressBar = document.getElementById('progress-bar');
const pinnedAppsEl = document.getElementById('pinned-apps');

const PINNED_GRADIENTS = [
  ['#4285f4', '#34a853'],
  ['#ff0844', '#b80f2e'],
  ['#5c6470', '#2d323b'],
  ['#6e5494', '#3b2e59'],
  ['#ff6a3d', '#d93900'],
  ['#0a84ff', '#5e5ce6'],
  ['#ff9f0a', '#ff375f'],
  ['#30d158', '#0a84ff'],
];

function renderPinnedButtons(settings, state) {
  if (!settings) return;
  pinnedAppsEl.innerHTML = '';
  const apps = settings.pinnedApps || [];
  const openIds = (state && state.openPinnedIds) || [];
  const activeIds = (state && state.pinnedActiveIds) || [];
  apps.forEach((appCfg, i) => {
    const btn = document.createElement('button');
    btn.className = 'nav-btn pinned-btn';
    const isOpen = openIds.includes(appCfg.id);
    const isActive = activeIds.includes(appCfg.id);
    btn.classList.toggle('pinned-open', isOpen);
    btn.classList.toggle('pinned-live', isActive && !isOpen);
    btn.classList.toggle('pinned-wide', isOpen && !!(state && state.dockWriteMode));
    btn.title = `${appCfg.title} — panel acoplado (⌘⇧D: ancho/compacto)`;
    if (appCfg.icon) {
      const img = document.createElement('img');
      img.src = appCfg.icon;
      btn.appendChild(img);
    } else {
      const [from, to] = PINNED_GRADIENTS[i % PINNED_GRADIENTS.length];
      btn.style.background = isOpen ? '' : `linear-gradient(135deg, ${from}22, ${to}22)`;
      btn.textContent = (appCfg.title || '?').trim().charAt(0).toUpperCase();
    }
    btn.addEventListener('click', () => window.api.togglePinned(appCfg.id));
    pinnedAppsEl.appendChild(btn);
  });
}

function renderToolbar(state) {
  backBtn.disabled = !state.canGoBack;
  forwardBtn.disabled = !state.canGoForward;

  renderPinnedButtons(currentSettings, state);

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
  lastTabsState = state;
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
const notesPanel = document.getElementById('notes-panel');
const profileMenu = document.getElementById('profile-menu');

function closeAllPanels() {
  bookmarksPanel.classList.add('hidden');
  historyPanel.classList.add('hidden');
  settingsPanel.classList.add('hidden');
  notesPanel.classList.add('hidden');
  profileMenu.classList.add('hidden');
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
  if (mod && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
    e.preventDefault();
    window.api.toggleDockWidth();
  }
  if (mod && e.key === 'r') {
    e.preventDefault();
    window.api.reload();
  }
  if (e.key === 'Escape') {
    closeAllPanels();
  }
});

// ---------- Notas ----------

const notesBtn = document.getElementById('notes-btn');
const notesList = document.getElementById('notes-list');
const addNoteBtn = document.getElementById('add-note-btn');

function buildNoteCard(note) {
  const li = document.createElement('li');
  li.className = 'note-card';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'note-title-input';
  titleInput.placeholder = 'Título de la nota';
  titleInput.value = note.title;

  const bodyInput = document.createElement('textarea');
  bodyInput.className = 'note-body-input';
  bodyInput.placeholder = 'Coordenadas, tratados, lo que necesites apuntar…';
  bodyInput.value = note.body;

  let saveTimer = null;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      window.api.saveNote({ id: note.id, title: titleInput.value, body: bodyInput.value });
    }, 500);
  };
  titleInput.addEventListener('input', scheduleSave);
  bodyInput.addEventListener('input', scheduleSave);

  const footer = document.createElement('div');
  footer.className = 'note-card-footer';
  const del = document.createElement('button');
  del.className = 'note-delete-btn';
  del.textContent = 'Eliminar';
  del.addEventListener('click', async () => {
    await window.api.deleteNote(note.id);
    li.remove();
  });
  footer.appendChild(del);

  li.appendChild(titleInput);
  li.appendChild(bodyInput);
  li.appendChild(footer);
  return li;
}

function renderNotesList(notes) {
  notesList.innerHTML = '';
  if (notes.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'panel-empty';
    empty.textContent = 'Sin notas todavía';
    notesList.appendChild(empty);
    return;
  }
  notes.forEach((n) => notesList.appendChild(buildNoteCard(n)));
}

async function openNotesPanel() {
  const wasOpen = !notesPanel.classList.contains('hidden');
  closeAllPanels();
  if (wasOpen) return;
  window.api.setContentVisible(false);
  renderNotesList(await window.api.listNotes());
  notesPanel.classList.remove('hidden');
}

notesBtn.addEventListener('click', openNotesPanel);
addNoteBtn.addEventListener('click', async () => {
  await window.api.saveNote({ title: '', body: '' });
  renderNotesList(await window.api.listNotes());
});

// ---------- Perfiles ----------

const profileBtn = document.getElementById('profile-btn');
const profileDot = document.getElementById('profile-dot');
const profileList = document.getElementById('profile-list');
const newProfileBtn = document.getElementById('new-profile-btn');

let profilesState = { profiles: [], activeProfileId: null };

function renderProfileDot() {
  const active = profilesState.profiles.find((p) => p.id === profilesState.activeProfileId);
  profileDot.style.background = active ? active.color : 'var(--accent)';
}

function renderProfileMenu() {
  profileList.innerHTML = '';
  profilesState.profiles.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'profile-row' + (p.id === profilesState.activeProfileId ? ' is-active' : '');

    const dot = document.createElement('span');
    dot.className = 'profile-color-dot';
    dot.style.background = p.color;

    const name = document.createElement('span');
    name.className = 'profile-row-name';
    name.textContent = p.name;

    const check = document.createElement('span');
    check.className = 'profile-check';
    check.textContent = p.id === profilesState.activeProfileId ? '✓' : '';

    li.appendChild(dot);
    li.appendChild(name);
    li.appendChild(check);
    li.addEventListener('click', () => {
      window.api.switchProfile(p.id);
      closeAllPanels();
    });
    profileList.appendChild(li);
  });
}

profileBtn.addEventListener('click', () => {
  const wasOpen = !profileMenu.classList.contains('hidden');
  closeAllPanels();
  if (wasOpen) return;
  window.api.setContentVisible(false);
  renderProfileMenu();
  profileMenu.classList.remove('hidden');
});

newProfileBtn.addEventListener('click', () => window.api.createProfile('Nuevo perfil'));

window.api.onProfilesState((state) => {
  profilesState = state;
  renderProfileDot();
  if (!profileMenu.classList.contains('hidden')) renderProfileMenu();
  renderProfilesEditor();
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
const pinnedEditor = document.getElementById('pinned-editor');
const addPinnedBtn = document.getElementById('add-pinned-btn');
const mcEditor = document.getElementById('mcservers-editor');
const addMcBtn = document.getElementById('add-mcserver-btn');
const profilesEditor = document.getElementById('profiles-editor');
const addProfileBtn = document.getElementById('add-profile-btn');
const versionLabel = document.getElementById('version-label');
const checkUpdatesBtn = document.getElementById('check-updates-btn');
const updateResult = document.getElementById('update-result');
const updateProgressRow = document.getElementById('update-progress-row');
const updateProgressFill = document.getElementById('update-progress-fill');
const updateProgressLabel = document.getElementById('update-progress-label');
const updateActions = document.getElementById('update-actions');
const updateActionBtn = document.getElementById('update-action-btn');

let currentSettings = null;

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
      const [from, to] = PINNED_GRADIENTS[i % PINNED_GRADIENTS.length];
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

function renderPinnedEditor(pinnedApps) {
  pinnedEditor.innerHTML = '';
  pinnedApps.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'shortcut-row';

    const iconBtn = document.createElement('button');
    iconBtn.className = 'sc-icon-preview';
    iconBtn.title = 'Cambiar icono (imagen de tu ordenador)';
    if (p.icon) {
      const img = document.createElement('img');
      img.src = p.icon;
      iconBtn.appendChild(img);
    } else {
      const [from, to] = PINNED_GRADIENTS[i % PINNED_GRADIENTS.length];
      iconBtn.style.background = `linear-gradient(135deg, ${from}, ${to})`;
      iconBtn.textContent = (p.title || '?').trim().charAt(0).toUpperCase();
    }
    iconBtn.addEventListener('click', async () => {
      const url = await window.api.pickImage('pinned');
      if (!url) return;
      const next = currentSettings.pinnedApps.map((a, idx) => (idx === i ? { ...a, icon: url } : a));
      await saveSettings({ pinnedApps: next });
    });

    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'sc-title';
    title.value = p.title || '';
    title.placeholder = 'Nombre';

    const url = document.createElement('input');
    url.type = 'text';
    url.className = 'sc-url';
    url.value = p.url || '';
    url.placeholder = 'https://…';

    const commit = async () => {
      const next = currentSettings.pinnedApps.map((a, idx) =>
        idx === i ? { ...a, title: title.value.trim(), url: url.value.trim() } : a
      );
      await saveSettings({ pinnedApps: next });
    };
    title.addEventListener('change', commit);
    url.addEventListener('change', commit);

    const remove = document.createElement('button');
    remove.className = 'sc-remove';
    remove.textContent = '×';
    remove.title = 'Eliminar';
    remove.addEventListener('click', async () => {
      const next = currentSettings.pinnedApps.filter((_, idx) => idx !== i);
      await saveSettings({ pinnedApps: next });
    });

    li.appendChild(iconBtn);
    li.appendChild(title);
    li.appendChild(url);
    li.appendChild(remove);
    pinnedEditor.appendChild(li);
  });
}

function renderMcEditor(servers) {
  mcEditor.innerHTML = '';
  servers.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'editor-row';

    const name = document.createElement('input');
    name.type = 'text';
    name.value = s.name || '';
    name.placeholder = 'Nombre';

    const address = document.createElement('input');
    address.type = 'text';
    address.value = s.address || '';
    address.placeholder = 'ip:puerto';

    const commit = async () => {
      const next = currentSettings.newtab.mcServers.map((sv, idx) =>
        idx === i ? { name: name.value.trim(), address: address.value.trim() } : sv
      );
      await saveSettings({ newtab: { mcServers: next } });
    };
    name.addEventListener('change', commit);
    address.addEventListener('change', commit);

    const remove = document.createElement('button');
    remove.className = 'sc-remove';
    remove.textContent = '×';
    remove.title = 'Eliminar';
    remove.addEventListener('click', async () => {
      const next = currentSettings.newtab.mcServers.filter((_, idx) => idx !== i);
      await saveSettings({ newtab: { mcServers: next } });
    });

    li.appendChild(name);
    li.appendChild(address);
    li.appendChild(remove);
    mcEditor.appendChild(li);
  });
}

function renderProfilesEditor() {
  if (!profilesEditor) return;
  profilesEditor.innerHTML = '';
  profilesState.profiles.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'editor-row';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = p.color;
    colorInput.addEventListener('change', () => window.api.recolorProfile(p.id, colorInput.value));

    const name = document.createElement('input');
    name.type = 'text';
    name.value = p.name;
    name.addEventListener('change', () => window.api.renameProfile(p.id, name.value));

    const remove = document.createElement('button');
    remove.className = 'sc-remove';
    remove.textContent = '×';
    const isOnly = profilesState.profiles.length <= 1;
    remove.title = isOnly ? 'No puedes borrar el único perfil' : 'Borrar perfil';
    remove.disabled = isOnly;
    remove.style.opacity = isOnly ? '0.35' : '';
    remove.addEventListener('click', () => window.api.deleteProfile(p.id));

    li.appendChild(colorInput);
    li.appendChild(name);
    li.appendChild(remove);
    profilesEditor.appendChild(li);
  });
}

addProfileBtn.addEventListener('click', () => window.api.createProfile('Nuevo perfil'));

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
  renderPinnedEditor(settings.pinnedApps || []);
  renderMcEditor(settings.newtab.mcServers || []);
  renderProfilesEditor();
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

addPinnedBtn.addEventListener('click', async () => {
  const id = `app${Date.now().toString(36)}`;
  const next = [...(currentSettings.pinnedApps || []), { id, title: 'Nueva app', url: 'https://', icon: null }];
  await saveSettings({ pinnedApps: next });
});

addMcBtn.addEventListener('click', async () => {
  const next = [...(currentSettings.newtab.mcServers || []), { name: 'Servidor', address: 'play.ejemplo.net' }];
  await saveSettings({ newtab: { mcServers: next } });
});

let pendingMacInstallerPath = null;

function setUpdateAction(label, handler) {
  updateActionBtn.textContent = label;
  updateActionBtn.onclick = handler;
  updateActions.classList.remove('hidden');
}

function hideUpdateAction() {
  updateActions.classList.add('hidden');
  updateActionBtn.onclick = null;
}

function setUpdateProgress(percent) {
  updateProgressRow.classList.remove('hidden');
  updateProgressFill.style.width = `${percent}%`;
  updateProgressLabel.textContent = `${percent}%`;
}

function hideUpdateProgress() {
  updateProgressRow.classList.add('hidden');
}

checkUpdatesBtn.addEventListener('click', async () => {
  updateResult.textContent = 'Comprobando…';
  hideUpdateAction();
  hideUpdateProgress();
  const result = await window.api.checkUpdates();
  if (!result.ok) {
    updateResult.textContent = `No se pudo comprobar: ${result.error}`;
    return;
  }
  if (result.hasUpdate) {
    updateResult.textContent = `Nueva versión ${result.latest} disponible.`;
    setUpdateAction('Actualizar ahora', () => {
      hideUpdateAction();
      updateResult.textContent = 'Descargando actualización…';
      window.api.startUpdate();
    });
  } else {
    updateResult.textContent = `Estás en la última versión (${result.current}).`;
  }
});

window.api.onUpdateProgress((payload) => {
  if (payload.state === 'downloading') {
    updateResult.textContent = 'Descargando actualización…';
    setUpdateProgress(payload.percent || 0);
    hideUpdateAction();
  } else if (payload.state === 'ready') {
    hideUpdateProgress();
    updateResult.textContent = 'Actualización descargada.';
    setUpdateAction('Reiniciar y actualizar', () => window.api.installUpdate());
  } else if (payload.state === 'mac-ready') {
    hideUpdateProgress();
    pendingMacInstallerPath = payload.path;
    updateResult.textContent = 'Instalador descargado. Arrastra la app a Aplicaciones para completar la actualización.';
    window.api.openMacInstaller(pendingMacInstallerPath);
    setUpdateAction('Abrir instalador de nuevo', () => window.api.openMacInstaller(pendingMacInstallerPath));
  } else if (payload.state === 'not-available') {
    hideUpdateProgress();
    hideUpdateAction();
    updateResult.textContent = 'Estás en la última versión.';
  } else if (payload.state === 'error') {
    hideUpdateProgress();
    hideUpdateAction();
    updateResult.textContent = `Error al actualizar: ${payload.message}`;
  }
});

window.api.onSettingsChanged((settings) => {
  currentSettings = settings;
  applyChromeSettings(settings);
  if (lastTabsState) renderPinnedButtons(currentSettings, lastTabsState);
  if (!settingsPanel.classList.contains('hidden')) {
    renderSettingsPanel(settings);
  }
});

(async () => {
  currentSettings = await window.api.getSettings();
  applyChromeSettings(currentSettings);
  if (lastTabsState) renderPinnedButtons(currentSettings, lastTabsState);
  versionLabel.textContent = `Versión ${await window.api.getVersion()}`;
})();

(async () => {
  profilesState = await window.api.listProfiles();
  renderProfileDot();
})();
