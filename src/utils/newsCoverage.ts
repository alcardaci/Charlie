import type { NewsItem } from '../types';

export function canonicalNewsLink(link: string): string | null {
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch { return null; }
}


export type EventFeed = 'gdelt' | 'yahoo-finance';
const feedKey = (feed: EventFeed, hours: number) => `charlie-event-feed-v1:${feed}:${hours}`;

/** Keep a bounded public snapshot per source and window so an upstream outage survives an app restart. */
export function readEventFeed(feed: EventFeed, hours: number, now = Date.now()): { items: NewsItem[]; at: number } | undefined {
  try {
    const key = feedKey(feed, hours);
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Number.isFinite(saved.at) || saved.at > now || saved.at < now - hours * 3600000 || !Array.isArray(saved.items)) {
      window.localStorage.removeItem(key);
      return;
    }
    const items = saved.items.filter((item: NewsItem) => item?.feedSource === feed && typeof item.title === 'string'
      && typeof item.publisher === 'string' && typeof item.link === 'string' && canonicalNewsLink(item.link)
      && Number.isFinite(item.publishedAt) && item.publishedAt <= now && item.publishedAt >= now - hours * 3600000);
    if (items.length) return { items, at: saved.at };
  } catch { /* Storage is optional for public feed access. */ }
}

export function saveEventFeed(feed: EventFeed, hours: number, items: NewsItem[]): NewsItem[] {
  try {
    const key = feedKey(feed, hours);
    if (items.length) window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), items: items.slice(0, 250) }));
    else window.localStorage.removeItem(key);
  } catch { /* The in-memory query result still works when storage is full. */ }
  return items;
}
