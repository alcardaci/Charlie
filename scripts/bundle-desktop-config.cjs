const { join } = require('node:path');
const { build } = require('esbuild');

// Vite's TS config loader writes beside its input. Installed applications can be read-only.
module.exports = async ({ packager }) => {
  const root = packager.projectDir;
  await build({
    entryPoints: [join(root, 'vite.config.ts')],
    outfile: join(root, 'build-assets', 'desktop-config.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    packages: 'external',
  });
};
