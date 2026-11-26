import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { loadConfigFromFile } from 'vite';

// Use the registered preview handler and its real in-memory caches. Simulate an issuer
// acquiring tagged financials between two user visits, while the initial result is fresh.
const config = await loadConfigFromFile({ command: 'serve', mode: 'test' }, 'vite.config.ts');
const plugin = config.config.plugins.flat().find(plugin => plugin.name === 'vite-plugin-yahoo-finance');
const handlers = [];
plugin.configurePreviewServer({ middlewares: { use: handler => handlers.push(handler) } });
const getCompany = async (refresh = false) => {
  const req = Object.assign(new EventEmitter(), { url: '/api/sec/company/TEST' + (refresh ? '?refresh=1' : ''), method: 'GET' });
  let result;
  const res = Object.assign(new EventEmitter(), { setHeader() {}, writeHead() {}, end(text) { result = JSON.parse(text); } });
  for (const handler of handlers) {
    let passed = false;
    await handler(req, res, () => { passed = true; });
    if (!passed) break;
  }
  assert.ok(result?.identity, 'SEC preview route returned a verified issuer');
  return result;
};

const originalFetch = globalThis.fetch;
let published = false;
let factsReads = 0;
const accession = '0000320193-26-000026';
try {
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname === '/files/company_tickers.json') return Response.json([{ ticker: 'TEST', cik_str: 320193, title: 'Fixture Issuer' }]);
    if (url.pathname.startsWith('/submissions/')) return Response.json({ filings: { recent: {
      accessionNumber: [accession], filingDate: ['2026-11-03'], form: ['10-K'],
      reportDate: ['2026-09-26'], primaryDocument: ['annual.htm'],
    } } });
    assert.match(url.pathname, /^\/api\/xbrl\/companyfacts\//);
    factsReads++;
    return Response.json({ facts: published ? { 'us-gaap': { Revenues: { units: { USD: [{
      val: 12345, start: '2025-09-28', end: '2026-09-26', accn: accession, form: '10-K', filed: '2026-11-03', fp: 'FY',
    }] } } } } : { ffd: {} } });
  };
  assert.equal((await getCompany()).factsCoverage, 'no-mapped-metrics');
  published = true;
  assert.equal((await getCompany()).factsCoverage, 'no-mapped-metrics');
  assert.equal(factsReads, 1, 'Ordinary visits share the fresh upstream result');
  const updated = await getCompany(true);
  assert.equal(updated.factsCoverage, 'available');
  assert.equal(updated.metrics.revenue.value, 12345);
  assert.equal((await getCompany()).metrics.revenue.value, 12345);
  assert.equal(factsReads, 2, 'Manual refresh replaces the fee-only cache for subsequent visits');
  console.log('SEC preview cache picks up newly tagged financials on manual refresh');
} finally {
  globalThis.fetch = originalFetch;
}
