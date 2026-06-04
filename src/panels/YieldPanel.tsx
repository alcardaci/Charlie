import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart
} from 'recharts';
import { fetchQuotes } from '../api/finance';
import { fmt, changeColor } from '../utils/formatters';
import { getThemePalette, useTheme } from '../utils/theme';

const YIELD_INSTRUMENTS = [
  { symbol: '^IRX', label: '13W', maturity: '3 Month', months: 0.25 },
  { symbol: '^FVX', label: '5Y', maturity: '5 Year', months: 60 },
  { symbol: '^TNX', label: '10Y', maturity: '10 Year', months: 120 },
  { symbol: '^TYX', label: '30Y', maturity: '30 Year', months: 360 },
];

// Additional rates via ETF proxies (proxy yields aren't directly available for all maturities)
const TREASURY_ETFS = [
  { symbol: 'SHY', label: '1-3Y', maturity: '~2 Year', note: 'SHY ETF' },
  { symbol: 'IEI', label: '3-7Y', maturity: '~5 Year', note: 'IEI ETF' },
  { symbol: 'IEF', label: '7-10Y', maturity: '~8 Year', note: 'IEF ETF' },
  { symbol: 'TLT', label: '20Y+', maturity: '~25 Year', note: 'TLT ETF' },
];

export function YieldPanel() {
  useTheme();
  const themePalette = getThemePalette();
  const yieldSymbols = YIELD_INSTRUMENTS.map((y) => y.symbol);

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['yield-curve', yieldSymbols],
    queryFn: () => fetchQuotes(yieldSymbols),
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  // Build yield curve data
  const curveData = YIELD_INSTRUMENTS.map((inst) => {
    const q = quoteMap.get(inst.symbol);
    return {
      label: inst.label,
      maturity: inst.maturity,
      rate: q?.regularMarketPrice ?? null,
      change: q?.regularMarketChange ?? null,
      changePct: q?.regularMarketChangePercent ?? null,
      symbol: inst.symbol,
    };
  }).filter((d) => d.rate !== null);

  // Check if inverted (short > long)
  const threeMonth = curveData.find((d) => d.label === '13W')?.rate;
  const tenYear = curveData.find((d) => d.label === '10Y')?.rate;
  const isInverted = threeMonth && tenYear && threeMonth > tenYear;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-terminal-accent font-bold text-sm tracking-wider">US TREASURY YIELD CURVE</h1>
        {isInverted !== undefined && (
          <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border ${
            isInverted
              ? 'text-terminal-negative border-terminal-negative/40 bg-terminal-negative/10'
              : 'text-terminal-positive border-terminal-positive/40 bg-terminal-positive/10'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isInverted ? 'bg-terminal-negative' : 'bg-terminal-positive'}`} />
            {isInverted ? 'CURVE INVERTED' : 'NORMAL CURVE'}
          </div>
        )}
      </div>

      {/* Key yields row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {YIELD_INSTRUMENTS.map((inst) => {
          const q = quoteMap.get(inst.symbol);
          return (
            <div key={inst.symbol} className="bg-terminal-panel border border-terminal-border rounded p-3">
              <div className="text-terminal-faint text-xs mb-1">{inst.maturity} Treasury</div>
              <div className="text-terminal-text font-bold text-lg tabular-nums">
                {q ? `${fmt.number(q.regularMarketPrice)}%` : isLoading ? '...' : '—'}
              </div>
              {q && (
                <div className={`text-xs tabular-nums ${changeColor(q.regularMarketChangePercent)}`}>
                  {fmt.change(q.regularMarketChange, 3)} ({fmt.pct(q.regularMarketChangePercent)})
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Yield curve chart */}
      <div className="bg-terminal-panel border border-terminal-border rounded p-4">
        <div className="text-terminal-muted text-xs font-bold tracking-wider mb-4">YIELD CURVE</div>
        {curveData.length < 2 ? (
          <div className="h-48 flex items-center justify-center text-terminal-faint text-xs">
            {isLoading ? 'Loading yield data...' : 'Insufficient data to plot curve'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={curveData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="yieldGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={themePalette.accent} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={themePalette.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={themePalette.chartGrid} />
              <XAxis
                dataKey="label"
                tick={{ fill: themePalette.muted, fontSize: 11 }}
                axisLine={{ stroke: themePalette.border }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: themePalette.muted, fontSize: 11 }}
                axisLine={{ stroke: themePalette.border }}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{ background: themePalette.elevated, border: `1px solid ${themePalette.border}`, borderRadius: '4px', fontSize: '11px' }}
                labelStyle={{ color: themePalette.text, fontWeight: 'bold' }}
                formatter={(v: number) => [`${v?.toFixed(3)}%`, 'Yield']}
                labelFormatter={(label) => {
                  const item = curveData.find((d) => d.label === label);
                  return item?.maturity ?? label;
                }}
              />
              <Area
                type="monotone"
                dataKey="rate"
                stroke={themePalette.accent}
                strokeWidth={2}
                fill="url(#yieldGradient)"
                dot={{ fill: themePalette.accent, r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: themePalette.accent }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Detailed table */}
      <div className="bg-terminal-panel border border-terminal-border rounded overflow-hidden">
        <div className="px-3 py-2 panel-border-b">
          <span className="text-terminal-muted text-xs font-bold tracking-wider">TREASURY RATES</span>
        </div>
        <table className="data-table w-full">
          <thead>
            <tr>
              <th className="text-left">MATURITY</th>
              <th>YIELD (%)</th>
              <th>CHANGE (bps)</th>
              <th>CHANGE %</th>
              <th>PREV CLOSE</th>
            </tr>
          </thead>
          <tbody>
            {YIELD_INSTRUMENTS.map((inst) => {
              const q = quoteMap.get(inst.symbol);
              const bps = q ? (q.regularMarketChange * 100).toFixed(1) : '—';
              const bpsColor = q && q.regularMarketChange >= 0 ? 'text-terminal-negative' : 'text-terminal-positive';
              // Higher yields = bad for bonds, so color is inverted
              return (
                <tr key={inst.symbol}>
                  <td className="text-terminal-text">{inst.maturity} Bill/Note/Bond</td>
                  <td className="tabular-nums font-bold">{q ? `${fmt.number(q.regularMarketPrice)}%` : '—'}</td>
                  <td className={`tabular-nums ${bpsColor}`}>{bps !== '—' ? `${parseFloat(bps) >= 0 ? '+' : ''}${bps} bps` : '—'}</td>
                  <td className={`tabular-nums ${changeColor(q?.regularMarketChangePercent)}`}>{q ? fmt.pct(q.regularMarketChangePercent) : '—'}</td>
                  <td className="tabular-nums text-terminal-muted">{q ? `${fmt.number(q.regularMarketPreviousClose)}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Spread analysis */}
      {tenYear && threeMonth && (
        <div className="bg-terminal-panel border border-terminal-border rounded p-3">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-2">SPREAD ANALYSIS</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-terminal-faint mb-0.5">10Y - 3M Spread</div>
              <div className={`font-bold tabular-nums text-sm ${tenYear - threeMonth >= 0 ? 'text-terminal-positive' : 'text-terminal-negative'}`}>
                {((tenYear - threeMonth) * 100).toFixed(1)} bps
              </div>
            </div>
            <div>
              <div className="text-terminal-faint mb-0.5">Curve Shape</div>
              <div className={`font-bold text-sm ${isInverted ? 'text-terminal-negative' : 'text-terminal-positive'}`}>
                {isInverted ? 'Inverted' : 'Normal'}
              </div>
            </div>
            <div>
              <div className="text-terminal-faint mb-0.5">Recession Signal</div>
              <div className={`font-bold text-sm ${isInverted ? 'text-terminal-negative' : 'text-terminal-muted'}`}>
                {isInverted ? 'ELEVATED RISK' : 'LOW'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
