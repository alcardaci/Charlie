import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const scratchDir = await mkdtemp(path.join(tmpdir(), 'charlie-sec-edgar-'));
const outfile = path.join(scratchDir, 'sec-edgar-check.mjs');

try {
  await build({
    entryPoints: [path.resolve('scripts/fixtures/sec-edgar.fixture.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });

  await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
  await import('./fixtures/sec-refresh.fixture.mjs');
} finally {
  await rm(scratchDir, { recursive: true, force: true });
}
