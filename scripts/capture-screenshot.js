import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.name = 'GST Ledger';
app.setVersion('0.1.0');

async function capture() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.resolve(__dirname, '../dist-electron/preload.mjs'),
    },
  });

  ipcMain.handle('system:getInfo', () => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    userDataPath: app.getPath('userData'),
  }));

  await win.loadFile(path.resolve(__dirname, '../dist/index.html'));

  // Wait a moment for React to mount and resolve IPC
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Evaluate Criterion 9 in renderer context
  const typeofRequire = await win.webContents.executeJavaScript('typeof require');
  const typeofProcess = await win.webContents.executeJavaScript('typeof process');
  const typeofGstLedger = await win.webContents.executeJavaScript('typeof window.gstLedger');

  console.log('--- RENDERER CONSOLE CHECK ---');
  console.log('typeof require in renderer:', typeofRequire);
  console.log('typeof process in renderer:', typeofProcess);
  console.log('typeof window.gstLedger in renderer:', typeofGstLedger);
  console.log('------------------------------');

  // Capture screenshot
  const image = await win.webContents.capturePage();
  const screenshotPath = path.resolve(__dirname, '../screenshot_running_window.png');
  fs.writeFileSync(screenshotPath, image.toPNG());
  console.log('Screenshot saved to:', screenshotPath);

  app.quit();
}

app.whenReady().then(capture);
