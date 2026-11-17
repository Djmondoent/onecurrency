const { app, BrowserWindow } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: 'OneCurrency',
    show: false,
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    const url = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    win.webContents.session.clearCache().catch(() => {});
    win.loadURL(url);
    try { win.webContents.openDevTools({ mode: 'detach' }); } catch {}
  } else {
    win.webContents.session.clearCache().catch(() => {});
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
