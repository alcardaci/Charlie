import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchMacroDashboard } from '../api/finance';
import { EventsCalendar } from '../components/EventsCalendar';
import { MACRO_COUNTRIES, MACRO_METRICS } from '../data/macroRegistry';
import { useTerminalStore } from '../store/useTerminalStore';
import { BlsIndicator, EurostatIndicator, MacroCountryCode, MacroDashboardData, MacroMetricKey, MacroMetricSnapshot, OecdComparableIndicator } from '../types';
import { fmt } from '../utils/formatters';
import { getThemePalette, useTheme } from '../utils/theme';
import { YieldPanel } from './YieldPanel';

type MacroView = 'dashboard' | 'compare' | 'calendar' | 'yield';

const VIEWS: Array<{ key: MacroView; label: string }> = [
  { key: 'dashboard', label: 'DASHBOARD' },
  { key: 'compare', label: 'COMPARE' },
  { key: 'calendar', label: 'CALENDAR' },
  { key: 'yield', label: 'YIELD CURVE' },
];

const METRIC_KEYS = Object.keys(MACRO_METRICS) as MacroMetricKey[];

export function MacroPanel() {
  const { activePanel } = useTerminalStore();
  const [view, setView] = useState<MacroView>(activePanel === 'yield' ? 'yield' : 'dashboard');
  const [country, setCountry] = useState<MacroCountryCode>('US');
  useTheme();
  const themePalette = getThemePalette();

  useEffect(() => {
    if (activePanel === 'yield') {
      setView('yield');
      return;
    }
    if (activePanel === 'macro') {
      setView((current) => (current === 'yield' ? 'dashboard' : current));
    }
  }, [activePanel]);

  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
  } = useQuery({
    queryKey: ['macro-dashboard', country],
    queryFn: () => fetchMacroDashboard([country]),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 1,
    refetchOnMount: 'always',
  });

  const {
    data: compareData,
    isLoading: compareLoading,
    isError: compareError,
  } = useQuery({
    queryKey: ['macro-compare'],
    queryFn: () => fetchMacroDashboard(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 1,
    refetchOnMount: 'always',
    enabled: view === 'compare',
  });

  const activeData = view === 'compare' ? compareData : view === 'dashboard' ? dashboardData : null;
  const selectedCountry = dashboardData?.countries[0];
  const selectedCountryEmpty = !selectedCountry || METRIC_KEYS.every((metricKey) => !selectedCountry.values[metricKey]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex flex-col gap-2 px-4 py-2 panel-border-b bg-terminal-panel flex-shrink-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-terminal-accent font-bold text-sm tracking-wider">MACRO MONITOR</span>
          <span className="block sm:inline text-terminal-faint text-xs sm:ml-3">US + G10 economic dashboard</span>
        </div>
        {activeData?.error && (
          <span className="text-terminal-faint text-xs">{activeData.error}</span>
        )}
      </div>

      <div className="flex flex-col gap-2 px-4 py-2 bg-terminal-bg panel-border-b flex-shrink-0">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {VIEWS.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={`px-2.5 py-0.5 text-xs rounded border transition-colors ${
                view === item.key
                  ? 'border-terminal-accent/50 bg-terminal-accent/10 text-terminal-accent'
                  : 'border-transparent text-terminal-faint hover:text-terminal-text hover:bg-terminal-hover'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {(view === 'dashboard' || view === 'compare') && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {MACRO_COUNTRIES.map((item) => (
              <button
                key={item.code}
                onClick={() => setCountry(item.code)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  item.code === country
                    ? 'bg-terminal-accent/15 text-terminal-accent'
                    : 'text-terminal-faint hover:text-terminal-text hover:bg-terminal-hover'
                }`}
              >
                {item.shortLabel}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {view === 'dashboard' && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            {dashboardData?.error && (
              <MacroAlert text={dashboardData.error} />
            )}
            {dashboardLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="shimmer h-36 rounded" />
                ))}
              </div>
            ) : dashboardError || !selectedCountry ? (
              <PanelMessage text="Could not load macro dashboard" />
            ) : selectedCountryEmpty && dashboardData?.error ? (
              <PanelMessage text={dashboardData.error} />
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                  {METRIC_KEYS.map((metricKey) => (
                    <MetricCard
                      key={metricKey}
                      title={selectedCountry.values[metricKey]?.label ?? MACRO_METRICS[metricKey].label}
                      snapshot={selectedCountry.values[metricKey]}
                      palette={themePalette}
                    />
                  ))}
                </div>

                <OecdComparableTrends data={dashboardData.oecdCountry} palette={themePalette} />
                {country === 'US' && <BlsLaborTrends data={dashboardData.bls} palette={themePalette} />}
                {country === 'EA' && <EurostatLocalDetail data={dashboardData.eurostat} palette={themePalette} />}
              </>
            )}
          </div>
        )}

        {view === 'compare' && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            {compareData?.error && (
              <div className="mb-4">
                <MacroAlert text={compareData.error} />
              </div>
            )}
            {compareLoading ? (
              <div className="shimmer h-64 rounded" />
            ) : compareError || !compareData ? (
              <PanelMessage text="Could not load cross-country comparison" />
            ) : (
              <>
                <div className="bg-terminal-panel border border-terminal-border rounded overflow-hidden">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th className="text-left">COUNTRY</th>
                        {METRIC_KEYS.map((metricKey) => (
                          <th key={metricKey}>{MACRO_METRICS[metricKey].shortLabel}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {compareData.countries.map((item) => (
                        <tr key={item.country}>
                          <td className="text-terminal-accent font-bold">{item.label}</td>
                          {METRIC_KEYS.map((metricKey) => (
                            <td key={metricKey} className="tabular-nums">
                              {formatMacroValue(item.values[metricKey])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <OecdComparisonChart data={compareData.oecd} palette={themePalette} />
              </>
            )}
          </div>
        )}

        {view === 'calendar' && (
          <div className="h-full p-4">
            <div className="h-full border border-terminal-border rounded overflow-hidden">
              <EventsCalendar />
            </div>
          </div>
        )}

        {view === 'yield' && (
          <YieldPanel />
        )}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  snapshot,
  palette,
}: {
  title: string;
  snapshot: MacroMetricSnapshot | null;
  palette: ReturnType<typeof getThemePalette>;
}) {
  return (
    <div className="bg-terminal-panel border border-terminal-border rounded p-3 min-h-[12rem]">
      <div className="flex items-center justify-between mb-2">
        <div className="text-terminal-muted text-xs font-bold tracking-wider">{title}</div>
        <span className="text-terminal-faint text-xs">{snapshot?.source ?? 'FRED'}</span>
      </div>

      {snapshot ? (
        <>
          <div className="text-terminal-text font-bold text-2xl tabular-nums">
            {formatMacroValue(snapshot)}
          </div>
          <div className="text-terminal-muted text-xs mt-1">
            {snapshot.change == null
              ? 'No prior print'
              : `Delta ${formatSignedValue(snapshot.change, 2)} ${snapshot.unit}`}
          </div>
          <div className="text-terminal-faint text-[10px] mt-1">
            {[snapshot.frequency, snapshot.areaScope, snapshot.date].filter(Boolean).join(' · ')}
          </div>
          <div className="h-24 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={snapshot.series.slice(-12)}>
                <defs>
                  <linearGradient id={`macro-${snapshot.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={palette.accent} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={palette.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={palette.chartGrid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: palette.muted, fontSize: 10 }}
                  tickFormatter={(value: string) => value.slice(2, 7)}
                  axisLine={{ stroke: palette.border }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: palette.muted, fontSize: 10 }}
                  axisLine={{ stroke: palette.border }}
                  tickLine={false}
                  tickFormatter={(value: number) => value.toFixed(1)}
                />
                <Tooltip
                  contentStyle={{ background: palette.elevated, border: `1px solid ${palette.border}`, borderRadius: '4px', fontSize: '11px' }}
                  labelStyle={{ color: palette.text }}
                  formatter={(value: number) => [`${value.toFixed(2)} ${snapshot.unit}`, title]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={palette.accent}
                  fill={`url(#macro-${snapshot.key})`}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className="h-full flex items-center justify-center text-terminal-faint text-xs">
          No live data available
        </div>
      )}
    </div>
  );
}

function formatMacroValue(snapshot: MacroMetricSnapshot | null): string {
  if (!snapshot || snapshot.value == null) return '--';
  const decimals = snapshot.key === 'yield10y' || snapshot.key === 'policyRate' ? 2 : 1;
  return `${fmt.number(normalizeRoundedZero(snapshot.value, decimals), decimals)}${snapshot.unit}`;
}

function normalizeRoundedZero(value: number, decimals: number): number {
  return Math.abs(value) < 0.5 * (10 ** -decimals) ? 0 : value;
}

function formatSignedValue(value: number, decimals: number): string {
  const normalized = normalizeRoundedZero(value, decimals);
  return `${normalized >= 0 ? '+' : ''}${normalized.toFixed(decimals)}`;
}

function OecdComparableTrends({ data, palette }: {
  data: NonNullable<MacroDashboardData['oecdCountry']> | undefined;
  palette: ReturnType<typeof getThemePalette>;
}) {
  if (!data) {
    return (
      <section className="bg-terminal-panel border border-terminal-border rounded px-4 py-3 text-terminal-faint text-xs">
        Comparable activity and labour indicators are unavailable right now; the core Macro charts remain usable.
      </section>
    );
  }
  return (
    <section className="bg-terminal-panel border border-terminal-border rounded overflow-hidden">
      <div className="px-4 py-2 panel-border-b flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-terminal-muted text-xs font-bold tracking-wider">COMPARABLE ACTIVITY, LABOUR & CONFIDENCE</div>
          <div className="text-terminal-faint text-[10px] mt-1">Common OECD contracts · exact country and series mapping · {data.status.toUpperCase()}</div>
        </div>
        <a href="https://data-explorer.oecd.org/" target="_blank" rel="noreferrer" className="text-terminal-faint text-[10px] hover:text-terminal-text">OECD SOURCE ↗</a>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
        {data.indicators.map((indicator) => <OecdComparableCard key={indicator.key} indicator={indicator} palette={palette} />)}
      </div>
      {data.warning && <div className="px-4 py-2 panel-border-t text-terminal-faint text-[10px]">{data.warning}</div>}
    </section>
  );
}

function OecdComparableCard({ indicator, palette }: { indicator: OecdComparableIndicator; palette: ReturnType<typeof getThemePalette> }) {
  if (indicator.status === 'unavailable') {
    return (
      <div className="bg-terminal-elevated border border-terminal-border rounded p-3 min-h-[10rem] flex flex-col">
        <div className="text-terminal-muted text-xs font-bold tracking-wider">{indicator.label}</div>
        <div className="text-terminal-faint text-xs mt-4">Coverage unavailable</div>
        <div className="text-terminal-faint text-[10px] mt-2 leading-relaxed">{indicator.coverageNote}</div>
        <div className="text-terminal-faint text-[10px] mt-auto pt-3">{indicator.frequency} · {indicator.unitLabel}</div>
      </div>
    );
  }
  const value = indicator.value == null ? '--' : indicator.unit === '%'
    ? `${indicator.value.toFixed(2)}%`
    : indicator.value.toFixed(1);
  const change = indicator.change == null ? 'No prior print' : `Delta ${formatSignedValue(indicator.change, 2)}`;
  return <SupplementalTrendCard
    title={indicator.label}
    value={value}
    detail={`${change} · ${indicator.date ?? 'Latest unavailable'} · ${indicator.frequency} · ${indicator.unitLabel}`}
    series={indicator.series}
    unit={indicator.unitLabel}
    sourceUrl={indicator.sourceUrl}
    color={indicator.key === 'employmentGrowth' ? palette.accent : indicator.key === 'businessConfidence' ? palette.purple : palette.blue}
    palette={palette}
  />;
}

function BlsLaborTrends({
  data,
  palette,
}: {
  data: NonNullable<MacroDashboardData['bls']> | undefined;
  palette: ReturnType<typeof getThemePalette>;
}) {
  if (!data || data.indicators.length === 0) {
    return (
      <div className="bg-terminal-panel border border-terminal-border rounded px-4 py-3 text-terminal-faint text-xs">
        BLS local labour indicators are unavailable right now; the core Macro charts remain usable.
      </div>
    );
  }

  return (
    <section className="bg-terminal-panel border border-terminal-border rounded overflow-hidden">
      <div className="px-4 py-2 panel-border-b flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-terminal-muted text-xs font-bold tracking-wider">US LOCAL DETAIL</div>
          <div className="text-terminal-faint text-[10px] mt-1">Monthly and quarterly labour, cost and productivity trends · {data.status.toUpperCase()}</div>
        </div>
        <a href="https://www.bls.gov/developers/" target="_blank" rel="noreferrer" className="text-terminal-faint text-[10px] hover:text-terminal-text">
          BLS SOURCE ↗
        </a>
      </div>
      <div className="p-3 space-y-4">
        <BlsFamilySection title="HEADLINE LABOUR" indicators={data.indicators.filter((indicator) => indicator.family === 'headline')} palette={palette} mode="cards" />
        <BlsFamilySection title="LABOUR TURNOVER" indicators={data.indicators.filter((indicator) => indicator.family === 'jolts')} palette={palette} />
        <BlsFamilySection title="WORK INTENSITY & COST" indicators={data.indicators.filter((indicator) => indicator.family === 'work-cost')} palette={palette} mode="cards" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <BlsFamilySection title="PRODUCTIVITY & UNIT COSTS" indicators={data.indicators.filter((indicator) => indicator.family === 'productivity')} palette={palette} compact />
          <BlsFamilySection title="IMPORT & EXPORT PRICES" indicators={data.indicators.filter((indicator) => indicator.family === 'trade-prices')} palette={palette} compact />
        </div>
        <BlsFamilySection title="INVESTOR-RELEVANT INDUSTRY PAYROLLS" indicators={data.indicators.filter((indicator) => indicator.family === 'sector-payrolls')} palette={palette} />
      </div>
      {data.warning && <div className="px-4 py-2 panel-border-t text-terminal-faint text-[10px]">{data.warning}</div>}
    </section>
  );
}

function BlsFamilySection({ title, indicators, palette, mode = 'lines', compact = false }: {
  title: string;
  indicators: BlsIndicator[];
  palette: ReturnType<typeof getThemePalette>;
  mode?: 'lines' | 'cards';
  compact?: boolean;
}) {
  if (mode === 'cards') {
    return (
      <div>
        <div className="text-terminal-faint text-[10px] font-bold tracking-wider mb-2">{title}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {indicators.map((indicator) => <BlsIndicatorChart key={indicator.id} indicator={indicator} palette={palette} />)}
        </div>
      </div>
    );
  }
  return <GroupedTrendCard title={title} indicators={indicators} palette={palette} color={palette.accent} compact={compact} />;
}

function BlsIndicatorChart({ indicator, palette }: { indicator: BlsIndicator; palette: ReturnType<typeof getThemePalette> }) {
  const value = indicator.value == null ? '--' : indicator.unit === 'thousand jobs'
    ? `${fmt.number(indicator.value, 0)} ${indicator.unit}`
    : `${indicator.value.toFixed(indicator.unit === 'USD/hour' ? 2 : 1)} ${indicator.unit}`;
  const change = indicator.change == null ? 'No prior print' : `Δ ${formatSignedValue(indicator.change, 2)}`;
  return <SupplementalTrendCard
    title={indicator.label}
    value={value}
    detail={`${change} · ${indicator.date ?? 'Latest unavailable'} · ${indicator.frequency} · ${indicator.seasonalAdjustment}`}
    series={indicator.series}
    unit={indicator.unit}
    sourceUrl={indicator.sourceUrl}
    color={palette.accent}
    palette={palette}
  />;
}

function OecdComparisonChart({ data, palette }: { data: NonNullable<MacroDashboardData['oecd']> | undefined; palette: ReturnType<typeof getThemePalette> }) {
  if (!data || data.indicators.length === 0) return null;
  const dates = Array.from(new Set(data.indicators.flatMap((indicator) => indicator.series.map((point) => point.date)))).sort();
  const chartData = dates.map((date) => Object.fromEntries([
    ['date', date],
    ...data.indicators.map((indicator) => [indicator.countryCode, indicator.series.find((point) => point.date === date)?.value]),
  ]));
  const colors = [palette.accent, palette.blue, palette.purple, palette.positive, palette.negative];
  return (
    <section className="bg-terminal-panel border border-terminal-border rounded overflow-hidden">
      <div className="px-4 py-2 panel-border-b flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-terminal-muted text-xs font-bold tracking-wider">OECD LEADING INDICATOR COMPARISON</div>
          <div className="text-terminal-faint text-[10px] mt-1">Direction-focused cross-country trend · index · {data.status.toUpperCase()}</div>
        </div>
        <a href="https://www.oecd.org/en/data/insights/data-explainers/2024/09/api.html" target="_blank" rel="noreferrer" className="text-terminal-faint text-[10px] hover:text-terminal-text">OECD SOURCE ↗</a>
      </div>
      <div className="h-56 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid stroke={palette.chartGrid} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fill: palette.muted, fontSize: 10 }} tickFormatter={(value: string) => value.slice(2, 7)} axisLine={{ stroke: palette.border }} tickLine={false} />
            <YAxis domain={['auto', 'auto']} tick={{ fill: palette.muted, fontSize: 10 }} axisLine={{ stroke: palette.border }} tickLine={false} tickFormatter={(value: number) => value.toFixed(1)} />
            <Tooltip contentStyle={{ background: palette.elevated, border: `1px solid ${palette.border}`, borderRadius: '4px', fontSize: '11px' }} labelStyle={{ color: palette.text }} />
            <Legend wrapperStyle={{ color: palette.muted, fontSize: '10px', paddingTop: '8px' }} />
            {data.indicators.map((indicator, index) => (
              <Line key={indicator.countryCode} type="monotone" dataKey={indicator.countryCode} name={indicator.countryLabel} stroke={colors[index % colors.length]} strokeWidth={2} dot={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {data.warning && <div className="px-4 py-2 panel-border-t text-terminal-faint text-[10px]">{data.warning}</div>}
    </section>
  );
}

function EurostatLocalDetail({ data, palette }: { data: NonNullable<MacroDashboardData['eurostat']> | undefined; palette: ReturnType<typeof getThemePalette> }) {
  const indicators = data?.indicators.filter((indicator) => indicator.placement === 'detail') ?? [];
  if (!data || indicators.length === 0) return null;
  return (
    <section className="bg-terminal-panel border border-terminal-border rounded overflow-hidden">
      <div className="px-4 py-2 panel-border-b flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-terminal-muted text-xs font-bold tracking-wider">EURO AREA LOCAL DETAIL</div>
          <div className="text-terminal-faint text-[10px] mt-1">Labour, activity and price trends · Euro Area 21 only · {data.status.toUpperCase()}</div>
        </div>
        <a href="https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started/api" target="_blank" rel="noreferrer" className="text-terminal-faint text-[10px] hover:text-terminal-text">EUROSTAT SOURCE ↗</a>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 p-3">
        <GroupedTrendCard title="LABOUR COSTS & VACANCIES" indicators={indicators.filter((indicator) => indicator.group === 'labour')} palette={palette} color={palette.accent} />
        <GroupedTrendCard title="ACTIVITY VOLUMES" indicators={indicators.filter((indicator) => indicator.group === 'activity')} palette={palette} color={palette.blue} />
        {indicators.filter((indicator) => indicator.group === 'prices-trade').map((indicator) => (
          indicator.value == null
            ? <UnavailableTrendCard key={indicator.id} title={indicator.label} detail={indicator.coverageNote ?? 'No current observation is available for this exact contract.'} cadence={`${indicator.frequency} · ${indicator.unitLabel}`} />
            : <EurostatIndicatorChart key={indicator.id} indicator={indicator} palette={palette} />
        ))}
      </div>
      {data.warning && <div className="px-4 py-2 panel-border-t text-terminal-faint text-[10px]">{data.warning}</div>}
    </section>
  );
}

function EurostatIndicatorChart({ indicator, palette }: { indicator: EurostatIndicator; palette: ReturnType<typeof getThemePalette> }) {
  const value = indicator.value == null ? '--' : `${indicator.value.toFixed(1)}${indicator.unit === '%' ? '%' : indicator.unit === 'billion EUR' ? ' €bn' : ''}`;
  const change = indicator.change == null ? 'No prior print' : `Delta ${formatSignedValue(indicator.change, 1)}`;
  return <SupplementalTrendCard
    title={indicator.label}
    value={value}
    detail={`${change} · ${indicator.date ?? 'Latest unavailable'} · ${indicator.frequency} · ${indicator.unitLabel} · ${indicator.seasonalAdjustment}`}
    series={indicator.series}
    unit={indicator.unit}
    sourceUrl={indicator.sourceUrl}
    color={palette.blue}
    palette={palette}
  />;
}

type GroupedTrendIndicator = Pick<BlsIndicator | EurostatIndicator, 'id' | 'shortLabel' | 'value' | 'date' | 'unit' | 'frequency' | 'series' | 'sourceUrl'>;

function GroupedTrendCard({ title, indicators, palette, color, compact = false }: {
  title: string;
  indicators: GroupedTrendIndicator[];
  palette: ReturnType<typeof getThemePalette>;
  color: string;
  compact?: boolean;
}) {
  const available = indicators.filter((indicator) => indicator.series.length > 0);
  if (available.length === 0) return <UnavailableTrendCard title={title} detail="No current observations are available for these exact series contracts." cadence="Coverage unavailable" />;
  const dates = Array.from(new Set(available.flatMap((indicator) => indicator.series.map((point) => point.date)))).sort();
  const chartData = dates.map((date) => Object.fromEntries([
    ['date', date],
    ...available.map((indicator) => [indicator.id, indicator.series.find((point) => point.date === date)?.value]),
  ]));
  const colors = [color, palette.blue, palette.purple, palette.positive, palette.negative];
  return (
    <div className="bg-terminal-elevated border border-terminal-border rounded p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-terminal-muted text-xs font-bold tracking-wider">{title}</div>
        <div className="text-terminal-faint text-[10px]">{Array.from(new Set(available.map((indicator) => indicator.frequency))).join(' + ')}</div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {indicators.map((indicator) => (
          <a key={indicator.id} href={indicator.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] hover:text-terminal-text">
            <span className="text-terminal-faint">{indicator.shortLabel}</span>{' '}
            <span className="text-terminal-text tabular-nums font-bold">{formatSupplementalValue(indicator.value, indicator.unit)}</span>{' '}
            <span className="text-terminal-faint">{indicator.date?.slice(0, 7) ?? 'unavailable'} ↗</span>
          </a>
        ))}
      </div>
      <div className={compact ? 'h-32 mt-2' : 'h-40 mt-2'}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid stroke={palette.chartGrid} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fill: palette.muted, fontSize: 10 }} tickFormatter={(value: string) => value.slice(2, 7)} axisLine={{ stroke: palette.border }} tickLine={false} />
            <YAxis domain={['auto', 'auto']} tick={{ fill: palette.muted, fontSize: 10 }} axisLine={{ stroke: palette.border }} tickLine={false} tickFormatter={(value: number) => Math.abs(value) >= 1_000 ? `${(value / 1_000).toFixed(0)}k` : value.toFixed(1)} />
            <Tooltip contentStyle={{ background: palette.elevated, border: `1px solid ${palette.border}`, borderRadius: '4px', fontSize: '11px' }} labelStyle={{ color: palette.text }} />
            <Legend wrapperStyle={{ color: palette.muted, fontSize: '10px', paddingTop: '6px' }} />
            {available.map((indicator, index) => <Line key={indicator.id} type="monotone" dataKey={indicator.id} name={indicator.shortLabel} stroke={colors[index % colors.length]} strokeWidth={2} dot={false} connectNulls />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function UnavailableTrendCard({ title, detail, cadence }: { title: string; detail: string; cadence: string }) {
  return (
    <div className="bg-terminal-elevated border border-terminal-border rounded p-3 min-h-[10rem] flex flex-col">
      <div className="text-terminal-muted text-xs font-bold tracking-wider">{title}</div>
      <div className="text-terminal-faint text-xs mt-4">Coverage unavailable</div>
      <div className="text-terminal-faint text-[10px] mt-2 leading-relaxed">{detail}</div>
      <div className="text-terminal-faint text-[10px] mt-auto pt-3">{cadence}</div>
    </div>
  );
}

function formatSupplementalValue(value: number | null, unit: string): string {
  if (value == null) return '--';
  const formatted = Math.abs(value) >= 1_000 ? fmt.number(value, 0) : value.toFixed(1);
  if (unit === '%') return `${formatted}%`;
  if (unit === 'billion EUR') return `${formatted} €bn`;
  return `${formatted} ${unit}`;
}

function SupplementalTrendCard({ title, value, detail, series, unit, sourceUrl, color, palette }: {
  title: string;
  value: string;
  detail: string;
  series: Array<{ date: string; value: number }>;
  unit: string;
  sourceUrl: string;
  color: string;
  palette: ReturnType<typeof getThemePalette>;
}) {
  const gradientId = `supplemental-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <a href={sourceUrl} target="_blank" rel="noreferrer" className="block bg-terminal-elevated border border-terminal-border rounded p-3 hover:bg-terminal-hover transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-terminal-muted text-xs font-bold tracking-wider">{title}</div>
          <div className="text-terminal-text font-bold text-lg tabular-nums mt-1">{value}</div>
        </div>
        <span className="text-terminal-faint text-[10px]">SOURCE ↗</span>
      </div>
      <div className="text-terminal-faint text-[10px] mt-1">{detail}</div>
      <div className="h-28 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={palette.chartGrid} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fill: palette.muted, fontSize: 10 }} tickFormatter={(date: string) => date.slice(2, 7)} axisLine={{ stroke: palette.border }} tickLine={false} />
            <YAxis domain={['auto', 'auto']} tick={{ fill: palette.muted, fontSize: 10 }} axisLine={{ stroke: palette.border }} tickLine={false} tickFormatter={(point: number) => point.toFixed(1)} />
            <Tooltip contentStyle={{ background: palette.elevated, border: `1px solid ${palette.border}`, borderRadius: '4px', fontSize: '11px' }} labelStyle={{ color: palette.text }} formatter={(point: number) => [`${point.toFixed(2)} ${unit}`, title]} />
            <Area type="monotone" dataKey="value" stroke={color} fill={`url(#${gradientId})`} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </a>
  );
}

function PanelMessage({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center text-terminal-faint text-sm">
      {text}
    </div>
  );
}

function MacroAlert({ text }: { text: string }) {
  return (
    <div className="bg-terminal-panel border border-terminal-accent/40 rounded px-3 py-2 text-terminal-muted text-xs">
      {text}
    </div>
  );
}
