#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { prepareElectronForMacDev, ELECTRON_CLI, ELECTRON_MAIN_ENTRY, PROJECT_ROOT } from './electron-dev.mjs';

function buildChildEnv() {
  const env = { ...process.env };

  for (const key of Object.keys(env)) {
    if (
      key === 'INIT_CWD' ||
      key === 'npm_command' ||
      key === 'npm_execpath' ||
      key === 'npm_lifecycle_event' ||
      key === 'npm_lifecycle_script' ||
      key === 'npm_node_execpath' ||
      key.startsWith('npm_config_') ||
      key.startsWith('npm_package_') ||
      key.startsWith('npm_')
    ) {
      delete env[key];
    }
  }

  return env;
}

function launch(command, args) {
  const child = spawn(command, args, {
    cwd: PROJECT_ROOT,
    env: buildChildEnv(),
    detached: process.platform === 'darwin',
    stdio: 'inherit',
    windowsHide: false,
  });

  child.on('error', (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

  const forwardSignal = (signal) => {
    process.on(signal, () => {
      if (!child.killed) {
        child.kill(signal);
      }
    });
  };

  forwardSignal('SIGINT');
  forwardSignal('SIGTERM');

  child.on('close', (code, signal) => {
    if (signal) {
      console.error(`[desktop:dev] Electron exited with signal ${signal}`);
      process.exitCode = 1;
      return;
    }

    process.exitCode = code ?? 0;
  });
}

async function main() {
  const extraArgs = process.argv.slice(2);

  if (process.platform === 'darwin') {
    const { binaryPath, version, prepared } = await prepareElectronForMacDev();
    if (prepared) {
      console.log(`[desktop:dev] Prepared local Electron cache ${version}`);
    }
    launch(binaryPath, [ELECTRON_MAIN_ENTRY, ...extraArgs]);
    return;
  }

  launch(process.execPath, [ELECTRON_CLI, ELECTRON_MAIN_ENTRY, ...extraArgs]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
