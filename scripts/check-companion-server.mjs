import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Keep package resolution intact while giving the actual preview middleware a disposable profile.
const profile = await mkdtemp(resolve('node_modules', '.charlie-companion-check-'));
const originalFetch = globalThis.fetch;
try {
  const answerFixture = join(profile, 'companion-answer.mjs');
  await build({ entryPoints: ['scripts/fixtures/companion-answer.fixture.tsx'], outfile: answerFixture, bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' } });
  await import(pathToFileURL(answerFixture).href);
  const osStub = join(profile, 'os.mjs');
  const bundle = join(profile, 'middleware.mjs');
  await writeFile(osStub, `export const homedir = () => ${JSON.stringify(profile)};`);
  await mkdir(join(profile, '.charlie'));
  await writeFile(join(profile, '.charlie', 'connections.json'), JSON.stringify({ openai: 'only-for-tests' }));
  await build({
    entryPoints: ['vite.config.ts'], outfile: bundle, bundle: true, format: 'esm', platform: 'node', packages: 'external',
    alias: { 'node:os': osStub }, define: { 'process.platform': '"linux"' }, logLevel: 'silent',
  });
  const { default: configure } = await import(pathToFileURL(bundle).href);
  const handlers = [];
  for (const plugin of configure({ command: 'serve', mode: 'test' }).plugins.flat()) {
    if (plugin.name === 'vite-plugin-yahoo-finance') {
      plugin.configurePreviewServer({ middlewares: { use: handler => handlers.push(handler) } });
    }
  }
  assert.ok(handlers.length, 'Real preview middleware registered');

  const quote = { title: 'Fixture source', url: 'https://example.test/filing' };
  const reply = 'Fixture answer from the provider.';
  let searchStatus;
  let upstream;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    assert.equal(init.headers.Authorization, 'Bearer only-for-tests');
    upstream = JSON.parse(init.body);
    const output = [{ type: 'message', content: [{ type: 'output_text', text: reply,
      annotations: searchStatus === 'completed' ? [{ type: 'url_citation', ...quote }] : [],
    }] }];
    if (searchStatus) output.unshift({ type: 'web_search_call', status: searchStatus, action: { type: 'search', query: 'example' } });
    return Response.json({ status: 'completed', output });
  };

  // Drive the registered HTTP handler without opening a listening socket or contacting a provider.
  async function ask(question, { model, history = [], forceWebSearch = false, webSearch = true, search, stream = false } = {}) {
    searchStatus = search;
    upstream = null;
    const activePanel = 'chart';
    const payload = { activePanel, panels: [activePanel], model, webSearch, forceWebSearch, stream,
      messages: [...history, { role: 'user', content: question }],
      contexts: [{ panel: activePanel, title: 'Equity chart', summary: 'AAPL chart on screen',
        renderedText: 'AAPL 1Y chart', source: 'visible-panel', data: { symbol: 'AAPL' } }],
    };
    return request('/api/openai/panel-chat', payload);
  }

  async function request(endpoint, payload) {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(payload))]), { url: endpoint, method: 'POST' });
    const res = Object.assign(new EventEmitter(), { statusCode: 200, body: '',
      setHeader() {}, writeHead(code) { this.statusCode = code; }, write(text) { this.body += text; },
      end(text = '') { this.body += text; this.writableEnded = true; },
    });
    for (const handler of handlers) {
      let passed = false;
      await handler(req, res, () => { passed = true; });
      if (!passed) break;
    }
    assert.ok(res.writableEnded, `${endpoint} responded`);
    return res;
  }

  const summary = await request('/api/openai/overview-summary', { snapshot: {} });
  assert.equal(summary.statusCode, 200);
  assert.equal(JSON.parse(summary.body).model, 'gpt-6-luna');
  assert.equal(upstream.reasoning.effort, 'low');
  await request('/api/openai/overview-summary', { model: 'gpt-4.1-mini', snapshot: {} });
  assert.equal(upstream.model, 'gpt-4.1-mini');
  assert.equal(upstream.reasoning, undefined);

  const priceQuestion = 'What are the predictions for MSFT next quarter?';
  const history = [{ role: 'user', content: 'Explain this chart.' }, { role: 'assistant', content: 'This chart shows AAPL.' }];
  const researched = await ask(priceQuestion, { history, search: 'completed' });
  assert.equal(researched.statusCode, 200);
  assert.equal(upstream.model, 'gpt-6-luna');
  assert.equal(upstream.tool_choice, 'required');
  assert.deepEqual(upstream.tools.map(tool => tool.type), ['web_search']);
  assert.equal(upstream.reasoning.effort, 'low');
  assert.equal(upstream.input.at(-1).role, 'user');
  assert.ok(JSON.stringify(upstream.input.at(-1).content).includes(priceQuestion));
  assert.ok(upstream.input.some(item => item.role === 'assistant' && JSON.stringify(item.content).includes(history[1].content)));
  const result = JSON.parse(researched.body);
  assert.equal(result.webSearch, true);
  assert.equal(result.webSearchForced, false, 'Automatic research is distinct from a manual override');
  assert.deepEqual(result.webSearchCitations, [quote]);

  const chart = await ask('Explain the chart I am looking at.', { model: 'gpt-6.2-sol' });
  assert.equal(chart.statusCode, 200);
  assert.equal(upstream.reasoning.effort, 'medium');
  assert.ok(!upstream.tools?.length);
  assert.ok(JSON.stringify(upstream.input).includes('AAPL 1Y chart'));
  assert.equal(JSON.parse(chart.body).webSearch, false);
  const definition = await ask('What is a moving average?', { model: 'gpt-6.2-astra' });
  assert.equal(definition.statusCode, 200);
  assert.equal(upstream.reasoning.effort, 'high');
  assert.ok(!upstream.tools?.length);

  for (const question of ['Compare this chart with the latest earnings release.', 'What happened to NVDA today?']) {
    assert.equal((await ask(question, { search: 'completed' })).statusCode, 200);
    assert.equal(upstream.tool_choice, 'required');
  }
  const forced = await ask('What is a moving average?', { forceWebSearch: true, search: 'completed' });
  assert.equal(upstream.tool_choice, 'required');
  assert.equal(JSON.parse(forced.body).webSearchForced, true);
  const blocked = await ask(priceQuestion, { webSearch: false });
  assert.equal(blocked.statusCode, 400);
  assert.equal(upstream, null, 'Required research cannot silently fall back to an offline answer');
  const verifiedStream = await ask(priceQuestion, { stream: true, search: 'completed' });
  assert.equal(verifiedStream.statusCode, 200);
  assert.equal(verifiedStream.body, reply);
  for (const stream of [false, true]) {
    for (const search of [undefined, 'failed']) {
      const failure = await ask(priceQuestion, { search, stream });
      assert.equal(failure.statusCode, 502);
      assert.ok(!failure.body.includes(reply), 'Do not publish an unverified forecast');
    }
  }
  console.log('Companion preview middleware verified: chart, definition, forecast, mixed and recent questions, model efforts, manual search, citations and failed research.');
} finally {
  globalThis.fetch = originalFetch;
  await rm(profile, { recursive: true, force: true });
}
