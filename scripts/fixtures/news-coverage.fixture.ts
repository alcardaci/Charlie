import './live-news.fixture';
import { zipSync, strToU8 } from 'fflate';
import { aggregateGeopoliticalStoriesToCountries, cachedGeopoliticalEvents, reviewGeopoliticalEvents, selectEventCandidates } from '../../src/api/finance';
import { getGdeltNews, inWindow, parseGkgHeadlines } from '../../server/gdelt';
import { DEFAULT_NEWS_LAYOUT, NEWS_CARD_IDS, dropNewsTile, minNewsHeight, newsDropTarget, normalizeNewsLayout, positionNewsTiles, restoreNewsLayout, setSplitRatio, tileOrder } from '../../src/utils/newsLayout';
import { split } from '../../src/utils/tileLayout';
import type { NewsItem } from '../../src/types';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const now = Date.now();
const headline = (title: string, link: string, fields: Partial<NewsItem> = {}): NewsItem =>
  ({ title, link, publishedAt: now - 60_000, publisher: 'Example', ...fields });
const selected = selectEventCandidates([
  headline('Missile attack in Ukraine', 'https://example.test/a?utm_source=feed#top', { feedSource: 'gdelt', sourceCountryCode: 'CA', severityScore: 8 }),
  headline('Missile attack in Ukraine', 'https://example.test/a'),
  headline('Canada grants award to film studio', 'https://example.test/b'),
  headline('Peaceful event helps us', 'https://example.test/p', { sourceCountryCode: 'US' }),
  headline('Protests in India', 'https://example.test/d', { feedSource: 'yahoo-finance' }),
  headline('US imposes sanctions', 'https://example.test/e'),
  headline('Airstrike in Iran', 'https://example.test/f', { publishedAt: now - 25 * 3600_000 }),
  headline('Protests in Japan', 'https://example.test/g', { publishedAt: now + 60_000 }),
  headline('Raid in France', 'data:text/plain,abc'),
], 24, now);
assert(selected.length === 5 && selected.every(h => h.severityScore == null), 'Deduplicate reports, enforce the lookback and remove feed-supplied scores before review');
const originalFetch = globalThis.fetch;
const options = { enableAI: true, model: 'test-news-model' };
try {
  let calls = 0;
  let offline = false;
  globalThis.fetch = async (url, init) => {
    assert(String(url).endsWith('/geopolitical-events'), 'Unexpected review endpoint');
    calls++;
    const input = JSON.parse(String(init?.body)) as { headlines: Array<{ title: string; link: string }> };
    if (offline || input.headlines.some(h => h.title === 'Failed batch')) return new Response(null, { status: 503 });
    const events = input.headlines.flatMap(({ title, link }) => {
      if (title === 'Missile attack in Ukraine') return [{ link, countryCodes: ['UA'], severityScore: 4 }];
      if (title === 'Protests in India') return [{ link, countryCodes: ['IN'], severityScore: 2 }];
      if (title === 'Peaceful event helps us') return [{ link, countryCodes: [], severityScore: 3 }];
      if (title === 'Canada grants award to film studio') return [{ link, countryCodes: ['CA'], severityScore: 0 }];
      return [];
    });
    return Response.json({ events: [...events, { link: 'unknown-reference', countryCodes: ['JP'], severityScore: 9 }] });
  };

  const disabled = await reviewGeopoliticalEvents(selected, 24, { ...options, enableAI: false });
  assert(calls === 0 && !disabled.stories.length && !disabled.batches, 'Without OpenAI there must be no requests or assessments');
  offline = true;
  const failed = await reviewGeopoliticalEvents(selected, 24, options);
  assert(failed.failed === 1 && !failed.stories.length, 'A failed first review cannot produce a keyword score');
  offline = false;
  const reviewed = await reviewGeopoliticalEvents(selected, 24, options);
  const countries = aggregateGeopoliticalStoriesToCountries(reviewed.stories, 'Yahoo Finance + GDELT', 'geo');
  assert(reviewed.failed === 0 && reviewed.stories.length === 2, 'Only matched, scored and located OpenAI events may be mapped');
  assert(countries.find(c => c.countryCode === 'UA')?.severityScore === 4, 'Use the actual AI estimate, even when feed metadata and wording suggest a different score');
  assert(countries.find(c => c.countryCode === 'IN')?.severityScore === 2, 'Both sources can contribute AI-reviewed events');
  for (const code of ['CA', 'US', 'JP']) assert(!countries.find(c => c.countryCode === code)?.count, 'Source geography, missing scores and unreviewed keywords must not create hotspots');
  assert(cachedGeopoliticalEvents(selected, options).length === 2 && !cachedGeopoliticalEvents(selected, { ...options, model: 'other' }).length, 'Cached reviews must match the model and reports');
  const previousCalls = calls;
  const reused = await reviewGeopoliticalEvents(selected, 24, options);
  assert(calls === previousCalls && reused.stories.length === 2, 'Repeating a successful review must reuse its results');
  const rejected = await reviewGeopoliticalEvents([headline('US imposes sanctions', 'https://example.test/e')], 24, options);
  assert(!rejected.failed && rejected.batches === 1 && !rejected.stories.length, 'An actual model review can legitimately find zero events');
  const unreviewed = headline('Failed batch', 'https://example.test/outage', { severityScore: 10, countryCodes: ['CA'] });
  const retained = await reviewGeopoliticalEvents([...selected, unreviewed], 24, options);
  assert(retained.failed === 1 && retained.stories.length === 2, 'A failed refresh may retain only previously AI-reviewed events');
  const mixed = await reviewGeopoliticalEvents([
    ...selected,
    ...Array.from({ length: 40 - selected.length }, (_, i) => headline('Unrelated report ' + i, 'https://example.test/mixed/' + i)),
    unreviewed,
  ], 24, { ...options, systemPrompt: 'different review' });
  assert(mixed.batches === 2 && mixed.failed === 1 && mixed.stories.length === 2, 'A partial review must include only successfully reviewed stories');
  const controller = new AbortController();
  controller.abort();
  let cancelled = false;
  try { await reviewGeopoliticalEvents([unreviewed], 24, { ...options, signal: controller.signal }); }
  catch (error) { cancelled = error instanceof Error && error.name === 'AbortError'; }
  assert(cancelled, 'Switching time frames must cancel the superseded review');
} finally { globalThis.fetch = originalFetch; }

const stamp = new Date(Math.floor((now - 900000) / 900000) * 900000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
const filename = stamp + '.gkg.csv';
const row = [stamp + '-1', stamp, '1', 'news.test', 'https://news.test/story', ...Array(21).fill(''), '<PAGE_TITLE>Ukraine &amp; allies announce sanctions</PAGE_TITLE>'].join('\t');
const articles = parseGkgHeadlines(row);
assert(articles.length === 1 && articles[0].collection === 'GKG' && articles[0].title.includes('& allies'), 'Archive titles must have original dates, links and decoded entities');
assert(!inWindow(articles, 1, now + 2 * 3600_000).length, 'Cached GDELT reports must expire from shorter windows');
const zip = zipSync({ [filename]: strToU8(row) });
let downloads = 0;
try {
  globalThis.fetch = async url => {
    if (String(url).includes('api.gdeltproject.org')) return new Response('Rate limited', { status: 429 });
    if (String(url).endsWith('lastupdate.txt')) return new Response(`${zip.length} ${'a'.repeat(32)} http://data.gdeltproject.org/gdeltv2/${filename}.zip\n`);
    if (String(url).endsWith(filename + '.zip')) { downloads++; return new Response(zip); }
    throw new Error('Unexpected upstream ' + url);
  };
  const [short, long] = await Promise.all([getGdeltNews(1, 10), getGdeltNews(24, 50)]);
  assert(short[0]?.link === 'https://news.test/story' && long[0]?.collection === 'GKG' && downloads === 1,
    'Concurrent windows must share a real archive batch when DOC rate-limits');
} finally { globalThis.fetch = originalFetch; }

const custom = normalizeNewsLayout([{ id: 'risk', width: 'full', height: 'tall' }, { id: 'risk' }, { id: 'unknown' }]);
const migrated = positionNewsTiles(custom, 1200, 960);
assert(tileOrder(custom.tree).join(',') === 'risk,map,headlines,player' && migrated.tiles[0].rect.width === 1200 && custom.stackedHeights.risk === 688,
  'Retain the order, full-width rows and sizes of legacy presets, repairing missing and duplicate cards');
assert(JSON.stringify(normalizeNewsLayout(undefined)) === JSON.stringify(DEFAULT_NEWS_LAYOUT), 'Existing installs get all four default cards');
const tree = DEFAULT_NEWS_LAYOUT.tree;
const equalGrid = { ...DEFAULT_NEWS_LAYOUT, tree: split('y', split('x', 'map', 'headlines'), split('x', 'player', 'risk')), version: 1 };
const oldLayout = { ...DEFAULT_NEWS_LAYOUT, tree: setSplitRatio(setSplitRatio(equalGrid.tree, '', 0.53), '1', 0.43) };
assert(restoreNewsLayout(oldLayout) === DEFAULT_NEWS_LAYOUT, 'Upgrade the previously persisted factory layout');
assert(restoreNewsLayout(equalGrid) === DEFAULT_NEWS_LAYOUT, 'Upgrade the previous equal-grid default');
for (const customized of [
  { ...oldLayout, height: 900 }, { ...oldLayout, stackedHeights: { player: 320 } },
  { ...oldLayout, tree: setSplitRatio(oldLayout.tree, '0', 0.62) }, { ...oldLayout, version: 1 },
  { ...equalGrid, tree: setSplitRatio(equalGrid.tree, '1', 0.55) }, { ...equalGrid, version: 2 },
  { ...equalGrid, height: 800 }, { ...equalGrid, stackedHeights: { map: 440 } },
]) {
  assert(JSON.stringify(restoreNewsLayout(customized)) === JSON.stringify(normalizeNewsLayout(customized)),
    'Retain saved custom layouts, including deliberate choices that match the previous default');
}
for (const [width, height] of [[2245, 1116], [1280, 960], [1001, 551], [855, 440], [854, 440], [579, 800], [390, 844], [390, 2000]]) {
  const board = positionNewsTiles(DEFAULT_NEWS_LAYOUT, width, height);
  const [map, feed, player, risk] = board.tiles.map(tile => tile.rect);
  assert(board.tiles.map(t => t.id).join(',') === 'map,headlines,player,risk', 'News reading order matches the reference layout');
  assert(board.stacked === (width < 855), 'Stack when three usable columns no longer fit');
  if (board.stacked) {
    assert(board.tiles.every(({ rect }) => rect.width === width && rect.height === map.height), 'Stack News cards at full width with equal heights');
  } else {
    assert(map.height === board.height && feed.height === board.height && feed.left > map.width, 'Map and headlines span the full height');
    assert(player.left > feed.left + feed.width && risk.left === player.left && risk.width === player.width &&
      player.top === 0 && risk.top > player.height && risk.top + risk.height === board.height, 'Player sits above risk in the right column');
    assert(feed.width >= 280, 'Preserve a readable headline column');
    if (width === 2245) {
      assert(Math.abs(map.width / width - 0.5) < 0.01 && Math.abs(feed.width / width - 0.125) < 0.01 &&
        Math.abs(player.height - risk.height) <= 1, 'Match the screenshot proportions on a wide desktop');
    }
  }
}
const swapped = dropNewsTile(tree, 'risk', { target: 'map', edge: 'center' });
assert(tileOrder(swapped).join(',') === 'risk,headlines,player,map', 'Dropping in the center exchanges the two cards');
const docked = dropNewsTile(swapped, 'map', { target: 'board', edge: 'top' });
const wide = positionNewsTiles({ ...DEFAULT_NEWS_LAYOUT, tree: docked }, 1280, 1050);
const first = wide.tiles[0];
assert(first.id === 'map' && first.rect.width === 1280 && wide.tiles.slice(1).every(t => t.rect.top >= first.rect.height), 'Outer-edge docking spans the whole workspace');
const initial = positionNewsTiles(DEFAULT_NEWS_LAYOUT, 1280, 950);
const enlarged = positionNewsTiles({ ...DEFAULT_NEWS_LAYOUT, tree: setSplitRatio(tree, '', 0.72) }, 1280, 950);
assert(enlarged.tiles[0].rect.width > initial.tiles[0].rect.width && enlarged.tiles[2].rect.width < initial.tiles[2].rect.width,
  'Widening the map redistributes the remaining space');
const feed = enlarged.tiles.find(t => t.id === 'headlines')!.rect;
assert(newsDropTarget(enlarged, 'map', feed.left + feed.width / 2, feed.height / 2)?.edge === 'center', 'Center of a card is a swap target');
const lowerFeedDrop = newsDropTarget(enlarged, 'map', feed.left + feed.width / 2, feed.height - 30);
assert(lowerFeedDrop?.target === 'headlines' && lowerFeedDrop.edge === 'bottom',
  'Interior bottom edges insert a card below the target');
for (const width of [320, 390, 650, 860, 1280]) {
  for (const id of NEWS_CARD_IDS) for (const edge of ['left', 'top', 'bottom', 'right'] as const) {
    const next = { ...DEFAULT_NEWS_LAYOUT, tree: dropNewsTile(tree, id, { target: 'headlines', edge }) };
    const board = positionNewsTiles(next, width, 1080);
    assert(tileOrder(next.tree).length === 4 && new Set(tileOrder(next.tree)).size === 4, 'Docking must retain each card exactly once');
    assert(Math.max(...board.tiles.map(t => t.rect.top + t.rect.height)) === board.height && board.height >= 1080, 'Use all available height');
    for (const t of board.tiles) {
      const r = t.rect;
      assert(r.height >= minNewsHeight(t.id, r.width) && r.width <= width && r.left >= 0 && r.left + r.width <= width, 'Keep cards usable inside the viewport');
      for (const other of board.tiles.filter(c => c.id !== t.id)) {
        const s = other.rect;
        assert(r.left + r.width <= s.left || s.left + s.width <= r.left || r.top + r.height <= s.top || s.top + s.height <= r.top, 'Cards must not overlap');
      }
    }
  }
}
const stored = { ...DEFAULT_NEWS_LAYOUT, tree: setSplitRatio(docked, '', 0.67), height: 1280, stackedHeights: { map: 580 } };
assert(JSON.stringify(normalizeNewsLayout(stored)) === JSON.stringify(stored), 'Restoring saved split sizes, card order and stacked heights must be lossless');
console.log('AI-only reviews, outages, mixed-source events, archive recovery, docking, resizing and layout migration checks passed');
