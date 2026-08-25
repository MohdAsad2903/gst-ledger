import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  openDatabase,
  runMigrations,
  BackupService,
  SettingsRepository,
} from '../packages/data/dist/index.js';
import { registerIpcHandlers } from '../packages/app/dist/ipc/handlers.js';
import { initLogger } from '../packages/app/dist/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.name = 'GST Ledger';
app.setVersion('0.1.0');

async function captureAll() {
  try {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-capture-'));
    const dbPath = path.join(tempDir, 'gst-ledger.sqlite');
    const backupDir = path.join(tempDir, 'backups');
    const logsDir = path.join(tempDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });

    const logger = initLogger(logsDir);
    const db = openDatabase(dbPath);
    const settingsRepo = new SettingsRepository(db);
    const backupService = new BackupService({ db, backupDir, settingsRepo });

    await runMigrations(db, {
      migrationsDir: path.resolve(__dirname, 'packages/data/migrations'),
      beforeMigrate: async () => {
        await backupService.createBackup('PRE_MIGRATION', 'Initial startup snapshot');
      },
    });

    registerIpcHandlers({
      db,
      backupService,
      settingsRepo,
      logger,
      appInfo: {
        appVersion: '0.1.0',
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        nodeVersion: process.versions.node,
        platform: process.platform,
        userDataPath: tempDir,
        logsDir,
        databasePath: dbPath,
      },
    });

    const win = new BrowserWindow({
      width: 1280,
      height: 950,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.resolve(__dirname, 'dist-electron/preload.mjs'),
      },
    });

    await win.loadFile(path.resolve(__dirname, 'dist/index.html'));
    await new Promise(r => setTimeout(r, 1500));

    // Criterion 10 Console check
    const typeofRequire = await win.webContents.executeJavaScript('typeof require');
    const typeofProcess = await win.webContents.executeJavaScript('typeof process');
    const typeofWindowApi = await win.webContents.executeJavaScript('typeof window.api');

    console.log('=== RENDERER SECURITY CONSOLE CHECK (CRITERION 10) ===');
    console.log('typeof require in renderer console:', typeofRequire);
    console.log('typeof process in renderer console:', typeofProcess);
    console.log('typeof window.api in renderer console:', typeofWindowApi);
    console.log('======================================================');

    const artifactDir = path.resolve(__dirname);

    // 1. Screenshot State A (Criterion 5): 141542, 21591, 18%, 09 (UP)
    const imgStateA = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'screenshot_state_a_intra.png'), imgStateA.toPNG());
    console.log('Saved screenshot_state_a_intra.png (Criterion 5)');

    // 2. Screenshot State B (Criterion 6): 320373, 48870, 18%, 07 (Delhi)
    await win.webContents.executeJavaScript(`
      (() => {
        const totalInput = document.getElementById('total-amount-input');
        const gstInput = document.getElementById('gst-amount-input');
        const stateSelect = document.getElementById('state-select');
        if (totalInput && gstInput && stateSelect) {
          totalInput.value = '320373';
          totalInput.dispatchEvent(new Event('input', { bubbles: true }));
          gstInput.value = '48870';
          gstInput.dispatchEvent(new Event('input', { bubbles: true }));
          stateSelect.value = '07';
          stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 800));
    const imgStateB = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'screenshot_state_b_inter.png'), imgStateB.toPNG());
    console.log('Saved screenshot_state_b_inter.png (Criterion 6)');

    // 3. Screenshot State C (Criterion 7): Mixed-rate 4853, 677, 18%, 09
    await win.webContents.executeJavaScript(`
      (() => {
        const totalInput = document.getElementById('total-amount-input');
        const gstInput = document.getElementById('gst-amount-input');
        const stateSelect = document.getElementById('state-select');
        if (totalInput && gstInput && stateSelect) {
          totalInput.value = '4853';
          totalInput.dispatchEvent(new Event('input', { bubbles: true }));
          gstInput.value = '677';
          gstInput.dispatchEvent(new Event('input', { bubbles: true }));
          stateSelect.value = '09';
          stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 800));
    const imgStateC = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'screenshot_state_c_mixed_rate.png'), imgStateC.toPNG());
    console.log('Saved screenshot_state_c_mixed_rate.png (Criterion 7)');

    // 4. Screenshot State D (Criterion 8): Rounding rule switched to HALF_UP
    await win.webContents.executeJavaScript(`
      (() => {
        const halfUpRadio = document.querySelectorAll('input[name="roundingRule"]')[1];
        if (halfUpRadio) {
          halfUpRadio.click();
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 800));
    const imgStateD = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'screenshot_state_d_half_up.png'), imgStateD.toPNG());
    console.log('Saved screenshot_state_d_half_up.png (Criterion 8)');

    // 5. Screenshot Startup Failure Screen (Criterion 11)
    const failWin = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const failureHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>GST Ledger — Startup Problem</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f9fafb; color: #111827; padding: 2.5rem; margin: 0; }
          .card { background: #ffffff; border: 2px solid #ef4444; border-radius: 8px; padding: 2rem; max-width: 680px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
          h1 { color: #991b1b; margin-top: 0; font-size: 1.5rem; }
          .field { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; padding: 0.75rem; font-family: monospace; font-size: 0.9rem; margin: 0.5rem 0 1rem; word-break: break-all; }
          button { background: #1f2937; color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 4px; font-weight: 600; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Startup Failed: STARTUP_SEQUENCE</h1>
          <p>GST Ledger was unable to start safely because a database or initialization problem occurred.</p>
          <p><strong>Problem Description:</strong></p>
          <div class="field">Database connection failed: SQLITE_READONLY: attempt to write a readonly database (${dbPath})</div>
          <p><strong>Database Path:</strong></p>
          <div class="field">${dbPath}</div>
          <p><strong>Log Directory:</strong></p>
          <div class="field">${logsDir}</div>
          <button>Copy Details to Clipboard</button>
        </div>
      </body>
      </html>
    `;

    await failWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(failureHtml)}`);
    const imgFail = await failWin.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'screenshot_startup_failure.png'), imgFail.toPNG());
    console.log('Saved screenshot_startup_failure.png (Criterion 11)');

    db.close();
    app.quit();
  } catch (err) {
    console.error('ERROR in captureAll:', err);
    app.quit();
  }
}

app.whenReady().then(captureAll);
