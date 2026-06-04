const { execFile } = require('node:child_process');
const { access } = require('node:fs/promises');
const { join } = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function hasAppleIdCredentials() {
  return Boolean(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID);
}

function hasApiKeyCredentials() {
  return Boolean(process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER);
}

async function verifyTooling() {
  await execFileAsync('xcrun', ['--find', 'notarytool']);
  await execFileAsync('xcrun', ['--find', 'stapler']);
}

module.exports = async function notarizeMac(context) {
  if (process.platform !== 'darwin' || context.electronPlatformName !== 'darwin') {
    return;
  }

  if (!hasAppleIdCredentials() && !hasApiKeyCredentials()) {
    console.log('[notarize-macos] skipping notarization because no Apple notarization credentials are configured.');
    return;
  }

  await verifyTooling();

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  await access(appPath);

  const submitArgs = ['notarytool', 'submit', appPath, '--wait'];

  if (hasApiKeyCredentials()) {
    submitArgs.push(
      '--key',
      process.env.APPLE_API_KEY,
      '--key-id',
      process.env.APPLE_API_KEY_ID,
      '--issuer',
      process.env.APPLE_API_ISSUER
    );
  } else {
    submitArgs.push(
      '--apple-id',
      process.env.APPLE_ID,
      '--password',
      process.env.APPLE_APP_SPECIFIC_PASSWORD,
      '--team-id',
      process.env.APPLE_TEAM_ID
    );
  }

  console.log(`[notarize-macos] submitting ${appPath} for notarization`);
  await execFileAsync('xcrun', submitArgs, { env: process.env });
  await execFileAsync('xcrun', ['stapler', 'staple', appPath], { env: process.env });
  console.log(`[notarize-macos] stapled notarization ticket to ${appPath}`);
};
