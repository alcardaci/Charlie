import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Newspaper, RefreshCw, Search, X } from 'lucide-react';
import { fetchNews, fetchNewsFeed, searchNewsArchive } from '../api/finance';
import { NewsGeoFilterKey } from '../types';
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

export function NewsPanel({
  className = '',
  symbol,
  embedded = false,
  defaultTopicQuery,
}: NewsPanelProps) {
  const { activeSymbol, activePanel } = useTerminalStore();
  const [topicIdx, setTopicIdx] = useState(0);
  const [geoFilter, setGeoFilter] = useState<NewsGeoFilterKey>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLookbackHours, setSearchLookbackHours] = useState<number>(24);
  const [viewMode, setViewMode] = useState<NewsViewMode>('compact');
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const manualRefreshTimeoutRef = useRef<number | null>(null);

  const assetSymbol = symbol ?? (activePanel === 'equity' ? activeSymbol : null);
  const topic = TOPICS[topicIdx];
  const activeGeoLabel = GEO_FILTERS.find((item) => item.key === geoFilter)?.label ?? 'WORLD';
  const activeSearchQuery = searchQuery.trim();
  const headerLabel = assetSymbol
    ? `${assetSymbol} NEWS`
    : activeSearchQuery
      ? `SEARCH · ${activeSearchQuery.toUpperCase()}`
      : `${topic.label} NEWS`;

  const { data: news = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['news-feed', assetSymbol ?? topic.query, assetSymbol ? 'asset' : geoFilter, activeSearchQuery, searchLookbackHours],
    queryFn: () => {
      if (assetSymbol) return fetchNews(assetSymbol, 30);
      if (activeSearchQuery) return searchNewsArchive(activeSearchQuery, searchLookbackHours, geoFilter, 40);
      return fetchNewsFeed(topic.query, geoFilter, 30);
    },
    refetchInterval: 300000,
    staleTime: 120000,
  });
  const hasExtendedContent = useMemo(
    () => news.some((item) => Boolean(item.snippet?.trim())),
    [news]
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

  useEffect(() => {
    return () => {
      if (manualRefreshTimeoutRef.current !== null) {
        window.clearTimeout(manualRefreshTimeoutRef.current);
      }
    };
  }, []);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
  };

  const handleRefresh = async () => {
    if (manualRefreshTimeoutRef.current !== null) {
      window.clearTimeout(manualRefreshTimeoutRef.current);
      manualRefreshTimeoutRef.current = null;
    }

    setIsManualRefreshing(true);
    const startedAt = Date.now();

    try {
      await refetch({ cancelRefetch: false });
    } finally {
      const elapsed = Date.now() - startedAt;
      const holdMs = Math.max(0, 450 - elapsed);
      manualRefreshTimeoutRef.current = window.setTimeout(() => {
        setIsManualRefreshing(false);
        manualRefreshTimeoutRef.current = null;
      }, holdMs);
    }
  };

  return (
    <div className={`flex h-full flex-col overflow-hidden bg-terminal-panel ${embedded ? 'rounded border border-terminal-border' : 'panel-border-l'} ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 py-2 panel-border-b bg-terminal-elevated/40 flex-shrink-0">
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
          {!assetSymbol ? <div className="text-[11px] text-terminal-faint">LIVE FEED</div> : null}
          <button
            type="button"
            onClick={() => {
              void handleRefresh();
            }}
            className="inline-flex items-center gap-1.5 rounded border border-terminal-border px-3 py-1.5 text-[11px] text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors"
            title="Refresh"
          >
            <RefreshCw size={11} className={isFetching || isManualRefreshing ? 'animate-spin' : ''} />
            REFRESH
          </button>
        </div>
      </div>

      {!assetSymbol && (
        <div className="px-2 pt-1.5 pb-1 border-b border-terminal-border/40 flex-shrink-0 space-y-1.5">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-terminal-faint" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
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
                onClick={() => setTopicIdx(index)}
                className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                  topicIdx === index
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

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="space-y-1">
                <div className="shimmer h-3 w-full rounded" />
                <div className="shimmer h-3 w-3/4 rounded" />
                <div className="shimmer h-2 w-1/3 rounded" />
              </div>
            ))}
          </div>
        ) : news.length === 0 ? (
          <div className="p-4 text-center text-terminal-faint text-xs">
            {activeSearchQuery
              ? `No news matched "${activeSearchQuery}" in the selected timeframe.`
              : 'No news available for the selected filters.'}
          </div>
        ) : (
          <div>
            {news.map((item, index) => (
              <a
                key={`${item.link}-${index}`}
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
                  <span className="text-terminal-faint text-xs">{item.publisher}</span>
                  <span className="text-terminal-faint/50 text-xs">·</span>
                  <span className="text-terminal-faint text-xs">{fmt.timeAgo(item.publishedAt)}</span>
                  {!assetSymbol && (
                    <>
                      <span className="text-terminal-faint/50 text-xs">·</span>
                      <span className="text-terminal-faint text-xs">{activeGeoLabel}</span>
                    </>
                  )}
                  {item.tickers && item.tickers.length > 0 && (
                    <>
                      <span className="text-terminal-faint/50 text-xs">·</span>
                      <span className="text-terminal-blue text-xs">{item.tickers.slice(0, 2).join(', ')}</span>
                    </>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
