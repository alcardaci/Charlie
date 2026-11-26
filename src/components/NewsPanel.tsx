import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, ExternalLink, Newspaper, RefreshCw, Search, X } from 'lucide-react';
import { fetchNews, fetchNewsFeed, searchNewsArchive } from '../api/finance';
import { marketNewsQuery, NEWS_REFRESH_INTERVAL_MS } from '../api/marketNewsQuery';
import type { NewsGeoFilterKey, NewsItem } from '../types';
import { EMPTY_LIVE_NEWS, liveNewsHighlights, pendingHeadlineCount, updateLiveNews, type LiveNewsState } from '../utils/liveNews';
import { useTerminalStore } from '../store/useTerminalStore';
import { fmt } from '../utils/formatters';

interface NewsPanelProps {
  className?: string;
  symbol?: string;
  embedded?: boolean;
  defaultTopicQuery?: (typeof TOPICS)[number]['query'];
}

const TOPICS = [
  { label: 'ALL', query: 'markets' },
  { label: 'TECH', query: 'technology' },
  { label: 'ECON', query: 'economy' },
  { label: 'GEO', query: 'geopolitics' },
  { label: 'ENERGY', query: 'energy' },
  { label: 'CRYPTO', query: 'crypto' },
  { label: 'HEALTH', query: 'healthcare' },
] as const;

const GEO_FILTERS: Array<{ key: NewsGeoFilterKey; label: string }> = [
  { key: 'all', label: 'WORLD' },
  { key: 'north-america', label: 'NA' },
  { key: 'latin-america', label: 'LATAM' },
  { key: 'europe', label: 'EUROPE' },
  { key: 'africa', label: 'AFRICA' },
  { key: 'middle-east', label: 'MID EAST' },
  { key: 'asia-pacific', label: 'APAC' },
];

const SEARCH_TIMEFRAMES = [
  { label: '1H', hours: 1 },
  { label: '6H', hours: 6 },
  { label: '24H', hours: 24 },
  { label: '7D', hours: 24 * 7 },
  { label: '30D', hours: 24 * 30 },
  { label: '90D', hours: 24 * 90 },
] as const;

type NewsViewMode = 'compact' | 'extended';
const EMPTY_HEADLINES: NewsItem[] = [];

export function NewsPanel({
  className = '',
  symbol,
  embedded = false,
  defaultTopicQuery,
}: NewsPanelProps) {
  const { activeSymbol, activePanel } = useTerminalStore();
  const queryClient = useQueryClient();
  const [topicIdx, setTopicIdx] = useState(0);
  const [geoFilter, setGeoFilter] = useState<NewsGeoFilterKey>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLookbackHours, setSearchLookbackHours] = useState<number>(24);
  const [viewMode, setViewMode] = useState<NewsViewMode>('compact');
  const panelRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    let intersects = !('IntersectionObserver' in window);
    const sync = () => setVisible(intersects && document.visibilityState === 'visible');
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      intersects = entry.isIntersecting;
      sync();
    });
    observer?.observe(node);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, []);

  const assetSymbol = symbol ?? (activePanel === 'equity' ? activeSymbol : null);
  const topic = TOPICS[topicIdx];
  const activeGeoLabel = GEO_FILTERS.find((item) => item.key === geoFilter)?.label ?? 'WORLD';
  const activeSearchQuery = searchQuery.trim();
  const headerLabel = assetSymbol
    ? `${assetSymbol} NEWS`
    : activeSearchQuery
      ? `SEARCH · ${activeSearchQuery.toUpperCase()}`
      : `${topic.label} NEWS`;

  const archive = !assetSymbol && Boolean(activeSearchQuery);
  const geoFeed = !assetSymbol && !archive && topic.query === 'geopolitics';
  const sharedFeed = !assetSymbol && !archive && topic.query === 'markets' && geoFilter === 'all';
  const sharedQuery = marketNewsQuery(queryClient);
  const interval = geoFeed ? 5 * NEWS_REFRESH_INTERVAL_MS : NEWS_REFRESH_INTERVAL_MS;
  const queryKey = sharedFeed ? sharedQuery.queryKey : [
    'news-feed', assetSymbol ?? topic.query, assetSymbol ? 'asset' : geoFilter,
    archive ? activeSearchQuery : '', archive ? searchLookbackHours : null,
  ] as const;
  const { data, isPending, isError, refetch, isFetching, dataUpdatedAt, errorUpdatedAt } = useQuery<NewsItem[] | LiveNewsState>({
    queryKey,
    queryFn: ({ signal }) => {
      if (sharedFeed) return sharedQuery.queryFn({ signal });
      if (assetSymbol) return fetchNews(assetSymbol, 30, signal);
      if (activeSearchQuery) return searchNewsArchive(activeSearchQuery, searchLookbackHours, geoFilter, 40, signal);
      return fetchNewsFeed(topic.query, geoFilter, 30, signal);
    },
    // The global headline bar polls this query. The News panel subscribes to it
    // here and can still refresh it manually.
    enabled: visible && !sharedFeed,
    refetchInterval: visible && !sharedFeed && !archive ? interval : false,
    refetchIntervalInBackground: false,
    staleTime: archive ? 120_000 : interval,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const mergedFeed = Array.isArray(data) ? undefined : data;
  const news = Array.isArray(data) ? data : EMPTY_HEADLINES;
  const hasExtendedContent = useMemo(
    () => mergedFeed
      ? mergedFeed.latest.some(({ item }) => Boolean(item.snippet?.trim()))
      : news.some(item => Boolean(item.snippet?.trim())),
    [news, mergedFeed]
  );

  useEffect(() => {
    if (!defaultTopicQuery || assetSymbol || searchQuery.trim()) return;
    const nextIndex = TOPICS.findIndex((item) => item.query === defaultTopicQuery);
    if (nextIndex >= 0) setTopicIdx(nextIndex);
  }, [assetSymbol, defaultTopicQuery, searchQuery]);

  useEffect(() => {
    if (!hasExtendedContent && viewMode === 'extended') {
      setViewMode('compact');
    }
  }, [hasExtendedContent, viewMode]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
  };

  const handleRefresh = () => refetch({ cancelRefetch: false });

  return (
    <div ref={panelRef} className={`flex h-full flex-col overflow-hidden bg-terminal-panel ${embedded ? 'instrument-card rounded border border-terminal-border' : 'instrument-section panel-border-l'} ${className}`}>
      <header className={embedded ? 'news-card-header' : 'instrument-section flex items-center justify-between gap-3 px-4 py-2 panel-border-b bg-terminal-elevated/40 flex-shrink-0'}>
        <div className="flex items-center gap-2">
          <Newspaper size={14} className="text-terminal-accent" />
          <span className="text-terminal-accent text-sm font-bold tracking-wider">{headerLabel}</span>
          {!assetSymbol && (
            <span className="text-terminal-faint text-[11px] hidden xl:inline">
              {activeGeoLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dataUpdatedAt > 0 && <div className="hidden xl:block text-[10px] text-terminal-faint" title={new Date(dataUpdatedAt).toLocaleString()}>Checked {fmt.timeAgo(dataUpdatedAt)}</div>}
          <button
            type="button"
            onClick={() => {
              void handleRefresh();
            }}
            className="inline-flex items-center gap-1.5 rounded border border-terminal-border px-3 py-1.5 text-[11px] text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors"
            disabled={isFetching}
            title="Refresh headlines"
            aria-label="Refresh headlines"
          >
            <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
            REFRESH
          </button>
        </div>
      </header>

      {!assetSymbol && (
        <div className="px-2 pt-1.5 pb-1 border-b border-terminal-border/40 flex-shrink-0 space-y-1.5">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-terminal-faint" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label="Search news headlines"
                placeholder="Search any topic or keyword"
                className="w-full rounded border border-terminal-border bg-terminal-elevated pl-7 pr-8 py-1.5 text-xs text-terminal-text placeholder-terminal-faint focus:outline-none focus:border-terminal-accent/50"
              />
              {searchInput.length > 0 && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-terminal-faint hover:text-terminal-accent"
                  title="Clear search"
                >
                  <X size={11} />
                </button>
              )}
            </div>
            <select
              aria-label="Search lookback period"
              title="Applies to keyword searches; recent topic feeds are provider-limited"
              value={String(searchLookbackHours)}
              onChange={(event) => setSearchLookbackHours(Number(event.target.value))}
              className="rounded border border-terminal-border bg-terminal-elevated px-2 py-1.5 text-[11px] text-terminal-text focus:outline-none focus:border-terminal-accent/50"
            >
              {SEARCH_TIMEFRAMES.map((option) => (
                <option key={option.hours} value={option.hours}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="px-2.5 py-1.5 text-xs rounded border border-terminal-accent/40 bg-terminal-accent/20 text-terminal-accent hover:bg-terminal-accent/30 transition-colors"
            >
              SEARCH
            </button>
          </form>

          <div className="flex gap-1 flex-wrap">
            {TOPICS.map((item, index) => (
              <button
                key={item.label}
                onClick={() => { setTopicIdx(index); clearSearch(); }}
                aria-pressed={topicIdx === index && !activeSearchQuery}
                className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                  topicIdx === index && !activeSearchQuery
                    ? 'bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/40'
                    : 'text-terminal-faint hover:text-terminal-muted border border-transparent'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] tracking-[0.18em] text-terminal-faint mr-1">GEO</span>
            {GEO_FILTERS.map((item) => (
              <button
                key={item.key}
                onClick={() => setGeoFilter(item.key)}
                aria-pressed={geoFilter === item.key}
                className={`px-1.5 py-0.5 text-[11px] rounded transition-colors ${
                  geoFilter === item.key
                    ? 'bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/40'
                    : 'text-terminal-faint hover:text-terminal-muted border border-transparent'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {hasExtendedContent && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] tracking-[0.18em] text-terminal-faint mr-1">VIEW</span>
              {(['compact', 'extended'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-1.5 py-0.5 text-[11px] rounded transition-colors ${
                    viewMode === mode
                      ? 'bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/40'
                      : 'text-terminal-faint hover:text-terminal-muted border border-transparent'
                  }`}
                >
                  {mode === 'compact' ? 'COMPACT' : 'EXTENDED'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {assetSymbol && hasExtendedContent && (
        <div className="px-2 py-1 border-b border-terminal-border/40 flex-shrink-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] tracking-[0.18em] text-terminal-faint mr-1">VIEW</span>
            {(['compact', 'extended'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-1.5 py-0.5 text-[11px] rounded transition-colors ${
                  viewMode === mode
                    ? 'bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/40'
                    : 'text-terminal-faint hover:text-terminal-muted border border-transparent'
                }`}
              >
                {mode === 'compact' ? 'COMPACT' : 'EXTENDED'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="shrink-0 border-b border-terminal-border/40 px-3 py-1.5 text-[10px] leading-relaxed text-terminal-faint">
        {archive ? 'Yahoo Finance · archive search' : geoFeed ? 'Yahoo Finance and GDELT · past 24 hours · checks every 5 min' : 'Yahoo Finance · checks every minute'}
      </div>
      <NewsResults key={JSON.stringify(queryKey)} batch={news} mergedFeed={mergedFeed} updatedAt={dataUpdatedAt} lastAttempt={Math.max(dataUpdatedAt, errorUpdatedAt)}
        loading={isPending} failed={isError} archive={archive} search={activeSearchQuery} viewMode={viewMode}
        region={assetSymbol ? null : activeGeoLabel} />
    </div>
  );
}

interface NewsResultsProps {
  batch: NewsItem[];
  mergedFeed?: LiveNewsState;
  updatedAt: number;
  lastAttempt: number;
  loading: boolean;
  failed: boolean;
  archive: boolean;
  search: string;
  viewMode: NewsViewMode;
  region: string | null;
}

function NewsResults({ batch, mergedFeed, updatedAt, lastAttempt, loading, failed, archive, search, viewMode, region }: NewsResultsProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [feed, setFeed] = useState(EMPTY_LIVE_NEWS);
  useEffect(() => {
    if (archive || !updatedAt) return;
    const follow = (scroller.current?.scrollTop ?? 0) <= 8;
    setFeed(prev => {
      if (!mergedFeed) return updateLiveNews(prev, batch, updatedAt, follow);
      if (mergedFeed.checkedAt <= prev.checkedAt) return prev;
      return follow || !prev.checkedAt ? mergedFeed : { ...mergedFeed, shown: prev.shown };
    });
  }, [batch, mergedFeed, archive, updatedAt]);

  const shown = archive ? batch : feed.shown.map(story => story.item);
  const pending = pendingHeadlineCount(feed);
  const highlights = useMemo(() => archive ? [] : liveNewsHighlights(feed.shown, Math.max(lastAttempt, Date.now())), [archive, feed.shown, lastAttempt]);
  function followLatest() {
    setFeed(current => current.shown === current.latest ? current : { ...current, shown: current.latest });
  }
  return (
    <>
      {failed && shown.length > 0 && (
        <div role="status" className="border-b border-terminal-accent/25 bg-terminal-accent/5 px-3 py-2 text-xs text-terminal-muted">
          Refresh failed. Showing the last successful headlines.
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div ref={scroller} className="h-full overflow-y-auto" aria-busy={loading}
          onScroll={event => { if (!archive && event.currentTarget.scrollTop <= 8) followLatest(); }}>
        {highlights.length > 0 && (
          <section aria-label="Recent news highlights" className="border-b border-terminal-accent/40 px-3 py-2">
            {highlights.map(({ label, item, supporting }) => (
              <div key={item.link} className="py-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-terminal-accent">{label}</div>
                <a className="text-xs leading-snug text-terminal-text hover:underline" href={item.link} target="_blank" rel="noopener noreferrer">{item.title}</a>
                <div className="text-[10px] text-terminal-muted">
                  {item.publisher || new URL(item.link).hostname}
                  {supporting && <> · <a href={supporting.link} target="_blank" rel="noopener noreferrer" className="underline">{supporting.publisher}</a></>}
                </div>
              </div>
            ))}
          </section>
        )}
        {loading || (!archive && updatedAt > 0 && !feed.checkedAt) ? (
          <div className="p-3 space-y-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="space-y-1">
                <div className="shimmer h-3 w-full rounded" />
                <div className="shimmer h-3 w-3/4 rounded" />
                <div className="shimmer h-2 w-1/3 rounded" />
              </div>
            ))}
          </div>
        ) : failed && shown.length === 0 ? (
          <div role="alert" className="p-4 text-center text-xs text-terminal-muted">
            Headlines could not be loaded from the provider. Try Refresh or another topic.
          </div>
        ) : shown.length === 0 ? (
          <div className="p-4 text-center text-terminal-faint text-xs">
            {archive
              ? `No news matched "${search}" in the selected timeframe.`
              : 'No news available for the selected filters.'}
          </div>
        ) : (
          <div>
            {shown.map((item, index) => (
              <a
                key={archive ? item.link : feed.shown[index].id}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group block px-3 py-2.5 border-b border-terminal-border/40 hover:bg-terminal-hover transition-colors"
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="text-terminal-text text-xs leading-relaxed group-hover:text-terminal-accent transition-colors line-clamp-3">
                    {item.title}
                  </p>
                  <ExternalLink
                    size={10}
                    className="text-terminal-faint flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100"
                  />
                </div>
                {viewMode === 'extended' && item.snippet && (
                  <p className="mt-1.5 text-terminal-faint text-xs leading-relaxed line-clamp-3">
                    {item.snippet}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-terminal-faint text-xs">{item.publisher}{item.feedSource === 'gdelt' ? ' · GDELT' : ''}</span>
                  <span className="text-terminal-faint/50 text-xs">·</span>
                  <time className="text-terminal-faint text-xs" dateTime={new Date(item.publishedAt).toJSON() ?? undefined} title={new Date(item.publishedAt).toLocaleString()}>
                    {item.feedSource === 'gdelt' ? 'Indexed ' : 'Published '}{fmt.timeAgo(item.publishedAt)}{item.gdeltCached ? ' · cached' : ''}
                  </time>
                  {region && (
                    <>
                      <span className="text-terminal-faint/50 text-xs">·</span>
                      <span className="text-terminal-faint text-xs">{region}</span>
                    </>
                  )}
                  {item.tickers && item.tickers.length > 0 && (
                    <>
                      <span className="text-terminal-faint/50 text-xs">·</span>
                      <span className="text-terminal-accent text-xs">{item.tickers.slice(0, 2).join(', ')}</span>
                    </>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
        </div>
        {pending > 0 && (
          <button type="button" onClick={() => { followLatest(); scroller.current?.scrollTo({ top: 0 }); }}
            className="absolute left-1/2 top-1.5 z-10 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded border border-terminal-accent/60 bg-terminal-panel px-2.5 py-1 text-xs text-terminal-accent shadow">
            <ArrowUp size={12} aria-hidden />Show {pending} new {pending === 1 ? 'headline' : 'headlines'}
          </button>
        )}
      </div>
    </>
  );
}
