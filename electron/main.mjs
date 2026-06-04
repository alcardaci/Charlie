import { app, BrowserWindow, shell } from 'electron';
import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, preview } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const DEFAULT_PACKAGED_PREVIEW_PORT = 4173;

let mainWindow = null;
let viteDevServer = null;
let vitePreviewServer = null;
let rendererUrlPromise = null;
let currentRendererUrl = null;
let shutdownPromise = null;
let isQuitting = false;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function setDockIconIfAvailable() {
  if (process.platform !== 'darwin') return;

  const possibleIcons = app.isPackaged
    ? [join(process.resourcesPath, 'icon.icns'), join(process.resourcesPath, 'Charlie.icns')]
    : [join(projectRoot, 'build-assets', 'Charlie.icns')];

  for (const iconPath of possibleIcons) {
    try {
      await access(iconPath);
      app.dock?.setIcon(iconPath);
      return;
    } catch {
      // Try the next candidate path.
    }
  }
}

function resolveServerUrl(server) {
  const url = server?.resolvedUrls?.local?.[0];
  if (url) return url;

  const address = server?.httpServer?.address?.();
  if (address && typeof address === 'object' && 'port' in address) {
    return `http://127.0.0.1:${address.port}`;
  }

  throw new Error('Unable to resolve the local renderer server URL.');
}

async function startRendererServer() {
  if (rendererUrlPromise) return rendererUrlPromise;

  rendererUrlPromise = (async () => {
    if (app.isPackaged) {
      const appRoot = app.getAppPath();
      const requestedPort = Number.parseInt(process.env.CHARLIE_PREVIEW_PORT ?? '', 10);
      const previewPort = Number.isFinite(requestedPort) && requestedPort > 0
        ? requestedPort
        : DEFAULT_PACKAGED_PREVIEW_PORT;
      vitePreviewServer = await preview({
        configFile: join(appRoot, 'vite.config.ts'),
        root: appRoot,
        preview: {
          host: '127.0.0.1',
          port: previewPort,
          strictPort: false,
          open: false,
        },
      });

      currentRendererUrl = resolveServerUrl(vitePreviewServer);
      return currentRendererUrl;
    }

    viteDevServer = await createServer({
      configFile: join(projectRoot, 'vite.config.ts'),
      root: projectRoot,
      server: {
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
      },
      appType: 'spa',
      clearScreen: false,
    });

    await viteDevServer.listen();
    currentRendererUrl = resolveServerUrl(viteDevServer);
    return currentRendererUrl;
  })();

  return rendererUrlPromise;
}

async function stopRendererServer() {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    if (viteDevServer) {
      await withTimeout(viteDevServer.close(), 5000, 'Vite dev server shutdown');
      viteDevServer = null;
    }

    if (vitePreviewServer?.httpServer) {
      vitePreviewServer.httpServer.closeIdleConnections?.();
      vitePreviewServer.httpServer.closeAllConnections?.();
      await withTimeout(new Promise((resolveClose, rejectClose) => {
        vitePreviewServer.httpServer.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      }), 5000, 'Vite preview server shutdown');
      vitePreviewServer = null;
    }

    rendererUrlPromise = null;
    currentRendererUrl = null;
  })();

  try {
    await shutdownPromise;
  } finally {
    shutdownPromise = null;
  }
}

async function createMainWindow() {
  const rendererUrl = await startRendererServer();
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    title: 'Charlie',
    backgroundColor: '#0a1017',
    ...(isMac ? { titleBarStyle: 'hiddenInset' } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    show: false,
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (currentRendererUrl && url.startsWith(currentRendererUrl)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  await mainWindow.loadURL(rendererUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.setName('Charlie');

app.whenReady().then(async () => {
  try {
    await setDockIconIfAvailable();
    await createMainWindow();
  } catch (error) {
    console.error('[electron] unable to start Charlie', error);
    await stopRendererServer().catch(() => undefined);
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  if (isQuitting) return;

  isQuitting = true;
  event.preventDefault();

  await stopRendererServer().catch((error) => {
    console.error('[electron] unable to stop local renderer server', error);
  });

  app.exit(0);
});
