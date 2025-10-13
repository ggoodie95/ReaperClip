import {app, BrowserWindow, globalShortcut, clipboard, screen, ipcMain, Menu, nativeImage, Tray} from 'electron';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {createHash} from 'crypto';
import {Store} from './store.js';
import {SettingsStore, getDefaultSettings} from './settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win = null;
let pollTimer = null;
const store = new Store({ maxItems: 20 });
const settingsStore = new SettingsStore();
let settings = settingsStore.get();
let lastTextDigest = '';
let lastImageDigest = '';
const IMAGE_PLACEHOLDER_RE = /^\[image \d+x\d+\]$/i;
const SCREENSHOT_TITLE_RE = /^screenshot \d{4}-\d{2}-\d{2}/i;
let registeredHotkey = null;
let tray = null;

function createWindow() {
  win = new BrowserWindow({
    width: 560,
    height: 380,
    minWidth: 420,
    minHeight: 280,
    show: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    transparent: true,
    hasShadow: true,
    roundedCorners: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');

  win.loadFile(path.join(__dirname, 'index.html'));

  // Poll clipboard for changes (cheap, reliable)
  pollTimer = setInterval(() => {
    const { text: textPayload, image: imagePayload } = readClipboardPayload();

    const textChanged = Boolean(textPayload?.text) && textPayload.digest !== lastTextDigest;
    const imageChanged = Boolean(imagePayload?.data?.dataUrl) && imagePayload.digest !== lastImageDigest;

    console.log('[clipboard poll]', {
      textPreview: textPayload?.text?.slice(0, 80) ?? '',
      textSource: textPayload?.source ?? 'none',
      textChanged,
      imageLabel: imagePayload?.text ?? '',
      imageChanged,
      ts: new Date().toISOString()
    });

    let updated = false;

    if (textChanged) {
      store.push(textPayload);
      lastTextDigest = textPayload.digest;
      updated = true;
    }

    if (imageChanged) {
      store.push(imagePayload);
      lastImageDigest = imagePayload.digest;
      updated = true;
    }

    if (updated) {
      const snapshot = store.peek(20);
      console.log('[ipc] send history-updated length=', snapshot.length);
      win?.webContents.send('history-updated', snapshot);
    }
  }, 800);
}

function toggleAtCursor() {
  if (!win) return;

  if (win.isVisible()) {
    hideOverlay();
    return;
  }

  showOverlayAtCursor();
}

function showOverlayAtCursor() {
  if (!win) return;

  if (typeof win.setVisibleOnAllWorkspaces === 'function') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  // Position right under the cursor
  const pt = screen.getCursorScreenPoint();
  const { width, height } = win.getBounds();

  // Small offset to sit just below the cursor
  const x = Math.max(0, pt.x - Math.floor(width / 2));
  const y = pt.y + 12;

  win.setPosition(x, y, false);
  win.show();
  win.focus();
  win.webContents.send('history-updated', store.peek(20));
  if (process.platform === 'darwin') {
    setTimeout(ensureDockHidden, 0);
  }
}

function hideOverlay() {
  if (!win) return;
  win.hide();
  if (typeof win.setVisibleOnAllWorkspaces === 'function') {
    win.setVisibleOnAllWorkspaces(false);
  }
  ensureDockHidden();
}

app.whenReady().then(() => {
  ensureDockHidden();

  createWindow();
  createTray();

  const hotkeyToUse = settings.hotkey || getDefaultSettings().hotkey;
  const ok = registerHotkey(hotkeyToUse);
  if (!ok) console.error('Failed to register hotkey', hotkeyToUse);

  console.log('[app] ready, hotkey', hotkeyToUse, 'registered?', ok);
  console.log('[paths]', app.getPath('userData'));

  app.on('activate', () => {
    if (!win) {
      createWindow();
    } else {
      showWindowFromTray(tray?.getBounds());
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (pollTimer) clearInterval(pollTimer);
});

ipcMain.handle('get-history', () => store.peek(20));
ipcMain.handle('set-clip', (_e, item) => {
  if (!item) return;

  if (item.kind === 'image' && item.data?.dataUrl) {
    const img = nativeImage.createFromDataURL(item.data.dataUrl);
    clipboard.writeImage(img);
    try {
      const png = img.toPNG();
      if (png?.length) clipboard.writeBuffer('public.png', png);
    } catch (err) {
      console.warn('[clipboard] failed to write public.png buffer', err);
    }
    try {
      const tiff = img.toTIFF();
      if (tiff?.length) clipboard.writeBuffer('public.tiff', tiff);
    } catch (err) {
      console.warn('[clipboard] failed to write public.tiff buffer', err);
    }
  } else {
    const text = item.data?.text ?? item.text ?? '';
    const payload = { text };
    if (item.data?.html) payload.html = item.data.html;
    if (item.data?.rtf) payload.rtf = item.data.rtf;
    clipboard.write(payload);
  }

  store.push(item);
  if (item.kind === 'image') lastImageDigest = item.digest || lastImageDigest;
  else lastTextDigest = item.digest || lastTextDigest;
  win?.webContents.send('history-updated', store.peek(20));
});

ipcMain.handle('hide-window', () => {
  if (win?.isVisible()) hideOverlay();
});

ipcMain.handle('get-settings', () => settings);
ipcMain.handle('set-settings', (_e, payload) => {
  const patch = normalizeSettings(payload);
  const prevSettings = settings;
  let next = settingsStore.set(patch);

  let hotkeyRegistered = true;
  if (patch.hotkey !== undefined && patch.hotkey !== prevSettings.hotkey) {
    hotkeyRegistered = registerHotkey(next.hotkey);
    if (!hotkeyRegistered) {
      // revert hotkey change
      registerHotkey(prevSettings.hotkey);
      next = settingsStore.set({ hotkey: prevSettings.hotkey });
    }
  }

  settings = next;
  broadcastSettings();
  return { settings, hotkeyRegistered };
});

const template = [{
  label: 'Debug',
  submenu: [
    {
      label: 'Inject Test Clip',
      accelerator: 'Command+Shift+I',
      click() {
        const s = 'injected_' + new Date().toISOString();
        const payload = createTextPayload({ text: s, source: 'debug' });
        if (!payload) return;
        store.push(payload);
        clipboard.writeText(payload.data.text);
        lastTextDigest = payload.digest;
        win?.webContents.send('history-updated', store.peek(20));
        console.log('[debug] injected', s);
      },
    },
  ],
}];
const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

function readClipboardPayload() {
  const fmts = clipboard.availableFormats();
  if (!Array.isArray(globalThis.__lastFmts) || fmts.join('|') !== globalThis.__lastFmts.join('|')) {
    console.log('[pb] formats=', fmts);
    globalThis.__lastFmts = fmts;
  }

  const text = (clipboard.readText() || '').trim();
  const html = clipboard.readHTML ? clipboard.readHTML() : '';
  const rtf = clipboard.readRTF ? clipboard.readRTF() : '';
  const img = clipboard.readImage ? clipboard.readImage() : null;

  if (html) console.log('[pb] html len=', html.length);
  if (rtf) console.log('[pb] rtf len=', rtf.length);

  let finalText = text;
  let source = 'text';

  if (!finalText && html) {
    // strip tags; keep spaces
    const stripped = html.replace(/<style[\s\S]*?<\/style>/gi, ' ')
                         .replace(/<script[\s\S]*?<\/script>/gi, ' ')
                         .replace(/<[^>]+>/g, ' ')
                         .replace(/\s+/g, ' ')
                         .trim();
    if (stripped) {
      finalText = stripped;
      source = 'html';
    }
  }
  if (!finalText && rtf) {
    // crude RTF→text: remove {\*\...}, control words, braces
    const stripped = rtf.replace(/\\'[0-9a-f]{2}/gi, ' ')
                        .replace(/\\[a-z]+\d* ?/gi, ' ')
                        .replace(/[{}]/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
    if (stripped) {
      finalText = stripped;
      source = 'rtf';
    }
  }

  let textPayload = finalText ? createTextPayload({
    text: finalText,
    source,
    html,
    rtf
  }) : null;

  let imagePayload = null;
  if (img && !img.isEmpty?.()) {
    const size = img.getSize ? img.getSize() : { width: 0, height: 0 };
    const label = (text || `[Image ${size.width}x${size.height}]`).replace(/\s+/g, ' ').trim() || `[Image ${size.width}x${size.height}]`;
    imagePayload = createImagePayload({
      dataUrl: img.toDataURL(),
      width: size.width,
      height: size.height,
      text: label,
      source: 'image',
      fmts
    });
  }

  if (!imagePayload) {
    const fileUrls = readFileUrlsFromClipboard();
    for (const filePath of fileUrls) {
      const imgFromPath = nativeImage.createFromPath(filePath);
      if (imgFromPath.isEmpty()) continue;
      const { width, height } = imgFromPath.getSize();
      const mime = guessMimeFromPath(filePath);
      imagePayload = createImagePayload({
        dataUrl: imgFromPath.toDataURL(),
        width,
        height,
        text: path.basename(filePath),
        source: 'file',
        fmts: [mime, 'public.file-url']
      });
      break;
    }
  }

  if (imagePayload && textPayload) {
    const sameText = textPayload.text === imagePayload.text;
    if (sameText || IMAGE_PLACEHOLDER_RE.test(textPayload.text)) {
      textPayload = null;
    }
  }

  const screenshotText = textPayload && isScreenshotLabel(textPayload.text);
  const screenshotImage = imagePayload && isScreenshotLabel(imagePayload.text);

  if (textPayload && screenshotText && settings.captureScreenshots === false) {
    textPayload = null;
  }
  if (imagePayload) {
    if (screenshotImage) {
      if (settings.captureScreenshots === false) imagePayload = null;
    } else if (settings.captureImages === false) {
      imagePayload = null;
    }
  }

  return { text: textPayload, image: imagePayload };
}

function computeDigest(kind, value, fmts) {
  const hash = createHash('sha1');
  hash.update(kind || '');
  hash.update('\0');
  hash.update(value || '');
  hash.update('\0');
  hash.update(Array.isArray(fmts) ? fmts.join(',') : '');
  return hash.digest('hex');
}

function createTextPayload({ text, source = 'text', html = '', rtf = '' }) {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const fmts = ['text/plain'];
  if (html) fmts.push('text/html');
  if (rtf) fmts.push('text/rtf');
  return {
    kind: 'text',
    text: cleaned,
    source,
    fmts,
    data: { text: cleaned, html, rtf },
    digest: computeDigest('text', cleaned, fmts),
    createdAt: new Date().toISOString()
  };
}

function createImagePayload({ dataUrl, width = 0, height = 0, text = '', source = 'image', fmts = ['image/png'] }) {
  if (!dataUrl) return null;
  const label = text || `[Image ${width}x${height}]`;
  return {
    kind: 'image',
    text: label,
    source,
    fmts,
    data: { dataUrl, width, height },
    digest: computeDigest('image', dataUrl, fmts),
    createdAt: new Date().toISOString()
  };
}

function readFileUrlsFromClipboard() {
  try {
    const buf = clipboard.readBuffer('public.file-url');
    if (!buf || buf.length === 0) return [];
    let raw = buf.toString('utf8');
    if (!raw.trim() || raw.includes('\u0000')) {
      raw = buf.toString('utf16le');
    }
    raw = raw.replace(/\0/g, '\n'); // normalize null separators
    if (!raw.trim()) return [];
    return raw.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).map((entry) => {
      const url = entry.trim();
      if (!url) return null;
      if (url.startsWith('file://')) {
        const decoded = decodeURI(url.replace('file://', ''));
        return decoded;
      }
      return url;
    }).filter(Boolean).filter((filePath) => {
      try {
        return fs.existsSync(filePath);
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function guessMimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.tif':
    case '.tiff':
      return 'image/tiff';
    case '.bmp':
      return 'image/bmp';
    case '.heic':
      return 'image/heic';
    default:
      return 'image/png';
  }
}

function registerHotkey(accelerator) {
  if (registeredHotkey) {
    globalShortcut.unregister(registeredHotkey);
    registeredHotkey = null;
  }

  if (!accelerator) return false;
  const ok = globalShortcut.register(accelerator, () => toggleAtCursor());
  if (ok) registeredHotkey = accelerator;
  return ok;
}

function broadcastSettings() {
  if (win?.webContents) {
    win.webContents.send('settings-updated', settings);
  }
}

function normalizeSettings(patch) {
  if (!patch || typeof patch !== 'object') return {};
  const out = {};
  if (patch.hotkey !== undefined && typeof patch.hotkey === 'string') {
    const trimmed = patch.hotkey.trim();
    if (trimmed) out.hotkey = trimmed;
  }
  if (patch.captureScreenshots !== undefined) {
    out.captureScreenshots = Boolean(patch.captureScreenshots);
  }
  if (patch.captureImages !== undefined) {
    out.captureImages = Boolean(patch.captureImages);
  }
  return out;
}

function isScreenshotLabel(label) {
  return SCREENSHOT_TITLE_RE.test((label || '').toLowerCase());
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'assets', 'ggoodie95.png');
    const baseIcon = nativeImage.createFromPath(iconPath);
    if (baseIcon.isEmpty()) {
      tray = new Tray(nativeImage.createEmpty());
    } else {
      const trayIcon = baseIcon.resize({ height: 24, quality: 'best' });
      const trayIcon2x = baseIcon.resize({ height: 48, quality: 'best' });
      trayIcon.addRepresentation({
        scaleFactor: 2,
        buffer: trayIcon2x.toPNG()
      });
      trayIcon.setTemplateImage(false);
      tray = new Tray(trayIcon);
    }
    tray.setToolTip('ReaperClip — ggoodie95');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show ReaperClip',
        click: () => showWindowFromTray(tray?.getBounds())
      },
      {
        label: 'Hide ReaperClip',
        click: () => hideOverlay()
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', (_event, bounds) => {
      toggleFromTray(bounds);
    });
  } catch (err) {
    console.error('Failed to create tray icon', err);
  }
}

function toggleFromTray(bounds) {
  if (!win) return;
  if (win.isVisible()) {
    hideOverlay();
  } else {
    showWindowFromTray(bounds);
  }
}

function showWindowFromTray(bounds) {
  if (!win) return;

  if (typeof win.setVisibleOnAllWorkspaces === 'function') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  const trayBounds = bounds || tray?.getBounds?.();
  const winBounds = win.getBounds();

  let x = 0;
  let y = 24;

  if (trayBounds) {
    x = Math.round(trayBounds.x + (trayBounds.width / 2) - (winBounds.width / 2));
    y = Math.round(trayBounds.y + trayBounds.height + 6);
  } else {
    const cursor = screen.getCursorScreenPoint();
    x = Math.round(cursor.x - winBounds.width / 2);
    y = cursor.y + 12;
  }

  const display = screen.getDisplayNearestPoint({ x, y });
  const workArea = display.workArea;

  x = Math.min(Math.max(workArea.x + 6, x), workArea.x + workArea.width - winBounds.width - 6);
  y = Math.min(Math.max(workArea.y + 6, y), workArea.y + workArea.height - winBounds.height - 6);

  win.setPosition(x, y, false);
  win.show();
  win.focus();
  win.webContents.send('history-updated', store.peek(20));
  if (process.platform === 'darwin') {
    setTimeout(ensureDockHidden, 0);
  }
}

function ensureDockHidden() {
  if (process.platform !== 'darwin') return;
  if (!app.dock || typeof app.dock.hide !== 'function') return;
  try {
    app.dock.hide();
  } catch (err) {
    console.warn('[dock] failed to hide dock icon', err);
  }
}
