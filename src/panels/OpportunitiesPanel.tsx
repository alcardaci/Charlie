import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bug, Loader2, Orbit, Radar, RefreshCw, Square } from 'lucide-react';
import {
  fetchCountryNewsCounts,
  fetchMacroReleaseCalendar,
  fetchNewsFeed,
  fetchOpenAIKeyStatus,
  fetchPredictionForecasts,
  fetchQuotes,
  fetchSentimentSnapshot,
  getOpenAIDebugPayload,
  generateThemeDiscovery,
  generateTopicThemeGuidance,
  searchNewsArchive,
} from '../api/finance';
import type { OpenAIDebugPayloadEntry } from '../api/finance';
import { ThemeInsightCard, ThemeStatCard } from '../components/ThemeInsightCard';
import { useTerminalStore } from '../store/useTerminalStore';
import type { MarketSentimentSnapshot, NewsItem, Quote } from '../types';
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
const BASE_INPUT_QUERY_STALE_MS = 15 * 1000;
const BASE_INPUT_FETCH_TIMEOUT_MS = 12_000;
const TOPIC_NEWS_FETCH_TIMEOUT_MS = 10_000;
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
  countryCounts: Awaited<ReturnType<typeof fetchCountryNewsCounts>>;
  predictions: Awaited<ReturnType<typeof fetchPredictionForecasts>>['forecasts'];
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

  const [
    countryCounts,
    predictionsSnapshot,
    sentiment,
    calendarData,
    marketNews,
    techNews,
    economyNews,
    energyNews,
  ] = await Promise.all([
    withTimeout(
      fetchCountryNewsCounts('geopolitics', LOOKBACK_HOURS, {
        enableAI: false,
        model: DEFAULT_GEOPOLITICS_OPENAI_MODEL,
        includeHotspotSummaries: false,
      }).catch(() => []),
      BASE_INPUT_FETCH_TIMEOUT_MS,
      [],
    ),
    withTimeout(fetchPredictionForecasts(12).then((snapshot) => snapshot.forecasts).catch(() => []), BASE_INPUT_FETCH_TIMEOUT_MS, []),
    withTimeout(fetchSentimentSnapshot().catch(() => null), BASE_INPUT_FETCH_TIMEOUT_MS, null),
    withTimeout(fetchMacroReleaseCalendar(from, to).catch(() => fallbackCalendar), BASE_INPUT_FETCH_TIMEOUT_MS, fallbackCalendar),
    withTimeout(fetchNewsFeed('markets', 'all', 24).catch(() => []), BASE_INPUT_FETCH_TIMEOUT_MS, []),
    withTimeout(fetchNewsFeed('technology', 'all', 18).catch(() => []), BASE_INPUT_FETCH_TIMEOUT_MS, []),
    withTimeout(fetchNewsFeed('economy', 'all', 18).catch(() => []), BASE_INPUT_FETCH_TIMEOUT_MS, []),
    withTimeout(fetchNewsFeed('energy', 'all', 18).catch(() => []), BASE_INPUT_FETCH_TIMEOUT_MS, []),
  ]);

  const symbols = Array.from(new Set([
    ...args.quoteUniverse,
    ...args.watchlist.map((symbol) => symbol.toUpperCase()),
    ...args.portfolio.map((position) => position.symbol.toUpperCase()),
  ]));
  const quotes = symbols.length > 0
    ? await withTimeout(fetchQuotes(symbols).catch(() => []), BASE_INPUT_FETCH_TIMEOUT_MS, [])
    : [];

  return {
    marketNews,
    techNews,
    economyNews,
    energyNews,
    countryCounts,
    predictions: predictionsSnapshot,
    sentiment,
    calendarEvents: calendarData.events,
    portfolio: args.portfolio,
    watchlist: args.watchlist,
    quotes,
  };
}

function mergeQuotes(baseQuotes: Quote[], extraQuotes: Quote[]): Quote[] {
  if (extraQuotes.length === 0) return baseQuotes;

  const quoteBySymbol = new Map<string, Quote>();
  for (const quote of baseQuotes) {
    quoteBySymbol.set(quote.symbol.toUpperCase(), quote);
  }
  for (const quote of extraQuotes) {
    quoteBySymbol.set(quote.symbol.toUpperCase(), quote);
  }

  return Array.from(quoteBySymbol.values());
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
    <section className="rounded border border-terminal-border bg-terminal-panel p-5">
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
    <section className="rounded border border-terminal-border bg-terminal-panel p-5 space-y-3">
      <div className="flex items-center gap-2 text-terminal-accent text-sm font-bold tracking-wider">
        <AlertTriangle size={15} />
        {title}
      </div>
      <div className="text-sm text-terminal-muted">{body}</div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded border border-terminal-border bg-terminal-elevated px-3 py-2 text-xs text-terminal-text hover:bg-terminal-hover transition-colors"
      >
        <RefreshCw size={12} />
        RETRY
      </button>
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
        detail="This side is loading independently from the custom topic side."
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

  const contentVisibilityClass = isPendingAiReveal
    ? 'pointer-events-none select-none blur-[5px] opacity-50 saturate-[0.78]'
    : 'blur-0 opacity-100 saturate-100';

  return (
    <div className="relative rounded border border-terminal-border bg-terminal-panel overflow-hidden xl:min-h-0 xl:flex xl:flex-col">
      {isPendingAiReveal && (
        <div className="pointer-events-none absolute inset-x-4 top-28 z-10 flex justify-center">
          <div className="rounded border border-terminal-accent/35 bg-black/78 px-3 py-2 text-[11px] font-bold tracking-[0.2em] text-terminal-accent shadow-[0_14px_36px_rgba(0,0,0,0.34)]">
            AI ANALYSIS IN PROGRESS
          </div>
        </div>
      )}
      <div className="opportunities-discovery-header flex-shrink-0 border-b border-terminal-accent/25 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className={`min-w-0 transition-all duration-300 ${contentVisibilityClass}`}>
            <div className="flex items-center gap-2">
              <Orbit size={14} className="text-terminal-accent" />
              <span className="text-terminal-accent text-xs font-bold tracking-[0.24em]">THEME DISCOVERY</span>
              <span className="text-[11px] text-terminal-faint">Updated {new Date(dashboard.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="opportunities-header-kicker mt-2 text-[11px] uppercase tracking-[0.18em]">
              Built from live signals extracted across news, macro, sentiment, predictions, and geopolitics
            </div>
            <div className="mt-2 text-lg font-bold text-terminal-text">{dashboard.brief.headline}</div>
            <div className="opportunities-header-summary mt-1 text-sm leading-relaxed">
              {dashboard.brief.summary}
              {' '}This side keeps the existing discovery behavior unchanged.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAiRefreshing && (
              <button
                onClick={onStop}
                className="inline-flex items-center gap-2 rounded border border-terminal-negative/40 bg-terminal-negative/10 px-3 py-2 text-xs text-terminal-negative hover:bg-terminal-negative/15 transition-colors"
              >
                <Square size={12} />
                STOP
              </button>
            )}
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded border border-terminal-border bg-terminal-panel px-3 py-2 text-xs text-terminal-text hover:bg-terminal-hover transition-colors"
            >
              <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
              REFRESH
            </button>
          </div>
        </div>

        <div className={`mt-4 grid gap-3 transition-all duration-300 md:grid-cols-2 xl:grid-cols-4 ${contentVisibilityClass}`}>
          <ThemeStatCard
            label="DISCOVERED THEMES"
            value={fmt.integer(dashboard.stats.clusterCount)}
            detail="Top themes identified from the live multi-source snapshot."
          />
          <ThemeStatCard
            label="RAW SIGNALS USED"
            value={fmt.integer(dashboard.stats.signalCount)}
            detail="Signals gathered independently from news, geopolitics, macro, prediction, and sentiment."
          />
          <ThemeStatCard
            label="PORTFOLIO RELEVANT"
            value={fmt.integer(dashboard.stats.portfolioRelevantCount)}
            detail="Themes that already touch your holdings or watchlist."
          />
          <ThemeStatCard
            label="AVG SOURCE BREADTH"
            value={fmt.integer(dashboard.stats.avgSourceDiversity)}
            detail="Average number of source types contributing to each displayed theme."
          />
        </div>
      </div>

      <div className={`p-4 space-y-4 transition-all duration-300 xl:min-h-0 xl:flex-1 xl:overflow-y-auto ${contentVisibilityClass}`}>
        {dashboard.themes.map((theme) => (
          <ThemeInsightCard
            key={theme.id}
            theme={theme}
            onOpenSymbol={onOpenSymbol}
          />
        ))}
      </div>
    </div>
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
        detail="This side reloads independently whenever the requested topics change."
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

  const contentVisibilityClass = isPendingAiReveal
    ? 'pointer-events-none select-none blur-[5px] opacity-50 saturate-[0.78]'
    : 'blur-0 opacity-100 saturate-100';

  return (
    <div className="relative rounded border border-terminal-border bg-terminal-panel overflow-hidden xl:min-h-0 xl:flex xl:flex-col">
      {isPendingAiReveal && (
        <div className="pointer-events-none absolute inset-x-4 top-28 z-10 flex justify-center">
          <div className="rounded border border-amber-400/35 bg-black/78 px-3 py-2 text-[11px] font-bold tracking-[0.2em] text-amber-300 shadow-[0_14px_36px_rgba(0,0,0,0.34)]">
            AI ANALYSIS IN PROGRESS
          </div>
        </div>
      )}
      <div className="opportunities-topic-header flex-shrink-0 border-b border-amber-400/25 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className={`min-w-0 transition-all duration-300 ${contentVisibilityClass}`}>
            <div className="flex items-center gap-2">
              <Radar size={14} className="text-terminal-accent" />
              <span className="text-terminal-accent text-xs font-bold tracking-[0.24em]">TOPIC RESEARCH</span>
              <span className="text-[11px] text-terminal-faint">Updated {new Date(dashboard.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="opportunities-header-kicker mt-2 text-[11px] uppercase tracking-[0.18em]">
              Choose your topics and the system will generate matching theme cards
            </div>
            <div className="mt-2 text-lg font-bold text-terminal-text">{dashboard.brief.headline}</div>
            <div className="opportunities-header-summary mt-1 text-sm leading-relaxed">
              {dashboard.brief.summary}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAiRefreshing && (
              <button
                onClick={onStop}
                className="inline-flex items-center gap-2 rounded border border-terminal-negative/40 bg-terminal-negative/10 px-3 py-2 text-xs text-terminal-negative hover:bg-terminal-negative/15 transition-colors"
              >
                <Square size={12} />
                STOP
              </button>
            )}
            <button
              onClick={onResetTopics}
              className="inline-flex items-center gap-2 rounded border border-terminal-border bg-terminal-panel px-3 py-2 text-xs text-terminal-text hover:bg-terminal-hover transition-colors"
            >
              RESET TOPICS
            </button>
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded border border-terminal-border bg-terminal-panel px-3 py-2 text-xs text-terminal-text hover:bg-terminal-hover transition-colors"
            >
              <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
              REFRESH
            </button>
          </div>
        </div>

        <div className={`mt-4 space-y-3 transition-all duration-300 ${contentVisibilityClass}`}>
          <div>
            <div className="text-[10px] tracking-[0.2em] text-terminal-faint">TYPE TOPICS</div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
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
                onClick={onApplyTopics}
                className="rounded border border-terminal-border bg-terminal-panel px-3 py-2 text-xs font-medium text-terminal-text hover:bg-terminal-hover transition-colors"
              >
                BUILD THEMES
              </button>
            </div>
            <div className="mt-1 text-[11px] text-terminal-faint">Use commas to separate topics. Up to five topics are tracked at once.</div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(dashboard.requestedTopics.length > 0 ? dashboard.requestedTopics : previewTopics).map((topic) => (
              <span key={topic} className="rounded border border-terminal-accent/30 bg-terminal-accent/10 px-2 py-1 text-xs text-terminal-accent">
                {topic}
              </span>
            ))}
          </div>

          {dashboard.unmatchedTopics.length > 0 && (
            <div className="text-xs text-terminal-muted">
              Still waiting for stronger overlap in {dashboard.unmatchedTopics.join(', ')}.
            </div>
          )}
        </div>

        <div className={`mt-4 grid gap-3 transition-all duration-300 md:grid-cols-2 xl:grid-cols-4 ${contentVisibilityClass}`}>
          <ThemeStatCard
            label="REQUESTED TOPICS"
            value={fmt.integer(dashboard.stats.requestedTopicCount)}
            detail="Topics currently coming from your own keyword list."
          />
          <ThemeStatCard
            label="MATCHED THEMES"
            value={fmt.integer(dashboard.stats.matchedTopicCount)}
            detail="Requested topics that produced enough live overlap to display."
          />
          <ThemeStatCard
            label="PORTFOLIO RELEVANT"
            value={fmt.integer(dashboard.stats.portfolioRelevantCount)}
            detail="Custom topic themes that already touch holdings or the watchlist."
          />
          <ThemeStatCard
            label="AVG SOURCE BREADTH"
            value={fmt.integer(dashboard.stats.avgSourceDiversity)}
            detail="Average number of source types contributing to each custom topic theme."
          />
        </div>
      </div>

      <div className={`p-4 space-y-4 transition-all duration-300 xl:min-h-0 xl:flex-1 xl:overflow-y-auto ${contentVisibilityClass}`}>
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
    </div>
  );
}

export function OpportunitiesPanel() {
  const { portfolio, watchlist, setActivePanel, openAISettings, updateOpenAISettings, debugMode } = useTerminalStore();
  const queryClient = useQueryClient();
  const quoteUniverse = useMemo(() => getDiscoveryAssetUniverse(), []);
  const [discoveryLoadingStepIndex, setDiscoveryLoadingStepIndex] = useState(0);
  const [topicLoadingStepIndex, setTopicLoadingStepIndex] = useState(0);
  const [showPromptDebug, setShowPromptDebug] = useState(false);
  const [showPayloadDebug, setShowPayloadDebug] = useState(false);
  const [topicInput, setTopicInput] = useState(() => getInitialTopicInput());
  const [appliedTopics, setAppliedTopics] = useState(() => parseTopicInput(getInitialTopicInput()));
  const [discoveryAiPaused, setDiscoveryAiPaused] = useState(false);
  const [topicAiPaused, setTopicAiPaused] = useState(false);
  const aiEnabledForOpportunities = openAISettings.hasStoredApiKey && Boolean(openAISettings.model.trim());
  const topicStorageKey = useMemo(() => topicCacheKey(appliedTopics), [appliedTopics]);
  const cachedDiscoveryDashboard = useMemo(
    () => readFreshCache<DiscoveryDashboard>(DISCOVERY_CACHE_KEY),
    []
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
    queryKey: ['hybrid-opportunities-discovery'],
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
    enabled: cachedDiscoveryDashboard == null || aiEnabledForOpportunities,
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
    enabled: Boolean(discoveryQuery.data) && openAISettings.hasStoredApiKey && Boolean(openAISettings.model.trim()) && !discoveryAiPaused,
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
      const topicTickers = topicNewsEntries.flatMap(([, stories]) => stories.flatMap((story) => story.tickers ?? []));
      const knownSymbols = new Set(baseInput.quotes.map((quote) => quote.symbol.toUpperCase()));
      const additionalSymbols = Array.from(new Set(
        topicTickers
          .map((symbol) => symbol.trim().toUpperCase())
          .filter((symbol) => symbol.length > 0 && !knownSymbols.has(symbol))
      ));
      const additionalQuotes = additionalSymbols.length > 0
        ? await withTimeout(fetchQuotes(additionalSymbols).catch(() => []), TOPIC_NEWS_FETCH_TIMEOUT_MS, [])
        : [];
      const keywordInput = additionalQuotes.length > 0
        ? { ...baseInput, quotes: mergeQuotes(baseInput.quotes, additionalQuotes) }
        : baseInput;

      return buildKeywordThemeDashboard(keywordInput, appliedTopics, topicNewsByTopic);
    },
    enabled: appliedTopics.length > 0 && (cachedTopicDashboard == null || aiEnabledForOpportunities),
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
    enabled: Boolean(topicQuery.data && topicQuery.data.themes.length > 0) && openAISettings.hasStoredApiKey && Boolean(openAISettings.model.trim()) && !topicAiPaused,
    staleTime: HYBRID_CACHE_TTL_MS,
    gcTime: HYBRID_CACHE_TTL_MS * 2,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 0,
  });

  useEffect(() => {
    const latestDiscoveryDashboard = discoveryAiQuery.data ?? discoveryQuery.data;
    if (latestDiscoveryDashboard) {
      writeCache(DISCOVERY_CACHE_KEY, latestDiscoveryDashboard);
    }
  }, [discoveryAiQuery.data, discoveryQuery.data]);

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

  if (!openAISettings.hasStoredApiKey) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <section className="rounded border border-terminal-border bg-terminal-panel p-6">
          <div className="flex items-center gap-2 text-terminal-accent text-sm font-bold tracking-wider">
            <AlertTriangle size={15} />
            OPENAI KEY REQUIRED
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="text-sm leading-relaxed text-terminal-muted whitespace-nowrap">
              The Opportunities workspace only populates after you add your own OpenAI API key. Open Connections & AI Settings to configure it locally, then come back here.
            </div>
            <button
              onClick={() => setActivePanel('settings')}
              className="inline-flex items-center gap-2 rounded border border-terminal-accent/40 bg-terminal-accent/10 px-3 py-2 text-xs text-terminal-accent hover:bg-terminal-accent/20 transition-colors"
            >
              OPEN SETTINGS
            </button>
            <button
              onClick={() => setActivePanel('overview')}
              className="inline-flex items-center gap-2 rounded border border-terminal-border bg-terminal-panel px-3 py-2 text-xs text-terminal-text hover:bg-terminal-hover transition-colors"
            >
              BACK TO OVERVIEW
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 xl:overflow-hidden">
      {debugMode && (
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex justify-end gap-2">
            <button
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

      <div className="grid gap-4 xl:h-full xl:min-h-0 xl:grid-cols-2">
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
              void discoveryQuery.refetch();
              void discoveryAiQuery.refetch();
            }}
            onStop={() => {
              setDiscoveryAiPaused(true);
              void queryClient.cancelQueries({ queryKey: ['hybrid-opportunities-discovery-ai'] });
            }}
            onOpenSymbol={(symbol) => setActivePanel('equity', symbol)}
          />

          <TopicPane
            dashboard={topicData}
            topicInput={topicInput}
            onTopicInputChange={setTopicInput}
            onApplyTopics={() => {
              setTopicAiPaused(false);
              setAppliedTopics(parseTopicInput(topicInput));
            }}
            onResetTopics={() => {
              const nextValue = '';
              setTopicInput(nextValue);
              setTopicAiPaused(false);
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
              void topicQuery.refetch();
              void topicAiQuery.refetch();
            }}
            onStop={() => {
              setTopicAiPaused(true);
              void queryClient.cancelQueries({ queryKey: ['hybrid-opportunities-topics-ai'] });
            }}
            onOpenSymbol={(symbol) => setActivePanel('equity', symbol)}
          />
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
