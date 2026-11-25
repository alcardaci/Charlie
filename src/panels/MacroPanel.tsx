import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MacroHistoryChart, MacroRangeContext, MacroRangeSelect } from '../components/MacroHistoryChart';
import { availableMacroWindows, type MacroHistory, type MacroWindow } from '../utils/macroHistory';
import { fetchMacroDashboard } from '../api/finance';
import { EventsCalendar } from '../components/EventsCalendar';
import { MACRO_COUNTRIES, MACRO_METRICS } from '../data/macroRegistry';
import { useTerminalStore } from '../store/useTerminalStore';
import { BlsIndicator, EurostatIndicator, MacroDashboardData, MacroMetricKey, MacroMetricSnapshot, OecdComparableIndicator } from '../types';
import { fmt } from '../utils/formatters';
import { getThemePalette, useTheme } from '../utils/theme';
import { formatMacroReading, formatMacroNumber, getMacroSeriesStyle, macroDeltaUnit, macroObservationAge } from '../utils/macroDisplay';
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
  const { activePanel, macroCountry: country, setMacroCountry: setCountry } = useTerminalStore();
  const [view, setView] = useState<MacroView>(activePanel === 'yield' ? 'yield' : 'dashboard');
  const [customRanges, setCustomRanges] = useState(false);
  const [sharedRange, setSharedRange] = useState<{ range: MacroWindow; revision: number }>({ range: '1Y', revision: 0 });
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
    isFetching: dashboardRefreshing,
    refetch: refreshDashboard,
  } = useQuery({
    queryKey: ['macro-dashboard', country],
    queryFn: () => fetchMacroDashboard([country]),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    enabled: view === 'dashboard',
  });

  const {
    data: compareData,
    isLoading: compareLoading,
    isError: compareError,
    isFetching: compareRefreshing,
    refetch: refreshCompare,
  } = useQuery({
    queryKey: ['macro-compare'],
    queryFn: () => fetchMacroDashboard(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    enabled: view === 'compare',
  });

  const selectedCountry = dashboardData?.countries[0];
  const selectedCountryName = MACRO_COUNTRIES.find((item) => item.code === country)?.label;

  const histories: MacroHistory[] = [
    ...Object.values(selectedCountry?.values ?? {}).flatMap(s => s ? [{ series: s.series, step: s.chartType === 'step' }] : []),
    ...(dashboardData?.bls?.indicators ?? []), ...(dashboardData?.oecdCountry?.indicators ?? []),
    ...(dashboardData?.eurostat?.indicators.filter(i => i.placement === 'detail') ?? []),
  ].filter(h => h.series.length > 1);
  // A dashboard preset must work independently for every plotted source, including older releases.
  const ranges = histories.map(h => availableMacroWindows([h]));
  for (const family of ['jolts', 'productivity', 'trade-prices', 'sector-payrolls']) {
    const group = dashboardData?.bls?.indicators.filter(i => i.family === family && i.series.length);
    if (group?.length) ranges.push(availableMacroWindows(group));
  }
  const activity = dashboardData?.eurostat?.indicators.filter(i => i.group === 'activity' && i.series.length);
  if (activity?.length) ranges.push(availableMacroWindows(activity));
  const commonRanges = ranges[0]?.filter(r => ranges.every(options => options.includes(r))) ?? [];
  const dashboardRange = commonRanges.includes(sharedRange.range) ? sharedRange.range : 'All';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex flex-col gap-2 px-4 py-2 panel-border-b bg-terminal-panel flex-shrink-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-terminal-accent font-bold text-sm tracking-wider">MACRO MONITOR</span>
          <span className="block sm:inline text-terminal-faint text-xs sm:ml-3">Ten economies · source dates and coverage vary</span>
        </div>
        {(view === 'dashboard' || view === 'compare') && (
          <div className="flex items-center justify-between gap-4">
            {view === 'dashboard' && <span aria-live="polite" className="text-terminal-text text-xs font-bold">{selectedCountryName}</span>}
            <button
              type="button"
              onClick={() => void (view === 'compare' ? refreshCompare() : refreshDashboard())}
              disabled={view === 'compare' ? compareRefreshing : dashboardRefreshing}
              className="text-terminal-muted text-xs hover:text-terminal-text disabled:opacity-50"
            >
              {(view === 'compare' ? compareRefreshing : dashboardRefreshing) ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 px-4 py-2 bg-terminal-bg panel-border-b flex-shrink-0">
        <div role="tablist" aria-label="Macro views" className="flex gap-1 overflow-x-auto pb-1">
          {VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`macro-tab-${item.key}`}
              tabIndex={view === item.key ? 0 : -1}
              aria-selected={view === item.key}
              aria-controls={`macro-view-${item.key}`}
              onClick={() => setView(item.key)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const current = VIEWS.findIndex((entry) => entry.key === view);
                const index = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1
                  : (current + (event.key === 'ArrowRight' ? 1 : -1) + VIEWS.length) % VIEWS.length;
                const next = VIEWS[index].key;
                setView(next);
                document.getElementById(`macro-tab-${next}`)?.focus();
              }}
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

        {view === 'dashboard' && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {MACRO_COUNTRIES.map((item) => (
              <button
                key={item.code}
                type="button"
                aria-pressed={item.code === country}
                aria-label={item.label}
                title={item.label}
                onClick={() => { setCountry(item.code); setCustomRanges(false); setSharedRange(current => ({ ...current, revision: current.revision + 1 })); }}
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

      <div role="tabpanel" id={`macro-view-${view}`} aria-labelledby={`macro-tab-${view}`} className="flex-1 overflow-hidden">
        {view === 'dashboard' && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            <MacroRangeContext.Provider value={{ range: dashboardRange, revision: sharedRange.revision, onOverride: () => setCustomRanges(true) }}>
            {dashboardData && <div className="flex flex-wrap items-center justify-between gap-2 text-terminal-faint text-[11px]">
              <span>Each chart ends at its latest published observation.</span>
              {commonRanges.length > 0 && <label className="flex items-center gap-2">All charts
                <MacroRangeSelect label="Time frame for all Macro charts" options={commonRanges} range={dashboardRange} mixed={customRanges}
                  onChange={range => { setSharedRange(current => ({ range, revision: current.revision + 1 })); setCustomRanges(false); }} /></label>}
            </div>}
            {dashboardData?.error && (
              <MacroAlert text={dashboardData.error} />
            )}
            {dashboardError && dashboardData && <MacroAlert text="Refresh failed. Previously received observations remain visible below." />}
            {dashboardLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="shimmer h-36 rounded" />
                ))}
              </div>
            ) : !selectedCountry ? (
              <PanelMessage text="Could not load macro dashboard" />
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
            </MacroRangeContext.Provider>
          </div>
        )}

        {view === 'compare' && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            {compareData?.error && (
              <div className="mb-4">
                <MacroAlert text={compareData.error} />
              </div>
            )}
            {compareError && compareData && <MacroAlert text="Refresh failed. Previously received comparison data remains visible below." />}
            {compareLoading ? (
              <div className="shimmer h-64 rounded" />
            ) : !compareData ? (
              <PanelMessage text="Could not load cross-country comparison" />
            ) : (
              <>
                <div className="text-terminal-faint text-xs leading-relaxed">Compare source definitions as well as values: GDP may be annualized or quarter-on-quarter, CPI may be annual or monthly, and short rates may be interbank proxies. Observation dates can differ. Open a cell's source for its exact series.</div>
                <div className="bg-terminal-panel border border-terminal-border rounded overflow-x-auto">
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
                              {item.values[metricKey] ? (
                                <a href={item.values[metricKey]!.sourceUrl} target="_blank" rel="noreferrer" className="block hover:text-terminal-accent" title={[item.values[metricKey]!.label, item.values[metricKey]!.areaScope, item.values[metricKey]!.seriesId].filter(Boolean).join(' · ')}>
                                  <span className="block">{formatMacroValue(item.values[metricKey])}</span>
                                  <span className="block text-[10px] font-normal text-terminal-faint whitespace-nowrap">{item.values[metricKey]!.date ?? 'Date unavailable'} · {item.values[metricKey]!.frequency}</span>
                                  <span className="block text-[10px] font-normal text-terminal-faint">{item.values[metricKey]!.label} ↗</span>
                                  {macroObservationAge(item.values[metricKey]!.date, item.values[metricKey]!.frequency) && <span className="block text-[10px] font-normal text-terminal-accent">{macroObservationAge(item.values[metricKey]!.date, item.values[metricKey]!.frequency)}</span>}
                                </a>
                              ) : <span className="text-terminal-faint">Unavailable</span>}
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
  const stepHistory = snapshot?.chartType === 'step';
  return (
    <div className="bg-terminal-panel border border-terminal-border rounded p-3 min-h-[12rem]">
      <div className="flex items-center justify-between mb-2">
        <div className="text-terminal-muted text-xs font-bold tracking-wider">{title}</div>
        {snapshot?.sourceUrl ? <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer" className="text-terminal-faint text-xs hover:text-terminal-text" title="Open the official source series">{snapshot.source ?? 'Source'} ↗</a> : <span className="text-terminal-faint text-xs">{snapshot?.source ?? 'FRED'}</span>}
      </div>

      {snapshot ? (
        <>
          <div className="text-terminal-text font-bold text-2xl tabular-nums">
            {formatMacroValue(snapshot)}
          </div>
          <div className="text-terminal-muted text-xs mt-1">
            {stepHistory ? 'Rate history · changes shown on their effective dates' : snapshot.change == null
              ? 'No prior print'
              : `Change vs prior print ${formatSignedValue(snapshot.change, 2)} ${macroDeltaUnit(snapshot.unit)}`}
          </div>
          <div className="text-terminal-faint text-[10px] mt-1">
            {[snapshot.frequency, snapshot.areaScope, snapshot.date].filter(Boolean).join(' · ')}
          </div>
          {macroObservationAge(snapshot.date, snapshot.frequency) && <div className="text-terminal-accent text-[10px] mt-1">{macroObservationAge(snapshot.date, snapshot.frequency)}</div>}
          <MacroHistoryChart title={title} unit={snapshot.unit} palette={palette} height="h-24"
            lines={[{ id: 'value', label: title, series: snapshot.series, step: stepHistory, stroke: palette.accent }]} />
        </>
      ) : (
        <div className="h-full flex items-center justify-center text-terminal-faint text-xs">
          No observation available
        </div>
      )}
    </div>
  );
}

function formatMacroValue(snapshot: MacroMetricSnapshot | null): string {
  if (!snapshot || snapshot.value == null) return '—';
  const decimals = snapshot.key === 'yield10y' || snapshot.key === 'policyRate' ? 2 : 1;
  return `${fmt.number(normalizeRoundedZero(snapshot.value, decimals), decimals)}${snapshot.unit}`;
}

function normalizeRoundedZero(value: number, decimals: number): number {
  return Math.abs(value) < 0.5 * (10 ** -decimals) ? 0 : value;
}

function formatSignedValue(value: number, decimals: 0 | 1 | 2): string {
  const normalized = normalizeRoundedZero(value, decimals);
  return `${normalized >= 0 ? '+' : ''}${formatMacroNumber(normalized, decimals)}`;
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
  const value = formatMacroReading(indicator.value, indicator.unit);
  const change = indicator.change == null ? 'No prior print' : `Change vs prior print ${formatSignedValue(indicator.change, 2)} ${macroDeltaUnit(indicator.unit)}`;
  return <SupplementalTrendCard
    title={indicator.label}
    value={value}
    detail={`${change} · ${indicator.date ?? 'Latest unavailable'} · ${indicator.frequency} · ${indicator.unitLabel}`}
    series={indicator.series}
    observationDate={indicator.date}
    observationFrequency={indicator.frequency}
    unit={indicator.unit}
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
  const value = formatMacroReading(indicator.value, indicator.unit);
  const change = indicator.change == null ? 'No prior print' : `Change vs prior print ${formatSignedValue(indicator.change, 2)} ${macroDeltaUnit(indicator.unit)}`;
  return <SupplementalTrendCard
    title={indicator.label}
    value={value}
    detail={`${change} · ${indicator.date ?? 'Latest unavailable'} · ${indicator.frequency} · ${indicator.seasonalAdjustment}`}
    series={indicator.series}
    observationDate={indicator.date}
    observationFrequency={indicator.frequency}
    unit={indicator.unit}
    sourceUrl={indicator.sourceUrl}
    color={palette.accent}
    palette={palette}
  />;
}

function OecdComparisonChart({ data, palette }: { data: NonNullable<MacroDashboardData['oecd']> | undefined; palette: ReturnType<typeof getThemePalette> }) {
  if (!data || data.indicators.length === 0) return null;
  const lines = data.indicators.flatMap((indicator, i) => indicator.series.length ? [{ id: indicator.countryCode, label: indicator.countryLabel, series: indicator.series, ...getMacroSeriesStyle(i, palette) }] : []);
  return (
    <section className="bg-terminal-panel border border-terminal-border rounded overflow-hidden">
      <div className="px-4 py-2 panel-border-b flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-terminal-muted text-xs font-bold tracking-wider">OECD LEADING INDICATOR COMPARISON</div>
          <div className="text-terminal-faint text-[10px] mt-1">Directional indicator · 100 = long-term trend · not a growth forecast · {data.status.toUpperCase()}</div>
        </div>
        <a href="https://www.oecd.org/en/data/insights/data-explainers/2024/09/api.html" target="_blank" rel="noreferrer" className="text-terminal-faint text-[10px] hover:text-terminal-text">OECD SOURCE ↗</a>
      </div>
      <div className="p-3"><MacroHistoryChart title="OECD leading indicator comparison" lines={lines} unit="index" palette={palette} reference={100} height="h-48" /></div>
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
        {indicators.filter((indicator) => indicator.group === 'labour').map((indicator) => <EurostatIndicatorChart key={indicator.id} indicator={indicator} palette={palette} />)}
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
  const value = formatMacroReading(indicator.value, indicator.unit);
  const change = indicator.change == null ? 'No prior print' : `Change vs prior print ${formatSignedValue(indicator.change, 1)} ${macroDeltaUnit(indicator.unit)}`;
  return <SupplementalTrendCard
    title={indicator.label}
    value={value}
    detail={`${change} · ${indicator.date ?? 'Latest unavailable'} · ${indicator.frequency} · ${indicator.unitLabel} · ${indicator.seasonalAdjustment}`}
    series={indicator.series}
    observationDate={indicator.date}
    observationFrequency={indicator.frequency}
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
  const lines = available.map(indicator => ({ id: indicator.id, label: indicator.shortLabel, series: indicator.series, ...getMacroSeriesStyle(indicators.indexOf(indicator), palette) }));
  const unit = Array.from(new Set(available.map((indicator) => indicator.unit))).join(' / ');
  return (
    <div className="bg-terminal-elevated border border-terminal-border rounded p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-terminal-muted text-xs font-bold tracking-wider">{title}</div>
        <div className="text-terminal-faint text-[10px]">{unit} · {Array.from(new Set(available.map((indicator) => indicator.frequency))).join(' + ')}</div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {indicators.map((indicator) => (
          <a key={indicator.id} href={indicator.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] hover:text-terminal-text">
            <span className="text-terminal-faint">{indicator.shortLabel}</span>{' '}
            <span className="text-terminal-text tabular-nums font-bold">{formatMacroReading(indicator.value, indicator.unit)}</span>{' '}
            <span className="text-terminal-faint">{indicator.date?.slice(0, 7) ?? 'unavailable'} ↗</span>
            {macroObservationAge(indicator.date, indicator.frequency) && <span className="text-terminal-accent"> · {macroObservationAge(indicator.date, indicator.frequency)}</span>}
          </a>
        ))}
      </div>
      <MacroHistoryChart title={title} unit={unit} palette={palette} lines={lines} height={compact ? 'h-32' : 'h-40'} />
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

function SupplementalTrendCard({ title, value, detail, series, unit, sourceUrl, color, palette, observationDate, observationFrequency }: {
  title: string;
  value: string;
  detail: string;
  series: Array<{ date: string; value: number }>;
  observationDate?: string;
  observationFrequency?: string;
  unit: string;
  sourceUrl: string;
  color: string;
  palette: ReturnType<typeof getThemePalette>;
}) {
  return (
    <div className="bg-terminal-elevated border border-terminal-border rounded p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-terminal-muted text-xs font-bold tracking-wider">{title}</div>
          <div className="text-terminal-text font-bold text-lg tabular-nums mt-1">{value}</div>
        </div>
        <a href={sourceUrl} target="_blank" rel="noreferrer" aria-label={`Source for ${title}`} className="text-terminal-faint text-[10px] hover:text-terminal-accent">SOURCE ↗</a>
      </div>
      <div className="text-terminal-faint text-[10px] mt-1">{detail}</div>
      {macroObservationAge(observationDate, observationFrequency) && <div className="text-terminal-accent text-[10px] mt-1">{macroObservationAge(observationDate, observationFrequency)}</div>}
      <MacroHistoryChart title={title} unit={unit} palette={palette} lines={[{ id: 'value', label: title, series, stroke: color }]} />
    </div>
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
