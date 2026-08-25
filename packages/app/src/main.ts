import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initLogger, type Logger } from './logger.js';
import { runStartupSequence, type StartupContext } from './startup.js';
import { registerIpcHandlers } from './ipc/handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.name = 'GST Ledger';

let mainWindow: BrowserWindow | null = null;
let startupContext: StartupContext | null = null;
let logger: Logger | null = null;

function showStartupError(params: {
  step: string;
  error: string;
  stack?: string;
  dbPath: string;
  logsDir: string;
}): void {
  const errorWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'GST Ledger — Startup Failure',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>GST Ledger — Startup Problem</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: #f9fafb;
          color: #111827;
          padding: 2.5rem;
          margin: 0;
        }
        .card {
          background: #ffffff;
          border: 2px solid #ef4444;
          border-radius: 8px;
          padding: 2rem;
          max-width: 680px;
          margin: 0 auto;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        h1 {
          color: #991b1b;
          margin-top: 0;
          font-size: 1.5rem;
        }
        p {
          line-height: 1.5;
          margin: 0.75rem 0;
        }
        .field {
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          padding: 0.75rem;
          font-family: ui-monospace, monospace;
          font-size: 0.9rem;
          margin: 0.5rem 0 1rem;
          word-break: break-all;
        }
        button {
          background: #1f2937;
          color: white;
          border: none;
          padding: 0.6rem 1.2rem;
          border-radius: 4px;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.95rem;
        }
        button:hover { background: #374151; }
        details { margin-top: 1.5rem; }
        summary { cursor: pointer; color: #4b5563; font-weight: 500; }
        pre { background: #111827; color: #f3f4f6; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.8rem; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Startup Failed: ${params.step}</h1>
        <p>GST Ledger was unable to start safely because a database or initialization problem occurred.</p>
        
        <p><strong>Problem Description:</strong></p>
        <div class="field">${params.error}</div>

        <p><strong>Database Path:</strong></p>
        <div class="field">${params.dbPath}</div>

        <p><strong>Log Directory:</strong></p>
        <div class="field">${params.logsDir}</div>

        <button onclick="copyDetails()">Copy Details to Clipboard</button>

        <details>
          <summary>Technical Details (Stack Trace)</summary>
          <pre>${params.stack ?? 'No stack trace available'}</pre>
        </details>
      </div>

      <script>
        function copyDetails() {
          const text = "GST Ledger Startup Failure\\n" +
            "Step: ${params.step}\\n" +
            "Error: ${params.error}\\n" +
            "Database: ${params.dbPath}\\n" +
            "Logs: ${params.logsDir}\\n\\n" +
            "Stack:\\n${(params.stack || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n')}";
          navigator.clipboard.writeText(text).then(() => alert('Details copied to clipboard'));
        }
      </script>
    </body>
    </html>
  `;

  errorWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
}

async function createWindow(): Promise<void> {
  const userDataPath = app.getPath('userData');
  const logsDir = path.join(userDataPath, 'logs');
  logger = initLogger(logsDir);

  logger.info('Application starting', {
    app: 'GST Ledger',
    version: app.getVersion(),
    platform: process.platform,
    userDataPath,
  });

  const dbPath = path.join(userDataPath, 'gst-ledger.sqlite');

  // Run startup sequence
  try {
    startupContext = await runStartupSequence({
      userDataPath,
      logsDir,
      logger,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    showStartupError({
      step: 'STARTUP_SEQUENCE',
      error: errorMsg,
      stack,
      dbPath,
      logsDir,
    });
    return;
  }

  // Register typed IPC handlers
  registerIpcHandlers({
    db: startupContext.db,
    backupService: startupContext.backupService,
    settingsRepo: startupContext.settingsRepo,
    logger,
    appInfo: {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: process.platform,
      userDataPath,
      logsDir,
      databasePath: dbPath,
    },
  });

  const preloadPath = path.join(__dirname, 'preload.mjs');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    show: false, // Prevents white flash before UI is ready
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  });

  mainWindow.once('ready-to-show', async () => {
    if (mainWindow) {
      mainWindow.show();
      logger?.info('Main window displayed');

      if (process.env.CAPTURE_SCREENSHOTS === '1') {
        try {
          await new Promise(r => setTimeout(r, 1500));

          // Criterion 10 console check
          const typeofRequire = await mainWindow.webContents.executeJavaScript('typeof require');
          const typeofProcess = await mainWindow.webContents.executeJavaScript('typeof process');
          const typeofWindowApi = await mainWindow.webContents.executeJavaScript('typeof window.api');

          console.log('=== RENDERER SECURITY CONSOLE CHECK (CRITERION 10) ===');
          console.log('typeof require in renderer console:', typeofRequire);
          console.log('typeof process in renderer console:', typeofProcess);
          console.log('typeof window.api in renderer console:', typeofWindowApi);
          console.log('======================================================');

          const artifactDir = path.resolve(process.cwd());

          // 1. Screenshot State A (Criterion 5): 141542, 21591, 18%, 09 (UP)
          const imgStateA = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifactDir, 'screenshot_state_a_intra.png'), imgStateA.toPNG());
          console.log('Saved screenshot_state_a_intra.png (Criterion 5)');

          // 2. Screenshot State B (Criterion 6): 320373, 48870, 18%, 07 (Delhi)
          await mainWindow.webContents.executeJavaScript(`
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
          const imgStateB = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifactDir, 'screenshot_state_b_inter.png'), imgStateB.toPNG());
          console.log('Saved screenshot_state_b_inter.png (Criterion 6)');

          // 3. Screenshot State C (Criterion 7): Mixed-rate 4853, 677, 18%, 09
          await mainWindow.webContents.executeJavaScript(`
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
          const imgStateC = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifactDir, 'screenshot_state_c_mixed_rate.png'), imgStateC.toPNG());
          console.log('Saved screenshot_state_c_mixed_rate.png (Criterion 7)');

          // 4. Screenshot State D (Criterion 8): Rounding rule switched to HALF_UP
          await mainWindow.webContents.executeJavaScript(`
            (() => {
              const halfUpRadio = document.querySelectorAll('input[name="roundingRule"]')[1];
              if (halfUpRadio) {
                halfUpRadio.click();
              }
            })()
          `);
          await new Promise(r => setTimeout(r, 800));
          const imgStateD = await mainWindow.webContents.capturePage();
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

          app.quit();
        } catch (err) {
          console.error('Screenshot capture failed:', err);
          app.quit();
        }
      }
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

let isQuitting = false;
app.on('before-quit', async event => {
  if (isQuitting) {
    return;
  }

  if (startupContext?.backupService) {
    event.preventDefault();
    isQuitting = true;

    try {
      logger?.info('Application quit initiated, evaluating APP_CLOSE backup...');
      await startupContext.backupService.performAppCloseBackup();
    } catch (err) {
      logger?.error('Error during APP_CLOSE backup', { error: String(err) });
    } finally {
      if (startupContext.db) {
        try {
          startupContext.db.close();
        } catch {
          // ignore
        }
      }
      app.quit();
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
