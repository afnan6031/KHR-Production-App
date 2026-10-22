// KHR Production — Windows / PC desktop app (Electron wrapper around the same app)
// v8: upar ki patti app ke rang mein (Discord jaisi), aur window band karne par app tray mein
//     chalti rehti hai taake messages / deadlines ke notifications aate rahein.
const { app, BrowserWindow, shell, Menu, Tray, nativeImage, ipcMain, session, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

const ICON = path.join(__dirname, '..', 'build-resources', 'icon.png');
const BAR = {
  dark: { color: '#0B1124', symbolColor: '#E8EBF4', bg: '#090C24' },
  light: { color: '#FFFFFF', symbolColor: '#121A2E', bg: '#F2F4FA' }
};
const settingsFile = () => path.join(app.getPath('userData'), 'khr-settings.json');
function readSettings() {
  try { return { autostart: true, dark: true, toldTray: false, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; }
  catch { return { autostart: true, dark: true, toldTray: false }; }
}
function writeSettings(s) { try { fs.writeFileSync(settingsFile(), JSON.stringify(s)); } catch { /* koi baat nahi */ } }

let win = null;
let tray = null;
let quitting = false;
let settings = null;

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow(startHidden) {
  const t = settings.dark ? BAR.dark : BAR.light;
  win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 380,
    minHeight: 600,
    show: false,
    title: 'KHR Production',
    backgroundColor: t.bg,
    icon: ICON,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: t.color, symbolColor: t.symbolColor, height: 32 },
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling: false, // window chhupi ho tab bhi timers / deadline alerts chalte rahein
      autoplayPolicy: 'no-user-gesture-required' // music player
    }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.once('ready-to-show', () => { if (!startHidden) win.show(); });
  // Bahar ke links normal browser mein khulein
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  // X dabane par app band nahi hoti, tray (ghadi ke paas) mein chali jati hai
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!settings.toldTray && tray) {
      settings.toldTray = true;
      writeSettings(settings);
      try { tray.displayBalloon({ iconType: 'info', title: 'KHR Production chal rahi hai', content: 'Notifications aate rahenge. Poori tarah band karne ke liye tray icon par right-click > Band karein.' }); } catch { /* purana Windows */ }
    }
  });
  win.on('focus', () => win.flashFrame(false));
  win.on('session-end', () => { quitting = true; }); // Windows shutdown ko na roke
}

function buildTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('KHR Production');
  const menu = () => Menu.buildFromTemplate([
    { label: 'KHR Production kholein', click: showWindow },
    { type: 'separator' },
    {
      label: 'Computer on hote hi chalayein',
      type: 'checkbox',
      checked: settings.autostart,
      click: (item) => { settings.autostart = item.checked; writeSettings(settings); applyAutostart(); }
    },
    { type: 'separator' },
    { label: 'Band karein (notifications bhi band)', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu());
  tray.on('click', showWindow);
}

function applyAutostart() {
  if (!app.isPackaged) return;
  try { app.setLoginItemSettings({ openAtLogin: !!settings.autostart, args: ['--hidden'] }); } catch { /* koi baat nahi */ }
}

// app ke andar se: theme badla -> upar ki patti ka rang; notification -> taskbar par chamak; tap -> window kholo
ipcMain.on('khr-theme', (_e, dark) => {
  lastBar = '';
  settings.dark = !!dark;
  writeSettings(settings);
  const t = dark ? BAR.dark : BAR.light;
  if (!win) return;
  try { win.setTitleBarOverlay({ color: t.color, symbolColor: t.symbolColor, height: 32 }); } catch { /* purana Windows */ }
  win.setBackgroundColor(t.bg);
});
let lastBar = '';
ipcMain.on('khr-bar', (_e, o) => {
  if (!win || !o || !/^#[0-9a-f]{6}$/i.test(o.color)) return;
  // v15: wahi rang dobara aaye to patti ko na chhuo (Windows par chamak / flicker)
  const key = o.color + (o.dark ? 'd' : 'l');
  if (key === lastBar) return;
  lastBar = key;
  try { win.setTitleBarOverlay({ color: o.color, symbolColor: o.dark ? '#E8EBF4' : '#121A2E', height: 32 }); } catch { /* purana Windows */ }
});
// v16: Pixeldrain par upload (Node se — browser ki CORS rukawat nahi), progress app ko bhejte hain.
// Bari video: file disk se seedhi stream (memory mein poori nahi aati). Chhoti file: bytes.
const https = require('https');
const pdReqs = new Map();
ipcMain.handle('khr-pd-upload', async (e, o) => {
  let size = 0;
  let body = null;
  if (o.path) {
    try { size = fs.statSync(o.path).size; } catch (err) { return { status: 0, text: 'File nahi mili: ' + (err && err.message) }; }
  } else {
    body = Buffer.from(o.bytes);
    size = body.length;
  }
  const name = String(o.name || 'file').slice(0, 180);
  return new Promise((resolve) => {
    const req = https.request({
      method: 'PUT',
      hostname: 'pixeldrain.com',
      path: '/api/file/' + encodeURIComponent(name),
      headers: {
        Authorization: 'Basic ' + Buffer.from(':' + String(o.key || '')).toString('base64'),
        'Content-Type': o.type || 'application/octet-stream',
        'Content-Length': size,
        'User-Agent': 'KHR-Production/1.0 (Windows)'
      }
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => { pdReqs.delete(o.id); resolve({ status: res.statusCode || 0, text }); });
    });
    pdReqs.set(o.id, req);
    req.on('error', (err) => { pdReqs.delete(o.id); resolve({ status: 0, text: String((err && err.message) || err) }); });
    let sent = 0;
    let last = -1;
    const tick = (n) => {
      sent += n;
      const pct = size ? Math.round((sent / size) * 100) : 0;
      if (pct !== last) { last = pct; try { e.sender.send('khr-pd-progress', { id: o.id, pct }); } catch { /* window band */ } }
    };
    if (o.path) {
      const rs = fs.createReadStream(o.path, { highWaterMark: 512 * 1024 });
      rs.on('data', (c) => { tick(c.length); if (!req.write(c)) { rs.pause(); req.once('drain', () => rs.resume()); } });
      rs.on('end', () => req.end());
      rs.on('error', (err) => req.destroy(err));
      req.on('close', () => rs.destroy());
      return;
    }
    const CH = 256 * 1024;
    let off = 0;
    const pump = () => {
      while (off < body.length) {
        const chunk = body.subarray(off, off + CH);
        off += chunk.length;
        tick(chunk.length);
        if (!req.write(chunk)) { req.once('drain', pump); return; }
      }
      req.end();
    };
    pump();
  });
});
ipcMain.on('khr-pd-cancel', (_e, id) => { const r = pdReqs.get(id); if (r) { r.destroy(new Error('Upload cancel ho gaya')); pdReqs.delete(id); } });
// v16: app Pixeldrain ki key yahan deti hai (videos / awaaz chalane ke liye)
let pdKey = '';
ipcMain.on('khr-pd-key', (_e, k) => { pdKey = String(k || '').trim(); });
ipcMain.handle('khr-fetch-bytes', async (_e, url) => {
  if (!/^https:\/\/((files\.)?catbox\.moe|pixeldrain\.com)\//i.test(String(url))) throw new Error('not allowed');
  const headers = { 'User-Agent': 'KHR-Production/1.0 (Windows)' };
  if (pdKey && /pixeldrain\.com/i.test(String(url))) headers.Authorization = 'Basic ' + Buffer.from(':' + pdKey).toString('base64');
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return { type: r.headers.get('content-type') || 'audio/mpeg', bytes: Buffer.from(await r.arrayBuffer()) };
});
ipcMain.on('khr-attention', () => { if (win && !win.isFocused()) win.flashFrame(true); });
ipcMain.on('khr-show', showWindow);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('com.khr.production'); // Windows notifications ke liye zaroori
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { quitting = true; });
  app.whenReady().then(() => {
    // v11/v16: Catbox / Pixeldrain (music) aur Gemini (voiceover) — browser ki CORS rukawat ke baghair
    session.defaultSession.webRequest.onHeadersReceived({ urls: ['https://catbox.moe/*', 'https://*.catbox.moe/*', 'https://pixeldrain.com/*', 'https://generativelanguage.googleapis.com/*'] }, (det, cb) => {
      const h = { ...det.responseHeaders };
      for (const k of Object.keys(h)) if (k.toLowerCase().startsWith('access-control-')) delete h[k];
      h['Access-Control-Allow-Origin'] = ['*'];
      h['Access-Control-Allow-Headers'] = ['Authorization, Content-Type, Range, X-Goog-Api-Key, *'];
      h['Access-Control-Allow-Methods'] = ['GET, POST, PUT, OPTIONS'];
      h['Access-Control-Expose-Headers'] = ['Content-Length, Content-Range, Content-Type'];
      cb({ responseHeaders: h });
    });
    // v9 music: YouTube player ko "Referer" chahiye (file:// se khulne wali app ke paas nahi hota)
    // v16: Pixeldrain — free account par "hotlinking" band hai; owner ki key saath bhejo (owner hamesha chala / download kar sakta hai)
    //      aur Referer / Origin hata do. (Ek session mein ek hi onBeforeSendHeaders chalta hai — is liye dono yahin.)
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://*.youtube.com/*', 'https://*.youtube-nocookie.com/*', 'https://*.googlevideo.com/*', 'https://*.ytimg.com/*', 'https://pixeldrain.com/*', 'https://*.pixeldrain.com/*'] },
      (details, cb) => {
        const h = details.requestHeaders;
        if (/^https:\/\/([\w-]+\.)?pixeldrain\.com\//i.test(details.url)) {
          for (const k of Object.keys(h)) if (/^(referer|origin)$/i.test(k)) delete h[k];
          const hasAuth = Object.keys(h).some((k) => k.toLowerCase() === 'authorization');
          if (pdKey && !hasAuth) h.Authorization = 'Basic ' + Buffer.from(':' + pdKey).toString('base64');
        } else if (!h.Referer) h.Referer = 'https://khr-production.app/';
        cb({ requestHeaders: h });
      }
    );
    settings = readSettings();
    applyAutostart();
    buildTray();
    createWindow(process.argv.includes('--hidden'));
    // v15: PC sleep se jaage / lock khule -> app ko batao (realtime dobara jode aur reh gaye messages le aaye)
    const wake = () => { try { win && win.webContents.executeJavaScript("window.dispatchEvent(new Event('online'))"); } catch { /* koi baat nahi */ } };
    try { powerMonitor.on('resume', wake); powerMonitor.on('unlock-screen', wake); } catch { /* purana Electron */ }
  });
  app.on('window-all-closed', () => { /* tray mein chalti rahe */ });
}
