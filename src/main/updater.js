const { app, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { autoUpdater } = require('electron-updater');
const pkg = require('../../package.json');

const GITHUB_REPO = (pkg.repository && pkg.repository.github) || '';

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function fetchLatestRelease() {
  if (!GITHUB_REPO) return { ok: false, error: 'Repositorio no configurado' };
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'User-Agent': 'umbrathel-web', Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: res.status === 404 ? 'Aún no hay versiones publicadas' : `HTTP ${res.status}`,
      };
    }
    return { ok: true, release: await res.json() };
  } catch {
    return { ok: false, error: 'Sin conexión con GitHub' };
  }
}

async function checkForUpdates() {
  const current = app.getVersion();
  const result = await fetchLatestRelease();
  if (!result.ok) return { ok: false, error: result.error, current };

  const latest = String(result.release.tag_name || '').replace(/^v/, '');
  return {
    ok: true,
    current,
    latest,
    hasUpdate: latest !== '' && compareVersions(latest, current) > 0,
    notes: result.release.body || '',
  };
}

// ---- Windows / Linux: instalación silenciosa real vía electron-updater ----
// (No requiere firma de código: el NSIS y el AppImage se pueden reemplazar
// sin la validación estricta que macOS exige para Squirrel.Mac.)

function setupAutoUpdater(win) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  const send = (payload) => {
    if (win && !win.isDestroyed()) win.webContents.send('update:progress', payload);
  };

  autoUpdater.on('update-available', (info) => {
    send({ state: 'downloading', percent: 0 });
    autoUpdater.downloadUpdate().catch((err) => {
      send({ state: 'error', message: err.message });
    });
  });
  autoUpdater.on('update-not-available', () => {
    send({ state: 'not-available' });
  });
  autoUpdater.on('download-progress', (progress) => {
    send({ state: 'downloading', percent: Math.round(progress.percent) });
  });
  autoUpdater.on('update-downloaded', () => {
    send({ state: 'ready' });
  });
  autoUpdater.on('error', (err) => {
    send({ state: 'error', message: err.message });
  });
}

function startNativeUpdate() {
  autoUpdater.checkForUpdates().catch(() => {
    // los errores ya se propagan por el evento 'error'
  });
}

function installNativeUpdate() {
  autoUpdater.quitAndInstall();
}

// ---- macOS: sin cuenta de Apple Developer no se puede firmar la app, y
// Squirrel.Mac (el mecanismo de electron-updater para Mac) exige firma para
// reemplazar el .app en sitio. En su lugar: descargamos el DMG correcto
// dentro de la propia app (nada de navegador) y lo abrimos ya montado, listo
// para que el usuario solo arrastre el icono — el único paso que macOS obliga
// a hacer a mano para apps sin firmar.

function pickMacAsset(assets) {
  const arch = process.arch; // 'arm64' | 'x64'
  return assets.find((a) => a.name.endsWith('.dmg') && a.name.includes(arch));
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const request = (currentUrl, redirectsLeft) => {
      https
        .get(
          currentUrl,
          { headers: { 'User-Agent': 'umbrathel-web' } },
          (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
              if (redirectsLeft <= 0) return reject(new Error('Demasiadas redirecciones'));
              res.resume();
              request(res.headers.location, redirectsLeft - 1);
              return;
            }
            if (res.statusCode !== 200) {
              res.resume();
              reject(new Error(`HTTP ${res.statusCode} al descargar`));
              return;
            }
            const total = Number(res.headers['content-length'] || 0);
            let downloaded = 0;
            const file = fs.createWriteStream(destPath);
            res.on('data', (chunk) => {
              downloaded += chunk.length;
              if (total > 0) onProgress(Math.round((downloaded / total) * 100));
            });
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve()));
            file.on('error', reject);
          }
        )
        .on('error', reject);
    };
    request(url, 5);
  });
}

async function startMacUpdate(win) {
  const send = (payload) => {
    if (win && !win.isDestroyed()) win.webContents.send('update:progress', payload);
  };

  const result = await fetchLatestRelease();
  if (!result.ok) {
    send({ state: 'error', message: result.error });
    return;
  }

  const asset = pickMacAsset(result.release.assets || []);
  if (!asset) {
    send({ state: 'error', message: 'No se encontró el instalador para tu Mac en la última versión' });
    return;
  }

  const destPath = path.join(app.getPath('downloads'), asset.name);
  send({ state: 'downloading', percent: 0 });

  try {
    await downloadFile(asset.browser_download_url, destPath, (percent) => {
      send({ state: 'downloading', percent });
    });
    send({ state: 'mac-ready', path: destPath });
  } catch (err) {
    send({ state: 'error', message: err.message });
  }
}

function openMacInstaller(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    shell.openPath(filePath);
  }
}

module.exports = {
  checkForUpdates,
  setupAutoUpdater,
  startNativeUpdate,
  installNativeUpdate,
  startMacUpdate,
  openMacInstaller,
};
