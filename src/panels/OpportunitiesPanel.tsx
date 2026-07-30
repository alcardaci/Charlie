import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bug, Loader2, Orbit, Radar, RefreshCw, Square } from 'lucide-react';
import {
  fetchMacroReleaseCalendar,
  fetchNewsFeed,
  fetchOpenAIKeyStatus,
  fetchPredictionForecasts,
  fetchQuotes,
  fetchSentimentSnapshot,
  getOpenAIDebugPayload,
  generateThemeDiscovery,
  generateTopicThemeGuidance,
  readCachedGeopoliticalMapCountryCounts,
  searchNewsArchive,
} from '../api/finance';
import type { OpenAIDebugPayloadEntry } from '../api/finance';
import { EarlySignalCard } from '../components/EarlySignalCard';
import { ThemeInsightCard, ThemeStatCard } from '../components/ThemeInsightCard';
import { useTerminalStore } from '../store/useTerminalStore';
import type { CountryNewsCount, MarketSentimentSnapshot, NewsItem, Quote } from '../types';
import { fmt } from '../utils/formatters';
import { buildTimestampedJsonFilename, downloadJsonFile } from '../utils/downloadJson';
import {
  applyAIThemeGuidanceDashboard,
  buildAIDiscoveryDashboard,
  buildDiscoveryDashboard,
  buildKeywordThemeDashboard,
  buildTopicThemeGuidancePayload,
  buildThemeDiscoverySignalPayload,
  getDiscoveryAssetUniverse,
  type DiscoveryDashboard,
  type KeywordThemeDashboard,
} from '../utils/themeDiscoveryEngine';
import {
  buildEarlySignalsDashboard,
  canonicalizeEarlySignalEvidence,
  EARLY_SIGNAL_QUERIES,
  mergeEarlySignalEvidence,
  type EarlySignalsDashboard,
} from '../utils/earlySignalsEngine';
import {
  loadEarlySignalEvidence,
  saveEarlySignalEvidence,
} from '../utils/earlySignalsStorage';
import {
  DEFAULT_GEOPOLITICS_OPENAI_MODEL,
  DEFAULT_THEME_DISCOVERY_RECOMMENDATION_SYSTEM_PROMPT,
  DEFAULT_THEME_DISCOVERY_SYSTEM_PROMPT,
  DEFAULT_TOPIC_THEME_GUIDANCE_SYSTEM_PROMPT,
} from '../utils/openaiConfig';

const LOOKBACK_HOURS = 72;
const TOPIC_STORAGE_KEY = 'bterminal-hybrid-opportunity-topics-v1';
const DISCOVERY_CACHE_KEY = 'bterminal-hybrid-discovery-cache-v1';
const TOPIC_CACHE_KEY_PREFIX = 'bterminal-hybrid-topic-cache-v1';
const HYBRID_CACHE_TTL_MS = 30 * 60 * 1000;
const BASE_INPUT_QUERY_STALE_MS = 5 * 60 * 1000;
const BASE_INPUT_FETCH_TIMEOUT_MS = 12_000;
const TOPIC_NEWS_FETCH_TIMEOUT_MS = 10_000;
const EARLY_SIGNALS_FETCH_TIMEOUT_MS = 12_000;
const EARLY_SIGNALS_QUERY_STALE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_TOPIC_INPUT = 'Energy security, semiconductor capex, shipping disruptions, defense spending';
const DISCOVERY_LOADING_STEPS = [
  'Collecting live data...',
  'Processing cross-market signals...',
  'Extracting key themes...',
  'Connecting assets and exposure...',
  'Building discovery results...',
] as const;
const TOPIC_LOADING_STEPS = [
  'Collecting live data...',
  'Searching your requested topics...',
  'Matching live signals...',
  'Connecting assets and exposure...',
  'Building topic themes...',
] as const;

type BaseInput = {
  marketNews: NewsItem[];
  techNews: NewsItem[];
  economyNews: NewsItem[];
  energyNews: NewsItem[];
  geopoliticsNews: NewsItem[];
  countryCounts: CountryNewsCount[];
  predictions: Awaited<ReturnType<typeof fetchPredictionForecasts>>['forecasts'];
  predictionsUpdatedAt?: string;
  sentiment: MarketSentimentSnapshot | null;
  calendarEvents: Awaited<ReturnType<typeof fetchMacroReleaseCalendar>>['events'];
  quotes: Quote[];
  portfolio: ReturnType<typeof useTerminalStore.getState>['portfolio'];
  watchlist: ReturnType<typeof useTerminalStore.getState>['watchlist'];
};

type LocalCacheEnvelope<T> = {
  savedAt: number;
  data: T;
};

function createEmptyTopicDashboard(): KeywordThemeDashboard {
  return {
    generatedAt: new Date().toISOString(),
    mode: 'keyword',
    requestedTopics: [],
    matchedTopics: [],
    unmatchedTopics: [],
    themes: [],
    brief: {
      headline: 'Choose topics to build this workspace',
      summary: 'Type one or more topics and click BUILD THEMES to generate topic-focused cards.',
      sourceCount: 0,
      signalCount: 0,
    },
    stats: {
      clusterCount: 0,
      signalCount: 0,
      portfolioRelevantCount: 0,
      avgSourceDiversity: 0,
      requestedTopicCount: 0,
      matchedTopicCount: 0,
      unmatchedTopicCount: 0,
    },
  };
}

function readFreshCache<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as LocalCacheEnvelope<T>;
    if (!parsed || typeof parsed !== 'object') return undefined;
    if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) return undefined;
    if (Date.now() - parsed.savedAt > HYBRID_CACHE_TTL_MS) {
      window.localStorage.removeItem(key);
      return undefined;
    }
    return parsed.data;
  } catch {
    return undefined;
  }
}

function writeCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;

  try {
    const payload: LocalCacheEnvelope<T> = {
      savedAt: Date.now(),
      data,
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // No-op if storage is unavailable.
  }
}

function topicCacheKey(topics: string[]): string {
  const normalized = topics
    .map((topic) => topic.trim().toLowerCase())
    .filter(Boolean)
    .join('|');
  return `${TOPIC_CACHE_KEY_PREFIX}:${normalized || '__empty__'}`;
}

function opportunityContextKey(args: {
  model: string;
  portfolio: ReturnType<typeof useTerminalStore.getState>['portfolio'];
  watchlist: string[];
}): string {
  const portfolioKey = args.portfolio
    .map((position) => `${position.symbol.toUpperCase()}:${position.shares}:${position.avgCost}`)
    .sort()
    .join(',');
  const watchlistKey = args.watchlist.map((symbol) => symbol.toUpperCase()).sort().join(',');
  return [args.model.trim() || 'heuristic', portfolioKey || 'no-portfolio', watchlistKey || 'no-watchlist'].join('|');
}

function contextualDiscoveryCacheKey(contextKey: string): string {
  return `${DISCOVERY_CACHE_KEY}:${contextKey}`;
}

function contextualTopicCacheKey(topics: string[], contextKey: string): string {
  return `${topicCacheKey(topics)}:${contextKey}`;
}

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseTopicInput(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[\n,;]+/)
      .map((part) => part.trim())
      .filter(Boolean)
  )).slice(0, 5);
}

function getInitialTopicInput(): string {
  if (typeof window === 'undefined') return DEFAULT_TOPIC_INPUT;
  return window.localStorage.getItem(TOPIC_STORAGE_KEY) || DEFAULT_TOPIC_INPUT;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(fallbackValue), timeoutMs);
  });

  const result = await Promise.race([promise, timeoutPromise]);
  if (timeoutId) clearTimeout(timeoutId);
  return result;
}

async function fetchEarlySignalNews(query: string, parentSignal: AbortSignal): Promise<NewsItem[]> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal.reason);
  const timeoutId = window.setTimeout(() => controller.abort('Early Signals news request timed out.'), EARLY_SIGNALS_FETCH_TIMEOUT_MS);
  parentSignal.addEventListener('abort', abortFromParent, { once: true });

  try {
    return await fetchNewsFeed(query, 'all', 36, controller.signal);
  } catch (error) {
    if (parentSignal.aborted) throw error;
    return [];
  } finally {
    window.clearTimeout(timeoutId);
    parentSignal.removeEventListener('abort', abortFromParent);
  }
}

async function fetchEarlySignalsDashboard(signal: AbortSignal): Promise<EarlySignalsDashboard> {
  const [storedEvidence, newsGroups] = await Promise.all([
    loadEarlySignalEvidence(signal),
    Promise.all(EARLY_SIGNAL_QUERIES.map(({ query }) => fetchEarlySignalNews(query, signal))),
  ]);
  signal.throwIfAborted();

  const observedAt = Date.now();
  const currentEvidence = canonicalizeEarlySignalEvidence(newsGroups.flat(), observedAt);
  const mergedEvidence = mergeEarlySignalEvidence(storedEvidence, currentEvidence, observedAt);
  await saveEarlySignalEvidence(mergedEvidence, signal);
  signal.throwIfAborted();
  return buildEarlySignalsDashboard(mergedEvidence, observedAt);
}

async function fetchBaseInput(args: {
  quoteUniverse: string[];
  portfolio: ReturnType<typeof useTerminalStore.getState>['portfolio'];
  watchlist: string[];
}): Promise<BaseInput> {
  const from = toYmd(new Date());
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + 14);
  const to = toYmd(toDate);
  const fallbackCalendar = { events: [] as never[] };
  const symbols = Array.from(new Set([
    ...args.quoteUniverse,
    ...args.watchlist.map((symbol) => symbol.toUpperCase()),
    ...args.portfolio.map((position) => position.symbol.toUpperCase()),
  ]));
  const cachedCountryCounts = readCachedGeopoliticalMapCountryCounts(LOOKBACK_HOURS, {
    enableAI: false,
    model: DEFAULT_GEOPOLITICS_OPENAI_MODEL,
    includeHotspotSummaries: false,
  }) ?? [];

  const [
    predictionsSnapshot,
    sentiment,
    calendarData,
    marketNews,
    techNews,
    economyNews,
    energyNews,
    geopoliticsNews,
    quotes,
  ] = await Promise.all([
    withTimeout(fetchPredictionForecasts(12).catch(() => ({ forecasts: [], updatedAt: new Date().toISOString(), source: 'Unavailable' })), BASE_INPUT_FETCH_TIMEOUT_MS, { forecasts: [], updatedAt: new Date().toISOString(), source: 'Unavailable' }),
    withTimeout(fetchSentimentSnapshot().catch(() => null), BASE_INPUT_FETCH_TIMEOUT_MS, null),
    withTimeout(fetchMacroReleaseCalendar(from, to).catch(() => fallbackCalendar), BASE_INPUT_FETCH_TIMEOUT_MS, fallbackCalendar),
    withTimeout(fetchNewsFeed('markets', 'all', 24).catch(() => []), BASE_INPUT_FETCH_TIMEOUT_MS, []),
    withTimeout(fetchNewsFeed('technology', 'all', 18).catch(() => []), BASE_INPUT_FETCH_TIMEOUT_MS, []),
    withTimeout(fetchNewsFeed('economy', 'all', 18).catch(() => []), BASE_INPUT_FETCH_TIMEOUT_MS, []),
    withTimeout(fetchNewsFeed('energy', 'all', 18).catch(() => []), BASE_INPUT_FETCH_TIMEOUT_MS, []),
    withTimeout(fetchNewsFeed('geopolitical tensions', 'all', 18).catch(() => []), BASE_INPUT_FETCH_TIMEOUT_MS, []),
    symbols.length > 0
      ? withTimeout(fetchQuotes(symbols).catch(() => []), BASE_INPUT_FETCH_TIMEOUT_MS, [])
      : Promise.resolve([]),
  ]);

  return {
    marketNews,
    techNews,
    economyNews,
    energyNews,
    geopoliticsNews,
    countryCounts: cachedCountryCounts,
    predictions: predictionsSnapshot.forecasts,
    predictionsUpdatedAt: predictionsSnapshot.updatedAt,
    sentiment,
    calendarEvents: calendarData.events,
    portfolio: args.portfolio,
    watchlist: args.watchlist,
    quotes,
  };
}

function SectionEmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded border border-terminal-border bg-terminal-panel p-4">
      <div className="text-xs font-bold tracking-[0.18em] text-terminal-accent">{title}</div>
      <div className="mt-2 text-sm text-terminal-muted leading-relaxed">{body}</div>
    </div>
  );
}

function SectionLoadingState({
  title,
  step,
  detail,
}: {
  title: string;
  step: string;
  detail: string;
}) {
  return (
    <section className="rounded border border-terminal-border bg-terminal-panel p-5" role="status" aria-live="polite">
      <div className="text-xs font-bold tracking-[0.2em] text-terminal-accent">{title}</div>
      <div className="mt-4 flex items-center gap-3 text-sm text-terminal-muted">
        <Loader2 size={16} className="animate-spin" />
        <div className="min-w-0">
          <div className="text-terminal-text">{step}</div>
          <div className="mt-1 text-xs text-terminal-faint animate-pulse">{detail}</div>
        </div>
      </div>
    </section>
  );
}

function SectionErrorState({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry: () => void;
}) {
  return (
    <section className="rounded border border-terminal-border bg-terminal-panel p-5 space-y-3" role="alert">
      <div className="flex items-center gap-2 text-terminal-accent text-sm font-bold tracking-wider">
        <AlertTriangle size={15} />
        {title}
      </div>
      <div className="text-sm text-terminal-muted">{body}</div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded border border-terminal-border bg-terminal-elevated px-3 py-2 text-xs text-terminal-text hover:bg-terminal-hover transition-colors"
      >
        <RefreshCw size={12} />
        RETRY
      </button>
    </section>
  );
}

function ExperimentalFeatureNotice() {
  return (
    <section className="flex items-center gap-2 text-[11px] text-terminal-muted">
      <AlertTriangle size={12} className="flex-shrink-0 text-amber-300" />
      <div className="min-w-0 truncate">
        <span className="font-bold tracking-[0.12em] text-amber-300">EXPERIMENTAL</span>
        {' '}Research leads only. Verify evidence before acting.
      </div>
    </section>
  );
}

function DiscoveryPane({
  dashboard,
  isLoading,
  isRefreshing,
  isAiRefreshing,
  isPendingAiReveal,
  loadingStep,
  error,
  onRetry,
  onStop,
  onOpenSymbol,
}: {
  dashboard?: DiscoveryDashboard;
  isLoading: boolean;
  isRefreshing: boolean;
  isAiRefreshing: boolean;
  isPendingAiReveal: boolean;
  loadingStep: string;
  error: boolean;
  onRetry: () => void;
  onStop: () => void;
  onOpenSymbol: (symbol: string) => void;
}) {
  if (isLoading && !dashboard) {
    return (
      <SectionLoadingState
        title="THEME DISCOVERY"
        step={loadingStep}
        detail="Building a local signal snapshot first; AI enrichment follows when enabled."
      />
    );
  }

  if (error && !dashboard) {
    return (
      <SectionErrorState
        title="THEME DISCOVERY UNAVAILABLE"
        body="The discovery side could not build a usable signal cluster snapshot right now."
        onRetry={onRetry}
      />
    );
  }

  if (!dashboard) return null;

  return (
    <section
      className="relative flex h-full min-h-0 flex-col overflow-hidden rounded border border-terminal-border bg-terminal-panel"
      aria-busy={isRefreshing}
      aria-labelledby="opportunities-discovery-title"
    >
      {isPendingAiReveal && (
        <div className="pointer-events-none absolute right-3 top-3 z-10">
          <div role="status" aria-live="polite" className="inline-flex items-center gap-2 rounded border border-terminal-accent/35 bg-black/78 px-3 py-2 text-[11px] font-bold tracking-[0.16em] text-terminal-accent shadow-lg">
            <Loader2 size={12} className="animate-spin" />
            AI ENRICHMENT RUNNING
          </div>
        </div>
      )}
      <div className="opportunities-discovery-header flex-shrink-0 border-b border-terminal-accent/25 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Orbit size={14} className="text-terminal-accent" />
              <h2 id="opportunities-discovery-title" className="text-terminal-accent text-xs font-bold tracking-[0.24em]">THEME DISCOVERY</h2>
              <span className="text-[11px] text-terminal-faint">Updated {new Date(dashboard.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="mt-2 text-base font-bold text-terminal-text">{dashboard.brief.headline}</div>
            <div className="opportunities-header-summary mt-1 max-w-4xl text-xs leading-relaxed">{dashboard.brief.summary}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAiRefreshing && (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex items-center gap-2 rounded border border-terminal-negative/40 bg-terminal-negative/10 px-3 py-2 text-xs text-terminal-negative hover:bg-terminal-negative/15 transition-colors"
              >
                <Square size={12} />
                STOP
              </button>
            )}
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded border border-terminal-border bg-terminal-panel px-3 py-2 text-xs text-terminal-text hover:bg-terminal-hover transition-colors"
            >
              <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
              REFRESH
            </button>
          </div>
        </div>

      </div>

      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 focus:outline-none focus-visible:ring-1 focus-visible:ring-terminal-accent"
        role="region"
        aria-label="Discovered opportunity themes"
        tabIndex={0}
      >
        <div className="grid grid-cols-2 divide-x divide-terminal-border border-y border-terminal-border lg:grid-cols-4">
          <ThemeStatCard
            label="DISCOVERED THEMES"
            value={fmt.integer(dashboard.stats.clusterCount)}
            detail="Themes in this snapshot."
          />
          <ThemeStatCard
            label="RAW SIGNALS"
            value={fmt.integer(dashboard.stats.signalCount)}
            detail="Signals used."
          />
          <ThemeStatCard
            label="EXPOSURE MATCHES"
            value={fmt.integer(dashboard.stats.portfolioRelevantCount)}
            detail="Portfolio or watchlist."
          />
          <ThemeStatCard
            label="SOURCE BREADTH"
            value={fmt.integer(dashboard.stats.avgSourceDiversity)}
            detail="Average source types."
          />
        </div>
        {dashboard.themes.map((theme) => (
          <ThemeInsightCard
            key={theme.id}
            theme={theme}
            onOpenSymbol={onOpenSymbol}
          />
        ))}
      </div>
    </section>
  );
}

function TopicPane({
  dashboard,
  topicInput,
  onTopicInputChange,
  onApplyTopics,
  onResetTopics,
  previewTopics,
  isLoading,
  isRefreshing,
  isAiRefreshing,
  isPendingAiReveal,
  loadingStep,
  error,
  onRetry,
  onStop,
  onOpenSymbol,
}: {
  dashboard?: KeywordThemeDashboard;
  topicInput: string;
  onTopicInputChange: (value: string) => void;
  onApplyTopics: () => void;
  onResetTopics: () => void;
  previewTopics: string[];
  isLoading: boolean;
  isRefreshing: boolean;
  isAiRefreshing: boolean;
  isPendingAiReveal: boolean;
  loadingStep: string;
  error: boolean;
  onRetry: () => void;
  onStop: () => void;
  onOpenSymbol: (symbol: string) => void;
}) {
  if (isLoading && !dashboard) {
    return (
      <SectionLoadingState
        title="TOPIC RESEARCH"
        step={loadingStep}
        detail="Searching only the topics you submitted, then validating live overlap."
      />
    );
  }

  if (error && !dashboard) {
    return (
      <SectionErrorState
        title="TOPIC WORKSPACE UNAVAILABLE"
        body="The deterministic topic side could not build a usable snapshot from the current feeds."
        onRetry={onRetry}
      />
    );
  }

  if (!dashboard) return null;

  return (
    <section
      className="relative flex h-full min-h-0 flex-col overflow-hidden rounded border border-terminal-border bg-terminal-panel"
      aria-busy={isRefreshing}
      aria-labelledby="opportunities-topic-title"
    >
      {isPendingAiReveal && (
        <div className="pointer-events-none absolute right-3 top-3 z-10">
          <div role="status" aria-live="polite" className="inline-flex items-center gap-2 rounded border border-amber-400/35 bg-black/78 px-3 py-2 text-[11px] font-bold tracking-[0.16em] text-amber-300 shadow-lg">
            <Loader2 size={12} className="animate-spin" />
            AI ENRICHMENT RUNNING
          </div>
        </div>
      )}
      <div className="opportunities-topic-header flex-shrink-0 border-b border-amber-400/25 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Radar size={14} className="text-terminal-accent" />
              <h2 id="opportunities-topic-title" className="text-terminal-accent text-xs font-bold tracking-[0.24em]">TOPIC RESEARCH</h2>
              <span className="text-[11px] text-terminal-faint">Updated {new Date(dashboard.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="mt-2 text-base font-bold text-terminal-text">{dashboard.brief.headline}</div>
            <div className="opportunities-header-summary mt-1 max-w-4xl text-xs leading-relaxed">{dashboard.brief.summary}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAiRefreshing && (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex items-center gap-2 rounded border border-terminal-negative/40 bg-terminal-negative/10 px-3 py-2 text-xs text-terminal-negative hover:bg-terminal-negative/15 transition-colors"
              >
                <Square size={12} />
                STOP
              </button>
            )}
            <button
              type="button"
              onClick={onResetTopics}
              className="inline-flex items-center gap-2 rounded border border-terminal-border bg-terminal-panel px-3 py-2 text-xs text-terminal-text hover:bg-terminal-hover transition-colors"
            >
              RESET TOPICS
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded border border-terminal-border bg-terminal-panel px-3 py-2 text-xs text-terminal-text hover:bg-terminal-hover transition-colors"
            >
              <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
              REFRESH
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <div>
            <div className="text-[10px] tracking-[0.2em] text-terminal-faint">TYPE TOPICS</div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                aria-label="Topics to research"
                value={topicInput}
                onChange={(event) => onTopicInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onApplyTopics();
                  }
                }}
                placeholder="Examples: energy security, defense spending, copper demand"
                className="min-w-0 flex-1 rounded border border-terminal-border bg-terminal-panel px-3 py-2 text-sm text-terminal-text placeholder:text-terminal-faint focus:border-terminal-accent/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={onApplyTopics}
                className="rounded border border-terminal-border bg-terminal-panel px-3 py-2 text-xs font-medium text-terminal-text hover:bg-terminal-hover transition-colors"
              >
                BUILD THEMES
              </button>
            </div>
            <div className="mt-1 text-[11px] text-terminal-faint">Use commas to separate topics. Up to five topics are tracked at once.</div>
          </div>

          <div className="truncate text-[11px] text-terminal-muted">
            <span className="text-terminal-faint">TOPICS</span>
            {' · '}
            <span className="text-terminal-accent">
              {(dashboard.requestedTopics.length > 0 ? dashboard.requestedTopics : previewTopics).join(' · ')}
            </span>
          </div>

          {dashboard.unmatchedTopics.length > 0 && (
            <div className="text-xs text-terminal-muted">
              Still waiting for stronger overlap in {dashboard.unmatchedTopics.join(', ')}.
            </div>
          )}
        </div>

      </div>

      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 focus:outline-none focus-visible:ring-1 focus-visible:ring-terminal-accent"
        role="region"
        aria-label="Topic-specific opportunity themes"
        tabIndex={0}
      >
        {dashboard.requestedTopics.length > 0 && (
          <div className="grid grid-cols-2 divide-x divide-terminal-border border-y border-terminal-border lg:grid-cols-4">
            <ThemeStatCard
              label="REQUESTED"
              value={fmt.integer(dashboard.stats.requestedTopicCount)}
              detail="Submitted topics."
            />
            <ThemeStatCard
              label="MATCHED"
              value={fmt.integer(dashboard.stats.matchedTopicCount)}
              detail="Evidence-qualified themes."
            />
            <ThemeStatCard
              label="EXPOSURE MATCHES"
              value={fmt.integer(dashboard.stats.portfolioRelevantCount)}
              detail="Portfolio or watchlist."
            />
            <ThemeStatCard
              label="SOURCE BREADTH"
              value={fmt.integer(dashboard.stats.avgSourceDiversity)}
              detail="Average source types."
            />
          </div>
        )}
        {dashboard.requestedTopics.length === 0 ? (
          <SectionEmptyState
            title="NO TOPICS SELECTED"
            body="Type one or more topics above and click BUILD THEMES to generate this workspace."
          />
        ) : dashboard.themes.length > 0 ? (
          dashboard.themes.map((theme) => (
            <ThemeInsightCard
              key={theme.id}
              theme={theme}
              onOpenSymbol={onOpenSymbol}
            />
          ))
        ) : (
          <SectionEmptyState
            title="NO STRONG TOPIC THEMES YET"
            body="Try broader phrases such as energy security, cloud capex, defense spending, copper demand, shipping stress, or consumer weakness. This side only builds cards when the requested topics have enough live signal overlap."
          />
        )}
      </div>
    </section>
  );
}

function EarlySignalsPane({
  dashboard,
  isLoading,
  isRefreshing,
  error,
  onRetry,
  onStop,
  onOpenSymbol,
}: {
  dashboard?: EarlySignalsDashboard;
  isLoading: boolean;
  isRefreshing: boolean;
  error: boolean;
  onRetry: () => void;
  onStop: () => void;
  onOpenSymbol: (symbol: string) => void;
}) {
  if (isLoading && !dashboard) {
    return (
      <section className="space-y-3">
        <SectionLoadingState
          title="EARLY SIGNALS"
          step="Comparing structural evidence with the saved local baseline..."
          detail="No AI is used. News requests are cancellable and results are retained locally for longitudinal comparison."
        />
        <button
          type="button"
          onClick={onStop}
          className="inline-flex items-center gap-2 rounded border border-terminal-negative/40 px-3 py-2 text-xs text-terminal-negative transition-colors hover:bg-terminal-negative/10"
        >
          <Square size={12} />
          STOP
        </button>
      </section>
    );
  }

  if (error && !dashboard) {
    return (
      <SectionErrorState
        title="EARLY SIGNALS UNAVAILABLE"
        body="The local evidence scan could not finish. No model request was made and existing history was preserved."
        onRetry={onRetry}
      />
    );
  }

  if (!dashboard) return null;

  const baselineLabel = dashboard.baseline.status === 'established'
    ? 'Established baseline'
    : dashboard.baseline.status === 'partial'
      ? 'Partial baseline'
      : 'Baseline warming';

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-terminal-border bg-terminal-panel"
      aria-busy={isRefreshing}
      aria-labelledby="opportunities-early-signals-title"
    >
      <div className="opportunities-early-signals-header flex-shrink-0 border-b border-terminal-purple/25 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Radar size={14} className="text-terminal-purple" />
              <h2 id="opportunities-early-signals-title" className="text-xs font-bold tracking-[0.24em] text-terminal-purple">
                EARLY SIGNALS
              </h2>
              <span className="text-[11px] text-terminal-faint">6–36 month monitor</span>
            </div>
            <div className="mt-2 text-base font-bold text-terminal-text">Weak, accelerating structural developments</div>
            <div className="opportunities-header-summary mt-1 max-w-4xl text-xs leading-relaxed">
              Deterministic evidence scan ranked against Charlie’s saved local history. Low-quality candidates are suppressed rather than filled with generic themes.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isRefreshing && (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex items-center gap-2 rounded border border-terminal-negative/40 px-3 py-2 text-xs text-terminal-negative transition-colors hover:bg-terminal-negative/10"
              >
                <Square size={12} />
                STOP
              </button>
            )}
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded border border-terminal-border px-3 py-2 text-xs text-terminal-text transition-colors hover:bg-terminal-hover"
            >
              <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
              REFRESH EVIDENCE
            </button>
          </div>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-terminal-accent"
        role="region"
        aria-label="Early structural signals"
        tabIndex={0}
      >
        <div className="grid grid-cols-2 divide-x divide-terminal-border border-b border-terminal-border pb-3 md:grid-cols-4">
          <ThemeStatCard
            label="SURFACED"
            value={fmt.integer(dashboard.signals.length)}
            detail="Candidates clearing all gates."
          />
          <ThemeStatCard
            label="SUPPRESSED"
            value={fmt.integer(dashboard.stats.suppressedCandidateCount)}
            detail="Below evidence threshold."
          />
          <ThemeStatCard
            label="SOURCE BASE"
            value={fmt.integer(dashboard.stats.independentSourceCount)}
            detail="Independent publishers retained."
          />
          <ThemeStatCard
            label="HISTORY"
            value={`${dashboard.stats.historySpanDays}d`}
            detail={baselineLabel}
          />
        </div>

        {dashboard.signals.length > 0 ? (
          <div className="mt-3">
            {dashboard.signals.map((signal) => (
              <EarlySignalCard
                key={signal.id}
                signal={signal}
                onOpenSymbol={onOpenSymbol}
              />
            ))}
          </div>
        ) : (
          <div className="py-10">
            <div className="text-sm font-bold tracking-[0.12em] text-terminal-text">NO CANDIDATE CLEARS THE GATES</div>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-terminal-muted">
              Charlie needs repeated evidence across independent publishers and at least two active weeks. A cold start requires stronger support; as local history accumulates, the engine can compare recent rates with a real prior baseline.
            </p>
            <div className="mt-4 text-[11px] text-terminal-faint">
              {dashboard.stats.evidenceCount} canonical observations retained · {dashboard.stats.candidateCount} structural candidates monitored · {baselineLabel.toLowerCase()}
            </div>
          </div>
        )}

        <details className="group border-t border-terminal-border py-3">
          <summary className="cursor-pointer list-none text-[10px] tracking-[0.16em] text-terminal-faint marker:hidden">
            <span className="inline-flex items-center gap-2">
              <span className="transition-transform group-open:rotate-90">›</span>
              METHODOLOGY & LIMITS
            </span>
          </summary>
          <div className="mt-2 max-w-4xl space-y-2 text-[11px] leading-relaxed text-terminal-muted">
            <p>
              Signals require coherent topic terms, three or more recent observations, two or more independent publishers, multiple publication days, and persistence across at least two weeks. Acceleration compares the last 30 days with up to 150 prior days.
            </p>
            <p>
              Company links require explicit references in at least two articles from two independent publishers. Otherwise Charlie shows only the supported value-chain role. Scores are relative research priorities, not probabilities, forecasts, or investment recommendations.
            </p>
            <p>
              Phase-one history is local to this Charlie installation. Coverage begins when the view is first used and is limited by the available news feeds; absence from this panel is not evidence that a trend does not exist.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}

export function OpportunitiesPanel() {
  const { portfolio, watchlist, setActivePanel, openAISettings, updateOpenAISettings, debugMode } = useTerminalStore();
  const queryClient = useQueryClient();
  const quoteUniverse = useMemo(() => getDiscoveryAssetUniverse(), []);
  const [activeWorkspace, setActiveWorkspace] = useState<'discovery' | 'topics' | 'early-signals'>('discovery');
  const [discoveryLoadingStepIndex, setDiscoveryLoadingStepIndex] = useState(0);
  const [topicLoadingStepIndex, setTopicLoadingStepIndex] = useState(0);
  const [showPromptDebug, setShowPromptDebug] = useState(false);
  const [showPayloadDebug, setShowPayloadDebug] = useState(false);
  const [topicInput, setTopicInput] = useState(() => getInitialTopicInput());
  const [appliedTopics, setAppliedTopics] = useState<string[]>([]);
  const [discoveryAiPaused, setDiscoveryAiPaused] = useState(false);
  const [topicAiPaused, setTopicAiPaused] = useState(false);
  const [discoveryAiRequested, setDiscoveryAiRequested] = useState(false);
  const [topicAiRequested, setTopicAiRequested] = useState(false);
  const aiEnabledForOpportunities = openAISettings.hasStoredApiKey && Boolean(openAISettings.model.trim());
  const opportunityCacheContext = useMemo(
    () => opportunityContextKey({
      model: aiEnabledForOpportunities ? openAISettings.model : '',
      portfolio,
      watchlist,
    }),
    [aiEnabledForOpportunities, openAISettings.model, portfolio, watchlist]
  );
  const discoveryStorageKey = useMemo(
    () => contextualDiscoveryCacheKey(opportunityCacheContext),
    [opportunityCacheContext]
  );
  const topicStorageKey = useMemo(
    () => contextualTopicCacheKey(appliedTopics, opportunityCacheContext),
    [appliedTopics, opportunityCacheContext]
  );
  const cachedDiscoveryDashboard = useMemo(
    () => readFreshCache<DiscoveryDashboard>(discoveryStorageKey),
    [discoveryStorageKey]
  );
  const cachedTopicDashboard = useMemo(() => {
    if (appliedTopics.length === 0) return createEmptyTopicDashboard();
    return readFreshCache<KeywordThemeDashboard>(topicStorageKey);
  }, [appliedTopics.length, topicStorageKey]);
  const baseInputQueryKey = useMemo(
    () => [
      'hybrid-opportunities-base-input',
      portfolio,
      watchlist,
    ],
    [portfolio, watchlist]
  );

  useEffect(() => {
    if (!debugMode) {
      setShowPromptDebug(false);
      setShowPayloadDebug(false);
    }
  }, [debugMode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDiscoveryLoadingStepIndex((current) => (current + 1) % DISCOVERY_LOADING_STEPS.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTopicLoadingStepIndex((current) => (current + 1) % TOPIC_LOADING_STEPS.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TOPIC_STORAGE_KEY, topicInput);
  }, [topicInput]);

  useEffect(() => {
    if (!aiEnabledForOpportunities) {
      setDiscoveryAiPaused(false);
      setTopicAiPaused(false);
      setDiscoveryAiRequested(false);
      setTopicAiRequested(false);
    }
  }, [aiEnabledForOpportunities]);

  const { data: keyStatus } = useQuery({
    queryKey: ['openai-key-status'],
    queryFn: fetchOpenAIKeyStatus,
    staleTime: 30_000,
    retry: 1,
  });

  useEffect(() => {
    if (typeof keyStatus?.configured === 'boolean' && keyStatus.configured !== openAISettings.hasStoredApiKey) {
      updateOpenAISettings({ hasStoredApiKey: keyStatus.configured });
    }
  }, [keyStatus?.configured, openAISettings.hasStoredApiKey, updateOpenAISettings]);

  const discoveryQuery = useQuery({
    queryKey: ['hybrid-opportunities-discovery', opportunityCacheContext],
    queryFn: async () => {
      const baseInput = await queryClient.fetchQuery({
        queryKey: baseInputQueryKey,
        queryFn: () => fetchBaseInput({
          quoteUniverse,
          portfolio,
          watchlist,
        }),
        staleTime: BASE_INPUT_QUERY_STALE_MS,
        gcTime: HYBRID_CACHE_TTL_MS,
      });

      return buildDiscoveryDashboard(baseInput);
    },
    enabled: cachedDiscoveryDashboard == null,
    staleTime: HYBRID_CACHE_TTL_MS,
    gcTime: HYBRID_CACHE_TTL_MS * 2,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const discoveryAiQuery = useQuery({
    queryKey: [
      'hybrid-opportunities-discovery-ai',
      discoveryQuery.data?.generatedAt ?? 'none',
      openAISettings.model.trim(),
    ],
    queryFn: async ({ signal }) => {
      const baseInput = await queryClient.fetchQuery({
        queryKey: baseInputQueryKey,
        queryFn: () => fetchBaseInput({
          quoteUniverse,
          portfolio,
          watchlist,
        }),
        staleTime: BASE_INPUT_QUERY_STALE_MS,
        gcTime: HYBRID_CACHE_TTL_MS,
      });

      const signalSnapshot = buildThemeDiscoverySignalPayload(baseInput);
      const aiResult = await generateThemeDiscovery({
        model: openAISettings.model.trim(),
        snapshot: signalSnapshot,
        signal,
      });
      return buildAIDiscoveryDashboard(baseInput, aiResult);
    },
    enabled: Boolean(discoveryQuery.data) &&
      openAISettings.hasStoredApiKey &&
      Boolean(openAISettings.model.trim()) &&
      discoveryAiRequested &&
      !discoveryAiPaused,
    staleTime: HYBRID_CACHE_TTL_MS,
    gcTime: HYBRID_CACHE_TTL_MS * 2,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 0,
  });

  const topicQuery = useQuery({
    queryKey: ['hybrid-opportunities-topics', topicStorageKey],
    queryFn: async () => {
      if (appliedTopics.length === 0) {
        return createEmptyTopicDashboard();
      }

      const [topicNewsEntries, baseInput] = await Promise.all([
        Promise.all(
          appliedTopics.map(async (topic) => [topic, await withTimeout(
            searchNewsArchive(topic, LOOKBACK_HOURS, 'all', 16).catch(() => []),
            TOPIC_NEWS_FETCH_TIMEOUT_MS,
            [],
          )] as const)
        ),
        queryClient.fetchQuery({
        queryKey: baseInputQueryKey,
        queryFn: () => fetchBaseInput({
            quoteUniverse,
            portfolio,
            watchlist,
          }),
          staleTime: BASE_INPUT_QUERY_STALE_MS,
          gcTime: HYBRID_CACHE_TTL_MS,
        }),
      ]);
      const topicNewsByTopic = Object.fromEntries(topicNewsEntries);
      return buildKeywordThemeDashboard(baseInput, appliedTopics, topicNewsByTopic);
    },
    enabled: appliedTopics.length > 0 && cachedTopicDashboard == null,
    staleTime: HYBRID_CACHE_TTL_MS,
    gcTime: HYBRID_CACHE_TTL_MS * 2,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const topicAiQuery = useQuery({
    queryKey: [
      'hybrid-opportunities-topics-ai',
      topicStorageKey,
      topicQuery.data?.generatedAt ?? 'none',
      openAISettings.model.trim(),
    ],
    queryFn: async ({ signal }) => {
      if (!topicQuery.data || topicQuery.data.themes.length === 0) {
        return topicQuery.data ?? createEmptyTopicDashboard();
      }

      const guidanceSnapshot = buildTopicThemeGuidancePayload(topicQuery.data);
      const aiGuidance = await generateTopicThemeGuidance({
        model: openAISettings.model.trim(),
        snapshot: guidanceSnapshot,
        signal,
      });
      return applyAIThemeGuidanceDashboard(topicQuery.data, aiGuidance);
    },
    enabled: Boolean(topicQuery.data && topicQuery.data.themes.length > 0) &&
      openAISettings.hasStoredApiKey &&
      Boolean(openAISettings.model.trim()) &&
      topicAiRequested &&
      !topicAiPaused,
    staleTime: HYBRID_CACHE_TTL_MS,
    gcTime: HYBRID_CACHE_TTL_MS * 2,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 0,
  });

  const earlySignalsQuery = useQuery({
    queryKey: ['opportunities-early-signals-v1'],
    queryFn: ({ signal }) => fetchEarlySignalsDashboard(signal),
    enabled: activeWorkspace === 'early-signals',
    staleTime: EARLY_SIGNALS_QUERY_STALE_MS,
    gcTime: HYBRID_CACHE_TTL_MS * 4,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 0,
  });

  useEffect(() => {
    if (activeWorkspace !== 'early-signals') {
      void queryClient.cancelQueries({ queryKey: ['opportunities-early-signals-v1'] });
    }
  }, [activeWorkspace, queryClient]);

  useEffect(() => {
    const latestDiscoveryDashboard = discoveryAiQuery.data ?? discoveryQuery.data;
    if (latestDiscoveryDashboard) {
      writeCache(discoveryStorageKey, latestDiscoveryDashboard);
    }
  }, [discoveryAiQuery.data, discoveryQuery.data, discoveryStorageKey]);

  useEffect(() => {
    const latestTopicDashboard = topicAiQuery.data ?? topicQuery.data;
    if (appliedTopics.length > 0 && latestTopicDashboard) {
      writeCache(topicStorageKey, latestTopicDashboard);
    }
  }, [appliedTopics.length, topicAiQuery.data, topicQuery.data, topicStorageKey]);

  const discoveryPayload = getOpenAIDebugPayload('discovery-themes');
  const topicPayload = getOpenAIDebugPayload('topic-theme-guidance');
  const discoveryData = discoveryAiQuery.data ?? discoveryQuery.data ?? cachedDiscoveryDashboard;
  const topicData = appliedTopics.length === 0
    ? (topicQuery.data ?? cachedTopicDashboard ?? createEmptyTopicDashboard())
    : (topicAiQuery.data ?? topicQuery.data ?? cachedTopicDashboard);

  const discoveryError = Boolean(discoveryQuery.error || (!discoveryData && discoveryAiQuery.error));
  const topicError = appliedTopics.length > 0
    ? Boolean(topicQuery.error || (!topicData && topicAiQuery.error))
    : Boolean(topicQuery.error);
  const discoveryLoading = !discoveryData && !discoveryError;
  const topicLoading = appliedTopics.length > 0 ? (!topicData && !topicError) : topicQuery.isLoading;
  const discoveryRefreshing = aiEnabledForOpportunities
    ? (discoveryAiQuery.isFetching || discoveryQuery.isFetching)
    : (discoveryQuery.isRefetching || (Boolean(discoveryQuery.data) && discoveryAiQuery.isFetching));
  const discoveryAiRefreshing = aiEnabledForOpportunities && discoveryAiQuery.isFetching;
  const topicRefreshing = aiEnabledForOpportunities
    ? (topicAiQuery.isFetching || topicQuery.isFetching)
    : (topicQuery.isRefetching || (Boolean(topicQuery.data) && topicAiQuery.isFetching));
  const topicAiRefreshing = aiEnabledForOpportunities && topicAiQuery.isFetching;
  const discoveryPendingAiReveal = discoveryAiRefreshing && !discoveryAiQuery.data && Boolean(discoveryData);
  const topicPendingAiReveal = topicAiRefreshing && !topicAiQuery.data && Boolean(topicData);
  const earlySignalsData = earlySignalsQuery.data;
  const earlySignalsError = Boolean(earlySignalsQuery.error);
  const earlySignalsLoading = !earlySignalsData && earlySignalsQuery.isFetching && !earlySignalsError;
  const activeDashboardUsesAI = activeWorkspace === 'discovery'
    ? discoveryData?.mode === 'ai'
    : activeWorkspace === 'topics'
      ? Boolean(topicData?.model)
      : false;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-terminal-border pb-2">
        <div className="inline-flex flex-wrap gap-x-4 gap-y-1" role="tablist" aria-label="Opportunity workspace">
          <button
            type="button"
            role="tab"
            aria-selected={activeWorkspace === 'discovery'}
            onClick={() => setActiveWorkspace('discovery')}
            className={`border-b-2 px-0.5 py-1 text-xs font-bold tracking-[0.12em] transition-colors ${
              activeWorkspace === 'discovery'
                ? 'border-terminal-accent text-terminal-accent'
                : 'border-transparent text-terminal-muted hover:text-terminal-text'
            }`}
          >
            DISCOVERED THEMES
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeWorkspace === 'topics'}
            onClick={() => setActiveWorkspace('topics')}
            className={`border-b-2 px-0.5 py-1 text-xs font-bold tracking-[0.12em] transition-colors ${
              activeWorkspace === 'topics'
                ? 'border-amber-300 text-amber-300'
                : 'border-transparent text-terminal-muted hover:text-terminal-text'
            }`}
          >
            TOPIC RESEARCH{appliedTopics.length > 0 ? ` · ${appliedTopics.length}` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeWorkspace === 'early-signals'}
            onClick={() => setActiveWorkspace('early-signals')}
            className={`border-b-2 px-0.5 py-1 text-xs font-bold tracking-[0.12em] transition-colors ${
              activeWorkspace === 'early-signals'
                ? 'border-terminal-purple text-terminal-purple'
                : 'border-transparent text-terminal-muted hover:text-terminal-text'
            }`}
          >
            EARLY SIGNALS
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-terminal-faint">
          <span className={`h-1.5 w-1.5 rounded-full ${
            activeWorkspace === 'early-signals'
              ? 'bg-terminal-purple'
              : aiEnabledForOpportunities
                ? 'bg-terminal-positive'
                : 'bg-terminal-muted'
          }`} />
          {activeWorkspace === 'early-signals'
            ? 'Deterministic evidence · no AI'
            : aiEnabledForOpportunities
              ? activeDashboardUsesAI
                ? `AI enriched · ${openAISettings.model}`
                : 'Local analysis · refresh for AI'
              : 'Local analysis · AI enrichment off'}
          {!openAISettings.hasStoredApiKey && activeWorkspace !== 'early-signals' && (
            <button
              type="button"
              onClick={() => setActivePanel('settings')}
              className="rounded border border-terminal-border px-2 py-1 text-terminal-muted transition-colors hover:bg-terminal-hover hover:text-terminal-text"
            >
              ENABLE AI
            </button>
          )}
        </div>
      </div>
      <ExperimentalFeatureNotice />

      {debugMode && (
        <div className="flex max-h-[38vh] flex-shrink-0 flex-col gap-2 overflow-y-auto">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowPromptDebug((current) => !current)}
              className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs transition-colors ${
                showPromptDebug
                  ? 'border-terminal-accent/45 bg-terminal-accent/10 text-terminal-accent'
                  : 'border-terminal-border text-terminal-muted hover:border-terminal-accent/35 hover:text-terminal-accent hover:bg-terminal-hover'
              }`}
            >
              <Bug size={12} />
              {showPromptDebug ? 'HIDE AI DEBUG' : 'SHOW AI DEBUG'}
            </button>
            <button
              type="button"
              onClick={() => setShowPayloadDebug((current) => !current)}
              className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs transition-colors ${
                showPayloadDebug
                  ? 'border-terminal-accent/45 bg-terminal-accent/10 text-terminal-accent'
                  : 'border-terminal-border text-terminal-muted hover:border-terminal-accent/35 hover:text-terminal-accent hover:bg-terminal-hover'
              }`}
            >
              <Bug size={12} />
              {showPayloadDebug ? 'HIDE AI PAYLOADS' : 'SHOW AI PAYLOADS'}
            </button>
          </div>

          {showPromptDebug && (
            <div className="rounded border border-terminal-border bg-terminal-panel p-3 space-y-3">
              <div className="text-terminal-accent text-xs font-bold tracking-[0.18em]">OPPS AI DEBUG</div>
              <div className="text-xs text-terminal-muted">
                Model: <span className="text-terminal-text">{openAISettings.model || '—'}</span>
              </div>

              <PromptBlock title="Theme Discovery Base Prompt" prompt={DEFAULT_THEME_DISCOVERY_SYSTEM_PROMPT} />
              <PromptBlock title="Theme Recommendation Base Prompt" prompt={DEFAULT_THEME_DISCOVERY_RECOMMENDATION_SYSTEM_PROMPT} />
              <PromptBlock title="Topic Guidance Base Prompt" prompt={DEFAULT_TOPIC_THEME_GUIDANCE_SYSTEM_PROMPT} />
            </div>
          )}

          {showPayloadDebug && (
            <div className="rounded border border-terminal-border bg-terminal-panel p-3 space-y-3">
              <div className="text-terminal-accent text-xs font-bold tracking-[0.18em]">OPPS AI PAYLOAD DEBUG</div>
              <PayloadBlock title="Discovery Themes Request" payload={discoveryPayload} />
              <PayloadBlock title="Topic Theme Guidance Request" payload={topicPayload} />
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {activeWorkspace === 'discovery' ? (
          <DiscoveryPane
            dashboard={discoveryData}
            isLoading={discoveryLoading}
            isRefreshing={discoveryRefreshing}
            isAiRefreshing={discoveryAiRefreshing}
            isPendingAiReveal={discoveryPendingAiReveal}
            loadingStep={DISCOVERY_LOADING_STEPS[discoveryLoadingStepIndex]}
            error={discoveryError}
            onRetry={() => {
              setDiscoveryAiPaused(false);
              setDiscoveryAiRequested(true);
              void discoveryQuery.refetch();
            }}
            onStop={() => {
              setDiscoveryAiPaused(true);
              setDiscoveryAiRequested(false);
              void queryClient.cancelQueries({ queryKey: ['hybrid-opportunities-discovery-ai'] });
            }}
            onOpenSymbol={(symbol) => setActivePanel('equity', symbol)}
          />
        ) : activeWorkspace === 'topics' ? (
          <TopicPane
            dashboard={topicData}
            topicInput={topicInput}
            onTopicInputChange={setTopicInput}
            onApplyTopics={() => {
              setTopicAiPaused(false);
              setTopicAiRequested(true);
              setAppliedTopics(parseTopicInput(topicInput));
            }}
            onResetTopics={() => {
              const nextValue = '';
              setTopicInput(nextValue);
              setTopicAiPaused(false);
              setTopicAiRequested(false);
              setAppliedTopics([]);
            }}
          previewTopics={parseTopicInput(topicInput)}
          isLoading={topicLoading}
          isRefreshing={topicRefreshing}
          isAiRefreshing={topicAiRefreshing}
          isPendingAiReveal={topicPendingAiReveal}
          loadingStep={TOPIC_LOADING_STEPS[topicLoadingStepIndex]}
          error={topicError}
            onRetry={() => {
              setTopicAiPaused(false);
              setTopicAiRequested(true);
              void topicQuery.refetch();
            }}
            onStop={() => {
              setTopicAiPaused(true);
              setTopicAiRequested(false);
              void queryClient.cancelQueries({ queryKey: ['hybrid-opportunities-topics-ai'] });
            }}
            onOpenSymbol={(symbol) => setActivePanel('equity', symbol)}
          />
        ) : (
          <EarlySignalsPane
            dashboard={earlySignalsData}
            isLoading={earlySignalsLoading}
            isRefreshing={earlySignalsQuery.isFetching}
            error={earlySignalsError}
            onRetry={() => {
              void earlySignalsQuery.refetch();
            }}
            onStop={() => {
              void queryClient.cancelQueries({ queryKey: ['opportunities-early-signals-v1'] });
            }}
            onOpenSymbol={(symbol) => setActivePanel('equity', symbol)}
          />
        )}
      </div>
    </div>
  );
}

function PromptBlock({
  title,
  prompt,
}: {
  title: string;
  prompt: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-terminal-faint tracking-[0.16em] font-bold mb-1">{title.toUpperCase()}</div>
      <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded border border-terminal-border bg-terminal-elevated px-2.5 py-2 text-[11px] leading-relaxed text-terminal-text">
        {prompt?.trim() || '—'}
      </pre>
    </div>
  );
}

function PayloadBlock({
  title,
  payload,
}: {
  title: string;
  payload: OpenAIDebugPayloadEntry | null;
}) {
  return (
    <div>
      <div className="text-[11px] text-terminal-faint tracking-[0.16em] font-bold mb-1">{title.toUpperCase()}</div>
      {payload ? (
        <>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-terminal-faint">
            <div>
              Captured: <span className="text-terminal-text">{new Date(payload.capturedAt).toLocaleString('en-US')}</span>
            </div>
            <button
              onClick={() => downloadJsonFile(
                buildTimestampedJsonFilename(payload.route, payload.capturedAt),
                payload.payload
              )}
              className="rounded border border-terminal-border bg-terminal-panel px-2 py-1 text-[10px] font-medium tracking-[0.08em] text-terminal-muted hover:border-terminal-accent/40 hover:text-terminal-accent hover:bg-terminal-hover transition-colors"
            >
              DOWNLOAD JSON
            </button>
          </div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded border border-terminal-border bg-terminal-elevated px-2.5 py-2 text-[11px] leading-relaxed text-terminal-text">
            {JSON.stringify(payload.payload, null, 2)}
          </pre>
        </>
      ) : (
        <div className="rounded border border-terminal-border bg-terminal-elevated px-2.5 py-2 text-[11px] text-terminal-faint">
          No payload captured yet for this request.
        </div>
      )}
    </div>
  );
}
