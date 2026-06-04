import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchMacroDashboard } from '../api/finance';
import { EventsCalendar } from '../components/EventsCalendar';
import { MACRO_COUNTRIES, MACRO_METRICS } from '../data/macroRegistry';
import { useTerminalStore } from '../store/useTerminalStore';
import { MacroCountryCode, MacroMetricKey, MacroMetricSnapshot } from '../types';
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
                      title={MACRO_METRICS[metricKey].label}
                      snapshot={selectedCountry.values[metricKey]}
                      palette={themePalette}
                    />
                  ))}
                </div>

                <div className="bg-terminal-panel border border-terminal-border rounded p-4">
                  <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">
                    CROSS-MARKET SNAPSHOT
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                    {METRIC_KEYS.map((metricKey) => {
                      const snapshot = selectedCountry.values[metricKey];
                      return (
                        <div key={metricKey} className="bg-terminal-elevated border border-terminal-border rounded p-3">
                          <div className="text-terminal-faint text-xs mb-1">{MACRO_METRICS[metricKey].shortLabel}</div>
                          <div className="text-terminal-text font-bold text-lg tabular-nums">
                            {formatMacroValue(snapshot)}
                          </div>
                          <div className="text-terminal-muted text-xs mt-1">
                            {snapshot?.date ? new Date(`${snapshot.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Latest value unavailable'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {view === 'compare' && (
          <div className="h-full overflow-y-auto p-4">
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
              : `Delta ${snapshot.change >= 0 ? '+' : ''}${snapshot.change.toFixed(2)} ${snapshot.unit}`}
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
  return `${fmt.number(snapshot.value, snapshot.key === 'yield10y' || snapshot.key === 'policyRate' ? 2 : 1)}${snapshot.unit}`;
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
