import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { fetchHouseSupplement, readHousePages, type HouseTextItem } from '../../server/congressHouse';
import { filingDelay, type CongressMember } from '../../src/data/congress';

// A real text-layer PDF exercises the Clerk's columns, including a status on a continuation page.
function pdf(pages: HouseTextItem[][]) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, n) => `${4 + 2*n} 0 R`).join(' ')}] >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (const [n, page] of pages.entries()) {
    objects.push(`<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R >> >> /MediaBox [0 0 612 792] /Contents ${5 + 2*n} 0 R >>`);
    const stream = page.map(({ x, y, text }) => `BT /F1 8 Tf 1 0 0 1 ${x} ${y} Tm (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`).join('\n');
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((value, i) => { offsets.push(body.length); body += `${i+1} 0 obj\n${value}\nendobj\n`; });
  const start = body.length;
  body += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Root 1 0 R /Size ${offsets.length} >>\nstartxref\n${start}\n%%EOF`;
  return strToU8(body);
}
const item = (x: number, y: number, text: string): HouseTextItem => ({ x, y, text });
const header = ['Owner', 'Asset', 'Transaction', 'Date', 'Notification', 'Amount', 'Cap.'].map((title, i) => item([65,104,262,327,382,446,525][i], 700, title));
const row = (y: number) => [item(65,y,'JT'), item(104,y,'Rockwell Automation Inc.'), item(104,y-10,'Common Stock (ROK) [ST]'),
  item(262,y,'S (partial)'), item(327,y,'11/17/2026'), item(382,y,'11/19/2026'), item(446,y,'$50,001 -'), item(446,y-10,'$100,000')];
const pages = [[...header, ...row(620), item(104,581,'Filing Status: New'), ...row(550)], [...header, item(104,650,'Filing Status: New')]];
const report = { id: '20036875', name: 'Kevin Hern', first: 'Kevin', last: 'Hern', filed: '2026-11-24', state: 'OK', district: '1',
  url: 'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20036875.pdf' };
const member: CongressMember = { id: 'H001082', name: 'Kevin Hern', party: 'Republican', chamber: 'House', state: 'OK', district: '1' };
const bytes = pdf(pages);
const scan = pdf([[]]);
const tsv = 'FilingDate\tDocID\tYear\tFilingType\tFirst\tLast\tSuffix\tStateDst\r\n'
  + '11/24/2026\t20036875\t2026\tP\tKevin\tHern\t\tOK01\r\n'
  + '11/22/2026\t12345\t2026\tP\tOther\tFiler\t\tNM01\r\n'
  + '11/25/2026\t12346\t2026\tA\tOther\tFiler\t\tNM01\r\n';
const index = zipSync({ '2026FD.txt': strToU8(tsv) });
const now = new Date('2026-11-26T18:00:00Z');
const downloads: string[] = [];
async function loadBytes(url: string) {
  downloads.push(url);
  if (url.endsWith('2026FD.zip')) return index;
  if (url.endsWith('/12345.pdf')) return scan.slice();
  if (url === report.url) return bytes.slice();
  throw new Error('Unexpected request');
}
const result = await fetchHouseSupplement([], [member], undefined, { now, loadBytes });
assert.equal(result.indexedCount, 2);
assert.equal(result.gaps.length, 1);
assert.match(result.gaps[0].reason, /image-only/i);
assert.equal(result.trades.length, 2);
const [a, b] = result.trades;
assert.notEqual(a.id, b.id);
assert.deepEqual({ ...a, id: b.id }, b);
assert.equal(a.memberId, member.id);
assert.equal(a.ticker, 'ROK');
assert.equal(a.owner, 'Joint');
assert.equal(a.action, 'Partial sale');
assert.equal(a.amount, '$50,001 - $100,000');
assert.equal(a.filingUrl, report.url);
assert.equal(filingDelay(a.tradeDate, a.filingDate), 7);
assert.equal(a.filingDate, result.filingDates[a.filingId]);
const corrected = readHousePages([[...header, item(104,620,'Treasury note [GS]'), item(262,620,'E'), item(327,620,'11/17/2026'),
  item(382,620,'11/19/2026'), item(446,620,'$1,001 - $15,000')], [...header, item(104,610,'F S: Amended')]], report, member);
assert.equal(corrected.gapReason, null);
assert.equal(corrected.trades[0].amendment, true);
assert.equal(corrected.trades[0].owner, null);
assert.equal(corrected.trades[0].ticker, null);
assert.equal(corrected.trades[0].action, 'Exchange');
downloads.length = 0;
const refresh = await fetchHouseSupplement([], [member], result, { now, loadBytes });
assert.deepEqual(refresh.trades, result.trades);
assert.ok(!downloads.includes(report.url));
const caughtUp = await fetchHouseSupplement(result.trades, [member], result, { now, loadBytes });
assert.equal(caughtUp.trades.length, 2);
const regressed = await fetchHouseSupplement([], [member], caughtUp, { now, loadBytes: async url => {
  if (url.endsWith('.pdf')) throw new Error('test outage');
  return loadBytes(url);
} });
assert.deepEqual(regressed.trades, result.trades);
const wrongMember = { ...member, name: 'Andrew Hern' };
const unmatched = await fetchHouseSupplement([], [wrongMember], undefined, { now, loadBytes });
assert.ok(unmatched.trades.every(trade => trade.memberId.startsWith('clerk:')));
assert.equal(caughtUp.filingDates[a.filingId], '2026-11-24');
console.log('House Clerk PDF fallback, cross-page amendments, scan coverage and distinct source rows passed');
