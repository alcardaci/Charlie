import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCongressService } from '../../server/congress';
import { filingDelay, type CongressGap, type CongressTrade } from '../../src/data/congress';
import type { HouseSupplement } from '../../server/congressHouse';
import type { CongressSnapshot } from '../../server/congressSnapshot';

const dir = await mkdtemp(join(tmpdir(), 'charlie-congress-check-'));
const day = 86_400_000;
let time = Date.UTC(2026, 10, 26, 13);
let snapshotDown = false, houseDown = false, snapshotCalls = 0, houseCalls = 0;
const member = { id: 'H001082', name: 'Kevin Hern', chamber: 'House' as const, state: 'OK', district: '1', party: 'Republican' };
const filingUrl = 'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20036875.pdf';
function row(id: string): CongressTrade {
  return { id, filingId: '20036875', memberId: member.id, memberName: member.name, chamber: member.chamber, owner: 'Joint',
    asset: 'Rockwell Automation', action: 'Partial sale', amount: '$50,001 - $100,000', tradeDate: '2026-11-17', ticker: 'ROK', filingDate: '2026-11-24', filingUrl, amendment: false };
}
const senateRow: CongressTrade = { ...row('senate:a:0'), chamber: 'Senate', filingId: 'a', memberId: 's1', memberName: 'Senate filer', ticker: null, owner: null, filingDate: '2026-11-25', filingUrl: null };
const gap: CongressGap = { chamber: 'House', filingId: '20036875', memberName: member.name, filingDate: '2026-11-24', filingUrl, reason: 'No normalized rows' };
const snapshot: CongressSnapshot = { trades: [senateRow], fingerprint: 'fixture', gaps: [gap], asOf: '2026-11-25T13:00:00Z', members: [member], metadataWarning: null };
const house: HouseSupplement = { trades: [row('house:20036875:7'), row('house:20036875:8')], members: [member], filingDates: { '20036875': '2026-11-24' },
  gaps: [{ ...gap, filingId: 'scanned', filingUrl: null, reason: 'Image-only PDF' }], windowStart: '2026-08-29', indexedCount: 2, checkedAt: '2026-11-26T13:00:00Z', asOf: '2026-11-24', pdfCheckedAt: {} };
const sources = { snapshot: async () => { snapshotCalls++; if (snapshotDown) throw new Error('test outage'); return snapshot; },
  house: async () => { houseCalls++; if (houseDown) throw new Error('test outage'); return house; } };
const query = (s = '') => new URLSearchParams(s);
try {
  let service = createCongressService(dir, sources, () => time);
  const [all, h] = await Promise.all([service(query()), service(query('chamber=House&member=House%3AH001082&ticker=rok'))]);
  assert.equal(snapshotCalls, 1); assert.equal(houseCalls, 1);
  assert.equal(all.rows[0].chamber, 'Senate'); assert.equal(all.rows[0].ticker, null); assert.equal(all.rows[0].owner, null);
  assert.deepEqual(h.rows.map(r => [r.id, filingDelay(r.tradeDate, r.filingDate), r.filingUrl]), [7, 8].map(i => [`house:20036875:${i}`, 7, filingUrl]));
  assert.deepEqual(all.coverage[0].gaps.map(g => g.filingId), ['scanned']); assert.equal(h.members.find(m => m.id === member.id)?.party, 'Republican');
  assert.equal((await service(query('ticker=missing'))).total, 0);
  assert.equal(filingDelay('2026-03-07', '2026-03-09'), 2); assert.equal(filingDelay(null, '2026-11-24'), null);
  // Upstream catches up. Keep exactly two rows and use the civil date printed in the official index.
  snapshot.trades.push(...house.trades.map(r => ({ ...r, filingDate: '2026-11-25', amendment: true })));
  snapshot.gaps = [];
  const updated = await service(query('refresh=1&ticker=ROK'));
  assert.equal(updated.total, 2); assert(updated.rows.every(r => r.amendment && r.filingDate === '2026-11-24'));
  snapshot.trades.pop(); snapshot.gaps = [{ ...gap, reason: 'Partial extraction' }];
  const repaired = await service(query('refresh=1&ticker=ROK'));
  assert.equal(repaired.total, 2, 'complete Clerk rows survive a partially extracted mirror');
  assert(!repaired.coverage[0].gaps.some(g => g.filingId === gap.filingId));
  // Restart, then lose the network. The original source timestamps and complete prior rows survive.
  snapshotDown = true; houseDown = true; time += day + 1;
  service = createCongressService(dir, sources, () => time);
  const saved = await service(query()); assert.equal(saved.refreshing, true); assert.equal(saved.total, all.total);
  const offline = await service(query('refresh=1')); assert.equal(offline.total, all.total);
  assert.deepEqual(offline.rows.map(r => r.id), all.rows.map(r => r.id));
  assert.equal(offline.coverage[0].indexChecked, house.checkedAt); assert.equal(offline.coverage[1].snapshotChecked, updated.coverage[1].snapshotChecked);
  assert.equal(offline.coverage[0].warnings.length, 2); assert.equal(offline.coverage[1].warnings.length, 1);
  const calls = snapshotCalls; await service(query('chamber=Senate')); assert.equal(snapshotCalls, calls);
  houseDown = false; const partial = await service(query('refresh=1')); assert.equal(partial.coverage[0].warnings.length, 1);
  snapshotDown = false; const online = await service(query('refresh=1')); assert(online.coverage.every(c => !c.warnings.length));
  senateRow.ticker = 'ETRN EQT'; await service(query('refresh=1'));
  for (const ticker of ['ETRN', 'EQT']) assert.equal((await service(query(`ticker=${ticker}`))).rows[0].id, senateRow.id);
  console.log('Congress service checks passed: filtering, source identity, coverage, daily refresh, offline restart, recovery.');
} finally { await rm(dir, { recursive: true, force: true }); }
