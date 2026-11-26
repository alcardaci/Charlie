import { access, mkdir, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourcePng = join(projectRoot, 'public', 'charlie-icon', '1024x1024.png');
const buildAssetsDir = join(projectRoot, 'build-assets');
const iconsetDir = join(buildAssetsDir, 'Charlie.iconset');
const outputIcns = join(buildAssetsDir, 'Charlie.icns');

const iconVariants = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

async function ensureDarwinTool(tool) {
  try {
    await execFileAsync('/usr/bin/which', [tool]);
  } catch {
    throw new Error(`Required macOS tool not found: ${tool}`);
  }
}

async function ensureSourceExists(path) {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`Icon source not found: ${path}`);
  }
}

async function main() {
  if (process.platform !== 'darwin') {
    console.log('Skipping mac icon generation because the current platform is not macOS.');
    return;
  }

  await ensureSourceExists(sourcePng);
  await ensureDarwinTool('sips');
  await ensureDarwinTool('iconutil');

  await mkdir(buildAssetsDir, { recursive: true });
  await rm(iconsetDir, { recursive: true, force: true });
  await mkdir(iconsetDir, { recursive: true });

  for (const [filename, size] of iconVariants) {
    await execFileAsync('/usr/bin/sips', ['-z', String(size), String(size), sourcePng, '--out', join(iconsetDir, filename)]);
  }

  await execFileAsync('/usr/bin/iconutil', ['-c', 'icns', iconsetDir, '-o', outputIcns]);
  console.log(`Built ${outputIcns}`);
}

main().catch((error) => {
  console.error('[build-mac-icon]', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
