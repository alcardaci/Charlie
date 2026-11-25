import { unzip } from 'fflate';

const DOC = 'https://api.gdeltproject.org/api/v2/doc/doc';
const ARCHIVE = 'https://storage.googleapis.com/data.gdeltproject.org/gdeltv2/';
const QUERY = '(conflict OR warfare OR invasion OR airstrike OR "missile attack" OR "border clash" OR sanctions OR ceasefire OR "civil unrest")';
const EVENT_TITLE = /\b(war|conflicts?|inva(?:des?|sion)|attack(?:s|ed)?|airstrikes?|missiles?|drones?|sanctions?|ceasefire|truce|clashes|blockade|military|troops|protests?|hostages?|coup|insurgents?|peace talks|bombing|rebels|civil unrest|elections?)\b/i;

export type GdeltHeadline = {
  title: string; link: string; publisher: string; publishedAt: number;
  collection: 'DOC' | 'GKG'; sourceCountry?: string; cached?: boolean;
};

function decodeTitle(title: string): string {
  return title.replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code: string) => {
    const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  }).replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function headline(title: string, rawUrl: string, stamp: string, collection: GdeltHeadline['collection'], domain?: string): GdeltHeadline | null {
  const match = /^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/.exec(stamp);
  if (!match || !title || !rawUrl) return null;
  const publishedAt = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
  if (!Number.isFinite(publishedAt)) return null;
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    const decoded = decodeTitle(title);
    return decoded ? { title: decoded, link: url.href, publisher: domain || url.hostname, publishedAt, collection } : null;
  } catch { return null; }
}

export function parseGkgHeadlines(tsv: string): GdeltHeadline[] {
  const results: GdeltHeadline[] = [];
  for (const line of tsv.split('\n')) {
    const title = /<PAGE_TITLE>([^<]{2,1000})<\/PAGE_TITLE>/i.exec(line)?.[1];
    if (!title || !EVENT_TITLE.test(title)) continue;
    const [, stamp, sourceType, domain, url] = line.split('\t', 5);
    if (sourceType !== '1') continue;
    const item = headline(title, url, stamp, 'GKG', domain);
    if (item) results.push(item);
  }
  return results;
}

async function readArchive() {
  const signal = AbortSignal.timeout(12_000);
  const manifest = await fetch(ARCHIVE + 'lastupdate.txt', { signal });
  if (!manifest.ok) throw new Error('GDELT archive index unavailable');
  const match = /^(\d+) [a-f\d]{32} https?:\/\/data\.gdeltproject\.org\/gdeltv2\/(\d{14}\.gkg\.csv\.zip)\s*$/im.exec(await manifest.text());
  if (!match || Number(match[1]) > 25_000_000) throw new Error('Invalid GDELT archive index');
  // The index can be ahead of the local clock at a quarter-hour boundary. Only use completed slots.
  const currentSlot = new Date(Math.floor(Date.now() / 900000) * 900000).toISOString().replace(/[-:]/g, '').replace('T', '').slice(0, 14) + '.gkg.csv.zip';
  const file = match[2] < currentSlot ? match[2] : currentSlot;
  if (file === lastArchiveFile) return archiveHistory;
  const response = await fetch(ARCHIVE + file, { signal });
  if (!response.ok) throw new Error('GDELT archive download unavailable');
  const expectedSize = file === match[2] ? Number(match[1]) : Number(response.headers.get('content-length'));
  if (expectedSize > 25_000_000) throw new Error('GDELT archive exceeds size limit');
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.length > 25_000_000 || (expectedSize > 0 && data.length !== expectedSize)) throw new Error('Incomplete GDELT archive download');
  const csvName = file.toLowerCase().slice(0, -4);
  const csv = await new Promise<Uint8Array>((resolve, reject) => {
    unzip(data, { filter: entry => entry.name.toLowerCase() === csvName && entry.originalSize <= 160_000_000 }, (err, files) => {
      const file = files && Object.values(files)[0];
      if (err || !file) reject(err ?? new Error('GDELT archive is missing its news records'));
      else resolve(file);
    });
  });
  const items = parseGkgHeadlines(new TextDecoder().decode(csv));
  archiveHistory = inWindow([...items, ...archiveHistory], 168).slice(0, 2500);
  lastArchiveFile = file;
  return archiveHistory;
}

async function readDoc(hours: number) {
  const params = new URLSearchParams({ query: QUERY, mode: 'artlist', timespan: `${hours}h`, maxrecords: '250', sort: 'HybridRel', format: 'json' });
  const res = await fetch(`${DOC}?${params}`, { signal: AbortSignal.timeout(11_000), headers: { Accept: 'application/json' } });
  if (res.status === 429) {
    const seconds = Number(res.headers.get('retry-after')) || 60;
    docAllowedAfter = Date.now() + Math.max(60, seconds) * 1000;
  }
  if (!res.ok) throw new Error(`GDELT search returned ${res.status}`);
  const data = await res.json() as { articles?: Array<{ title: string; url: string; seendate: string; domain?: string; sourcecountry?: string }> };
  if (!Array.isArray(data.articles)) throw new Error('GDELT search returned an invalid response');
  return data.articles.flatMap(a => {
    const item = headline(a.title, a.url, a.seendate, 'DOC', a.domain);
    return item ? [{ ...item, sourceCountry: a.sourcecountry }] : [];
  });
}

export function inWindow(items: GdeltHeadline[], hours: number, now = Date.now()): GdeltHeadline[] {
  const seen = new Set<string>();
  const cutoff = now - hours * 3600000;
  return items.filter(item => item.publishedAt >= cutoff && item.publishedAt <= now)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter(item => { if (seen.has(item.link)) return false; seen.add(item.link); return true; });
}

let lastArchiveFile = '';
let archiveHistory: GdeltHeadline[] = [];
let archivePending: Promise<GdeltHeadline[]> | undefined;
let archiveCheckAfter = 0;
let archiveUnavailable = false;
async function archiveFeed() {
  if (!archivePending && Date.now() >= archiveCheckAfter) {
    archivePending = readArchive().then(items => {
      archiveUnavailable = false;
      archiveCheckAfter = Date.now() + 5 * 60_000;
      return items;
    }).catch(error => {
      archiveCheckAfter = Date.now() + 30_000;
      archiveUnavailable = true;
      throw error;
    }).finally(() => { archivePending = undefined; });
  }
  if (archivePending) return archivePending;
  if (archiveUnavailable || !lastArchiveFile) throw new Error('GDELT archive temporarily unavailable');
  return archiveHistory;
}

let docAllowedAfter = 0;
const docCache = new Map<number, { items: GdeltHeadline[]; until: number }>();
const docPending = new Map<number, Promise<GdeltHeadline[]>>();
function docFeed(hours: number): Promise<GdeltHeadline[]> {
  const cached = docCache.get(hours);
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.items);
  const inflight = docPending.get(hours);
  if (inflight) return inflight;
  if (Date.now() < docAllowedAfter) return Promise.reject(new Error('GDELT search cooling down'));
  docAllowedAfter = Date.now() + 6000;
  const request = readDoc(hours).then(items => {
    docCache.set(hours, { items, until: Date.now() + 5 * 60_000 });
    return items;
  }).finally(() => docPending.delete(hours));
  docPending.set(hours, request);
  return request;
}

// A slow DOC request may still warm its cache. A cold browser can use an independent GDELT publication in the meantime.
export async function getGdeltNews(hours: number, limit: number): Promise<GdeltHeadline[]> {
  const doc = docFeed(hours).then(items => inWindow(items, hours));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const early = await Promise.race([
    doc.catch(() => []), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1200); }),
  ]).finally(() => clearTimeout(timer));
  if (early?.length) return early.slice(0, limit);
  const archive = archiveFeed().then(items => inWindow(items, hours));
  const sources = [doc, archive];
  // An empty collection must not hide a successful result from the other route.
  const first = await Promise.any(sources.map(async source => {
    const items = await source;
    if (!items.length) throw new Error('No matching articles');
    return items;
  })).catch(() => null);
  if (first) return first.slice(0, limit);
  const lastGood = inWindow([...archiveHistory, ...[...docCache.values()].flatMap(entry => entry.items)], hours);
  if (lastGood.length) return lastGood.slice(0, limit).map(item => ({ ...item, cached: true }));
  const settled = await Promise.allSettled(sources);
  if (settled.some(result => result.status === 'fulfilled')) return [];
  console.warn('[GDELT] Search and archive failed', settled.map(s => s.status === 'rejected' ? String(s.reason) : ''));
  throw new Error('GDELT search and archive are temporarily unavailable');
}
