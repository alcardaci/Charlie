import { readEventFeed, saveEventFeed } from '../utils/newsCoverage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bug, ExternalLink, Info, Minus, RefreshCw, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';
import {
  aggregateGeopoliticalStoriesToCountries,
  cachedGeopoliticalEvents,
  fetchGeopoliticalGdeltHeadlines,
  fetchGeopoliticalYahooHeadlines,
  selectEventCandidates,
  fetchGeopoliticalCountrySummaries,
  getCachedGeopoliticalCountrySummaries,
  reviewGeopoliticalEvents,
  fetchGeopoliticalRiskSnapshot,
  fetchOpenAIKeyStatus,
  getOpenAIDebugPayload,
} from '../api/finance';
import type { OpenAIDebugPayloadEntry } from '../api/finance';
import { RegionalNewsMap } from '../components/RegionalNewsMap';
import { useTerminalStore } from '../store/useTerminalStore';
import type { CountryNewsCount, GeopoliticalScanStatus, NewsItem } from '../types';
import { GeopoliticalRiskPoint, GeopoliticalRiskSnapshot } from '../types';
import { changeColor, fmt } from '../utils/formatters';
import { DEFAULT_GEOPOLITICS_OPENAI_MODEL } from '../utils/openaiConfig';
import { buildTimestampedJsonFilename, downloadJsonFile } from '../utils/downloadJson';
import { getThemePalette, useTheme } from '../utils/theme';

type TimeframeOption = {
  key: '1h' | '6h' | '24h' | '72h' | '7d';
  label: string;
  hours: number;
};

const TIMEFRAMES: TimeframeOption[] = [
  { key: '1h', label: '1H', hours: 1 },
  { key: '6h', label: '6H', hours: 6 },
  { key: '24h', label: '24H', hours: 24 },
  { key: '72h', label: '3D', hours: 72 },
  { key: '7d', label: '7D', hours: 168 },
];

const GPR_METRIC_SOURCE = 'Official Caldara-Iacoviello recent daily geopolitical risk dataset.';
const GPR_CHART_TIMEFRAMES = [
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '5y', label: '5Y' },
] as const;

type GprChartTimeframeKey = (typeof GPR_CHART_TIMEFRAMES)[number]['key'];

function formatRiskDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatRiskShortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function getRiskChartData(series: GeopoliticalRiskPoint[], timeframe: GprChartTimeframeKey) {
  const latest = series.length ? series[series.length - 1] : null;
  if (!latest) return [];

  const cutoff = new Date(`${latest.date}T00:00:00Z`);
  switch (timeframe) {
    case '30d':
      cutoff.setDate(cutoff.getDate() - 30);
      break;
    case '90d':
      cutoff.setDate(cutoff.getDate() - 90);
      break;
    case '6m':
      cutoff.setMonth(cutoff.getMonth() - 6);
      break;
    case '1y':
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      break;
    case '5y':
      cutoff.setFullYear(cutoff.getFullYear() - 5);
      break;
  }

  const cutoffTime = cutoff.getTime();
  return series
    .filter((point) => new Date(`${point.date}T00:00:00Z`).getTime() >= cutoffTime)
    .map((point) => ({
      ...point,
      label: formatRiskShortDate(point.date),
    }));
}

function InfoTooltip({
  label,
  description,
  source,
  align = 'left',
}: {
  label: string;
  description: string;
  source: string;
  align?: 'left' | 'right';
}) {
  return (
    <div className="relative flex-shrink-0 group/tooltip">
      <button
        type="button"
        className="text-terminal-faint hover:text-terminal-accent transition-colors"
        aria-label={`About ${label}`}
      >
        <Info size={12} />
      </button>
      <div
        className={`pointer-events-none absolute top-5 z-20 w-64 rounded border border-terminal-border bg-terminal-elevated p-3 opacity-0 shadow-2xl transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        <div className="text-terminal-accent text-[11px] font-bold tracking-wide">{label.toUpperCase()}</div>
        <div className="text-terminal-text text-xs leading-relaxed mt-1">{description}</div>
        <div className="text-terminal-faint text-[11px] leading-relaxed mt-2">{source}</div>
      </div>
    </div>
  );
}

function LabeledMetric({
  label,
  value,
  description,
  source,
  align = 'left',
}: {
  label: string;
  value: string;
  description: string;
  source: string;
  align?: 'left' | 'right';
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] tracking-wide text-terminal-faint">
        <span>{label}</span>
        <InfoTooltip label={label} description={description} source={source} align={align} />
      </div>
      <div className="text-xs font-semibold tabular-nums text-terminal-text">{value}</div>
    </div>
  );
}

function GeopoliticsPayloadBlock({
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

function RiskIndexReadings({ snapshot }: { snapshot: GeopoliticalRiskSnapshot }) {
  useTheme();
  const [chartTimeframe, setChartTimeframe] = useState<GprChartTimeframeKey>('30d');
  const themePalette = getThemePalette();
  const dailyColor = themePalette.accent;
  const averageColor = themePalette.muted;
  const latest = snapshot.latest;
  const change = snapshot.change;
  const riskRising = change != null && change > 0;
  const DeltaIcon = !change ? Minus : riskRising ? TrendingUp : TrendingDown;
  const chartData = getRiskChartData(snapshot.series, chartTimeframe);
  const chartMin = Math.min(...chartData.flatMap((point) => [point.value, point.movingAverage7]));
  const chartMax = Math.max(...chartData.flatMap((point) => [point.value, point.movingAverage7]));
  const chartPadding = Math.max((chartMax - chartMin) * 0.14, 18);
  const yDomain: [number, number] = [Math.max(0, chartMin - chartPadding), chartMax + chartPadding];

  return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <strong className="instrument-value text-2xl leading-tight tabular-nums text-terminal-text">{fmt.number(latest.value, 2)}</strong>
          <div className={`inline-flex items-center gap-1 text-xs tabular-nums ${changeColor(change)}`}>
            <DeltaIcon size={12} />
            {change == null ? 'Prior change unavailable' : `${fmt.change(change, 2)} (${fmt.pct(snapshot.changePct)})`}
          </div>
          <span className="text-[11px] text-terminal-muted">{formatRiskDate(latest.date)}</span>
          <InfoTooltip label="Official daily GPR" description={snapshot.methodology} source={snapshot.cadence} align="right" />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <LabeledMetric label="ACTS" value={fmt.number(latest.acts, 1)}
            description="Realized geopolitical events in the index, including attacks, wars and other escalations." source={GPR_METRIC_SOURCE} />
          <LabeledMetric label="THREATS" value={fmt.number(latest.threats, 1)}
            description="Geopolitical threats, tensions and warnings in newspaper coverage." source={GPR_METRIC_SOURCE} />
          <LabeledMetric label="7D AVG" value={fmt.number(latest.movingAverage7, 1)}
            description="Seven-day moving average of the daily index." source={GPR_METRIC_SOURCE} />
          <LabeledMetric label="7D RANGE" value={snapshot.weeklyLow == null || snapshot.weeklyHigh == null ? '—' : `${fmt.number(snapshot.weeklyLow, 1)}–${fmt.number(snapshot.weeklyHigh, 1)}`}
            description="Lowest and highest readings in the last seven published observations." source={GPR_METRIC_SOURCE} align="right" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex items-center gap-3 text-[10px] text-terminal-muted">
            <span className="inline-flex items-center gap-1"><span className="w-3 border-t-2 border-dotted" style={{ borderColor: dailyColor }} /> Daily GPR</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 border-t-2 border-dashed" style={{ borderColor: averageColor }} /> 7D average</span>
          </div>
          <div className="flex" aria-label="Risk index time frame">
            {GPR_CHART_TIMEFRAMES.map(option => <button key={option.key} type="button" aria-pressed={option.key === chartTimeframe}
              onClick={() => setChartTimeframe(option.key)} className={`rounded px-1.5 py-0.5 text-[10px] ${option.key === chartTimeframe ? 'bg-terminal-accent text-terminal-on-accent' : 'text-terminal-muted hover:bg-terminal-hover'}`}>
              {option.label}
            </button>)}
          </div>
        </div>
        <div className="min-h-0 flex-1" role="img" aria-label="Daily geopolitical risk index and seven-day moving average">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 14, right: 12, left: 6, bottom: 10 }}>
                <defs>
                  <linearGradient id="gprArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={dailyColor} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={dailyColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={themePalette.chartGrid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: themePalette.muted, fontSize: 10 }}
                  axisLine={{ stroke: themePalette.border }}
                  tickLine={false}
                  minTickGap={26}
                  label={{
                    value: 'Observation date (UTC)',
                    position: 'insideBottom',
                    offset: -2,
                    fill: themePalette.muted,
                    fontSize: 10,
                  }}
                />
                <YAxis
                  tick={{ fill: themePalette.muted, fontSize: 10 }}
                  axisLine={{ stroke: themePalette.border }}
                  tickLine={false}
                  tickFormatter={(value: number) => value.toFixed(0)}
                  width={42}
                  domain={yDomain}
                  label={{
                    value: 'GPR index level',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 6,
                    fill: themePalette.muted,
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  contentStyle={{ background: themePalette.elevated, border: `1px solid ${themePalette.border}`, borderRadius: '4px', fontSize: '11px' }}
                  labelStyle={{ color: themePalette.text, fontWeight: 'bold' }}
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload as { date?: string } | undefined;
                    return item?.date ? formatRiskDate(item.date) : '';
                  }}
                  formatter={(value: number, name: string) => [
                    fmt.number(value, 2),
                    name === 'movingAverage7' ? '7D average' : 'Global daily GPR',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={dailyColor}
                  strokeWidth={2.2}
                  strokeDasharray="0.2 4"
                  strokeLinecap="round"
                  fill="url(#gprArea)"
                  dot={false}
                  activeDot={{ r: 4, fill: dailyColor, strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="movingAverage7"
                  stroke={averageColor}
                  strokeWidth={2.2}
                  dot={false}
                  strokeDasharray="4 4"
                  activeDot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
        </div>
        <footer className="flex shrink-0 flex-wrap items-baseline gap-x-3 text-[10px] leading-tight text-terminal-muted">
          <span>{snapshot.cadence}</span>
          <a href={snapshot.dataUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-terminal-accent">Raw data</a>
          <span>{snapshot.license}</span>
        </footer>
      </div>
  );
}

type GeopoliticsMonitorState = ReturnType<typeof useGeopoliticsMonitorState>;

type GeopoliticalCountrySummaryState = {
  countryCounts: CountryNewsCount[];
  loadingCountrySummaries: boolean;
  fetchingCountrySummaries: boolean;
};

function useGeopoliticalCountrySummaryState(
  baseCountryCounts: CountryNewsCount[],
  lookbackHours: number,
  model: string,
  enabled: boolean
): GeopoliticalCountrySummaryState {
  const [summaryRecords, setSummaryRecords] = useState<Record<string, {
    hotspotSummary: string;
    hotspotSummarySources: NonNullable<CountryNewsCount['hotspotSummarySources']>;
  }>>({});
  const [summaryStatuses, setSummaryStatuses] = useState<Record<string, NonNullable<CountryNewsCount['hotspotSummaryStatus']>>>({});
  const [loadingCountrySummaries, setLoadingCountrySummaries] = useState(false);
  const [fetchingCountrySummaries, setFetchingCountrySummaries] = useState(false);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    const activeCountries = baseCountryCounts.filter((country) => country.count > 0 && (country.stories ?? []).length > 0);

    if (!enabled || !activeCountries.length) {
      requestVersionRef.current += 1;
      setSummaryRecords({});
      setSummaryStatuses({});
      setLoadingCountrySummaries(false);
      setFetchingCountrySummaries(false);
      return;
    }

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    const abortController = new AbortController();
    const cachedSummaries = getCachedGeopoliticalCountrySummaries(activeCountries, lookbackHours, model);
    const cachedCountryCodes = new Set(Object.keys(cachedSummaries));

    setSummaryRecords(cachedSummaries);
    setSummaryStatuses(
      activeCountries.reduce<Record<string, NonNullable<CountryNewsCount['hotspotSummaryStatus']>>>((acc, country) => {
        const countryCode = country.countryCode.toUpperCase();
        acc[countryCode] = cachedCountryCodes.has(countryCode) ? 'ready' : 'loading';
        return acc;
      }, {})
    );

    const missingCountries = activeCountries.filter(
      (country) => !cachedCountryCodes.has(country.countryCode.toUpperCase())
    );

    if (!missingCountries.length) {
      setLoadingCountrySummaries(false);
      setFetchingCountrySummaries(false);
      return;
    }

    setLoadingCountrySummaries(cachedCountryCodes.size === 0);
    setFetchingCountrySummaries(true);

    void fetchGeopoliticalCountrySummaries(
      missingCountries,
      lookbackHours,
      model,
      (chunkSummaries) => {
        if (requestVersionRef.current !== requestVersion || !Object.keys(chunkSummaries).length) return;

        setSummaryRecords((current) => ({ ...current, ...chunkSummaries }));
        setSummaryStatuses((current) => ({
          ...current,
          ...Object.fromEntries(
            Object.keys(chunkSummaries).map((countryCode) => [countryCode, 'ready'] as const)
          ),
        }));
        setLoadingCountrySummaries(false);
      },
      abortController.signal
    ).then(({ summariesByCountryCode, failedCountryCodes }) => {
      if (requestVersionRef.current !== requestVersion) return;

      if (Object.keys(summariesByCountryCode).length) {
        setSummaryRecords((current) => ({ ...current, ...summariesByCountryCode }));
      }

      setSummaryStatuses((current) => {
        const nextStatuses = { ...current };
        Object.keys(summariesByCountryCode).forEach((countryCode) => {
          nextStatuses[countryCode] = 'ready';
        });
        failedCountryCodes.forEach((countryCode) => {
          if (!nextStatuses[countryCode] || nextStatuses[countryCode] === 'loading') {
            nextStatuses[countryCode] = 'error';
          }
        });
        return nextStatuses;
      });
      setLoadingCountrySummaries(false);
      setFetchingCountrySummaries(false);
    }).catch(() => {
      if (requestVersionRef.current !== requestVersion || abortController.signal.aborted) return;
      setLoadingCountrySummaries(false);
      setFetchingCountrySummaries(false);
      setSummaryStatuses(Object.fromEntries(activeCountries.map((country) => [country.countryCode.toUpperCase(), 'error'])));
    });

    return () => {
      abortController.abort();
      if (requestVersionRef.current === requestVersion) {
        requestVersionRef.current += 1;
      }
    };
  }, [baseCountryCounts, enabled, lookbackHours, model]);

  return {
    countryCounts: baseCountryCounts.map((country) => {
      const countryCode = country.countryCode.toUpperCase();
      const summaryRecord = summaryRecords[countryCode];
      const hasStories = country.count > 0 && (country.stories ?? []).length > 0;

      return {
        ...country,
        hotspotSummary: summaryRecord?.hotspotSummary,
        hotspotSummarySources: summaryRecord?.hotspotSummarySources,
        hotspotSummaryStatus: hasStories ? (summaryStatuses[countryCode] ?? 'idle') : 'idle',
      };
    }),
    loadingCountrySummaries,
    fetchingCountrySummaries,
  };
}

const EMPTY_HEADLINES: NewsItem[] = [];
const EVENT_FEED_POLICY = { staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, retry: 1, refetchOnWindowFocus: false };
function sourceStatus(name: string, count: number, pending: boolean, failed: boolean) {
  if (failed) return count ? `${name} · ${count} from last refresh` : `${name} unavailable`;
  return pending ? `${name} loading…` : `${name} · ${count} articles`;
}

function useGeopoliticsMonitorState() {
  const [timeframe, setTimeframe] = useState<TimeframeOption>(TIMEFRAMES[2]);
  const [showPromptDebug, setShowPromptDebug] = useState(false);
  const [showPayloadDebug, setShowPayloadDebug] = useState(false);
  const { openAISettings, updateOpenAISettings, debugMode } = useTerminalStore();
  const geopoliticsModel = openAISettings.geopoliticsModel?.trim() || DEFAULT_GEOPOLITICS_OPENAI_MODEL;
  const { data: keyStatus, isPending: checkingKey, isError: keyCheckFailed, refetch: refetchKey } = useQuery({ queryKey: ['openai-key-status'], queryFn: fetchOpenAIKeyStatus, staleTime: 30_000 });
  const aiAvailable = keyStatus?.configured ?? openAISettings.hasStoredApiKey;
  useEffect(() => {
    if (typeof keyStatus?.configured === 'boolean' && keyStatus.configured !== openAISettings.hasStoredApiKey)
      updateOpenAISettings({ hasStoredApiKey: keyStatus.configured });
  }, [keyStatus?.configured, openAISettings.hasStoredApiKey, updateOpenAISettings]);

  const hours = timeframe.hours;
  const savedFeeds = useMemo(() => ({ yahoo: readEventFeed('yahoo-finance', hours), gdelt: readEventFeed('gdelt', hours) }), [hours]);
  const yahoo = useQuery({ ...EVENT_FEED_POLICY, initialData: savedFeeds.yahoo?.items, initialDataUpdatedAt: savedFeeds.yahoo?.at, queryKey: ['event-headlines-yahoo', hours],
    queryFn: async ({ signal }) => saveEventFeed('yahoo-finance', hours, await fetchGeopoliticalYahooHeadlines(hours, signal)) });
  const gdelt = useQuery({ ...EVENT_FEED_POLICY, initialData: savedFeeds.gdelt?.items, initialDataUpdatedAt: savedFeeds.gdelt?.at, queryKey: ['event-headlines-gdelt', hours],
    queryFn: async ({ signal }) => saveEventFeed('gdelt', hours, await fetchGeopoliticalGdeltHeadlines(hours, undefined, signal)) });
  const headlines = useMemo(() => selectEventCandidates([...(yahoo.data ?? EMPTY_HEADLINES), ...(gdelt.data ?? EMPTY_HEADLINES)], hours),
    [yahoo.data, gdelt.data, yahoo.dataUpdatedAt, gdelt.dataUpdatedAt, yahoo.errorUpdatedAt, gdelt.errorUpdatedAt, hours]);
  const now = Date.now();
  const recent = (items: NewsItem[] | undefined) => items?.filter(h => h.publishedAt >= now - hours * 3600000 && h.publishedAt <= now) ?? [];
  const gdeltItems = recent(gdelt.data);
  const hasArchive = gdeltItems.some(h => h.gdeltCollection === 'GKG');
  const cachedGdelt = gdeltItems.some(h => h.gdeltCached);
  const source = [
    sourceStatus('Yahoo Finance', recent(yahoo.data).length, yahoo.isPending, yahoo.isError),
    sourceStatus(hasArchive ? 'GDELT archive' : 'GDELT', gdeltItems.length, gdelt.isPending, gdelt.isError || cachedGdelt),
  ].join('   ·   ');
  const pendingFeeds = yahoo.isPending || gdelt.isPending;
  const readyForAI = aiAvailable && !pendingFeeds && headlines.length > 0;
  const reviewOptions = useMemo(() => ({
    enableAI: aiAvailable, model: geopoliticsModel, systemPrompt: openAISettings.geopoliticsSystemPrompt, debugMode,
  }), [aiAvailable, geopoliticsModel, openAISettings.geopoliticsSystemPrompt, debugMode]);
  const cachedStories = useMemo(() => cachedGeopoliticalEvents(headlines, reviewOptions), [headlines, reviewOptions]);
  const analysis = useQuery({
    queryKey: ['news-event-analysis-ai-only', hours, geopoliticsModel, openAISettings.geopoliticsSystemPrompt, headlines.map(h => [h.link, h.title, h.publishedAt])],
    queryFn: ({ signal }) => reviewGeopoliticalEvents(headlines, hours, { ...reviewOptions, signal }),
    enabled: readyForAI,
    staleTime: 15 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: query => query.state.status === 'error' || query.state.data?.failed ? 5 * 60_000 : false,
  });
  const result = readyForAI ? analysis.data : undefined;
  const reviewedStories = aiAvailable ? result?.stories ?? cachedStories : EMPTY_HEADLINES;
  const hasCompletedBatch = Boolean(result && result.batches > result.failed);
  const hasReview = hasCompletedBatch || reviewedStories.length > 0;
  const sourcePartial = yahoo.isError || gdelt.isError || cachedGdelt;
  const reviewFailed = analysis.isError || Boolean(result?.failed);
  const partial = pendingFeeds || sourcePartial || reviewFailed || !hasCompletedBatch;
  const lastClassifiedAt = hasCompletedBatch ? analysis.dataUpdatedAt : undefined;
  const counts = useMemo(() => aggregateGeopoliticalStoriesToCountries(reviewedStories, source, 'geopolitics',
    { isPartial: partial, lastClassifiedAt }), [reviewedStories, source, partial, lastClassifiedAt]);
  const summaries = useGeopoliticalCountrySummaryState(counts, hours, geopoliticsModel, hasReview && aiAvailable);

  let scanStatus: GeopoliticalScanStatus = 'complete';
  let scanStatusLabel = 'Complete';
  let analysisLabel = 'Events reviewed with OpenAI.';
  if (!aiAvailable) {
    scanStatus = keyCheckFailed ? 'error' : 'idle';
    scanStatusLabel = checkingKey ? 'Connecting' : keyCheckFailed ? 'Connection unavailable' : 'OpenAI required';
    analysisLabel = checkingKey ? 'Checking the OpenAI connection.'
      : keyCheckFailed ? 'Unable to check the OpenAI connection. Use Refresh to try again.'
        : 'Connect OpenAI in Settings to see event assessments.';
  } else if (pendingFeeds) {
    scanStatus = 'fetching-feeds';
    scanStatusLabel = 'Fetching feeds';
    analysisLabel = hasReview ? 'Showing previous OpenAI assessments while the feeds load.' : 'Waiting for headlines to review.';
  } else if (!headlines.length) {
    scanStatus = sourcePartial ? 'partial' : 'complete';
    scanStatusLabel = sourcePartial ? 'Partial coverage' : 'No headlines';
    analysisLabel = 'No headlines are available to review in this time frame.';
  } else if (analysis.isFetching || !result && !reviewFailed) {
    scanStatus = 'classifying';
    scanStatusLabel = 'Reviewing events';
    analysisLabel = hasReview ? 'Updating the map. Previous OpenAI assessments are shown.' : 'Reviewing headlines with OpenAI.';
  } else if (reviewFailed) {
    scanStatus = hasReview ? 'partial' : 'error';
    scanStatusLabel = hasReview ? 'Partial review' : 'Review unavailable';
    analysisLabel = hasReview ? 'OpenAI could not finish the review. Only reviewed events are shown.'
      : 'OpenAI could not review these headlines. Use Refresh to try again.';
  } else if (sourcePartial) {
    scanStatus = 'partial';
    scanStatusLabel = 'Partial coverage';
    analysisLabel = 'Events reviewed with OpenAI using the available headlines.';
  }
  return {
    timeframe, setTimeframe, debugMode, geopoliticsModel, openAISettings, scanStatus, scanStatusLabel, source, analysisLabel, hasArchive, hasReview,
    showPromptDebug, setShowPromptDebug, showPayloadDebug, setShowPayloadDebug,
    countryCounts: summaries.countryCounts, fetchingCountrySummaries: summaries.fetchingCountrySummaries,
    fetchingCountryCounts: yahoo.isFetching || gdelt.isFetching || analysis.isFetching,
    loadingCountryCounts: pendingFeeds && !headlines.length,
    refetchCountryCounts: () => {
      void yahoo.refetch();
      void gdelt.refetch();
      if (!aiAvailable) void refetchKey();
      if (readyForAI && reviewFailed) void analysis.refetch();
    },
    geopoliticalPipelinePayload: { route: 'geopolitical-pipeline', capturedAt: new Date(Math.max(yahoo.dataUpdatedAt, gdelt.dataUpdatedAt)).toISOString(),
      payload: { sources: source, candidates: headlines.length, reviewedEvents: reviewedStories.length, aiBatches: result?.batches, failedBatches: result?.failed } } as OpenAIDebugPayloadEntry,
    geopoliticalEventsPayload: getOpenAIDebugPayload('geopolitical-events'),
    countrySummariesPayload: getOpenAIDebugPayload('geopolitical-country-summaries'),
  };
}

function GeopoliticsMonitorControls({
  state,
  showRefresh = true,
}: {
  state: GeopoliticsMonitorState;
  showRefresh?: boolean;
}) {
  const {
    debugMode,
    showPromptDebug,
    setShowPromptDebug,
    showPayloadDebug,
    setShowPayloadDebug,
    fetchingCountryCounts,
    fetchingCountrySummaries,
  } = state;

  return (
    <div className="flex items-center gap-2">
      {debugMode && (
        <>
          <button
            onClick={() => setShowPromptDebug((current) => !current)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs transition-colors ${
              showPromptDebug
                ? 'border-terminal-accent/45 bg-terminal-accent/10 text-terminal-accent'
                : 'border-terminal-border text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover'
            }`}
            title={showPromptDebug ? 'Hide geopolitics AI debug' : 'Show geopolitics AI debug'}
          >
            <Bug size={11} />
            {showPromptDebug ? 'HIDE AI DEBUG' : 'SHOW AI DEBUG'}
          </button>
          <button
            onClick={() => setShowPayloadDebug((current) => !current)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs transition-colors ${
              showPayloadDebug
                ? 'border-terminal-accent/45 bg-terminal-accent/10 text-terminal-accent'
                : 'border-terminal-border text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover'
            }`}
            title={showPayloadDebug ? 'Hide geopolitics AI payloads' : 'Show geopolitics AI payloads'}
          >
            <Bug size={11} />
            {showPayloadDebug ? 'HIDE AI PAYLOADS' : 'SHOW AI PAYLOADS'}
          </button>
        </>
      )}

      {showRefresh ? (
        <button
          onClick={() => {
            void state.refetchCountryCounts();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-terminal-border text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors text-xs"
          disabled={fetchingCountryCounts || fetchingCountrySummaries}
          title="Refresh geopolitical monitor"
        >
          <RefreshCw
            size={11}
            className={fetchingCountryCounts || fetchingCountrySummaries ? 'animate-spin' : ''}
          />
          REFRESH
        </button>
      ) : null}
    </div>
  );
}

function GeopoliticsDebugPanels({
  state,
  variant = 'inline',
}: {
  state: GeopoliticsMonitorState;
  variant?: 'inline' | 'overlay';
}) {
  const {
    debugMode,
    showPromptDebug,
    showPayloadDebug,
    geopoliticsModel,
    openAISettings,
    geopoliticalPipelinePayload,
    geopoliticalEventsPayload,
    countrySummariesPayload,
  } = state;

  if (!debugMode || (!showPromptDebug && !showPayloadDebug)) {
    return null;
  }

  const wrapperClassName = variant === 'overlay'
    ? 'pointer-events-auto w-full max-w-3xl space-y-3'
    : 'space-y-3';
  const panelClassName = variant === 'overlay'
    ? 'rounded border border-terminal-border bg-terminal-panel/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur'
    : 'rounded border border-terminal-border bg-terminal-panel p-3';

  return (
    <div className={wrapperClassName}>
      {showPromptDebug && (
        <div className={`instrument-section ${panelClassName} space-y-3`}>
          <div className="text-terminal-accent text-xs font-bold tracking-[0.18em]">GEOPOL AI DEBUG</div>
          <div className="text-xs text-terminal-muted">
            Model: <span className="text-terminal-text">{geopoliticsModel}</span>
          </div>
          <div>
            <div className="text-[11px] text-terminal-faint tracking-[0.16em] font-bold mb-1">SYSTEM PROMPT</div>
            <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded border border-terminal-border bg-terminal-elevated px-2.5 py-2 text-[11px] leading-relaxed text-terminal-text">
              {openAISettings.geopoliticsSystemPrompt?.trim() || '—'}
            </pre>
          </div>
        </div>
      )}

      {showPayloadDebug && (
        <div className={`instrument-section ${panelClassName} space-y-3`}>
          <div className="text-terminal-accent text-xs font-bold tracking-[0.18em]">GEOPOL AI PAYLOAD DEBUG</div>
          <GeopoliticsPayloadBlock title="Pipeline Stage Debug" payload={geopoliticalPipelinePayload} />
          <GeopoliticsPayloadBlock title="Headline Extraction Request" payload={geopoliticalEventsPayload} />
          <GeopoliticsPayloadBlock title="Country Summary Request" payload={countrySummariesPayload} />
        </div>
      )}
    </div>
  );
}

export function NewsEventCard() {
  const state = useGeopoliticsMonitorState();
  const { timeframe } = state;
  return <div className="relative h-full">
    <RegionalNewsMap
      countryData={state.countryCounts} topicLabel="GEOPOLITICAL" timeframeLabel={timeframe.label}
      timeframeOptions={TIMEFRAMES} activeTimeframeKey={timeframe.key}
      onTimeframeChange={key => { const next = TIMEFRAMES.find(t => t.key === key); if (next) state.setTimeframe(next); }}
      showDebugSources={state.debugMode} isLoading={state.loadingCountryCounts}
      scanStatus={state.scanStatus} scanStatusLabel={state.scanStatusLabel} showHotspotsSection={state.hasReview}
      sourceNote={state.source} archiveMode={state.hasArchive} analysisNote={state.analysisLabel}
      headerActions={<GeopoliticsMonitorControls state={state} />}
    />
    {state.debugMode && (state.showPromptDebug || state.showPayloadDebug) && <div className="instrument-section absolute inset-3 z-20 overflow-auto bg-terminal-panel p-2">
      <button onClick={() => { state.setShowPayloadDebug(false); state.setShowPromptDebug(false); }} className="mb-2 text-xs text-terminal-accent">Close debug</button>
      <GeopoliticsDebugPanels state={state} /></div>}
  </div>;
}

export function NewsRiskCard() {
  const risk = useQuery({ queryKey: ['geopolitical-risk-snapshot'], queryFn: fetchGeopoliticalRiskSnapshot,
    refetchInterval: 3600000, staleTime: 900000 });
  return <div className="instrument-card flex h-full min-h-0 flex-col overflow-hidden rounded border border-terminal-border bg-terminal-panel">
    <header className="news-card-header">
      <h2 className="instrument-heading flex items-center gap-2 text-sm font-bold tracking-wider text-terminal-accent">
        <ShieldAlert size={14} className="shrink-0 text-terminal-accent" /> GEOPOLITICAL RISK INDEX
      </h2>
      {risk.data && <a href={risk.data.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[11px] text-terminal-muted hover:text-terminal-accent">Source ↗</a>}
    </header>
    {risk.data ? <RiskIndexReadings snapshot={risk.data} />
      : risk.isPending ? <div role="status" className="shimmer m-3 flex-1 rounded"><span className="sr-only">Loading risk index</span></div>
      : <p role="status" className="p-3 text-sm text-terminal-muted">The official geopolitical risk index is temporarily unavailable.</p>}
  </div>;
}
