const clock = document.getElementById('clock');
const greeting = document.getElementById('greeting');
const shortcutsEl = document.getElementById('shortcuts');
const emblemEl = document.getElementById('emblem');

function tick() {
  const now = new Date();
  clock.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const h = now.getHours();
  greeting.textContent =
    h < 7 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

tick();
setInterval(tick, 1000);

const LETTER_GRADIENTS = [
  ['#4285f4', '#34a853'],
  ['#ff0844', '#b80f2e'],
  ['#5c6470', '#2d323b'],
  ['#6e5494', '#3b2e59'],
  ['#ff6a3d', '#d93900'],
  ['#0a84ff', '#5e5ce6'],
  ['#ff9f0a', '#ff375f'],
  ['#30d158', '#0a84ff'],
];

function renderShortcuts(shortcuts) {
  shortcutsEl.innerHTML = '';
  shortcuts.forEach((s, i) => {
    const a = document.createElement('a');
    a.className = 'shortcut';
    a.href = s.url;

    const icon = document.createElement('span');
    icon.className = 'shortcut-icon';
    if (s.icon) {
      const img = document.createElement('img');
      img.src = s.icon;
      img.alt = '';
      icon.appendChild(img);
    } else {
      const [from, to] = LETTER_GRADIENTS[i % LETTER_GRADIENTS.length];
      icon.style.background = `linear-gradient(135deg, ${from}, ${to})`;
      icon.textContent = (s.title || '?').trim().charAt(0).toUpperCase();
    }

    const label = document.createElement('span');
    label.className = 'shortcut-label';
    label.textContent = s.title || s.url;

    a.appendChild(icon);
    a.appendChild(label);
    shortcutsEl.appendChild(a);
  });
}

function applyBackground(background, iconUrl) {
  document.body.classList.remove('custom-bg', 'emblem-bg');
  document.body.style.background = '';

  const type = background && background.type;
  if (type === 'color' && background.color) {
    document.body.classList.add('custom-bg');
    document.body.style.background = background.color;
  } else if (type === 'gradient' && background.from && background.to) {
    document.body.classList.add('custom-bg');
    document.body.style.background = `linear-gradient(135deg, ${background.from}, ${background.to})`;
  } else if (type === 'image' && background.image) {
    document.body.classList.add('custom-bg');
    document.body.style.background = `url("${background.image}") center / cover no-repeat fixed`;
  } else if (iconUrl) {
    // Por defecto: el escudo de Umbrathel como marca de agua sobre el degradado animado
    document.body.classList.add('emblem-bg');
    emblemEl.style.backgroundImage = `url("${iconUrl}")`;
  }
}

const mcServersEl = document.getElementById('mcservers');

function renderMcServers(servers) {
  mcServersEl.innerHTML = '';
  servers.forEach((server) => {
    const card = document.createElement('div');
    card.className = 'mc-card';

    const dot = document.createElement('span');
    dot.className = 'mc-dot';

    const info = document.createElement('div');
    info.className = 'mc-info';
    const name = document.createElement('div');
    name.className = 'mc-name';
    name.textContent = server.name || server.address;
    const meta = document.createElement('div');
    meta.className = 'mc-meta';
    meta.textContent = 'Consultando…';
    info.appendChild(name);
    info.appendChild(meta);

    const copy = document.createElement('button');
    copy.className = 'mc-copy';
    copy.title = 'Copiar IP';
    copy.textContent = '⧉';
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(server.address);
      copy.classList.add('copied');
      copy.textContent = '✓';
      setTimeout(() => {
        copy.classList.remove('copied');
        copy.textContent = '⧉';
      }, 1200);
    });

    card.appendChild(dot);
    card.appendChild(info);
    card.appendChild(copy);
    mcServersEl.appendChild(card);

    if (window.umbrathel && server.address) {
      window.umbrathel.checkMcServer(server.address).then((status) => {
        dot.classList.add(status.online ? 'online' : 'offline');
        meta.textContent = status.online
          ? `${server.address} · ${status.players ?? '?'}/${status.maxPlayers ?? '?'} jugadores`
          : `${server.address} · sin conexión`;
      });
    }
  });
}

async function init() {
  if (!window.umbrathel) return;
  const data = await window.umbrathel.getNewTabData();
  if (!data) return;

  if (data.accent) document.documentElement.style.setProperty('--accent', data.accent);
  applyBackground(data.newtab.background, data.iconUrl);
  renderShortcuts(data.newtab.shortcuts || []);
  renderMcServers(data.newtab.mcServers || []);
}

init();
