// KHR Production — Windows / PC desktop app (Electron wrapper around the same app)
// v8: upar ki patti app ke rang mein (Discord jaisi), aur window band karne par app tray mein
//     chalti rehti hai taake messages / deadlines ke notifications aate rahein.
const { app, BrowserWindow, shell, Menu, Tray, nativeImage, ipcMain, session } = require('electron');
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
  settings.dark = !!dark;
  writeSettings(settings);
  const t = dark ? BAR.dark : BAR.light;
  if (!win) return;
  try { win.setTitleBarOverlay({ color: t.color, symbolColor: t.symbolColor, height: 32 }); } catch { /* purana Windows */ }
  win.setBackgroundColor(t.bg);
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
    // v9 music: YouTube player ko "Referer" chahiye (file:// se khulne wali app ke paas nahi hota)
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://*.youtube.com/*', 'https://*.youtube-nocookie.com/*', 'https://*.googlevideo.com/*', 'https://*.ytimg.com/*'] },
      (details, cb) => {
        if (!details.requestHeaders.Referer) details.requestHeaders.Referer = 'https://khr-production.app/';
        cb({ requestHeaders: details.requestHeaders });
      }
    );
    settings = readSettings();
    applyAutostart();
    buildTray();
    createWindow(process.argv.includes('--hidden'));
  });
  app.on('window-all-closed', () => { /* tray mein chalti rahe */ });
}
