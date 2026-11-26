import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fetchCongressSnapshot } from '../../server/congressSnapshot';
import { filingDelay } from '../../src/data/congress';

// Small synthetic Parquet shards with the publisher's date, Zstandard and row-identity conventions.
const kinds = ['filings', 'trades'] as const;
const files = await Promise.all(kinds.map(kind => readFile(`scripts/fixtures/congress/${kind}.parquet`)));
const tables = Object.fromEntries(kinds.map((kind, i) => [`political_${kind}`, { rows: 3, manifests: [{ year: 2026, files: [{
  publicPath: `data/political_${kind}/2026-00000-of-00001.parquet`, size: files[i].length, sha256: createHash('sha256').update(files[i]).digest('hex'),
}] }] }]));
const manifest = { dataset: 'austin-starks/congressional-stock-trades', schemaVersion: 2, generatedAt: '2026-04-04T00:00:00Z', sourceFingerprint: '0'.repeat(64), audit: { passed: true }, tables };
const legislator = { id: { bioguide: 'T000001' }, name: { first: 'Test', last: 'Member' }, terms: [
  { type: 'rep', state: 'XY', district: 3, party: 'Democrat', start: '2023-01-03', end: '2025-01-03' },
  { type: 'sen', state: 'XY', party: 'Independent', start: '2025-01-03', end: '2031-01-03' },
] };
const original = globalThis.fetch;
const revision = 'a'.repeat(40);
const downloads: string[] = [];
let metadataOffline = false;
try {
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    downloads.push(url);
    if (url.endsWith('snapshot.json')) return Response.json(manifest, { headers: { 'x-repo-commit': revision } });
    if (url.includes('/legislators-')) return metadataOffline ? new Response(null, { status: 503 }) : Response.json([legislator]);
    assert.ok(url.includes(`/resolve/${revision}/`), 'the manifest commit must pin all shard reads');
    return new Response(new Uint8Array(files[url.includes('political_trades') ? 1 : 0]));
  };
  const snapshot = await fetchCongressSnapshot();
  const sales = snapshot.trades.filter(t => t.chamber === 'House');
  assert.deepEqual(sales.map(t => t.id), ['house:12345678:0', 'house:12345678:1']);
  assert.ok(sales.every(t => t.action === 'Partial sale' && t.owner === 'Joint' && t.amendment && filingDelay(t.tradeDate, t.filingDate) === 7));
  assert.equal(sales[0].filingUrl, 'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2024/12345678.pdf');
  const senate = snapshot.trades.find(t => t.chamber === 'Senate')!;
  assert.equal(senate.ticker, null, 'the source’s inferred ticker must not replace a missing reported ticker');
  assert.equal(senate.owner, null);
  assert.ok(senate.amendment);
  assert.deepEqual(snapshot.members.map(m => [m.id, m.chamber, m.district, m.party]).sort(), [
    ['T000001', 'House', '3', 'Democrat'], ['T000001', 'Senate', null, 'Independent'],
  ]);
  assert.equal(snapshot.gaps.length, 1);
  assert.match(snapshot.gaps[0].reason, /scanned/i);
  assert.equal(snapshot.gaps[0].filingId, '12345679');
  assert.equal(snapshot.metadataWarning, null);
  downloads.length = 0;
  assert.equal((await fetchCongressSnapshot(snapshot)).trades, snapshot.trades);
  assert.equal(downloads.length, 3, 'unchanged snapshot should refresh only the manifest and the two independent rosters');
  assert.ok(downloads.every(url => !url.includes('.parquet')));

  manifest.sourceFingerprint = '1'.repeat(64);
  metadataOffline = true;
  const partial = await fetchCongressSnapshot(snapshot);
  assert.match(partial.metadataWarning ?? '', /member directory/);
  assert.deepEqual(partial.members, snapshot.members, 'a directory outage should retain both chamber profiles');
  metadataOffline = false;
  assert.equal((await fetchCongressSnapshot(partial)).metadataWarning, null);
  manifest.generatedAt = '2026-04-03T00:00:00Z';
  await assert.rejects(() => fetchCongressSnapshot(snapshot), /older than the saved disclosures/);
  tables.political_trades.rows = 4;
  await assert.rejects(() => fetchCongressSnapshot(), /Incomplete political_trades/);
  const file = tables.political_trades.manifests[0].files[0];
  file.sha256 = 'f'.repeat(64);
  await assert.rejects(() => fetchCongressSnapshot(), /checksum/);
  console.log('Congressional snapshot checks passed.');
} finally { globalThis.fetch = original; }
