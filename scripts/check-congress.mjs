import { build } from 'esbuild';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Keep runtime dependencies external, as in the desktop app (in particular the PDF reader's worker).
const parent = resolve('node_modules/.cache');
await mkdir(parent, { recursive: true });
const dir = await mkdtemp(join(parent, 'charlie-congress-'));
try {
  for (const name of ['congress-service', 'congress-house', 'congress-snapshot']) {
    const outfile = join(dir, `${name}.mjs`);
    await build({ entryPoints: [`scripts/fixtures/${name}.fixture.ts`], outfile, bundle: true, packages: 'external', platform: 'node', format: 'esm' });
    await import(pathToFileURL(outfile).href);
  }
} finally { await rm(dir, { recursive: true, force: true }); }
