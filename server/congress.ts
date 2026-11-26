import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';
import { congressMemberKey, congressPageSize, congressTickers, type CongressGap, type CongressMember, type CongressPage, type CongressTrade } from '../src/data/congress';
import { fetchCongressSnapshot, type CongressSnapshot } from './congressSnapshot';
import { fetchHouseSupplement, type HouseSupplement } from './congressHouse';

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const day = 86_400_000;

interface Cache {
  version: 1;
  snapshot?: CongressSnapshot;
  house?: HouseSupplement;
  snapshotChecked: string | null;
  lastAttempt: number;
  snapshotFailed: boolean;
  houseFailed: boolean;
}

// Keep source snapshots independently so a temporary failure in one chamber cannot erase it.
function prepare(cache: Cache) {
  const { snapshot, house } = cache;
  const rows: CongressTrade[] = [];
  const incompleteHouse = new Set(snapshot?.gaps.filter(g => g.chamber === 'House').map(g => g.filingId));
  const partialPdfs = new Set(house?.gaps.map(g => g.filingId));
  const snapshotCounts = new Map<string, number>();
  const pdfCounts = new Map<string, number>();
  for (const row of snapshot?.trades ?? []) {
    if (row.chamber === 'House') snapshotCounts.set(row.filingId, (snapshotCounts.get(row.filingId) ?? 0) + 1);
  }
  for (const row of house?.trades ?? []) pdfCounts.set(row.filingId, (pdfCounts.get(row.filingId) ?? 0) + 1);
  // Select a single extraction per document. Keep distinct rows within the chosen extraction.
  const usePdf = new Set<string>();
  for (const [id, count] of pdfCounts) {
    const mirrorCount = snapshotCounts.get(id) ?? 0;
    if (!mirrorCount || (incompleteHouse.has(id) && (!partialPdfs.has(id) || count > mirrorCount))) usePdf.add(id);
  }
  const representedMembers = new Map<string, CongressMember>();
  const roster = new Map<string, CongressMember>();
  for (const member of [...(house?.members ?? []), ...(snapshot?.members ?? [])]) {
    roster.set(congressMemberKey(member.id, member.chamber), member);
  }
  function include(row: CongressTrade) {
    const date = row.chamber === 'House' && house?.filingDates[row.filingId];
    rows.push(date && date !== row.filingDate ? { ...row, filingDate: date } : row);
    const key = congressMemberKey(row.memberId, row.chamber);
    if (!representedMembers.has(key)) representedMembers.set(key, roster.get(key) ?? {
      id: row.memberId, name: row.memberName, chamber: row.chamber, party: null, state: null, district: null,
    });
  }
  for (const row of snapshot?.trades ?? []) {
    if (row.chamber !== 'House' || !usePdf.has(row.filingId)) include(row);
  }
  for (const row of house?.trades ?? []) if (usePdf.has(row.filingId)) include(row);
  rows.sort((a, b) => (b.filingDate ?? '').localeCompare(a.filingDate ?? '') || a.memberName.localeCompare(b.memberName) || a.filingId.localeCompare(b.filingId));
  const members = [...representedMembers.values()].sort((a, b) => a.name.localeCompare(b.name) || a.chamber.localeCompare(b.chamber));
  const gaps = new Map<string, CongressGap>();
  for (const gap of snapshot?.gaps ?? []) {
    const key = `${gap.chamber}:${gap.filingId}`;
    if (gap.chamber !== 'House' || !usePdf.has(gap.filingId)) {
      const officialDate = gap.chamber === 'House' && house?.filingDates[gap.filingId];
      gaps.set(key, officialDate ? { ...gap, filingDate: officialDate } : gap);
    }
  }
  for (const gap of house?.gaps ?? []) {
    // The Clerk parser can also flag partially readable reports that already have some rows.
    if (!snapshotCounts.has(gap.filingId) || usePdf.has(gap.filingId)) gaps.set(`House:${gap.filingId}`, gap);
  }
  const coverage = (['House', 'Senate'] as const).map(chamber => {
    const warnings: string[] = [];
    if (cache.snapshotFailed) warnings.push(snapshot ? 'Snapshot refresh failed. Showing the saved snapshot.' : 'The structured snapshot is unavailable.');
    if (chamber === 'House' && cache.houseFailed) warnings.push(house ? 'House Clerk refresh failed. Showing the last successful index check.' : 'House Clerk index unavailable. Recent filings could be missing.');
    if (snapshot?.metadataWarning) warnings.push(snapshot.metadataWarning);
    const chamberGaps = [...gaps.values()].filter(gap => gap.chamber === chamber).sort((a, b) => (b.filingDate ?? '').localeCompare(a.filingDate ?? ''));
    const latestFiling = [rows.find(row => row.chamber === chamber)?.filingDate, chamberGaps[0]?.filingDate].filter(Boolean).sort().pop() ?? null;
    return { chamber, latestFiling, snapshotAsOf: snapshot?.asOf ?? null, snapshotChecked: cache.snapshotChecked,
      indexChecked: chamber === 'House' ? house?.checkedAt ?? null : null, windowStart: chamber === 'House' ? house?.windowStart ?? null : null,
      warnings, gaps: chamberGaps };
  });
  return { rows, members, coverage };
}

function page(ledger: ReturnType<typeof prepare>, params: URLSearchParams): CongressPage {
  const chamber = params.get('chamber');
  const member = params.get('member');
  const ticker = params.get('ticker')?.trim().toUpperCase();
  const filtered = !chamber && !member && !ticker ? ledger.rows : ledger.rows.filter(row =>
    (!chamber || row.chamber === chamber) && (!member || congressMemberKey(row.memberId, row.chamber) === member) && (!ticker || (row.ticker?.toUpperCase() === ticker || congressTickers(row.ticker).includes(ticker))));
  const requested = Math.max(0, Math.trunc(Number(params.get('offset')) || 0));
  const offset = Math.min(requested, Math.floor(Math.max(0, filtered.length - 1) / congressPageSize) * congressPageSize);
  return { rows: filtered.slice(offset, offset + congressPageSize), total: filtered.length, offset, members: ledger.members, coverage: ledger.coverage };
}

export function createCongressService(directory: string, sources = { snapshot: fetchCongressSnapshot, house: fetchHouseSupplement }, now = Date.now) {
  const file = join(directory, 'disclosures-v1.json.gz');
  let cache: Cache = { version: 1, lastAttempt: 0, snapshotChecked: null, snapshotFailed: false, houseFailed: false };
  let ledger: ReturnType<typeof prepare> | undefined;
  let initialized: Promise<void> | undefined;
  let pending: Promise<void> | undefined;
  async function restore() {
    try {
      const saved = JSON.parse((await decompress(await readFile(file))).toString()) as Cache;
      if (saved.version === 1 && (Array.isArray(saved.snapshot?.trades) || Array.isArray(saved.house?.trades))) {
        const restored = prepare(saved);
        cache = saved;
        ledger = restored;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[congress] Skipping unreadable local cache.');
    }
  }
  async function refresh() {
    const next = { ...cache, lastAttempt: now(), snapshotFailed: false, houseFailed: false };
    try {
      next.snapshot = await sources.snapshot(cache.snapshot);
      next.snapshotChecked = new Date(now()).toISOString();
    } catch (e) { next.snapshotFailed = true; console.warn('[congress] Snapshot refresh failed:', (e as Error).message); }
    try {
      const incomplete = new Set(next.snapshot?.gaps.filter(g => g.chamber === 'House').map(g => g.filingId));
      const covered = (next.snapshot?.trades ?? []).filter(row => row.chamber === 'House' && !incomplete.has(row.filingId));
      next.house = await sources.house(covered, next.snapshot?.members ?? [], cache.house);
    } catch (e) { next.houseFailed = true; console.warn('[congress] Clerk refresh failed:', (e as Error).message); }
    cache = next;
    if (!next.snapshot && !next.house) throw new Error('Congressional disclosures are temporarily unavailable.');
    ledger = prepare(next);
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(temp, await compress(JSON.stringify(next), { level: 1 }));
      await rename(temp, file);
    } catch (err) {
      console.warn('[congress] Unable to save offline cache:', (err as Error).message);
      await rm(temp, { force: true }).catch(() => {});
    }
  }
  return async (params: URLSearchParams) => {
    await (initialized ??= restore());
    const retryAfter = cache.snapshotFailed || cache.houseFailed ? 15 * 60_000 : day;
    const force = params.get('refresh') === '1';
    if (!pending && (force || !cache.lastAttempt || now() - cache.lastAttempt >= retryAfter)) {
      pending = refresh().finally(() => { pending = undefined; });
    }
    if (pending && (force || !ledger)) await pending;
    if (!ledger) throw new Error('Congressional disclosures are temporarily unavailable.');
    return { ...page(ledger, params), refreshing: Boolean(pending) };
  };
}
