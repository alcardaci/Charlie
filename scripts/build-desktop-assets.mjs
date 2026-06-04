import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function main() {
  await mkdir(join(projectRoot, 'build-assets'), { recursive: true });

  if (process.platform !== 'darwin') {
    console.log('Skipping macOS icon build on non-macOS platform.');
    return;
  }

  await execFileAsync(process.execPath, [join(projectRoot, 'scripts', 'build-mac-icon.mjs')], {
    cwd: projectRoot,
  });
}

main().catch((error) => {
  console.error('[build-desktop-assets]', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
