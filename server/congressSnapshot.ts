import { createHash } from 'node:crypto';
import { decompress } from 'fzstd';
import { parquetMetadata, parquetReadObjects, parquetSchema } from 'hyparquet';
import { congressMemberKey, type Chamber, type CongressGap, type CongressMember, type CongressTrade } from '../src/data/congress';

const dataset = 'austin-starks/congressional-stock-trades';
const baseUrl = `https://huggingface.co/datasets/${dataset}/resolve`;
const rosterUrl = 'https://unitedstates.github.io/congress-legislators';
const filingColumns = ['chamber', 'docId', 'filingDate', 'sourceUrl', 'amendedReportDate', 'parseMethod', 'extractionStatus', 'extractedRows', 'filerKey', 'memberId', 'displayName', 'filerFirst', 'filerLast', 'stateDistrict', 'identitySource'];
const tradeColumns = ['chamber', 'docId', 'rowIndex', 'transactionDate', 'owner', 'action', 'partialSale', 'assetDescription', 'printedTicker', 'amountBracket', 'filingStatus'];

export interface CongressSnapshot {
  trades: CongressTrade[];
  members: CongressMember[];
  gaps: CongressGap[];
  asOf: string;
  fingerprint: string;
  metadataWarning: string | null;
}

type TableName = 'political_filings' | 'political_trades';
interface Shard { publicPath: string; sha256: string; size: number }
interface Table { rows: number; manifests: { year: number; files: Shard[] }[] }
interface Manifest {
  dataset: string; schemaVersion: number; generatedAt: string; sourceFingerprint: string;
  audit: { passed: boolean }; tables: Record<TableName, Table>;
}
type Row = Record<string, unknown>;
interface Filing {
  chamber: Chamber; filingId: string; filingDate: string | null; filingUrl: string | null;
  member: CongressMember; amendment: boolean; scanned: boolean; failed: boolean; expectedRows: number; rows: number;
}

const verifiedShards = new Map<string, { hash: string; bytes: ArrayBuffer }>();

async function get(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { 'User-Agent': 'Charlie/1.0' } });
  if (!response.ok) throw new Error(`Congressional data source returned HTTP ${response.status}`);
  return response;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function civilDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date && Number.isFinite(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  throw new Error('Congressional snapshot contains an invalid date');
}

function chamberOf(value: unknown): Chamber {
  if (value === 'house') return 'House';
  if (value === 'senate') return 'Senate';
  throw new Error('Congressional snapshot contains an unrecognized chamber');
}

function originalLink(value: unknown, chamber: Chamber): string | null {
  if (typeof value !== 'string') return null;
  const host = chamber === 'House' ? 'disclosures-clerk.house.gov' : 'efdsearch.senate.gov';
  try {
    const url = new URL(value);
    return url.origin === `https://${host}` ? url.href : null;
  } catch { return null; }
}

async function readTable(manifest: Manifest, tableName: TableName, revision: string, columns: string[], consume: (row: Row) => void) {
  const table = manifest.tables[tableName];
  if (!Number.isSafeInteger(table?.rows) || table.rows <= 0 || !table.manifests.length) throw new Error(`Missing ${tableName} manifest`);
  const files = table.manifests.flatMap(part => part.files);
  let rowCount = 0;
  // Read only the columns we display. Bound concurrent downloads/decoded row groups on cold starts.
  for (let offset = 0; offset < files.length; offset += 4) {
    await Promise.all(files.slice(offset, offset + 4).map(async shard => {
      if (!new RegExp(`^data/${tableName}/\\d{4}-\\d+-of-\\d+\\.parquet$`).test(shard.publicPath) || !/^[0-9a-f]{64}$/.test(shard.sha256)) {
        throw new Error(`Invalid published ${tableName} shard`);
      }
      const cached = verifiedShards.get(shard.publicPath);
      let bytes: ArrayBuffer;
      if (cached?.hash === shard.sha256) bytes = cached.bytes;
      else {
        bytes = await (await get(`${baseUrl}/${revision}/${shard.publicPath}`)).arrayBuffer();
        if (bytes.byteLength !== shard.size || createHash('sha256').update(new Uint8Array(bytes)).digest('hex') !== shard.sha256) {
          throw new Error(`Snapshot checksum mismatch in ${shard.publicPath}`);
        }
        verifiedShards.set(shard.publicPath, { hash: shard.sha256, bytes });
      }
      const metadata = parquetMetadata(bytes);
      const fields = new Set(parquetSchema(metadata).children.map(field => field.element.name));
      if (columns.some(col => !fields.has(col))) throw new Error(`Unexpected ${tableName} schema in ${shard.publicPath}`);
      const rows = await parquetReadObjects({ file: bytes, metadata, columns, compressors: { ZSTD: (data, size) => decompress(data, new Uint8Array(size)) } });
      for (const row of rows) consume(row);
      rowCount += rows.length;
    }));
  }
  if (rowCount !== table.rows) throw new Error(`Incomplete ${tableName} snapshot`);
}

function normalizeFiling(row: Row): Filing {
  const chamber = chamberOf(row.chamber);
  const filingId = text(row.docId);
  if (!filingId) throw new Error('Missing congressional filing ID');
  const memberId = text(row.memberId) ?? text(row.filerKey) ?? `${chamber}:${filingId}`;
  const name = text(row.displayName) ?? [text(row.filerFirst), text(row.filerLast)].filter(Boolean).join(' ');
  const district = /^([A-Z]{2})(\d{2})?$/.exec(text(row.stateDistrict) ?? '');
  return {
    chamber, filingId, filingDate: civilDate(row.filingDate), filingUrl: originalLink(row.sourceUrl, chamber),
    member: { id: memberId, name: name || 'Unspecified', chamber, ...(row.identitySource === 'non_member' ? { isNonMember: true } : {}), party: null, state: district?.[1] ?? null, district: district?.[2] ? String(Number(district[2])) : null },
    amendment: row.amendedReportDate != null, scanned: /ocr|scan|paper/i.test(text(row.parseMethod) ?? ''),
    failed: row.extractionStatus === 'failed', expectedRows: Number(row.extractedRows), rows: 0,
  };
}

const owners: Record<string, string> = { spouse: 'Spouse', joint: 'Joint', self: 'Self', dependent_child: 'Dependent child' };
const actions: Record<string, string> = { purchase: 'Purchase', sale: 'Sale', exchange: 'Exchange', unmarked: 'Unspecified' };

function normalizeTrade(row: Row, filing: Filing): CongressTrade {
  if (!Number.isSafeInteger(row.rowIndex) || Number(row.rowIndex) < 0) throw new Error('Invalid congressional source row index');
  const sale = row.action === 'sale' && row.partialSale === true;
  const status = text(row.filingStatus)?.toLowerCase();
  const reportedAction = text(row.action) ?? 'unmarked';
  const action = sale ? 'Partial sale' : (actions[reportedAction] ?? reportedAction);
  const owner = text(row.owner);
  const ticker = text(row.printedTicker);
  return {
    id: `${filing.chamber.toLowerCase()}:${filing.filingId}:${row.rowIndex}`, filingId: filing.filingId,
    chamber: filing.chamber, memberId: filing.member.id, memberName: filing.member.name,
    owner: owner && owner !== 'not_indicated' ? (owners[owner] ?? owner) : null,
    ticker: ticker && !/^(?:[-–—]+|N\/?A|NONE)$/i.test(ticker) ? ticker : null,
    asset: text(row.assetDescription), amount: text(row.amountBracket), tradeDate: civilDate(row.transactionDate),
    filingDate: filing.filingDate, filingUrl: filing.filingUrl,
    action: status === 'deleted' ? `${action} (deleted)` : action,
    amendment: filing.amendment || status === 'amended' || status === 'deleted',
  };
}

interface Seat { type: string; start: string; end: string; party: string; state: string; district?: number; party_affiliations?: { start: string; end: string; party: string }[] }
interface Legislator { id: { bioguide: string }; name: { official_full?: string; first: string; last: string; suffix?: string }; terms: Seat[] }

async function readRoster(kind: 'current' | 'historical', asOf: string) {
  const records = await (await get(`${rosterUrl}/legislators-${kind}.json`)).json() as Legislator[];
  if (!Array.isArray(records) || !records.length) throw new Error(`Missing ${kind} member records`);
  const members: CongressMember[] = [];
  for (const record of records) {
    const id = text(record.id.bioguide);
    if (!id) continue;
    // Each chamber has its own profile, including former House members who became senators.
    const latest = new Map<string, Seat>();
    for (const seat of record.terms) {
      if (seat.start <= asOf && seat.end >= '2012-01-01' && (seat.type === 'rep' || seat.type === 'sen')) latest.set(seat.type, seat);
    }
    for (const term of latest.values()) {
      const throughDate = term.end < asOf ? term.end : asOf;
      const affiliation = term.party_affiliations?.filter(p => p.start <= throughDate && throughDate <= p.end).at(-1);
      members.push({
        id, name: record.name.official_full ?? [record.name.first, record.name.last, record.name.suffix].filter(Boolean).join(' '),
        chamber: term.type === 'sen' ? 'Senate' : 'House', party: affiliation?.party ?? term.party ?? null,
        state: term.state ?? null, district: term.district == null ? null : String(term.district),
      });
    }
  }
  if (!members.length) throw new Error(`Unrecognized ${kind} member records`);
  return members;
}

export async function fetchCongressSnapshot(previous?: CongressSnapshot): Promise<CongressSnapshot> {
  const response = await get(`${baseUrl}/main/snapshot.json`);
  const manifest = await response.json() as Manifest;
  if (manifest.dataset !== dataset || manifest.schemaVersion !== 2 || !manifest.audit?.passed || !/^[a-f0-9]{64}$/.test(manifest.sourceFingerprint) || !Number.isFinite(Date.parse(manifest.generatedAt))) {
    throw new Error('Congressional snapshot manifest is unavailable or unrecognized');
  }
  if (previous && Date.parse(manifest.generatedAt) < Date.parse(previous.asOf)) {
    throw new Error('Published snapshot is older than the saved disclosures');
  }
  const fingerprint = manifest.sourceFingerprint;
  // Pin all shards to the commit that supplied the manifest. Hashes also protect mirrors without this header.
  const commit = response.headers.get('x-repo-commit') ?? '';
  const revision = /^[a-f0-9]{40}$/.test(commit) ? commit : 'main';
  const day = manifest.generatedAt.slice(0, 10);
  // Roster corrections are published separately and can change on a day without new filings.
  const directories = Promise.allSettled([readRoster('historical', day), readRoster('current', day)]);
  const members = new Map<string, CongressMember>();
  let trades: CongressTrade[] = [];
  let gaps: CongressGap[] = [];
  if (previous?.fingerprint === fingerprint) {
    trades = previous.trades;
    gaps = previous.gaps;
    for (const member of previous.members) members.set(congressMemberKey(member.id, member.chamber), member);
  } else {
    const filings = new Map<string, Filing>();
    await readTable(manifest, 'political_filings', revision, filingColumns, row => {
      const filing = normalizeFiling(row);
      const key = `${row.chamber}:${filing.filingId}`;
      if (filings.has(key)) throw new Error('Duplicate congressional filing identity');
      filings.set(key, filing);
    });
    const ids = new Set<string>();
    await readTable(manifest, 'political_trades', revision, tradeColumns, row => {
      const filing = filings.get(`${row.chamber}:${row.docId}`);
      if (!filing) throw new Error('Congressional trade has no corresponding filing');
      const trade = normalizeTrade(row, filing);
      if (ids.has(trade.id)) throw new Error('Duplicate congressional source row identity');
      ids.add(trade.id);
      trades.push(trade);
      filing.rows++;
    });
    // Last filing supplies fallback metadata when the Bioguide directory omits a filer.
    const chronological = [...filings.values()].sort((a, b) => (a.filingDate ?? '').localeCompare(b.filingDate ?? ''));
    for (const filing of chronological) {
      members.set(congressMemberKey(filing.member.id, filing.chamber), filing.member);
      if (filing.rows && !filing.failed && filing.rows === filing.expectedRows) continue;
      const reason = filing.rows ? 'The snapshot has incomplete or disputed extraction for this report.'
        : filing.scanned ? 'Scanned report with no normalized transactions.'
        : filing.failed ? 'The snapshot could not parse this filing.' : 'No normalized transactions in the snapshot.';
      gaps.push({ chamber: filing.chamber, filingId: filing.filingId, filingDate: filing.filingDate, filingUrl: filing.filingUrl, memberName: filing.member.name, reason });
    }
  }
  const results = await directories;
  const missing = results.flatMap((result, index) => result.status === 'rejected' ? [index === 0 ? 'historical' : 'current'] : []);
  if (missing.length && previous) {
    for (const member of previous.members) {
      const key = congressMemberKey(member.id, member.chamber);
      if (!members.get(key)?.isNonMember) members.set(key, member);
    }
  }
  for (const result of results) if (result.status === 'fulfilled') for (const member of result.value) members.set(congressMemberKey(member.id, member.chamber), member);
  return { trades, gaps, members: [...members.values()], fingerprint, asOf: manifest.generatedAt,
    metadataWarning: missing.length ? `The ${missing.join(' and ')} member directory could not be refreshed. Some party and district details may be missing or out of date.` : null };
}
