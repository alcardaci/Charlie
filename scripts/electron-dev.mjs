import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON_SOURCE_APP = join(PROJECT_ROOT, 'node_modules', 'electron', 'dist', 'Electron.app');
const ELECTRON_CLI = join(PROJECT_ROOT, 'node_modules', 'electron', 'cli.js');
const ELECTRON_MAIN_ENTRY = join(PROJECT_ROOT, 'electron', 'main.mjs');
const ELECTRON_PACKAGE_JSON = join(PROJECT_ROOT, 'node_modules', 'electron', 'package.json');
const ELECTRON_CACHE_ROOT = resolve('/private/tmp', 'charlie-electron-cache');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const signal = result.signal ? ` (signal ${result.signal})` : '';
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status}${signal}`);
  }
}

function runQuiet(command, args) {
  return spawnSync(command, args, { stdio: 'ignore' });
}

async function getElectronVersion() {
  const raw = await readFile(ELECTRON_PACKAGE_JSON, 'utf8');
  const parsed = JSON.parse(raw);
  const version = typeof parsed.version === 'string' && parsed.version.trim() ? parsed.version.trim() : '';
  if (!version) {
    throw new Error('Unable to determine the installed Electron version.');
  }
  return version;
}

function getCachedElectronPaths(version) {
  const cacheRoot = join(ELECTRON_CACHE_ROOT, version);
  const appPath = join(cacheRoot, 'Electron.app');
  const binaryPath = join(appPath, 'Contents', 'MacOS', 'Electron');
  return { cacheRoot, appPath, binaryPath };
}

function bundleLooksValid(appPath) {
  if (runQuiet('codesign', ['--verify', '--deep', '--strict', appPath]).status !== 0) {
    return false;
  }

  return runQuiet('codesign', ['-dv', '--verbose=4', appPath]).status === 0;
}

async function stripExtendedAttributes(appPath) {
  run('xattr', ['-cr', appPath]);
}

export async function prepareElectronForMacDev({ forceRefresh = false } = {}) {
  if (process.platform !== 'darwin') {
    return {
      appPath: ELECTRON_SOURCE_APP,
      binaryPath: join(ELECTRON_SOURCE_APP, 'Contents', 'MacOS', 'Electron'),
      prepared: false,
      version: null,
    };
  }

  await access(ELECTRON_SOURCE_APP, fsConstants.F_OK);
  const version = await getElectronVersion();
  const { cacheRoot, appPath, binaryPath } = getCachedElectronPaths(version);

  if (!forceRefresh) {
    try {
      await access(binaryPath, fsConstants.X_OK);
      if (bundleLooksValid(appPath)) {
        return { appPath, binaryPath, prepared: false, version };
      }
    } catch {
      // Fall through and rebuild the cache.
    }
  }

  await rm(cacheRoot, { recursive: true, force: true });
  await mkdir(cacheRoot, { recursive: true });

  run('ditto', [ELECTRON_SOURCE_APP, appPath]);
  await stripExtendedAttributes(appPath);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);

  return { appPath, binaryPath, prepared: true, version };
}

export {
  ELECTRON_CLI,
  ELECTRON_MAIN_ENTRY,
  PROJECT_ROOT,
};
