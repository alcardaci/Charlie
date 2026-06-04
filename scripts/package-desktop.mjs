import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const electronBuilderBin = process.platform === 'win32'
  ? join(projectRoot, 'node_modules', '.bin', 'electron-builder.cmd')
  : join(projectRoot, 'node_modules', '.bin', 'electron-builder');

function resolveTargets(mode) {
  if (process.platform === 'darwin') {
    return mode === 'dist' ? ['--mac', 'zip', 'dmg'] : ['--mac', 'dir'];
  }

  if (process.platform === 'win32') {
    return mode === 'dist' ? ['--win', 'nsis', 'portable'] : ['--win', 'dir'];
  }

  if (process.platform === 'linux') {
    return mode === 'dist' ? ['--linux', 'AppImage', 'tar.gz'] : ['--linux', 'dir'];
  }

  throw new Error(`Unsupported desktop platform: ${process.platform}`);
}

async function main() {
  const mode = process.argv[2] === 'dist' ? 'dist' : 'dir';
  const targets = resolveTargets(mode);

  const { stdout, stderr } = await execFileAsync(electronBuilderBin, targets, {
    cwd: projectRoot,
    env: process.env,
  });

  if (stdout.trim()) process.stdout.write(stdout);
  if (stderr.trim()) process.stderr.write(stderr);

  if (process.platform === 'darwin') {
    await execFileAsync(process.execPath, [join(projectRoot, 'scripts', 'promote-macos-app.mjs')], {
      cwd: projectRoot,
      env: process.env,
    });
  }
}

main().catch((error) => {
  const stdout = error?.stdout ?? '';
  const stderr = error?.stderr ?? '';
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  console.error('[package-desktop]', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
