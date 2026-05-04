const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = process.env.NODE_ENV !== 'production';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: "Cosmo Video",
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  if (isDev) {
    try {
      mainWindow.loadURL('http://localhost:5173');
    } catch (e) {
      console.error('Failed to load dev URL:', e);
    }
  } else {
    try {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    } catch (e) {
      console.error('Failed to load production file:', e);
    }
  }

  // Handle window controls from renderer
  ipcMain.on('window-min', () => mainWindow.minimize());
  ipcMain.on('window-max', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.on('window-close', () => mainWindow.close());

  // Handle folder reading for drag-and-drop
  ipcMain.handle('get-folder-videos', async (event, targetPath) => {
    if (typeof targetPath !== 'string' || !path.isAbsolute(targetPath)) {
      console.error('Invalid targetPath:', targetPath);
      return [];
    }
    try {
      const stats = fs.statSync(targetPath);
      const dir = stats.isDirectory() ? targetPath : path.dirname(targetPath);
      const files = fs.readdirSync(dir);
      const videoExts = ['.mp4', '.mkv', '.avi', '.webm', '.mov', '.m4v'];
      const videos = files
        .filter(f => videoExts.includes(path.extname(f).toLowerCase()))
        .map(f => ({
          name: f,
          url: `file:///${path.join(dir, f).replace(/\\\\/g, '/')}`
        }));
      return videos;
    } catch (e) {
      console.error('Error reading folder:', e);
      return [];
    }
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.on('open-folder', (event, targetPath) => {
    const localPath = targetPath.replace('file:///', '').replace(/\\//g, '\\');
    shell.showItemInFolder(localPath);
  });

  ipcMain.on('set-always-on-top', (event, flag) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setAlwaysOnTop(flag);
  });

  ipcMain.handle('save-snapshot', async (event, { base64Data, fileName, customDir }) => {
    const os = require('os');
    const picturesDir = customDir || path.join(os.homedir(), 'Pictures', 'CosmoVideo');
    if (!fs.existsSync(picturesDir)) fs.mkdirSync(picturesDir, { recursive: true });
    const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
    const fullPath = path.join(picturesDir, fileName);
    fs.writeFileSync(fullPath, buffer);
    return fullPath;
  });

  ipcMain.on('pop-out', (event, { url, title }) => {
    const pop = new BrowserWindow({
      width: 800,
      height: 450,
      title: `Cosmo - ${title}`,
      autoHideMenuBar: true,
      webPreferences: {
        webSecurity: false,
        autoplayPolicy: 'no-user-gesture-required'
      }
    });
    pop.loadURL(`data:text/html,<html><body style="margin:0;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center"><video src="${url}" autoplay loop controls style="max-width:100%;max-height:100%"></video></body></html>`);
  });
}

app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Graceful shutdown cleanup
app.on('before-quit', () => {
  console.log('Application is quitting, cleaning up resources.');
});
