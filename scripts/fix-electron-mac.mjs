#!/usr/bin/env node

import { prepareElectronForMacDev } from './electron-dev.mjs';

async function main() {
  if (process.platform !== 'darwin') {
    console.log('fix:electron-mac only applies to macOS.');
    return;
  }

  const { appPath, version } = await prepareElectronForMacDev({ forceRefresh: true });
  console.log(`Prepared a local Electron cache for v${version} at ${appPath}`);
  console.log('You can now run npm run desktop:dev');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
