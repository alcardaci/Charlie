import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const scratchDir = await mkdtemp(path.join(tmpdir(), 'charlie-portfolio-'));
try {
  const outfile = path.join(scratchDir, 'portfolio-check.mjs');
  await build({ entryPoints: [path.resolve('scripts/fixtures/portfolio.fixture.ts')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(scratchDir, { recursive: true, force: true });
}
