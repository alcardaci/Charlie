import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const scratchDir = await mkdtemp(path.join(tmpdir(), 'charlie-opportunities-quality-'));
const outfile = path.join(scratchDir, 'quality-check.mjs');

try {
  const proxySource = await readFile('vite.config.ts', 'utf8');
  const discoveryRoute = proxySource.slice(proxySource.indexOf("if (path === '/api/openai/discovery-themes')"));
  const discoveryInput = discoveryRoute.slice(discoveryRoute.indexOf('const firstInput ='), discoveryRoute.indexOf('const firstPass ='));
  const guidanceInput = discoveryRoute.slice(discoveryRoute.indexOf('const secondInput ='), discoveryRoute.indexOf('const secondPass ='));
  if (discoveryInput.includes('secEvidence') || !guidanceInput.includes('selectSecEvidenceForTheme')) {
    throw new Error('SEC evidence must reach existing-theme guidance only, never theme discovery/ranking');
  }
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
