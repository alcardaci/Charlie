import type { NewsItem } from '../types';
import { canonicalNewsLink } from './newsCoverage';

const MINUTE = 60_000;
const MAX_STORIES = 120;
const HISTORY_WINDOW = 24 * 60 * MINUTE;
const HIGHLIGHT_WINDOW = 45 * MINUTE;

export interface LiveStory {
  id: string;
  item: NewsItem;
  arrived: boolean;
}

export interface LiveNewsState {
  latest: LiveStory[];
  shown: LiveStory[];
  checkedAt: number;
}

export const EMPTY_LIVE_NEWS: LiveNewsState = { latest: [], shown: [], checkedAt: 0 };

function words(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? [];
}

function titleKey(item: NewsItem) {
  const tokens = words(item.title);
  // Very short headings can describe unrelated reports. Keep them publisher-specific.
  return (tokens.length < 4 ? item.publisher.toLowerCase() + '|' : '') + tokens.join(' ');
}

export function updateLiveNews(previous: LiveNewsState, batch: NewsItem[], checkedAt: number, follow: boolean): LiveNewsState {
  if (checkedAt <= previous.checkedAt) return previous;
  const stories = new Map<string, LiveStory>();
  const idsByTitle = new Map<string, string>();
  const idsByLink = new Map<string, string>();
  for (const story of previous.latest) {
    if (story.item.publishedAt < checkedAt - HISTORY_WINDOW) continue;
    stories.set(story.id, story);
    idsByLink.set(story.id, story.id);
    idsByLink.set(story.item.link, story.id);
    idsByTitle.set(titleKey(story.item), story.id);
  }
  for (const item of batch) {
    if (!item.title.trim() || !Number.isFinite(item.publishedAt) || item.publishedAt <= 0 || item.publishedAt > checkedAt) continue;
    const link = canonicalNewsLink(item.link);
    if (!link) continue;
    const title = titleKey(item);
    const id = idsByLink.get(link) ?? idsByTitle.get(title) ?? link;
    const known = stories.get(id);
    idsByLink.set(link, id);
    idsByTitle.set(title, id);
    if (known) {
      // Prefer a publisher timestamp to an index timestamp. Seeing the same URL
      // in a later GDELT batch must not promote it to the top again.
      if (item.feedSource === 'gdelt' && known.item.feedSource !== 'gdelt') continue;
      const publishedAt = known.item.feedSource === 'gdelt' && item.feedSource !== 'gdelt'
        ? item.publishedAt : Math.min(item.publishedAt, known.item.publishedAt);
      stories.set(id, { ...known, item: { ...item, link, publishedAt } });
    } else {
      const arrived = previous.checkedAt > 0 && !item.gdeltCached && item.publishedAt >= checkedAt - HIGHLIGHT_WINDOW;
      stories.set(id, { id, item: { ...item, link }, arrived });
    }
  }
  const latest = [...stories.values()].sort((a, b) => b.item.publishedAt - a.item.publishedAt || a.id.localeCompare(b.id)).slice(0, MAX_STORIES);
  return { latest, shown: follow || !previous.checkedAt ? latest : previous.shown, checkedAt };
}

export function pendingHeadlineCount(feed: LiveNewsState) {
  if (feed.shown === feed.latest) return 0;
  const visible = new Set(feed.shown.map(story => story.id));
  return feed.latest.filter(story => story.arrived && !visible.has(story.id)).length;
}

const officialDomain = /(?:^|\.)(?:federalreserve\.gov|ecb\.europa\.eu|bankofengland\.co\.uk|sec\.gov|fdic\.gov|usgs\.gov|who\.int)$/i;
const wire = /\b(reuters|associated press|afp|agence france.presse|bloomberg|business wire|globe\s?newswire|pr newswire|access newswire|dow jones newswires)\b/i;
const distributor = /\b(news\s?wire|press release|presswire|newsfile|pr newswire)\b/i;
const speculation = /\?|\b(?:might|could|may|rumou?rs?|speculates?|expects?|expected|forecasts?|predictions?|likely|unlikely|eyes|weighs|mulls|previews?|bets|analysis|opinion|reportedly|explainer|recap|yesterday|last (?:week|month|year)|why|what if|what to (?:expect|know)|set to|poised to|calls? (?:on|for)|rules? out|den(?:y|ies|ied)|never|not)\b/i;
const eventKinds = [
  /\b(?:cuts?|cutting|lowers?|slashes?)\b.{0,60}\b(?:rates?|basis points|bps)\b|\brate cut\b/i,
  /\b(?:raises?|raised|hikes?|hiked|lifts?)\b.{0,60}\b(?:rates?|basis points|bps)\b|\brate hike\b/i,
  /\b(?:declares?|declared|files? for|filed for|enters?|entered)\b.{0,35}\b(?:bankruptcy|chapter 11|insolvency)\b/i,
  /\b(?:halts?|halted|suspends?|suspended)\b.{0,35}\btrading\b|\btrading (?:halted|suspended)\b/i,
  /\b(?:agrees?|agreed|signs?|signed|reaches?|reached|announces?|announced)\b.{0,40}\bceasefire\b/i,
  /\b(?:imposes?|imposed|announces?|announced)\b.{0,40}\bsanctions\b/i,
  /\bearthquake\b.{0,50}\b(?:strikes?|hits?|shakes?)\b|\bmagnitude[ -]?[0-9.]+\b.{0,30}\bearthquake\b/i,
  /\b(?:declares?|declared)\b.{0,45}\b(?:state of emergency|public health emergency)\b/i,
];
const stopWords = new Set('the this that with will amid after from over into says said news breaking update latest more near live reports announces announced declares declared'.split(' '));
const genericEventTerms = new Set('bank central slashes lowers cuts hikes raises interest policy benchmark rates rate quarter half point points basis bps sanctions imposes trading exchange halts suspends ceasefire agreement reach reaches sign signs bankruptcy chapter files protection company enters earthquake strikes hits magnitude emergency state health public government growth today decision'.split(' '));
function publisherFamily(item: NewsItem) {
  const name = item.publisher.trim().toLowerCase();
  if (!name || name === 'gdelt' || distributor.test(name)) return '';
  const host = new URL(item.link).hostname.toLowerCase();
  if (/(?:^|\.)apnews\.com$/.test(host)) return 'associated press';
  const wireHost = /(?:^|\.)(reuters|bloomberg|afp)\.com$/.exec(host)?.[1];
  if (wireHost) return wireHost;
  const statedWire = wire.exec(name)?.[1] ?? wire.exec((item.snippet ?? '').slice(0, 100))?.[1] ?? wire.exec(item.title)?.[1];
  if (statedWire) return statedWire.toLowerCase().replace(/agence france.presse/, 'afp');
  if (/^(ap|ap news)\b/.test(name)) return 'associated press';
  return name.replace(/^www\./, '').replace(/\.com\b|\b(?:news|network)\b/g, '').replace(/[^\p{L}\p{N}]/gu, '');
}

export interface NewsHighlight {
  label: 'Official update' | 'Developing';
  item: NewsItem;
  supporting?: NewsItem;
}

/** GDELT supplies an index time, which cannot establish that an event just happened. */
export function liveNewsHighlights(stories: LiveStory[], now: number): NewsHighlight[] {
  const recent = stories.flatMap(story => {
    const item = story.item;
    if (item.feedSource !== 'yahoo-finance' || item.gdeltCached || item.publishedAt < now - HIGHLIGHT_WINDOW || item.publishedAt > now || speculation.test(item.title)) return [];
    const kind = eventKinds.findIndex(pattern => pattern.test(item.title));
    if (kind < 0) return [];
    const terms = new Set(words(item.title).filter(token => token.length > 2 && !stopWords.has(token)));
    const beforeAction = item.title.slice(0, item.title.search(eventKinds[kind]));
    const subject = words(beforeAction).filter(token => terms.has(token) && !genericEventTerms.has(token));
    return [{ ...story, kind, terms, subject, publisher: publisherFamily(item) }];
  });
  const results: NewsHighlight[] = [];
  const covered = new Set<string>();
  for (const candidate of recent) {
    if (covered.has(candidate.id) || !candidate.arrived) continue;
    const related = recent.filter(report => {
      if (report.kind !== candidate.kind || report.id === candidate.id || covered.has(report.id)) return false;
      if (candidate.subject.length && report.subject.length && !candidate.subject.some(term => report.subject.includes(term))) return false;
      const sharedTerms = [...candidate.terms].filter(term => report.terms.has(term));
      if (!sharedTerms.some(term => !genericEventTerms.has(term))) return false;
      const shared = sharedTerms.length;
      // Reprints have identical or almost identical wording. A loosely
      // matching topic alone also provides insufficient corroboration.
      const union = candidate.terms.size + report.terms.size - shared;
      return shared >= 4 && shared / union >= 0.4 && shared / Math.min(candidate.terms.size, report.terms.size) < 0.9;
    });
    const official = [candidate, ...related].find(report => officialDomain.test(new URL(report.item.link).hostname));
    if (official) {
      results.push({ label: 'Official update', item: official.item });
    } else {
      const other = related.find(report => candidate.publisher && report.publisher && report.publisher !== candidate.publisher);
      if (!other) continue;
      results.push({ label: 'Developing', item: candidate.item, supporting: other.item });
    }
    related.forEach(report => covered.add(report.id));
    covered.add(candidate.id);
    if (results.length === 2) break;
  }
  return results;
}

export type TickerHeadline = LiveStory & { highlight?: NewsHighlight['label'] };

export function headlineTickerStories(stories: LiveStory[], checkedAt: number): TickerHeadline[] {
  const labels = new Map(liveNewsHighlights(stories, checkedAt).map(({ item, label }) => [item.link, label]));
  const tagged = stories.map(story => ({ ...story, highlight: labels.get(story.item.link) }));
  return [
    ...tagged.filter(story => story.highlight === 'Official update'),
    ...tagged.filter(story => story.highlight === 'Developing'),
    ...tagged.filter(story => !story.highlight),
  ].slice(0, 8);
}

/** Apply incoming stories at a headline boundary so the text being read stays put. */
export function advanceHeadlineTicker(visible: TickerHeadline[], latest: TickerHeadline[]): TickerHeadline[] {
  const [current, ...upcoming] = visible;
  if (!current) return latest;
  const previous = new Map(visible.map(story => [story.id, story]));
  const available = new Map(latest.map(story => [story.id, story]));
  const priority = latest.filter(story => {
    if (story.id === current.id) return false;
    const prior = previous.get(story.id);
    return !prior || (story.highlight && story.highlight !== prior.highlight);
  });
  const promoted = new Set(priority.map(story => story.id));
  const remaining = upcoming.flatMap(story => {
    const updated = available.get(story.id);
    return updated && !promoted.has(story.id) ? [updated] : [];
  });
  const repeat = available.get(current.id);
  return [...priority, ...remaining, ...(repeat ? [repeat] : [])];
}
