import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { on, once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

if (!process.argv[2]) throw new Error('Pass the packaged Charlie executable to check.');
const version = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const profile = await mkdtemp(join(tmpdir(), 'charlie-startup-'));
const child = spawn(resolve(process.argv[2]), [
  '--user-data-dir=' + profile,
  '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0',
], { stdio: ['ignore', 'inherit', 'inherit'] });
const stopped = once(child, 'close');
let socket;

async function windowTarget() {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Charlie exited before opening a window.');
    try {
      const [port] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/);
      const response = await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(1000) });
      const page = (await response.json()).find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:'));
      if (page) return page;
    } catch { /* Remote debugging starts before the window is ready. */ }
    await delay(250);
  }
  throw new Error('Timed out waiting for the packaged app window.');
}

async function evaluateRenderer(socket, id, signal) {
  const messages = on(socket, 'message', { signal, close: ['close'] });
  try {
    socket.send(JSON.stringify({
      id, method: 'Runtime.evaluate', params: {
        awaitPromise: true, returnByValue: true,
        expression: `(async () => ({
          rendered: !!document.querySelector('.command-bar .cmd-input'),
          version: await window.charlie?.getVersion?.(),
        }))()`,
      },
    }));
    for await (const [data] of messages) {
      const reply = JSON.parse(data);
      if (reply.id === id) return reply;
    }
    throw new Error('The renderer closed its debugging connection before replying.');
  } finally {
    await messages.return();
  }
}

async function checkRenderer(socket) {
  const deadline = AbortSignal.timeout(20000);
  let lastState = 'waiting for the first evaluation';
  try {
    for (let id = 1; !deadline.aborted; id++) {
      const { result, error } = await evaluateRenderer(socket, id, deadline);
      if (error && /execution context was destroyed|cannot find (?:default execution )?context|inspected target navigated/i.test(error.message)) {
        lastState = error.message;
      } else {
        if (error) throw new Error(`Runtime.evaluate failed (${error.code}): ${error.message}`);
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
        const state = result.result.value;
        if (state?.rendered && state.version !== undefined) {
          assert.deepEqual(state, { rendered: true, version });
          return;
        }
        lastState = JSON.stringify(state);
      }
      await delay(150, undefined, { signal: deadline });
    }
  } catch (error) {
    if (!deadline.aborted) throw error;
  }
  throw new Error('Timed out waiting for the packaged renderer. Last observation: ' + lastState);
}

try {
  const page = await windowTarget();
  const api = await fetch(new URL('/api/local-state/', page.url));
  assert.equal(api.status, 400);
  assert.equal((await api.json()).error, 'state name required');

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await once(socket, 'open', { signal: AbortSignal.timeout(5000) });
  await checkRenderer(socket);
  console.log('Verified native window, command bar, local API and version ' + version + '.');
} finally {
  socket?.close();
  if (child.exitCode === null && child.signalCode === null) child.kill();
  await stopped;
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
