import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const scratchDir = await mkdtemp(path.join(tmpdir(), 'charlie-opportunities-quality-'));
const outfile = path.join(scratchDir, 'quality-check.mjs');

try {
  await build({
    entryPoints: [path.resolve('scripts/fixtures/opportunities-quality.fixture.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });

  await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
} finally {
  await rm(scratchDir, { recursive: true, force: true });
}
