import { unzipSync } from 'fflate';
import { getDocumentProxy } from 'unpdf';
import type { CongressGap, CongressMember, CongressTrade } from '../src/data/congress';

const CLERK = 'https://disclosures-clerk.house.gov/public_disc';
const DAY = 86_400_000;
const WINDOW_DAYS = 90;
const PDF_BUDGET = 18;

interface HouseReport {
  id: string;
  first: string;
  last: string;
  name: string;
  state: string | null;
  district: string | null;
  filed: string;
  url: string;
}

export interface HouseSupplement {
  trades: CongressTrade[];
  members: CongressMember[];
  gaps: CongressGap[];
  filingDates: Record<string, string>;
  checkedAt: string;
  asOf: string;
  windowStart: string;
  indexedCount: number;
  pdfCheckedAt: Record<string, number>;
}

function civilDate(value: string) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const date = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().startsWith(date) ? date : null;
}

export function readHouseIndex(bytes: Uint8Array, year: number): HouseReport[] {
  const entry = `${year}FD.txt`;
  const data = unzipSync(bytes, { filter: file => file.name === entry && file.originalSize < 8_000_000 })[entry];
  if (!data) throw new Error('House Clerk index has no disclosure table');
  const utf8 = new TextDecoder().decode(data);
  const text = utf8.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(data) : utf8;
  const [header, ...lines] = text.trimEnd().split(/\r?\n/);
  const columns = header.replace(/^\uFEFF/, '').split('\t');
  const fields = ['DocID', 'Year', 'FilingType', 'FilingDate', 'First', 'Last', 'Suffix', 'StateDst'];
  if (fields.some(field => !columns.includes(field))) throw new Error('Unrecognized House Clerk index columns');
  const reports = new Map<string, HouseReport>();
  for (const line of lines) {
    const values = line.split('\t');
    const field = (name: string) => values[columns.indexOf(name)]?.trim() || '';
    if (field('FilingType') !== 'P') continue;
    const id = field('DocID');
    const filed = civilDate(field('FilingDate'));
    if (!/^\d+$/.test(id) || !filed || field('Year') !== String(year)) throw new Error('Invalid House Clerk report identity or filing date');
    const seat = /^([A-Z]{2})(\d+)?$/.exec(field('StateDst'));
    reports.set(id, {
      id, filed, first: field('First'), last: field('Last'),
      name: [field('First'), field('Last'), field('Suffix')].filter(Boolean).join(' '),
      state: seat?.[1] || null, district: seat?.[2] ? String(Number(seat[2])) : null,
      url: `${CLERK}/ptr-pdfs/${year}/${id}.pdf`,
    });
  }
  return [...reports.values()].sort((a, b) => b.filed.localeCompare(a.filed) || b.id.localeCompare(a.id));
}

const nameKey = (name: string) => name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z]/g, '');
function identifyMember(report: HouseReport, roster: CongressMember[]): CongressMember {
  // The index has no Bioguide ID. An unrelated filer can share a seat and surname.
  const seat = roster.filter(person => person.chamber === 'House' && report.state && person.state === report.state
    && (report.district === null || person.district === report.district));
  const exact = seat.filter(person => nameKey(person.name) === nameKey(report.name));
  const given = nameKey(report.first.split(/\s+/)[0]);
  const candidates = exact.length ? exact : seat.filter(person => {
    const words = person.name.trim().split(/\s+/);
    // Keep compound surnames intact while avoiding a suffix match such as 'Carr' with 'McCarr'.
    const surnameMatches = words.some((_, i) => nameKey(words.slice(i).join(' ')) === nameKey(report.last));
    return given && nameKey(words[0]) === given && surnameMatches;
  });
  if (candidates.length === 1) return candidates[0];
  if (candidates.length && !candidates.some(person => person.isNonMember)) {
    const official = candidates.filter(person => /^[A-Z]\d{6}$/.test(person.id));
    if (official.length === 1) return official[0];
  }
  return { id: `clerk:${report.state ?? ''}:${report.district ?? ''}:${nameKey(report.name)}`, name: report.name,
    chamber: 'House', party: null, state: report.state, district: report.district };
}

export interface HouseTextItem { x: number; y: number; text: string }
const actionLabels: Record<string, string> = { P: 'Purchase', S: 'Sale', 'S (partial)': 'Partial sale', 'S (full)': 'Sale (full)', E: 'Exchange' };
const ownerLabels: Record<string, string> = { JT: 'Joint', SP: 'Spouse', DC: 'Dependent child' };

/** Identify the Clerk's actual column headings; the notification date must never stand in for the trade date. */
export function readHousePages(pages: HouseTextItem[][], report: HouseReport, member: CongressMember) {
  const trades: CongressTrade[] = [];
  let unreadable = 0;
  // Continue the last row across page breaks: status, ticker or the upper amount can be on the next page.
  const cells: { col: number; line: number; text: string }[] = [];
  const heading = pages[0]?.slice(0, 8).map(i => i.text).join(' ') ?? '';
  const amendedReport = /\b(?:amended (?:periodic transaction )?report|(?:periodic transaction report)\s*[-–(]?\s*amendment)\b/i.test(heading);
  for (const [pageIndex, items] of pages.entries()) {
    const header = items.find(i => i.text === 'Transaction' || i.text === 'Transaction Type');
    if (!header) {
      if (!items.length || items.some(i => /^(?:Amount|Notification|Transaction Date)$/i.test(i.text))) unreadable++;
      continue;
    }
    const column = (label: string) => items.find(i => Math.abs(i.y - header.y) < 3 && i.text === label)?.x;
    const starts = [column('Owner'), column('Asset'), header.x, column('Date'), column('Notification'), column('Amount'), column('Cap.') ?? Infinity];
    if (starts.some(x => x == null)) { unreadable++; continue; }
    const end = items.find(i => /^\* For the complete list/i.test(i.text));
    for (const item of items) {
      if (item.y > header.y - 15 || (end && item.y <= end.y + 1)) continue;
      // Allow the small difference between header and body x-coordinates in the Clerk template.
      const col = starts.filter(x => item.x >= x! - 2).length - 1;
      if (col < 0 || col > 5) continue;
      cells.push({ col, line: pageIndex * 10_000 - item.y, text: item.text });
    }
  }
  cells.sort((a, b) => a.line - b.line || a.col - b.col);
  // Anchor on both fields. If only one is readable, mark that row incomplete without joining it to its neighbor.
  const anchors = cells.filter(c => (c.col === 3 && civilDate(c.text)) || (c.col === 2 && Object.hasOwn(actionLabels, c.text)));
  const lines = anchors.map(c => c.line).filter((line, n, all) => !n || Math.abs(line - all[n - 1]) > 2);
  let cursor = 0;
  for (const [rowIndex, line] of lines.entries()) {
    while (cursor < cells.length && cells[cursor].line < line - 2) cursor++;
    const start = cursor, end = (lines[rowIndex + 1] ?? Infinity) - 2;
    while (cursor < cells.length && cells[cursor].line < end) cursor++;
    const section = cells.slice(start, cursor);
    // Small-cap glyphs in Clerk PDFs often lack Unicode mappings, yielding “F S: New” after stripping NULs.
    const metadata = section.find(c => /^(?:Filing Status|F S)\s*:/i.test(c.text));
    const body = metadata ? section.filter(c => c.line < metadata.line - 1) : section;
    const text = (column: number) => body.filter(c => c.col === column).map(c => c.text).join(' ').trim();
    const assetText = text(1), action = text(2), date = civilDate(text(3)), amount = text(5);
    if (!date || !action || !assetText || !amount.includes('$')) { unreadable++; continue; }
    const ticker = /\(([A-Z][A-Z\d.\-]{0,14})\)\s*(?:\[[A-Z0-9]+\])?\s*$/.exec(assetText)?.[1] ?? null;
    const owner = text(0);
    const status = metadata?.text.split(':')[1]?.trim() ?? '';
    const actionLabel = actionLabels[action] || action;
    trades.push({
      id: `house:${report.id}:${rowIndex}`, filingId: report.id, memberId: member.id, memberName: member.name, chamber: 'House',
      owner: ownerLabels[owner] || owner || null, asset: assetText.replace(/\s*\[[A-Z0-9]+\]\s*$/, ''),
      ticker, action: /^deleted/i.test(status) ? `${actionLabel} (deleted)` : actionLabel, amount, tradeDate: date, filingDate: report.filed, filingUrl: report.url,
      amendment: amendedReport || /^(?:amend|revis|correct|modif|delet)/i.test(status),
    });
  }
  return { trades, gapReason: !trades.length ? (pages.some(page => page.length) ? 'PDF contains no recognizable transaction rows' : 'Image-only PDF; no text transaction rows')
    : unreadable ? 'Some PDF rows or pages could not be read' : null };
}

export async function readHousePdf(bytes: Uint8Array, report: HouseReport, member: CongressMember) {
  const doc = await getDocumentProxy(bytes, { verbosity: 0 });
  try {
    const pages: HouseTextItem[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: HouseTextItem[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const text = item.str.replace(/\0/g, '').trim();
        if (text) items.push({ x: item.transform[4], y: item.transform[5], text });
      }
      pages.push(items);
      page.cleanup();
    }
    return readHousePages(pages, report, member);
  } finally { await doc.loadingTask.destroy(); }
}

async function getBytes(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`House Clerk returned HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function fetchHouseSupplement(snapshotTrades: CongressTrade[], members: CongressMember[], previous?: HouseSupplement,
  { now = new Date(), loadBytes = getBytes } = {}): Promise<HouseSupplement> {
  const windowStart = new Date(now.getTime() - (WINDOW_DAYS - 1) * DAY).toISOString().slice(0, 10);
  const years = [...new Set([Number(windowStart.slice(0, 4)), now.getUTCFullYear()])];
  const indexes = await Promise.all(years.map(async year => readHouseIndex(await loadBytes(`${CLERK}/financial-pdfs/${year}FD.zip`), year)));
  const allReports = indexes.flat().sort((a, b) => b.filed.localeCompare(a.filed) || b.id.localeCompare(a.id));
  const recent = allReports.filter(report => report.filed >= windowStart);
  const filingDates = { ...previous?.filingDates, ...Object.fromEntries(allReports.map(r => [r.id, r.filed])) };
  const covered = new Set(snapshotTrades.filter(t => t.chamber === 'House').map(t => t.filingId));
  // Keep the original extraction on disk even after the mirror catches up. A later snapshot can regress.
  const retained = previous?.trades ?? [];
  const byFiling = new Map<string, CongressTrade[]>();
  const memberMap = new Map((previous?.members ?? []).map(m => [m.id, m]));
  const reportsById = new Map(allReports.map(r => [r.id, r]));
  for (const trade of retained) {
    let rows = byFiling.get(trade.filingId);
    if (!rows) { rows = []; byFiling.set(trade.filingId, rows); }
    const report = reportsById.get(trade.filingId);
    // A previous offline parse may predate the first successful Bioguide download.
    const member = trade.memberId.startsWith('clerk:') && report && members.length
      ? (rows.length ? memberMap.get(rows[0].memberId) : identifyMember(report, members)) : undefined;
    if (member) memberMap.set(member.id, member);
    rows.push(member ? { ...trade, memberId: member.id, memberName: member.name } : trade);
  }
  const gaps = new Map((previous?.gaps ?? []).filter(g => byFiling.has(g.filingId) || !covered.has(g.filingId)).map(g => [g.filingId, g]));
  const pdfCheckedAt = { ...previous?.pdfCheckedAt };
  const missing = recent.filter(r => !covered.has(r.id) && (!byFiling.has(r.id) || gaps.has(r.id)));
  missing.sort((a, b) => (pdfCheckedAt[a.id] || 0) - (pdfCheckedAt[b.id] || 0) || b.filed.localeCompare(a.filed));
  const gap = (report: HouseReport, reason: string): CongressGap => ({ chamber: 'House', filingId: report.id, filingDate: report.filed, memberName: report.name, filingUrl: report.url, reason });
  const queue = missing.slice(0, PDF_BUDGET);
  for (const report of missing.slice(PDF_BUDGET)) {
    if (!gaps.has(report.id)) gaps.set(report.id, gap(report, 'Indexed report awaiting PDF extraction'));
  }
  const readNext = async () => {
    for (let report = queue.shift(); report; report = queue.shift()) {
      const member = identifyMember(report, members);
      memberMap.set(member.id, member);
      pdfCheckedAt[report.id] = now.getTime();
      try {
        const result = await readHousePdf(await loadBytes(report.url), report, member);
        if (result.trades.length && (!result.gapReason || result.trades.length >= (byFiling.get(report.id)?.length ?? 0))) byFiling.set(report.id, result.trades);
        if (result.gapReason) gaps.set(report.id, gap(report, result.gapReason));
        else gaps.delete(report.id);
      } catch {
        gaps.set(report.id, gap(report, 'Could not retrieve or read the original PDF'));
      }
    }
  };
  await Promise.all([readNext(), readNext(), readNext()]);
  return { members: [...memberMap.values()], trades: [...byFiling.values()].flat(), gaps: [...gaps.values()],
    filingDates, indexedCount: recent.length, windowStart, checkedAt: now.toISOString(), asOf: allReports[0]?.filed ?? '', pdfCheckedAt };
}
