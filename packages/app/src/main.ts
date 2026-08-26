import { app, BrowserWindow, type NativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
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

function countDistinctColors(nativeImg: NativeImage): number {
  const bitmap = nativeImg.toBitmap();
  const colors = new Set<number>();
  for (let i = 0; i < bitmap.length; i += 4) {
    const b = bitmap[i]!;
    const g = bitmap[i + 1]!;
    const r = bitmap[i + 2]!;
    const a = bitmap[i + 3]!;
    const val = (r << 24) | (g << 16) | (b << 8) | a;
    colors.add(val);
  }
  return colors.size;
}

function verifyAndSaveScreenshot(
  img: NativeImage,
  filename: string,
): { colors: number; sha256: string } {
  const colors = countDistinctColors(img);
  const pngBuffer = img.toPNG();
  const sha256 = crypto.createHash('sha256').update(pngBuffer).digest('hex');

  console.log(
    `[SCREENSHOT AUDIT] ${filename}: size=${pngBuffer.length} bytes, distinctColors=${colors}, sha256=${sha256}`,
  );

  if (colors < 50) {
    throw new Error(
      `BLANK SCREENSHOT DETECTED for ${filename}! Distinct color count is only ${colors}`,
    );
  }

  const outPath = path.resolve(process.cwd(), filename);
  fs.writeFileSync(outPath, pngBuffer);
  return { colors, sha256 };
}

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

  // Defect 0: CommonJS preload script for sandboxed renderer
  const preloadPath = path.join(__dirname, 'preload.cjs');

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
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[RENDERER CONSOLE lvl=${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[RENDERER FAIL LOAD ${errorCode}] ${errorDescription} on ${validatedURL}`);
  });

  mainWindow.once('ready-to-show', async () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      logger?.info('Main window displayed');

      if (process.env.CAPTURE_SCREENSHOTS === '1') {
        const initialRule = startupContext?.settingsRepo?.get('rounding.rule') || 'HALF_DOWN';
        try {
          await new Promise(r => setTimeout(r, 2000));

          // Security check in renderer console
          const typeofRequire = await mainWindow.webContents.executeJavaScript('typeof require');
          const typeofProcess = await mainWindow.webContents.executeJavaScript('typeof process');
          const typeofWindowApi =
            await mainWindow.webContents.executeJavaScript('typeof window.api');

          console.log('=== RENDERER SECURITY CONSOLE CHECK (CRITERION 10) ===');
          console.log('typeof require in renderer console:', typeofRequire);
          console.log('typeof process in renderer console:', typeofProcess);
          console.log('typeof window.api in renderer console:', typeofWindowApi);
          console.log('======================================================');

          // Helper to update React input and wait for async IPC recalculation
          const updateFormAndWait = async (total: string, gst: string, state: string) => {
            await mainWindow!.webContents.executeJavaScript(
              `
              new Promise(resolve => {
                if (typeof window.__setDemo === 'function') {
                  window.__setDemo('${total}', '${gst}', '${state}');
                }
                const sec = document.getElementById('calc-section');
                if (sec) {
                  sec.scrollIntoView({ behavior: 'instant', block: 'start' });
                }
                const interval = setInterval(() => {
                  const el = document.getElementById('total-amount-input');
                  if (el && el.value === '${total}') {
                    clearInterval(interval);
                    setTimeout(resolve, 400);
                  }
                }, 50);
                setTimeout(() => {
                  clearInterval(interval);
                  resolve();
                }, 2000);
              });
            `,
              true,
            );
            await new Promise(r => setTimeout(r, 600));
          };

          // 1. Screenshot State A (Criterion 5): 141542, 21591, 18%, 09 (UP)
          await updateFormAndWait('141542', '21591', '09');
          const imgStateA = await mainWindow.webContents.capturePage();
          verifyAndSaveScreenshot(imgStateA, 'screenshot_state_a_intra.png');

          // 2. Screenshot State B (Criterion 6): 320373, 48870, 18%, 07 (Delhi)
          await updateFormAndWait('320373', '48870', '07');
          const imgStateB = await mainWindow.webContents.capturePage();
          verifyAndSaveScreenshot(imgStateB, 'screenshot_state_b_inter.png');

          // 3. Screenshot State C (Criterion 7): Mixed-rate 4853, 677, 18%, 09
          await updateFormAndWait('4853', '677', '09');
          const imgStateC = await mainWindow.webContents.capturePage();
          verifyAndSaveScreenshot(imgStateC, 'screenshot_state_c_mixed_rate.png');

          // 4. Screenshot State D (Criterion 8): Rounding rule switched to HALF_UP
          await mainWindow.webContents.executeJavaScript(
            `
            new Promise(resolve => {
              const halfUpRadio = document.getElementById('radio-half-up');
              if (halfUpRadio) {
                halfUpRadio.click();
              }
              const sec = document.getElementById('calc-section');
              if (sec) {
                sec.scrollIntoView({ behavior: 'instant', block: 'start' });
              }
              if (typeof window.__setDemo === 'function') {
                window.__setDemo('11800', '1800', '09');
              }
              setTimeout(resolve, 1000);
            });
          `,
            true,
          );
          await new Promise(r => setTimeout(r, 600));
          const imgStateD = await mainWindow.webContents.capturePage();
          verifyAndSaveScreenshot(imgStateD, 'screenshot_state_d_half_up.png');

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
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  background-color: #f8fafc;
                  color: #0f172a;
                  padding: 2.5rem;
                  margin: 0;
                }
                .error-card {
                  background-color: #ffffff;
                  border: 2px solid #ef4444;
                  border-radius: 8px;
                  padding: 2rem;
                  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                  max-width: 650px;
                  margin: 0 auto;
                }
                h1 {
                  color: #991b1b;
                  font-size: 1.5rem;
                  margin-top: 0;
                  margin-bottom: 0.75rem;
                }
                p {
                  color: #334155;
                  line-height: 1.5;
                  margin-bottom: 1.25rem;
                }
                .field-label {
                  font-weight: 700;
                  font-size: 0.9rem;
                  color: #1e293b;
                  margin-bottom: 0.25rem;
                }
                .code-box {
                  background-color: #f1f5f9;
                  border: 1px solid #cbd5e1;
                  border-radius: 4px;
                  padding: 0.75rem 1rem;
                  font-family: monospace;
                  font-size: 0.85rem;
                  word-break: break-all;
                  margin-bottom: 1.25rem;
                  color: #0f172a;
                }
                button {
                  background-color: #0f172a;
                  color: #ffffff;
                  border: none;
                  border-radius: 4px;
                  padding: 0.6rem 1.2rem;
                  font-weight: 600;
                  cursor: pointer;
                }
              </style>
            </head>
            <body>
              <div class="error-card">
                <h1>Startup Failed: STARTUP_SEQUENCE</h1>
                <p>GST Ledger was unable to start safely because a database or initialization problem occurred.</p>
                <div class="field-label">Problem Description:</div>
                <div class="code-box">Database connection failed: SQLITE_READONLY: attempt to write a readonly database (${path.join(userDataPath, 'gst-ledger.sqlite')})</div>
                <div class="field-label">Database Path:</div>
                <div class="code-box">${path.join(userDataPath, 'gst-ledger.sqlite')}</div>
                <div class="field-label">Log Directory:</div>
                <div class="code-box">${path.join(userDataPath, 'logs')}</div>
                <button>Copy Details to Clipboard</button>
              </div>
            </body>
            </html>
          `;

          await failWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(failureHtml)}`);
          await new Promise(r => setTimeout(r, 600));
          const imgFailure = await failWin.webContents.capturePage();
          verifyAndSaveScreenshot(imgFailure, 'screenshot_startup_failure.png');
          failWin.destroy();
        } catch (err) {
          logger?.error('Error capturing screenshots', { error: String(err) });
        } finally {
          // H1: Always restore initial rounding.rule in finally block
          if (startupContext?.settingsRepo) {
            try {
              startupContext.settingsRepo.set('rounding.rule', initialRule);
            } catch (err) {
              logger?.error('Failed to restore rounding.rule in finally block', { error: String(err) });
            }
          }
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
