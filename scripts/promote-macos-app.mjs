import { rm, symlink } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const builtApp = join(projectRoot, 'release', 'mac-arm64', 'Charlie.app');
const promotedApp = join(projectRoot, 'release', 'Charlie.app');

async function main() {
  if (process.platform !== 'darwin') {
    console.log('Skipping macOS app promotion because the current platform is not macOS.');
    return;
  }

  await rm(promotedApp, { recursive: true, force: true });
  await symlink(relative(dirname(promotedApp), builtApp), promotedApp, 'dir');
  console.log(`Promoted ${builtApp} to ${promotedApp} via symlink`);
}

main().catch((error) => {
  console.error('[promote-macos-app]', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
