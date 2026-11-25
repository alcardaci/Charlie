import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import './OverviewPanel.css';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Loader2, Sparkles } from 'lucide-react';
import {
  fetchForexPairs,
  fetchMacroReleaseCalendar,
  fetchNewsFeed,
  fetchOpenAIKeyStatus,
  fetchPredictionForecasts,
  fetchQuotes,
  fetchSentimentSnapshot,
  generateMarketOverviewSummary,
  getOpenAIDebugPayload,
} from '../api/finance';
import type { OpenAIDebugPayloadEntry } from '../api/finance';
import { OverviewSentiment } from '../components/OverviewSentiment';
import { OverviewIndices } from '../components/OverviewIndices';
import { OverviewWatchlist } from '../components/OverviewWatchlist';
import { getHeatPaint, heatDotBackground } from '../utils/heatmapPaint';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { useTerminalStore } from '../store/useTerminalStore';
import { AIMarketSummary, NewsItem, Quote } from '../types';
import { fmt, changeColor } from '../utils/formatters';
import { buildTimestampedJsonFilename, downloadJsonFile } from '../utils/downloadJson';
import { EventsCalendar } from '../components/EventsCalendar';
import { PredictionMarketsSection } from '../components/PredictionMarketsSection';
import { DEFAULT_OVERVIEW_SUMMARY_SYSTEM_PROMPT } from '../utils/openaiConfig';
import { buildPortfolioOverviewSnapshot, normalizePortfolioCurrency, quoteCurrencyUnit, type PortfolioOverviewSnapshot } from '../utils/portfolioValuation';

const INDICES = ['^GSPC', '^DJI', '^IXIC', '^RUT', '^VIX'];
const INDEX_NAMES: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^DJI': 'Dow Jones',
  '^IXIC': 'NASDAQ',
  '^RUT': 'Russell 2000',
  '^VIX': 'CBOE VIX',
};

const SECTORS = ['XLK', 'XLF', 'XLV', 'XLE', 'XLI', 'XLC', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE'];
const SECTOR_NAMES: Record<string, string> = {
  XLK: 'Technology',
  XLF: 'Financials',
  XLV: 'Health Care',
  XLE: 'Energy',
  XLI: 'Industrials',
  XLC: 'Comm Services',
  XLY: 'Cons Disc',
  XLP: 'Cons Staples',
  XLU: 'Utilities',
  XLB: 'Materials',
  XLRE: 'Real Estate',
};

const MOVERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'BRK-B', 'JPM', 'V', 'UNH', 'JNJ', 'XOM', 'WMT', 'PG', 'AVGO', 'MA', 'HD', 'CVX', 'MRK'];

const OVERVIEW_SUMMARY_HARNESS = 'comprehensive' as const;
const US_EQUITY_MARKET_OPEN_STATES = new Set(['REGULAR']);
const OVERVIEW_SUMMARY_NEWS_TOPICS = [
  { query: 'markets', label: 'Markets' },
  { query: 'economy', label: 'Economy' },
  { query: 'geopolitics', label: 'Geopolitics' },
  { query: 'technology', label: 'Technology' },
  { query: 'energy', label: 'Energy' },
  { query: 'crypto', label: 'Crypto' },
  { query: 'healthcare', label: 'Health' },
] as const;
const OVERVIEW_SUMMARY_NEWS_PER_TOPIC = 16;
const OVERVIEW_SUMMARY_NEWS_MAX_ITEMS = 40;

type OverviewSummaryNewsEntry = {
  title: string;
  publisher: string;
  publishedAt: number;
  link: string;
  snippet: string | null;
  relatedTickers: string[];
  feedSource: NewsItem['feedSource'] | null;
  topics: string[];
};

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeOverviewQuote(quote: Quote | undefined, label: string) {
  return {
    symbol: quote?.symbol ?? label,
    label,
    price: quote?.regularMarketPrice ?? null,
    change: quote?.regularMarketChange ?? null,
    changePct: quote?.regularMarketChangePercent ?? null,
    currency: quote?.currency ?? null,
  };
}

function formatOverviewTimestamp(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

function getNewYorkDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
  weekday: string;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const year = Number.parseInt(getPart('year'), 10);
  const month = Number.parseInt(getPart('month'), 10);
  const day = Number.parseInt(getPart('day'), 10);
  const hour = Number.parseInt(getPart('hour') || '0', 10);
  const minute = Number.parseInt(getPart('minute') || '0', 10);
  const weekday = getPart('weekday');

  return {
    year: Number.isFinite(year) ? year : date.getUTCFullYear(),
    month: Number.isFinite(month) ? month : date.getUTCMonth() + 1,
    day: Number.isFinite(day) ? day : date.getUTCDate(),
    weekday: weekday || 'Mon',
    hour: Number.isFinite(hour) ? hour % 24 : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function dayOfWeekUtc(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): number {
  const firstDow = dayOfWeekUtc(year, month, 1);
  const offset = (weekday - firstDow + 7) % 7;
  return 1 + offset + (nth - 1) * 7;
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDow = dayOfWeekUtc(year, month, lastDay);
  const offset = (lastDow - weekday + 7) % 7;
  return lastDay - offset;
}

function easterSundayUtc(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return { month, day };
}

function isObservedFixedHoliday(year: number, month: number, day: number, fixedMonth: number, fixedDay: number): boolean {
  if (month === fixedMonth && day === fixedDay) return true;

  const fixedDow = dayOfWeekUtc(year, fixedMonth, fixedDay);
  if (fixedDow === 6) {
    const observed = new Date(Date.UTC(year, fixedMonth - 1, fixedDay - 1));
    return month === observed.getUTCMonth() + 1 && day === observed.getUTCDate();
  }

  if (fixedDow === 0) {
    const observed = new Date(Date.UTC(year, fixedMonth - 1, fixedDay + 1));
    return month === observed.getUTCMonth() + 1 && day === observed.getUTCDate();
  }

  return false;
}

function isNyseHoliday(year: number, month: number, day: number): boolean {
  if (isObservedFixedHoliday(year, month, day, 1, 1)) return true; // New Year's Day
  if (month === 1 && day === nthWeekdayOfMonth(year, 1, 1, 3)) return true; // MLK Day
  if (month === 2 && day === nthWeekdayOfMonth(year, 2, 1, 3)) return true; // Presidents Day

  const easter = easterSundayUtc(year);
  const goodFriday = new Date(Date.UTC(year, easter.month - 1, easter.day - 2));
  if (month === goodFriday.getUTCMonth() + 1 && day === goodFriday.getUTCDate()) return true;

  if (month === 5 && day === lastWeekdayOfMonth(year, 5, 1)) return true; // Memorial Day
  if (isObservedFixedHoliday(year, month, day, 6, 19)) return true; // Juneteenth
  if (isObservedFixedHoliday(year, month, day, 7, 4)) return true; // Independence Day
  if (month === 9 && day === nthWeekdayOfMonth(year, 9, 1, 1)) return true; // Labor Day
  if (month === 11 && day === nthWeekdayOfMonth(year, 11, 4, 4)) return true; // Thanksgiving
  if (isObservedFixedHoliday(year, month, day, 12, 25)) return true; // Christmas

  // If Jan 1 of the following year is Saturday, NYSE observes New Year's Day on Dec 31.
  if (month === 12 && day === 31 && dayOfWeekUtc(year + 1, 1, 1) === 6) return true;

  return false;
}

function isNyseRegularSessionOpen(requestedAt: Date): { open: boolean; nyDate: string; nyTime: string; isHoliday: boolean } {
  const nyParts = getNewYorkDateParts(requestedAt);
  const minutes = nyParts.hour * 60 + nyParts.minute;
  const isWeekend = nyParts.weekday === 'Sat' || nyParts.weekday === 'Sun';
  const isHoliday = isNyseHoliday(nyParts.year, nyParts.month, nyParts.day);
  const open = !isWeekend && !isHoliday && minutes >= 9 * 60 + 30 && minutes < 16 * 60;

  return {
    open,
    nyDate: `${nyParts.year}-${pad2(nyParts.month)}-${pad2(nyParts.day)}`,
    nyTime: `${pad2(nyParts.hour)}:${pad2(nyParts.minute)}`,
    isHoliday,
  };
}

function canonicalizeOverviewNewsLink(link: string): string {
  try {
    const parsed = new URL(link.trim());
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return link.trim();
  }
}

function buildOverviewSummaryNewsEntries(
  topicBuckets: Array<{ topicLabel: string; items: NewsItem[] }>
): OverviewSummaryNewsEntry[] {
  const mergedByLink = new Map<string, { item: NewsItem; topics: Set<string> }>();

  for (const bucket of topicBuckets) {
    for (const item of bucket.items) {
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const link = typeof item.link === 'string' ? item.link.trim() : '';
      if (!title || !link) continue;

      const linkKey = canonicalizeOverviewNewsLink(link);
      const existing = mergedByLink.get(linkKey);
      if (!existing) {
        mergedByLink.set(linkKey, { item: { ...item, title, link }, topics: new Set([bucket.topicLabel]) });
        continue;
      }

      existing.topics.add(bucket.topicLabel);
      if ((item.publishedAt ?? 0) > (existing.item.publishedAt ?? 0)) {
        existing.item = { ...item, title, link };
      }
    }
  }

  return Array.from(mergedByLink.values())
    .map(({ item, topics }) => ({
      title: item.title,
      publisher: item.publisher,
      publishedAt: item.publishedAt,
      link: item.link,
      snippet: item.snippet ?? null,
      relatedTickers: item.tickers ?? [],
      feedSource: item.feedSource ?? null,
      topics: Array.from(topics),
    }))
    .sort((left, right) => right.publishedAt - left.publishedAt)
    .slice(0, OVERVIEW_SUMMARY_NEWS_MAX_ITEMS);
}

async function fetchOverviewSummaryNewsMultiTopic(): Promise<OverviewSummaryNewsEntry[]> {
  const topicBuckets = await Promise.all(
    OVERVIEW_SUMMARY_NEWS_TOPICS.map(async (topic) => ({
      topicLabel: topic.label,
      items: await fetchNewsFeed(topic.query, 'all', OVERVIEW_SUMMARY_NEWS_PER_TOPIC).catch(() => []),
    }))
  );

  return buildOverviewSummaryNewsEntries(topicBuckets);
}

function buildOverviewRequestContext(
  requestedAt: Date,
  indexQuotes: Quote[],
  overviewNews: OverviewSummaryNewsEntry[]
) {
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const nyseClock = isNyseRegularSessionOpen(requestedAt);
  const quoteRegularCount = indexQuotes.filter((quote) => US_EQUITY_MARKET_OPEN_STATES.has((quote.marketState ?? '').toUpperCase())).length;
  const status = nyseClock.open ? 'open' : 'closed';
  const topicCoverage = OVERVIEW_SUMMARY_NEWS_TOPICS
    .map((topic) => ({
      topic: topic.label,
      headlineCount: overviewNews.filter((headline) => headline.topics.includes(topic.label)).length,
    }))
    .filter((entry) => entry.headlineCount > 0);

  return {
    generatedAtIso: requestedAt.toISOString(),
    generatedAtLocal: formatOverviewTimestamp(requestedAt),
    generatedAtNewYork: formatOverviewTimestamp(requestedAt, 'America/New_York'),
    localTimeZone,
    usEquitySession: {
      status,
      statusSource: 'nyse-regular-hours-clock-and-holiday-calendar',
      nyDate: nyseClock.nyDate,
      nyTime24h: nyseClock.nyTime,
      summary: status === 'open'
        ? 'US equity markets are open. Equity commentary must be framed as based on the data available up to this time, and conditions may still evolve during the session.'
        : 'US equity markets are not open. Equity commentary must be framed as based on the latest available data as of this time.',
      schedule: {
        timezone: 'America/New_York',
        regularSessionOpenTime: '09:30',
        regularSessionCloseTime: '16:00',
        holidayClosureApplied: nyseClock.isHoliday,
      },
      quoteStateSignal: {
        regularStateCount: quoteRegularCount,
        hasRegularState: quoteRegularCount > 0,
      },
      observedStates: indexQuotes.map((quote) => ({
        symbol: quote.symbol,
        label: INDEX_NAMES[quote.symbol] ?? quote.symbol,
        marketState: quote.marketState ?? 'UNKNOWN',
      })),
    },
    newsFeed: {
      headlineCount: overviewNews.length,
      topicCoverage,
      summary: overviewNews.length > 0
        ? `Snapshot includes ${overviewNews.length} recent multi-topic headlines for global context.`
        : 'Snapshot did not include major multi-topic headlines.',
    },
  };
}

function focusWatchlist(section: HTMLElement | null) {
  if (!section) return;
  section.focus({ preventScroll: true });
  section.scrollIntoView({ block: 'start' });
  useTerminalStore.setState({ watchlistFocusRequested: false });
}

export function OverviewPanel() {
  const queryClient = useQueryClient();
  const {
    setActivePanel,
    debugMode,
    openAISettings,
    portfolio,
    portfolioDisplayCurrency: displayCurrency,
    watchlistFocusRequested,
    marketOverviewSummary,
    marketOverviewSummaryCollapsed,
    updateOpenAISettings,
    setMarketOverviewSummary,
    setMarketOverviewSummaryCollapsed,
  } = useTerminalStore();
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const overviewSystemPrompt = openAISettings.systemPrompts.comprehensive?.trim() || DEFAULT_OVERVIEW_SUMMARY_SYSTEM_PROMPT;

  const today = new Date();
  const monthFrom = toYmd(new Date(today.getFullYear(), today.getMonth(), 1));
  const monthTo = toYmd(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const { data: indices = [], isLoading: loadingIdx, isError: indexError, isFetching: refreshingIndices, dataUpdatedAt: indicesUpdatedAt } = useQuery({
    queryKey: ['indices'],
    queryFn: () => fetchQuotes(INDICES),
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
  });

  const { data: sectors = [], isLoading: loadingSectors, isError: sectorError } = useQuery({
    queryKey: ['sectors'],
    queryFn: () => fetchQuotes(SECTORS),
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
  });

  const { data: movers = [], isError: moversError } = useQuery({
    queryKey: ['movers'],
    queryFn: () => fetchQuotes(MOVERS),
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
  });

  const { data: sentiment, isLoading: loadingSentiment, isError: sentimentError } = useQuery({
    queryKey: ['market-sentiment'],
    queryFn: fetchSentimentSnapshot,
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
  });

  const { data: crossAssetQuotes = [], isLoading: loadingCrossAssets, isError: crossAssetError } = useQuery({
    queryKey: ['overview-cross-asset'],
    queryFn: () => fetchQuotes([...COMMODITIES, ...CURRENCIES]),
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
  });
  const portfolioSymbols = useMemo(
    () => Array.from(new Set(portfolio.map((lot) => lot.symbol.trim().toUpperCase()))).sort(),
    [portfolio]
  );
  const { data: portfolioQuotes = [], isLoading: loadingPortfolioSnapshot, isError: portfolioQuoteError } = useQuery({
    queryKey: ['portfolio-quotes', portfolioSymbols],
    queryFn: () => fetchQuotes(portfolioSymbols),
    enabled: portfolioSymbols.length > 0,
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
  });

  const { data: predictionSnapshot, isLoading: loadingPredictions } = useQuery({
    queryKey: ['overview-predictions', 4],
    queryFn: () => fetchPredictionForecasts(4),
    refetchInterval: 2 * 60 * 1000,
    staleTime: 60 * 1000,
    retry: 1,
  });

  const { data: calendarData } = useQuery({
    queryKey: ['overview-calendar-summary', monthFrom, monthTo],
    queryFn: () => fetchMacroReleaseCalendar(monthFrom, monthTo),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const { data: keyStatus } = useQuery({
    queryKey: ['openai-key-status'],
    queryFn: fetchOpenAIKeyStatus,
    staleTime: 30000,
  });

  const { data: overviewNews = [] } = useQuery({
    queryKey: ['overview-summary-news'],
    queryFn: fetchOverviewSummaryNewsMultiTopic,
    enabled: false,
    staleTime: 120000,
    retry: 1,
  });

  useEffect(() => {
    if (typeof keyStatus?.configured === 'boolean' && keyStatus.configured !== openAISettings.hasStoredApiKey) {
      updateOpenAISettings({ hasStoredApiKey: keyStatus.configured });
    }
  }, [keyStatus?.configured, openAISettings.hasStoredApiKey, updateOpenAISettings]);

  const gainers = movers.filter((quote) => Number.isFinite(quote.regularMarketChangePercent) && quote.regularMarketChangePercent > 0).sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent).slice(0, 8);
  const losers = movers.filter((quote) => Number.isFinite(quote.regularMarketChangePercent) && quote.regularMarketChangePercent < 0).sort((a, b) => a.regularMarketChangePercent - b.regularMarketChangePercent).slice(0, 8);
  const todayYmd = toYmd(today);
  const upcomingEvents = (calendarData?.events ?? []).filter((event) => event.date >= todayYmd).slice(0, 8);
  const predictions = predictionSnapshot?.forecasts ?? [];
  const fxCurrencies = [...new Set([...portfolio.map((lot) => normalizePortfolioCurrency(lot.currency)), ...portfolioQuotes.map((quote) => quoteCurrencyUnit(quote.currency).currency)])].sort();
  const fxCurrencyKey = fxCurrencies.join(',');
  const { data: portfolioFx = [], isLoading: loadingPortfolioFx, isError: portfolioFxError } = useQuery({
    queryKey: ['portfolio-fx-rates', fxCurrencyKey, displayCurrency],
    queryFn: () => fetchForexPairs(fxCurrencies.filter((currency) => currency !== displayCurrency).map((currency) => ({ base: currency, quote: displayCurrency }))),
    enabled: portfolioSymbols.length > 0 && fxCurrencies.some((currency) => currency !== displayCurrency),
    staleTime: 300000,
    refetchInterval: 300000,
    retry: 1,
  });
  const portfolioSnapshot = useMemo(() => buildPortfolioOverviewSnapshot(portfolio, portfolioQuotes, displayCurrency, portfolioFx), [portfolio, portfolioQuotes, displayCurrency, portfolioFx]);
  const quoteIssues = [
    indexError || (!loadingIdx && indices.length < INDICES.length) ? 'major indices' : null,
    sectorError || (!loadingSectors && sectors.length < SECTORS.length) ? 'sectors' : null,
    moversError ? 'tracked-stock movers' : null,
    crossAssetError || (!loadingCrossAssets && crossAssetQuotes.length < COMMODITIES.length + CURRENCIES.length) ? 'cross-asset quotes' : null,
    sentimentError ? 'sentiment inputs' : null,
    portfolioQuoteError || portfolioFxError ? 'portfolio inputs' : null,
  ].filter((label): label is string => label != null);

  const overviewSnapshot = useMemo(() => ({
    indices: INDICES.map((symbol) => normalizeOverviewQuote(indices.find((item) => item.symbol === symbol), INDEX_NAMES[symbol] ?? symbol)),
    sectors: SECTORS.map((symbol) => normalizeOverviewQuote(sectors.find((item) => item.symbol === symbol), SECTOR_NAMES[symbol] ?? symbol)),
    gainers: gainers.map((quote) => normalizeOverviewQuote(quote, quote.symbol)),
    losers: losers.map((quote) => normalizeOverviewQuote(quote, quote.symbol)),
    commodities: COMMODITIES.map((symbol) => normalizeOverviewQuote(crossAssetQuotes.find((item) => item.symbol === symbol), COMMODITY_LABELS[symbol])),
    currencies: CURRENCIES.map((symbol) => normalizeOverviewQuote(crossAssetQuotes.find((item) => item.symbol === symbol), CURRENCY_LABELS[symbol])),
    sentiment: sentiment
      ? {
          score: sentiment.score,
          regime: sentiment.regime,
          summary: sentiment.summary,
          pillars: sentiment.pillars.map((pillar) => ({
            key: pillar.key,
            label: pillar.label,
            score: pillar.score,
            signal: pillar.signal,
            detail: pillar.detail,
            quoteTime: pillar.quoteTime == null ? null : new Date(pillar.quoteTime).toISOString(),
          })),
        }
      : null,
    calendar: upcomingEvents.map((event) => ({
      date: event.date,
      title: event.title,
      category: event.category,
      importance: event.importance,
      country: event.country ?? null,
      source: event.source ?? null,
      description: event.description ?? null,
    })),
    predictions: predictions.map((forecast) => ({
      question: forecast.question,
      event: forecast.eventTitle,
      theme: forecast.theme,
      yesProbability: forecast.yesPrice,
      noProbability: forecast.noPrice,
      yesChange24hr: forecast.yesChange24hr,
      leadingChoices: forecast.outcomeGroup?.outcomes,
      endDate: forecast.endDate,
      volume24hr: forecast.volume24hr,
    })),
    news: overviewNews,
    portfolio: portfolioSnapshot.assetCount > 0 && portfolioSnapshot.complete
      ? {
          lotCount: portfolioSnapshot.lotCount,
          assetCount: portfolioSnapshot.assetCount,
          currency: portfolioSnapshot.currency,
          valuationMethod: 'latest quotes and latest FX rates; recorded lot costs',
          totalCost: portfolioSnapshot.totalCost,
          totalValue: portfolioSnapshot.totalValue,
          gainLoss: portfolioSnapshot.gainLoss,
          gainLossPct: portfolioSnapshot.gainLossPct,
          topHoldings: portfolioSnapshot.topHoldings.map((holding) => ({
            symbol: holding.symbol,
            currentValue: holding.currentValue,
            gainLoss: holding.gainLoss,
            weightPct: holding.weightPct,
          })),
        }
      : null,
    portfolioCoverage: {
      currency: displayCurrency,
      complete: portfolioSnapshot.complete,
      missingQuotes: portfolioSnapshot.missingQuoteSymbols,
      missingFx: portfolioSnapshot.missingFxCurrencies,
    },
  }), [displayCurrency, indices, sectors, gainers, losers, crossAssetQuotes, sentiment, upcomingEvents, predictions, overviewNews, portfolioSnapshot]);

  const summaryMutation = useMutation({
    mutationFn: async () => {
      const requestedAt = new Date();
      const latestOverviewNews = await queryClient.fetchQuery({ queryKey: ['overview-summary-news'], queryFn: fetchOverviewSummaryNewsMultiTopic, staleTime: 120000 }).catch(() => overviewNews);
      const requestContext = buildOverviewRequestContext(requestedAt, indices, latestOverviewNews);

      return generateMarketOverviewSummary({
        model: openAISettings.model.trim(),
        harness: OVERVIEW_SUMMARY_HARNESS,
        systemPrompt: overviewSystemPrompt,
        snapshot: {
          ...overviewSnapshot,
          news: latestOverviewNews,
          asOf: requestContext.generatedAtIso,
          requestContext,
        },
      });
    },
    onMutate: () => {
      setSummaryError(null);
    },
    onSuccess: (result) => {
      setMarketOverviewSummary(result);
    },
    onError: (error) => {
      setSummaryError(error instanceof Error ? error.message : 'Unable to generate the AI overview summary right now.');
    },
  });

  const handleGenerateSummary = () => {
    if (!openAISettings.hasStoredApiKey && !keyStatus?.configured) {
      setSummaryError('Add an OpenAI API key in Settings before generating the overview summary.');
      return;
    }

    if (!openAISettings.model.trim()) {
      setSummaryError('Choose a model in Settings before generating the overview summary.');
      return;
    }

    void summaryMutation.mutateAsync();
  };

  const overviewSummaryPayload = getOpenAIDebugPayload('overview-summary');
  const openEquity = (symbol: string) => setActivePanel('equity', symbol);

  return <>
    <WorkspaceHeader title="MARKET OVERVIEW">
      <span className="text-terminal-faint text-[11px] sm:text-xs">
        {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </span>
    </WorkspaceHeader>
    <div className="section-stack min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
      <div className="text-[11px] text-terminal-faint" role="status">
        Public market quotes may be delayed. {refreshingIndices ? 'Refreshing…' : indicesUpdatedAt ? `Quotes fetched ${new Date(indicesUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'No quote snapshot yet.'}
      </div>
      {quoteIssues.length > 0 && <div className="rounded border border-terminal-accent/30 bg-terminal-accent/5 px-3 py-2 text-xs text-terminal-muted" role="status">Some data is unavailable or could not refresh: {quoteIssues.join(', ')}. Missing values stay blank; cached observations may still be shown.</div>}

      <AISummaryCard
        summary={marketOverviewSummary}
        isCollapsed={marketOverviewSummaryCollapsed}
        selectedModel={openAISettings.model}
        error={summaryError}
        hasApiKey={Boolean(keyStatus?.configured ?? openAISettings.hasStoredApiKey)}
        isLoading={summaryMutation.isPending}
        onGenerate={handleGenerateSummary}
        onOpenSettings={() => setActivePanel('settings')}
        onToggleCollapsed={() => setMarketOverviewSummaryCollapsed(!marketOverviewSummaryCollapsed)}
        debugMode={debugMode}
        aiPayload={overviewSummaryPayload}
      />

      <div className="overview-pair-region">
        <div className="overview-pair overview-primary-pair">
          <OverviewSentiment sentiment={sentiment} isLoading={loadingSentiment} onSelectSymbol={openEquity} />
          <OverviewIndices symbols={INDICES} names={INDEX_NAMES} quotes={indices} loading={loadingIdx} onSelect={openEquity} />
        </div>
      </div>

      <div className="overview-pair-region">
        <div className="overview-pair overview-holdings-pair">
          <PortfolioSnapshotCard
            snapshot={portfolioSnapshot}
            loading={loadingPortfolioSnapshot || loadingPortfolioFx}
            onOpenPortfolio={() => setActivePanel('portfolio')}
            onSelectSymbol={openEquity}
          />
          <OverviewWatchlist sectionRef={watchlistFocusRequested ? focusWatchlist : undefined} />
        </div>
      </div>

      {/* Sector Performance + Movers */}
      <div className="flex flex-col xl:flex-row gap-3 min-h-0">
        {/* Sector heatmap */}
        <div className="flex-1 min-w-0">
          <div className="instrument-heading text-terminal-muted text-xs mb-2 font-bold tracking-wider">SECTOR PERFORMANCE</div>
          {loadingSectors ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-1">
              {SECTORS.map((s) => <div key={s} className="shimmer h-12 rounded" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-1.5">
              {SECTORS.map((sym) => {
                const q = sectors.find((s) => s.symbol === sym);
                const pct = q && Number.isFinite(q.regularMarketChangePercent) ? q.regularMarketChangePercent : null;
                const paint = getHeatPaint(pct);

                return (
                  <button
                    key={sym}
                    type="button"
                    data-move={pct == null ? 'unavailable' : paint.tone}
                    aria-label={`Open ${SECTOR_NAMES[sym]} (${sym}), ${pct == null ? 'change unavailable' : fmt.pct(pct)}`}
                    onClick={() => setActivePanel('equity', sym)}
                    className="instrument-card overview-sector min-w-0 rounded p-2 text-left cursor-pointer hover:ring-1 hover:ring-terminal-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-terminal-accent transition-all"
                    style={{
                      '--sector-background': paint.surface,
                      '--sector-dots': heatDotBackground(paint),
                      '--sector-change-text': paint.changeText,
                    } as CSSProperties}
                  >
                    <span className="block text-terminal-text text-xs truncate">{SECTOR_NAMES[sym]}</span>
                    <span className="overview-sector-change block text-xs font-bold tabular-nums mt-0.5">
                      {fmt.pct(pct)}
                    </span>
                    <span className="block text-terminal-muted text-xs tabular-nums">{sym}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Gainers and Losers */}
        <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0 overflow-x-auto xl:overflow-visible pb-1 xl:pb-0">
          <MoverTable title="TRACKED GAINERS" data={gainers} onSelect={(s) => setActivePanel('equity', s)} />
          <MoverTable title="TRACKED LOSERS" data={losers} onSelect={(s) => setActivePanel('equity', s)} />
        </div>
      </div>

      {/* Commodities & Currencies */}
      <CommoditiesRow quotes={crossAssetQuotes} loading={loadingCrossAssets} onSelect={(s) => setActivePanel('equity', s)} />

      <PredictionMarketsSection
        predictions={predictions}
        loading={loadingPredictions}
        updatedAt={predictionSnapshot?.updatedAt ?? null}
        compact
      />

      {/* Economic Events Calendar */}
      <div className="instrument-card h-[28rem] sm:h-96 border border-terminal-border rounded overflow-hidden">
        <EventsCalendar />
      </div>
    </div>
  </>;
}

function AISummaryCard({
  summary,
  isCollapsed,
  selectedModel,
  error,
  hasApiKey,
  isLoading,
  onGenerate,
  onOpenSettings,
  onToggleCollapsed,
  debugMode,
  aiPayload,
}: {
  summary: AIMarketSummary | null;
  isCollapsed: boolean;
  selectedModel: string;
  error: string | null;
  hasApiKey: boolean;
  isLoading: boolean;
  onGenerate: () => void;
  onOpenSettings: () => void;
  onToggleCollapsed: () => void;
  debugMode: boolean;
  aiPayload: OpenAIDebugPayloadEntry | null;
}) {
  const displayModel = summary?.model ?? selectedModel ?? '--';
  const [showPayloadDebug, setShowPayloadDebug] = useState(false);

  useEffect(() => {
    if (!debugMode) setShowPayloadDebug(false);
  }, [debugMode]);

  return (
    <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot size={13} className="text-terminal-accent" />
            <span className="instrument-heading text-terminal-muted text-xs font-bold tracking-wider">AI MARKET SUMMARY</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto">
          {debugMode && (
            <button
              onClick={onOpenSettings}
              className="flex-1 sm:flex-none px-3 py-1.5 rounded border border-terminal-border text-terminal-muted text-xs hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors"
            >
              SETTINGS
            </button>
          )}
          {debugMode && (
            <button
              onClick={() => setShowPayloadDebug((current) => !current)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded border text-xs transition-colors ${
                showPayloadDebug
                  ? 'border-terminal-accent/45 bg-terminal-accent/10 text-terminal-accent'
                  : 'border-terminal-border text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover'
              }`}
            >
              {showPayloadDebug ? 'HIDE AI PAYLOAD' : 'SHOW AI PAYLOAD'}
            </button>
          )}
          {summary && !isLoading && (
            <button
              onClick={onToggleCollapsed}
              className="flex-1 sm:flex-none px-3 py-1.5 rounded border border-terminal-border text-terminal-muted text-xs hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors"
            >
              {isCollapsed ? 'EXPAND SUMMARY' : 'MINIMIZE SUMMARY'}
            </button>
          )}
          <button
            onClick={onGenerate}
            disabled={isLoading}
            className="w-full sm:w-auto px-3 py-1.5 rounded border border-terminal-accent/40 bg-terminal-accent/10 text-terminal-accent text-xs hover:bg-terminal-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'GENERATING...' : summary ? 'REGENERATE SUMMARY' : 'GENERATE SUMMARY'}
          </button>
        </div>
      </div>

      {debugMode && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-terminal-faint">
          <span>{summary ? 'Generated model' : 'Selected model'}: <span className="text-terminal-text">{displayModel}</span></span>
          <span>Summary type: <span className="text-terminal-text">Comprehensive</span></span>
          <span>API key: <span className={hasApiKey ? 'text-terminal-positive' : 'text-terminal-negative'}>{hasApiKey ? 'Configured' : 'Missing'}</span></span>
          {summary?.generatedAt && <span>Generated: <span className="text-terminal-text">{new Date(summary.generatedAt).toLocaleString('en-US')}</span></span>}
        </div>
      )}

      {debugMode && showPayloadDebug && (
        <div className="instrument-section mt-3 space-y-2 rounded border border-terminal-border bg-terminal-elevated px-3 py-3">
          <div className="text-terminal-accent text-[11px] font-bold tracking-[0.18em]">OVERVIEW AI PAYLOAD</div>
          {aiPayload ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-terminal-faint">
                <div>
                  Captured: <span className="text-terminal-text">{new Date(aiPayload.capturedAt).toLocaleString('en-US')}</span>
                </div>
                <button
                  onClick={() => downloadJsonFile(
                    buildTimestampedJsonFilename(aiPayload.route, aiPayload.capturedAt),
                    aiPayload.payload
                  )}
                  className="rounded border border-terminal-border bg-terminal-panel px-2 py-1 text-[10px] font-medium tracking-[0.08em] text-terminal-muted hover:border-terminal-accent/40 hover:text-terminal-accent hover:bg-terminal-hover transition-colors"
                >
                  DOWNLOAD JSON
                </button>
              </div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded border border-terminal-border bg-terminal-panel px-2.5 py-2 text-[11px] leading-relaxed text-terminal-text">
                {JSON.stringify(aiPayload.payload, null, 2)}
              </pre>
            </>
          ) : (
            <div className="text-xs text-terminal-faint">No payload captured yet. Generate the summary to inspect the request body.</div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded border border-terminal-negative/30 bg-terminal-negative/10 px-3 py-2 text-xs text-terminal-negative">
          {error}
        </div>
      )}

      {!summary && !error && !isLoading && (
        <div className="instrument-section mt-3 rounded border border-terminal-border bg-terminal-elevated px-3 py-3 text-xs text-terminal-muted">
          {hasApiKey
            ? 'Ready. Click generate to create a fresh AI summary of the current market overview.'
            : debugMode
              ? 'Open Settings to add your OpenAI key, choose a model, and tune the system prompt before generating.'
              : 'Use SETTINGS to add your OpenAI key and choose a model before generating.'}
        </div>
      )}

      {isLoading && (
        <div className="instrument-section mt-3 rounded border border-terminal-border bg-terminal-elevated px-3 py-3 text-xs text-terminal-muted flex items-center gap-2">
          <Loader2 size={12} className="animate-spin text-terminal-accent" />
          Building a fresh overview summary...
        </div>
      )}

      {summary && !isLoading && isCollapsed && (
        <div className="instrument-section mt-3 rounded border border-terminal-border bg-terminal-elevated px-3 py-3 text-xs text-terminal-muted">
          Summary saved. Expand it anytime to read the latest AI overview again.
        </div>
      )}

      {summary && !isLoading && !isCollapsed && (
        <div className="mt-3 rounded border border-terminal-accent/25 bg-terminal-accent/5 px-4 py-3">
          <div className="flex items-center gap-2 text-terminal-accent text-[11px] font-bold tracking-wider mb-2">
            <Sparkles size={12} />
            SUMMARY OUTPUT
          </div>
          <div className="text-terminal-text text-xs leading-relaxed whitespace-pre-line">
            {summary.summary}
          </div>
        </div>
      )}
    </div>
  );
}

function PortfolioSnapshotCard({
  snapshot,
  loading,
  onOpenPortfolio,
  onSelectSymbol,
}: {
  snapshot: PortfolioOverviewSnapshot;
  loading: boolean;
  onOpenPortfolio: () => void;
  onSelectSymbol: (symbol: string) => void;
}) {
  return (
    <section aria-label="Your portfolio snapshot">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="instrument-heading text-xs font-bold tracking-wider">YOUR PORTFOLIO SNAPSHOT</h2>
        <button
          onClick={onOpenPortfolio}
          className="px-2.5 py-1 text-[11px] rounded border border-terminal-border text-terminal-faint hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors"
        >
          OPEN PORTFOLIO
        </button>
      </div>

      {loading ? (
        <div className="shimmer h-28 rounded" />
      ) : snapshot.assetCount === 0 ? (
        <div className="instrument-card rounded border border-terminal-border bg-terminal-panel p-3 text-xs text-terminal-faint">
          No portfolio lots added yet. Add positions in Portfolio to include them in this overview snapshot.
        </div>
      ) : (
        <div className="instrument-card rounded border border-terminal-border bg-terminal-panel p-3">
          <div className="mb-2 text-[11px] text-terminal-faint">Valued in {snapshot.currency} using latest available FX rates.</div>
          {!snapshot.complete && <div className="mb-3 rounded border border-terminal-accent/30 bg-terminal-accent/5 px-2 py-1.5 text-xs text-terminal-muted" role="status">Portfolio valuation is incomplete. {snapshot.missingQuoteSymbols.length > 0 && `Missing quotes: ${snapshot.missingQuoteSymbols.join(', ')}. `}{snapshot.missingFxCurrencies.length > 0 && `Missing FX: ${snapshot.missingFxCurrencies.join(', ')}. `}Current value, P&L, and allocation are withheld until coverage is complete.</div>}
          <div className="flex flex-wrap gap-2">
            <SnapshotStat label="ASSETS" value={String(snapshot.assetCount)} />
            <SnapshotStat label="LOTS" value={String(snapshot.lotCount)} />
            <SnapshotStat label="TOTAL VALUE" value={formatSnapshotCurrency(snapshot.totalValue, snapshot.currency)} />
            <SnapshotStat label="TOTAL COST" value={formatSnapshotCurrency(snapshot.totalCost, snapshot.currency)} />
            <SnapshotStat
              label="TOTAL P&L"
              value={snapshot.gainLoss == null ? '—' : `${formatSnapshotCurrency(snapshot.gainLoss, snapshot.currency)} (${fmt.pct(snapshot.gainLossPct)})`}
              tone={snapshot.gainLoss == null || snapshot.gainLoss === 0 ? 'neutral' : snapshot.gainLoss > 0 ? 'positive' : 'negative'}
            />
          </div>

          {snapshot.complete && <div className="mt-3">
            <div className="text-terminal-muted text-[11px] font-bold tracking-wide mb-1.5">TOP HOLDINGS</div>
            <div className="flex flex-wrap gap-1.5">
              {snapshot.topHoldings.map((holding) => (
                <button
                  key={holding.symbol}
                  onClick={() => onSelectSymbol(holding.symbol)}
                  className="rounded border border-terminal-border bg-terminal-panel px-2.5 py-1.5 text-[11px] hover:border-terminal-accent/35 hover:text-terminal-accent hover:bg-terminal-hover transition-colors"
                >
                  <span className="text-terminal-text font-bold">{holding.symbol}</span>{' '}
                  <span className="text-terminal-muted font-medium">{formatSnapshotCurrency(holding.currentValue, snapshot.currency)} · {fmt.pct(holding.weightPct)}</span>
                </button>
              ))}
            </div>
          </div>}
        </div>
      )}
    </section>
  );
}

function formatSnapshotCurrency(value: number | null, currency: string): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function SnapshotStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
}) {
  const valueClass = tone === 'positive'
    ? 'text-terminal-positive'
    : tone === 'negative'
      ? 'text-terminal-negative'
      : 'text-terminal-text';

  return (
    <div className="instrument-section min-w-0 flex-[1_1_8rem] rounded border border-terminal-border bg-terminal-elevated px-3 py-2.5 shadow-sm">
      <div className="text-terminal-muted text-[10px] font-bold tracking-[0.18em]">{label}</div>
      <div className={`font-bold text-sm mt-1 tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}

function MoverTable({ title, data, onSelect }: {
  title: string;
  data: Quote[];
  onSelect: (symbol: string) => void;
}) {
  return (
    <div className="w-full sm:w-52 flex-shrink-0">
      <div className="instrument-heading text-terminal-muted text-xs mb-2 font-bold tracking-wider">{title}</div>
      <div className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th className="text-left">SYM</th>
              <th>PRICE</th>
              <th>CHG%</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={3} className="text-terminal-faint text-xs">No matching moves in the tracked stock sample.</td></tr>}
            {data.map((q) => (
              <tr key={q.symbol} onClick={() => onSelect(q.symbol)} className="cursor-pointer">
                <td className="text-terminal-accent font-bold">{q.symbol}</td>
                <td className="tabular-nums">{fmt.price(q.regularMarketPrice)}</td>
                <td className={`tabular-nums font-bold ${changeColor(q.regularMarketChangePercent)}`}>
                  {fmt.pct(q.regularMarketChangePercent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const COMMODITIES = ['GC=F', 'CL=F', 'SI=F', 'NG=F', 'HG=F'];
const CURRENCIES = ['EURUSD=X', 'USDJPY=X', 'GBPUSD=X', 'USDCHF=X', 'AUDUSD=X'];
const COMMODITY_LABELS: Record<string, string> = {
  'GC=F': 'Gold', 'CL=F': 'Crude Oil', 'SI=F': 'Silver', 'NG=F': 'Nat Gas', 'HG=F': 'Copper'
};
const CURRENCY_LABELS: Record<string, string> = {
  'EURUSD=X': 'EUR/USD', 'USDJPY=X': 'USD/JPY', 'GBPUSD=X': 'GBP/USD',
  'USDCHF=X': 'USD/CHF', 'AUDUSD=X': 'AUD/USD',
};

function CommoditiesRow({
  quotes,
  loading,
  onSelect,
}: {
  quotes: Quote[];
  loading: boolean;
  onSelect: (s: string) => void;
}) {
  const Row = ({ sym, label }: { sym: string; label: string }) => {
    const q = quotes.find((c) => c.symbol === sym);
    return (
      <tr onClick={() => onSelect(sym)} className="cursor-pointer">
        <td className="text-terminal-muted">{label}</td>
        <td className="tabular-nums">{fmt.price(q?.regularMarketPrice, q?.currency === 'JPY' ? 2 : undefined)}</td>
        <td className={`tabular-nums ${changeColor(q?.regularMarketChangePercent)}`}>
          {fmt.pct(q?.regularMarketChangePercent)}
        </td>
      </tr>
    );
  };

  return (
    <div className="flex flex-col md:flex-row gap-3">
      <div className="flex-1">
        <div className="instrument-heading text-terminal-muted text-xs mb-2 font-bold tracking-wider">COMMODITIES</div>
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-hidden">
          {loading ? <div className="shimmer h-32 rounded" /> : (
            <table className="data-table">
              <thead><tr><th className="text-left">ASSET</th><th>PRICE</th><th>CHG%</th></tr></thead>
              <tbody>{COMMODITIES.map((s) => <Row key={s} sym={s} label={COMMODITY_LABELS[s]} />)}</tbody>
            </table>
          )}
        </div>
      </div>
      <div className="flex-1">
        <div className="instrument-heading text-terminal-muted text-xs mb-2 font-bold tracking-wider">FX RATES</div>
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-hidden">
          {loading ? <div className="shimmer h-32 rounded" /> : (
            <table className="data-table">
              <thead><tr><th className="text-left">PAIR</th><th>RATE</th><th>CHG%</th></tr></thead>
              <tbody>{CURRENCIES.map((s) => <Row key={s} sym={s} label={CURRENCY_LABELS[s]} />)}</tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
