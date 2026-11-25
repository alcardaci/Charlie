import { strict as assert } from 'node:assert';
import type { NewsItem } from '../../src/types';
import {
  advanceHeadlineTicker, EMPTY_LIVE_NEWS, headlineTickerStories, liveNewsHighlights, pendingHeadlineCount, updateLiveNews,
} from '../../src/utils/liveNews';

const now = Date.UTC(2026, 10, 25, 16);
const minute = 60_000;
function news(id: string, title: string, minutes: number, overrides: Partial<NewsItem> = {}): NewsItem {
  return { link: 'https://news.test/' + id, publisher: 'Example News', feedSource: 'yahoo-finance', title,
    publishedAt: now + minutes * minute, ...overrides };
}
const first = news('a', 'Central bank bulletin released', -2);
const next = news('b', 'European chip exports reach new records', 1);
const late = news('c', 'Shipping volumes recover after holiday', -4);
const seed = updateLiveNews(EMPTY_LIVE_NEWS, [first], now, true);
assert.equal(pendingHeadlineCount(seed), 0);
assert.deepEqual(liveNewsHighlights(seed.shown, now), []);
const reading = updateLiveNews(seed, [next, late, { ...first, link: first.link + '?utm_source=yahoo#top' }], now + 2 * minute, false);
assert.equal(reading.shown, seed.shown, 'Keep the actual row objects in place while reading');
assert.equal(pendingHeadlineCount(reading), 2);
assert.deepEqual(reading.latest.map(story => story.item.title), [next.title, first.title, late.title], 'Sort late discoveries by their source time');
assert.equal(updateLiveNews(reading, [], now, true), reading, 'An out-of-order response cannot revert the feed');
const same = updateLiveNews(reading, [{ ...next, link: 'https://elsewhere.test/other' }], now + 3 * minute, false);
assert.equal(pendingHeadlineCount(same), 2, 'Repeat titles on syndicated links do not increment the unread count');
const caughtUp = updateLiveNews(same, [], now + 4 * minute, true);
assert.equal(caughtUp.shown, caughtUp.latest);
assert.equal(pendingHeadlineCount(caughtUp), 0);

const reindexed = updateLiveNews(seed, [{ ...first, publishedAt: now + minute, feedSource: 'gdelt' }], now + minute, true);
assert.equal(reindexed.latest[0].item.publishedAt, first.publishedAt);
assert.equal(reindexed.latest[0].item.feedSource, 'yahoo-finance');
const archiveOnly = news('archive', 'Archived headline indexed again by GDELT', -3, { feedSource: 'gdelt' });
const firstIndex = updateLiveNews(EMPTY_LIVE_NEWS, [archiveOnly], now, true);
const secondIndex = updateLiveNews(firstIndex, [{ ...archiveOnly, publishedAt: now + minute }], now + minute, true);
assert.equal(secondIndex.latest[0].item.publishedAt, archiveOnly.publishedAt);
const cached = updateLiveNews(seed, [news('old', 'Recently returned old report', -500), news('cache', 'Cached GDELT report', 1, { gdeltCached: true })], now + minute, false);
assert.equal(pendingHeadlineCount(cached), 0);
assert.equal(updateLiveNews(seed, [], now + 2 * 24 * 60 * minute, true).latest.length, 0, 'Expire session history that disappeared from the source');
const burst = Array.from({ length: 240 }, (_, n) => news(String(n), 'Distinct article title number ' + n, 0));
assert.equal(updateLiveNews(EMPTY_LIVE_NEWS, burst, now, true).latest.length, 120);
assert.equal(updateLiveNews(EMPTY_LIVE_NEWS, [news('future', 'Not due yet', 1), { ...first, link: 'javascript:void(0)' }], now, true).latest.length, 0);

const action = news('rates', 'Bank of Canada cuts interest rates by a quarter point as inflation eases', -1, { publisher: 'Canada Ledger' });
const corroboration = news('decision', 'Canada central bank cuts rates a quarter point after slowing growth', 1, { publisher: 'Ottawa Press' });
function arrivals(articles: NewsItem[]) {
  return updateLiveNews(seed, articles, now + 2 * minute, true).latest;
}
const confirmed = liveNewsHighlights(arrivals([action, corroboration]), now + 2 * minute);
assert.equal(confirmed.length, 1, 'Match two genuinely different reports of the same event');
assert.equal(confirmed[0].label, 'Developing');
assert.ok(confirmed[0].supporting?.link);
assert.deepEqual(liveNewsHighlights(updateLiveNews(EMPTY_LIVE_NEWS, [action, corroboration], now + 2 * minute, true).shown, now + 2 * minute), [], 'The first batch is always silent');
assert.deepEqual(liveNewsHighlights(arrivals([{ ...action, publisher: 'Reuters' }, { ...corroboration, snippet: '(Reuters) - Central bank reporting.' }]), now + 2 * minute), []);
assert.deepEqual(liveNewsHighlights(arrivals([{ ...action, link: 'https://reuters.com/a' }, { ...corroboration, link: 'https://www.reuters.com/b' }]), now + 2 * minute), [], 'Wire source domains also identify shared reporting');
assert.deepEqual(liveNewsHighlights(arrivals([action, { ...corroboration, feedSource: 'gdelt' }]), now + 2 * minute), [], 'Indexing time alone cannot corroborate a recent event');
assert.deepEqual(liveNewsHighlights(arrivals([action, { ...corroboration, title: 'Canada central bank could cut interest rates next month' }]), now + 2 * minute), []);
const otherCountry = [news('one', 'Australia central bank cuts interest rates by a quarter point', 0),
  news('two', 'Canadian central bank cuts benchmark rates a quarter point', 1, { publisher: 'Second outlet' })];
assert.deepEqual(liveNewsHighlights(arrivals(otherCountry), now + 2 * minute), [], 'Generic rate-cut language cannot join different countries');
const official = news('policy', 'Federal Reserve raises target interest rate', 1, { link: 'https://www.federalreserve.gov/newsevents/test.htm' });
assert.equal(liveNewsHighlights(arrivals([official]), now + 2 * minute)[0].label, 'Official update');
assert.deepEqual(liveNewsHighlights(arrivals([official]), now + 50 * minute), []);
assert.deepEqual(liveNewsHighlights(arrivals([{ ...official, link: 'https://federalreserve.gov.example.test/fake' }]), now + 2 * minute), []);

const ordinary = news('ordinary', 'Business survey shows a pickup in shipments', 2);
const tickerFeed = headlineTickerStories(arrivals([ordinary, action, corroboration, official]), now + 2 * minute);
assert.deepEqual(tickerFeed.slice(0, 3).map(row => [row.item.link, row.highlight]), [
  [official.link, 'Official update'], [corroboration.link, 'Developing'], [ordinary.link, undefined],
]);
const readingTicker = headlineTickerStories(seed.latest, now);
const nextTicker = advanceHeadlineTicker(readingTicker, tickerFeed);
assert.equal(readingTicker[0].item.link, first.link);
assert.equal(nextTicker[0].item.link, official.link, 'Move an alert ahead at the next headline boundary');
assert.equal(nextTicker.at(-1)?.item.link, first.link, 'Retain the previous headline once in the loop');
assert.equal(new Set(nextTicker.map(row => row.id)).size, nextTicker.length);
assert.equal(advanceHeadlineTicker(nextTicker, tickerFeed)[0].item.link, corroboration.link, 'An unchanged alert must not restart the queue');
const withoutOfficial = tickerFeed.filter(row => row.item.link !== official.link);
assert.ok(advanceHeadlineTicker(nextTicker, withoutOfficial).every(row => row.item.link !== official.link), 'A dropped headline must not be carried into the next loop');
assert.equal(headlineTickerStories(updateLiveNews(EMPTY_LIVE_NEWS, burst, now, true).latest, now).length, 8, 'Bound the number of headlines in the bar');
console.log('Live feed merge, reading position, deduplication, source timing and corroborated highlights passed');
