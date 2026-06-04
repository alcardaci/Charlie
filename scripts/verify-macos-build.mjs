import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appPath = join(projectRoot, 'release', 'mac-arm64', 'Charlie.app');

async function main() {
  if (process.platform !== 'darwin') {
    console.log('Skipping macOS app verification because the current platform is not macOS.');
    return;
  }

  await access(appPath);

  const commands = [
    ['/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]],
    ['/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath]],
    ['/usr/bin/xcrun', ['stapler', 'validate', appPath]],
  ];

  for (const [bin, args] of commands) {
    try {
      const { stdout, stderr } = await execFileAsync(bin, args);
      const text = [stdout, stderr].filter(Boolean).join('\n').trim();
      console.log(`[verify-macos-build] ${bin} ${args.join(' ')}`);
      if (text) console.log(text);
    } catch (error) {
      const stdout = error?.stdout ?? '';
      const stderr = error?.stderr ?? '';
      const text = [stdout, stderr].filter(Boolean).join('\n').trim();
      console.log(`[verify-macos-build] ${bin} ${args.join(' ')} failed`);
      if (text) console.log(text);
      throw error;
    }
  }
}

main().catch((error) => {
  console.error('[verify-macos-build]', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
