import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bug, ExternalLink, Globe2, Info, Minus, RefreshCw, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';
import {
  clearGeopoliticalMapCache,
  fetchCountryNewsCounts,
  fetchGeopoliticalRiskSnapshot,
  fetchOpenAIKeyStatus,
  getOpenAIDebugPayload,
} from '../api/finance';
import type { OpenAIDebugPayloadEntry } from '../api/finance';
import { CountryHotspotsSection, RegionalNewsMap } from '../components/RegionalNewsMap';
import { useTerminalStore } from '../store/useTerminalStore';
import type { OpenAISettings, PanelType } from '../types';
import { GeopoliticalRiskPoint, GeopoliticalRiskSnapshot } from '../types';
import { fmt } from '../utils/formatters';
import { DEFAULT_GEOPOLITICS_OPENAI_MODEL } from '../utils/openaiConfig';
import { buildTimestampedJsonFilename, downloadJsonFile } from '../utils/downloadJson';
import { getThemePalette, useTheme } from '../utils/theme';
import { NewsPanel } from '../components/NewsPanel';

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

const GEOPOLITICS_TOPIC_QUERY = 'geopolitics';
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
    <div className="rounded border border-terminal-border bg-terminal-elevated/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-terminal-faint">
        <span>{label}</span>
        <InfoTooltip label={label} description={description} source={source} align={align} />
      </div>
      <div className="mt-1 text-sm font-bold tabular-nums text-terminal-text">{value}</div>
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

function GeopoliticalRiskCard({
  snapshot,
  isLoading,
  isError,
}: {
  snapshot: GeopoliticalRiskSnapshot | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  useTheme();
  const [chartTimeframe, setChartTimeframe] = useState<GprChartTimeframeKey>('30d');
  const themePalette = getThemePalette();

  if (isLoading) {
    return <div className="shimmer h-64 rounded" />;
  }

  if (!snapshot || isError) {
    return (
      <div className="rounded border border-terminal-border bg-terminal-panel p-4">
        <div className="flex items-center gap-2 text-terminal-accent text-sm font-bold tracking-wider">
          <ShieldAlert size={14} />
          GEOPOLITICAL RISK INDEX
        </div>
        <p className="mt-3 text-sm text-terminal-faint">
          The official geopolitical risk index could not be loaded right now.
        </p>
      </div>
    );
  }

  const latest = snapshot.latest;
  const change = snapshot.change;
  const riskRising = (change ?? 0) > 0;
  const changeTone = change == null ? 'text-terminal-muted' : riskRising ? 'text-terminal-negative' : 'text-terminal-positive';
  const changeChipTone =
    change == null
      ? 'border-terminal-border bg-terminal-hover text-terminal-muted'
      : riskRising
        ? 'border-terminal-negative/30 bg-terminal-negative/10 text-terminal-negative'
        : 'border-terminal-positive/30 bg-terminal-positive/10 text-terminal-positive';
  const DeltaIcon = change == null ? Minus : riskRising ? TrendingUp : TrendingDown;
  const chartData = getRiskChartData(snapshot.series, chartTimeframe);
  const chartMin = Math.min(...chartData.flatMap((point) => [point.value, point.movingAverage7]));
  const chartMax = Math.max(...chartData.flatMap((point) => [point.value, point.movingAverage7]));
  const chartPadding = Math.max((chartMax - chartMin) * 0.14, 18);
  const yDomain: [number, number] = [Math.max(0, chartMin - chartPadding), chartMax + chartPadding];

  return (
    <div className="rounded border border-terminal-border bg-terminal-panel overflow-hidden">
      <div className="flex min-h-[3.5rem] items-center justify-between gap-3 px-4 py-3 panel-border-b bg-terminal-elevated/40">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} className="text-terminal-accent" />
          <span className="text-terminal-accent text-sm font-bold tracking-wider">GEOPOLITICAL RISK INDEX</span>
        </div>

        <a
          href={snapshot.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-terminal-faint hover:text-terminal-accent transition-colors"
        >
          SOURCE
          <ExternalLink size={11} />
        </a>
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.22em] text-terminal-faint">
                <span>OFFICIAL DAILY RECENT GPR</span>
                <InfoTooltip
                  label="Official Daily Recent GPR"
                  description="The headline global Geopolitical Risk Index level for the latest daily observation. The series is normalized so the 1985-2019 average equals 100."
                  source={GPR_METRIC_SOURCE}
                />
              </div>
              <div className="mt-1 text-4xl font-bold tracking-tight text-terminal-text tabular-nums">
                {fmt.number(latest.value, 2)}
              </div>
            </div>

            <div className="rounded border border-terminal-border bg-terminal-elevated/30 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-terminal-faint">
                <span>D/D DELTA</span>
                <InfoTooltip
                  label="Day-over-day delta"
                  description="Absolute and percentage change versus the previous published daily GPR observation. Positive means geopolitical risk increased versus the prior day."
                  source={GPR_METRIC_SOURCE}
                />
              </div>
              <div className={`mt-1 inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium ${changeChipTone}`}>
                <DeltaIcon size={12} />
                {change == null ? 'NO DELTA' : `${fmt.change(change, 2)} / ${fmt.pct(snapshot.changePct)}`}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <LabeledMetric
              label="ACTS"
              value={fmt.number(latest.acts, 1)}
              description="The 'acts' sub-index captures realized geopolitical events such as attacks, wars, terrorism, and other concrete escalations reflected in the newspaper-based methodology."
              source={GPR_METRIC_SOURCE}
            />
            <LabeledMetric
              label="THREATS"
              value={fmt.number(latest.threats, 1)}
              description="The 'threats' sub-index captures rising geopolitical threats, tensions, and warnings before or alongside realized events."
              source={GPR_METRIC_SOURCE}
            />
            <LabeledMetric
              label="MA 7D"
              value={fmt.number(latest.movingAverage7, 1)}
              description="Seven-day moving average of the daily GPR index. This smooths one-day spikes and makes short-term trend changes easier to read."
              source={GPR_METRIC_SOURCE}
            />
            <LabeledMetric
              label="DATA DATE"
              value={formatRiskDate(latest.date)}
              description="Publication date of the latest official daily GPR observation currently loaded into the app."
              source={GPR_METRIC_SOURCE}
            />
            <LabeledMetric
              label="7D RANGE"
              value={
                snapshot.weeklyLow == null || snapshot.weeklyHigh == null
                  ? '—'
                  : `${fmt.number(snapshot.weeklyLow, 1)} - ${fmt.number(snapshot.weeklyHigh, 1)}`
              }
              description="Lowest and highest daily global GPR readings observed in the latest seven published daily observations."
              source={GPR_METRIC_SOURCE}
            />
          </div>
        </div>

        <div className="rounded border border-terminal-border bg-[#071018] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.22em] text-terminal-faint">
              <span>GLOBAL DAILY GPR INDEX</span>
              <InfoTooltip
                label="Global Daily GPR Chart"
                description="This chart shows the official global aggregate geopolitical risk series, not a single country. X-axis is observation date in UTC; Y-axis is the GPR index level where 100 equals the 1985-2019 average."
                source={GPR_METRIC_SOURCE}
                align="right"
              />
            </div>
            <div className={`text-xs font-medium tabular-nums ${changeTone}`}>
              {change == null ? 'UNCH' : fmt.change(change, 2)}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-terminal-text">
                <span className="h-[2px] w-4 rounded-full bg-[#ff6b6b]" />
                Daily GPR
              </span>
              <span className="inline-flex items-center gap-1.5 text-terminal-faint">
                <span className="h-0 w-4 border-t-2 border-dashed border-[#f0c96d]" />
                7D average
              </span>
            </div>

            <div className="flex items-center gap-1 rounded border border-terminal-border bg-terminal-panel/60 p-1">
              {GPR_CHART_TIMEFRAMES.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setChartTimeframe(option.key)}
                  className={`rounded px-2.5 py-1 text-[10px] font-medium tracking-[0.18em] transition-colors ${
                    option.key === chartTimeframe
                      ? 'bg-terminal-accent text-terminal-bg'
                      : 'text-terminal-faint hover:bg-terminal-hover hover:text-terminal-text'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 h-44 rounded border border-white/5 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_44%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] px-2 py-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 14, right: 12, left: 6, bottom: 10 }}>
                <defs>
                  <linearGradient id="gprArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff6b6b" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#ff6b6b" stopOpacity={0.02} />
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
                  stroke="#ff6b6b"
                  strokeWidth={2.5}
                  fill="url(#gprArea)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#ff6b6b', strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="movingAverage7"
                  stroke="#f0c96d"
                  strokeWidth={2.2}
                  dot={false}
                  strokeDasharray="4 4"
                  activeDot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-terminal-faint">
            {snapshot.methodology}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-terminal-faint">
            <span>{snapshot.cadence}</span>
            <a href={snapshot.dataUrl} target="_blank" rel="noreferrer" className="hover:text-terminal-accent transition-colors">
              Raw data
            </a>
            <span>{snapshot.license}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

type GeopoliticsMonitorSectionProps = {
  embedded?: boolean;
};

type GeopoliticsMonitorState = {
  timeframe: TimeframeOption;
  setTimeframe: (timeframe: TimeframeOption) => void;
  showPromptDebug: boolean;
  setShowPromptDebug: (value: boolean | ((current: boolean) => boolean)) => void;
  showPayloadDebug: boolean;
  setShowPayloadDebug: (value: boolean | ((current: boolean) => boolean)) => void;
  geopoliticsModel: string;
  debugMode: boolean;
  hasStoredApiKey: boolean;
  setActivePanel: (panel: PanelType) => void;
  geopoliticalPipelinePayload: OpenAIDebugPayloadEntry | null;
  geopoliticalEventsPayload: OpenAIDebugPayloadEntry | null;
  countrySummariesPayload: OpenAIDebugPayloadEntry | null;
  countryCounts: Awaited<ReturnType<typeof fetchCountryNewsCounts>>;
  loadingCountryCounts: boolean;
  refetchCountryCounts: () => void;
  fetchingCountryCounts: boolean;
  riskSnapshot: GeopoliticalRiskSnapshot | undefined;
  loadingRiskSnapshot: boolean;
  riskSnapshotError: boolean;
  refetchRiskSnapshot: () => void;
  fetchingRiskSnapshot: boolean;
  openAISettings: OpenAISettings;
};

function useGeopoliticsMonitorState(): GeopoliticsMonitorState {
  const [timeframe, setTimeframe] = useState<TimeframeOption>(TIMEFRAMES[2]);
  const [showPromptDebug, setShowPromptDebug] = useState(false);
  const [showPayloadDebug, setShowPayloadDebug] = useState(false);
  const { openAISettings, updateOpenAISettings, debugMode, setActivePanel } = useTerminalStore();
  const geopoliticsModel = openAISettings.geopoliticsModel?.trim() || DEFAULT_GEOPOLITICS_OPENAI_MODEL;

  const { data: keyStatus } = useQuery({
    queryKey: ['openai-key-status'],
    queryFn: fetchOpenAIKeyStatus,
    staleTime: 30000,
  });

  useEffect(() => {
    if (typeof keyStatus?.configured === 'boolean' && keyStatus.configured !== openAISettings.hasStoredApiKey) {
      updateOpenAISettings({ hasStoredApiKey: keyStatus.configured });
    }
  }, [keyStatus?.configured, openAISettings.hasStoredApiKey, updateOpenAISettings]);

  useEffect(() => {
    if (!debugMode) {
      setShowPromptDebug(false);
      setShowPayloadDebug(false);
    }
  }, [debugMode]);

  const geopoliticalPipelinePayload = getOpenAIDebugPayload('geopolitical-pipeline');
  const geopoliticalEventsPayload = getOpenAIDebugPayload('geopolitical-events');
  const countrySummariesPayload = getOpenAIDebugPayload('geopolitical-country-summaries');

  const {
    data: countryCounts = [],
    isLoading: loadingCountryCounts,
    refetch: refetchCountryCounts,
    isFetching: fetchingCountryCounts,
  } = useQuery({
    queryKey: [
      'geopolitics-country-news-counts',
      GEOPOLITICS_TOPIC_QUERY,
      timeframe.hours,
      geopoliticsModel,
      openAISettings.geopoliticsSystemPrompt,
      openAISettings.hasStoredApiKey,
    ],
    queryFn: () =>
      fetchCountryNewsCounts(GEOPOLITICS_TOPIC_QUERY, timeframe.hours, {
        enableAI: openAISettings.hasStoredApiKey,
        model: geopoliticsModel,
        systemPrompt: openAISettings.geopoliticsSystemPrompt,
        debugMode,
      }),
    placeholderData: keepPreviousData,
    enabled: openAISettings.hasStoredApiKey,
    refetchInterval: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const {
    data: riskSnapshot,
    isLoading: loadingRiskSnapshot,
    isError: riskSnapshotError,
    refetch: refetchRiskSnapshot,
    isFetching: fetchingRiskSnapshot,
  } = useQuery({
    queryKey: ['geopolitical-risk-snapshot'],
    queryFn: () => fetchGeopoliticalRiskSnapshot(),
    refetchInterval: 3600000,
    staleTime: 900000,
  });

  return {
    timeframe,
    setTimeframe,
    showPromptDebug,
    setShowPromptDebug,
    showPayloadDebug,
    setShowPayloadDebug,
    geopoliticsModel,
    debugMode,
    hasStoredApiKey: openAISettings.hasStoredApiKey,
    setActivePanel,
    geopoliticalPipelinePayload,
    geopoliticalEventsPayload,
    countrySummariesPayload,
    countryCounts,
    loadingCountryCounts,
    refetchCountryCounts,
    fetchingCountryCounts,
    riskSnapshot,
    loadingRiskSnapshot,
    riskSnapshotError,
    refetchRiskSnapshot,
    fetchingRiskSnapshot,
    openAISettings,
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
    fetchingRiskSnapshot,
    refetchCountryCounts,
    refetchRiskSnapshot,
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
            clearGeopoliticalMapCache();
            void state.refetchCountryCounts();
            void state.refetchRiskSnapshot();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-terminal-border text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors text-xs"
          title="Refresh geopolitical monitor"
        >
          <RefreshCw
            size={11}
            className={fetchingCountryCounts || fetchingRiskSnapshot ? 'animate-spin' : ''}
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
        <div className={`${panelClassName} space-y-3`}>
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
        <div className={`${panelClassName} space-y-3`}>
          <div className="text-terminal-accent text-xs font-bold tracking-[0.18em]">GEOPOL AI PAYLOAD DEBUG</div>
          <GeopoliticsPayloadBlock title="Pipeline Stage Debug" payload={geopoliticalPipelinePayload} />
          <GeopoliticsPayloadBlock title="Headline Extraction Request" payload={geopoliticalEventsPayload} />
          <GeopoliticsPayloadBlock title="Country Summary Request" payload={countrySummariesPayload} />
        </div>
      )}
    </div>
  );
}

function GeopoliticsMapSection({
  state,
  onCountrySelect,
}: {
  state: GeopoliticsMonitorState;
  onCountrySelect?: (countryKey: string) => void;
}) {
  const {
    timeframe,
    setTimeframe,
    debugMode,
    hasStoredApiKey,
    setActivePanel,
    countryCounts,
    loadingCountryCounts,
    fetchingCountryCounts,
  } = state;

  return hasStoredApiKey ? (
    <RegionalNewsMap
      countryData={countryCounts}
      topicLabel="GEOPOLITICAL"
      timeframeLabel={timeframe.label}
      timeframeOptions={TIMEFRAMES}
      activeTimeframeKey={timeframe.key}
      onTimeframeChange={(nextKey) => {
        const nextTimeframe = TIMEFRAMES.find((item) => item.key === nextKey);
        if (nextTimeframe) setTimeframe(nextTimeframe);
      }}
      onCountrySelect={onCountrySelect}
      showDebugSources={debugMode}
      isRefreshing={fetchingCountryCounts && countryCounts.length > 0}
      isLoading={loadingCountryCounts && countryCounts.length === 0}
      showHotspotsSection={false}
      headerActions={<GeopoliticsMonitorControls state={state} />}
    />
  ) : (
    <div className="overflow-hidden rounded border border-terminal-border bg-terminal-panel">
      <div className="flex items-center justify-between gap-3 px-4 py-2 panel-border-b bg-terminal-elevated/40">
        <div className="flex items-center gap-2">
          <Globe2 size={14} className="text-terminal-accent" />
          <span className="text-terminal-accent text-sm font-bold tracking-wider">GLOBAL EVENT MAP</span>
        </div>
        <div className="text-[11px] text-terminal-faint">OPENAI KEY REQUIRED</div>
      </div>
      <div className="p-4">
        <div className="rounded border border-terminal-border bg-terminal-elevated px-4 py-3 text-sm text-terminal-muted">
          <div className="flex flex-wrap items-center gap-3">
            <span className="whitespace-nowrap">
              The Global Event Map only populates after you add your own OpenAI API key. Open Connections & AI Settings to configure it locally, then come back here.
            </span>
            <button
              onClick={() => setActivePanel('settings')}
              className="inline-flex items-center gap-2 rounded border border-terminal-accent/40 bg-terminal-accent/10 px-3 py-2 text-xs text-terminal-accent hover:bg-terminal-accent/20 transition-colors"
            >
              OPEN SETTINGS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GeopoliticsMonitorSection({ embedded = false }: GeopoliticsMonitorSectionProps) {
  const state = useGeopoliticsMonitorState();
  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 size={14} className="text-terminal-accent" />
            <h1 className="text-terminal-accent font-bold text-sm tracking-wider">GEOPOLITICAL MONITOR</h1>
          </div>
          <p className="text-terminal-faint text-xs mt-1 leading-relaxed whitespace-nowrap">
            Track geopolitical pressure through official GPR readings alongside country-specific geopolitical story clustering.
          </p>
        </div>

        <GeopoliticsMonitorControls state={state} />
      </div>

      <GeopoliticsDebugPanels state={state} />

      <GeopoliticalRiskCard
        snapshot={state.riskSnapshot}
        isLoading={state.loadingRiskSnapshot}
        isError={state.riskSnapshotError}
      />

      <GeopoliticsMapSection state={state} />
    </div>
  );

  if (embedded) {
    return <div className="h-full overflow-y-auto p-4">{content}</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      {content}
    </div>
  );
}

export function GeopoliticsPanel() {
  return <GeopoliticsMonitorSection />;
}

function resolveCountryHotspotKey(
  countryKey: string,
  countries: Array<{ key: string; countryCode: string; label: string; shortLabel: string }>
): string | null {
  const normalizedKey = countryKey.trim().toLowerCase();
  if (!normalizedKey) return null;

  const exactKeyMatch = countries.find((country) => country.key.toLowerCase() === normalizedKey);
  if (exactKeyMatch) return exactKeyMatch.key;

  const countryCodeMatch = countries.find((country) => country.countryCode.toLowerCase() === normalizedKey);
  if (countryCodeMatch) return countryCodeMatch.key;

  const labelMatch = countries.find((country) => {
    const label = country.label.trim().toLowerCase();
    const shortLabel = country.shortLabel.trim().toLowerCase();
    return label === normalizedKey || shortLabel === normalizedKey;
  });

  return labelMatch?.key ?? null;
}

export function NewsGeopoliticsPanel() {
  const state = useGeopoliticsMonitorState();
  const showDebugOverlay = state.debugMode && (state.showPromptDebug || state.showPayloadDebug);
  const hotspotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimeoutRef = useRef<number | null>(null);
  const [selectedCountryKey, setSelectedCountryKey] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const handleCountrySelect = (countryKey: string) => {
    const resolvedKey = resolveCountryHotspotKey(countryKey, state.countryCounts);
    if (!resolvedKey) return;

    hotspotRefs.current[resolvedKey]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setSelectedCountryKey(resolvedKey);

    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = window.setTimeout(() => {
      setSelectedCountryKey((current) => (current === resolvedKey ? null : current));
      highlightTimeoutRef.current = null;
    }, 1500);
  };

  return (
    <div className="relative h-full min-h-0 overflow-hidden p-4">
      <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(22rem,0.9fr)] xl:grid-rows-[minmax(24rem,1.2fr)_minmax(16rem,0.8fr)]">
        <div className="min-h-0 overflow-hidden xl:row-start-1 xl:col-start-1">
          <div className="h-full">
            <GeopoliticsMapSection state={state} onCountrySelect={handleCountrySelect} />
          </div>
        </div>
        <div className="min-h-0 overflow-hidden xl:row-start-1 xl:col-start-2">
          <div className="h-full overflow-y-auto">
            <NewsPanel
              className="h-full w-full"
              embedded
            />
          </div>
        </div>
        <div className="min-h-0 overflow-hidden xl:row-start-2 xl:col-start-1">
          <div className="h-full overflow-y-auto">
            <CountryHotspotsSection
              countryData={state.countryCounts}
              topicLabel="GEOPOLITICAL"
              selectedKey={selectedCountryKey}
              hotspotRefs={hotspotRefs}
            />
          </div>
        </div>
        <div className="min-h-0 overflow-hidden xl:row-start-2 xl:col-start-2">
          <div className="h-full overflow-y-auto">
            <GeopoliticalRiskCard
              snapshot={state.riskSnapshot}
              isLoading={state.loadingRiskSnapshot}
              isError={state.riskSnapshotError}
            />
          </div>
        </div>
      </div>

      {showDebugOverlay && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
          <GeopoliticsDebugPanels state={state} variant="overlay" />
        </div>
      )}
    </div>
  );
}
