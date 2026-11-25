import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchQuotes } from '../api/finance';
import { fmt } from '../utils/formatters';
import { finiteMarketValue, yieldSpreadBasisPoints } from '../utils/marketPanelDisplay';
import { getThemePalette, useTheme } from '../utils/theme';

const YIELD_INSTRUMENTS = [
  { symbol: '^IRX', label: '13W', maturity: '13-week bill', months: 3 },
  { symbol: '^FVX', label: '5Y', maturity: '5-year note', months: 60 },
  { symbol: '^TNX', label: '10Y', maturity: '10-year note', months: 120 },
  { symbol: '^TYX', label: '30Y', maturity: '30-year bond', months: 360 },
];
const YIELD_SYMBOLS = YIELD_INSTRUMENTS.map((instrument) => instrument.symbol);

export function YieldPanel() {
  useTheme();
  const palette = getThemePalette();
  const { data: quotes = [], isLoading, isError, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['yield-curve', YIELD_SYMBOLS],
    queryFn: async () => {
      const result = await fetchQuotes(YIELD_SYMBOLS);
      if (!result.length) throw new Error('Treasury yield quotes unavailable');
      return result;
    },
    refetchInterval: 120000,
    staleTime: 60000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const curveData = YIELD_INSTRUMENTS.map((instrument) => ({
    ...instrument,
    rate: finiteMarketValue(quoteMap.get(instrument.symbol)?.regularMarketPrice),
  }));
  const validCount = curveData.filter((point) => point.rate != null).length;
  const shortRate = curveData.find((point) => point.symbol === '^IRX')?.rate;
  const longRate = curveData.find((point) => point.symbol === '^TNX')?.rate;
  const spread = yieldSpreadBasisPoints(shortRate, longRate);
  const comparison = spread == null ? 'Comparison unavailable' : spread < 0 ? '10Y below 13W' : spread > 0 ? '10Y above 13W' : '10Y equals 13W';

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <h1 className="text-terminal-accent font-bold text-sm tracking-wider">US TREASURY YIELD SNAPSHOT</h1>
        <button type="button" onClick={() => void refetch()} disabled={isFetching} className="rounded border border-terminal-border px-3 py-1 text-terminal-muted text-xs hover:text-terminal-text disabled:opacity-50">{isFetching ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <div className="text-terminal-faint text-xs leading-relaxed">
        Yahoo Finance yield indexes · {validCount}/4 maturities available · quotes may be delayed. {dataUpdatedAt ? `Checked ${new Date(dataUpdatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.` : ''}
      </div>
      {isError && <div role="status" className="rounded border border-terminal-border p-3 text-terminal-muted text-xs">{quotes.length ? 'Refresh failed. Last received yields remain visible.' : 'Treasury yield quotes are unavailable. Use Refresh to try again.'}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {YIELD_INSTRUMENTS.map((instrument) => {
          const quote = quoteMap.get(instrument.symbol);
          const rate = finiteMarketValue(quote?.regularMarketPrice);
          const change = finiteMarketValue(quote?.regularMarketChange);
          return <div key={instrument.symbol} className="bg-terminal-panel border border-terminal-border rounded p-3">
            <div className="text-terminal-faint text-xs mb-1">{instrument.maturity}</div>
            <div className="text-terminal-text font-bold text-lg tabular-nums">{rate == null ? isLoading ? 'Loading…' : 'Unavailable' : `${fmt.number(rate, 3)}%`}</div>
            <div className="text-terminal-muted text-xs mt-1 tabular-nums">{change == null ? 'Change unavailable' : `${fmt.change(change * 100, 1)} bps vs prior close`}</div>
          </div>;
        })}
      </div>

      <div className="bg-terminal-panel border border-terminal-border rounded p-4">
        <div className="text-terminal-muted text-xs font-bold tracking-wider">AVAILABLE TREASURY MATURITIES</div>
        <div className="text-terminal-faint text-[11px] mt-1 mb-3">Horizontal distance reflects time to maturity. Lines join available observations; intermediate tenors are not measured.</div>
        {validCount < 2 ? <div className="h-48 flex items-center justify-center text-terminal-faint text-xs">{isLoading ? 'Loading yield data…' : 'At least two yields are needed to plot the snapshot.'}</div> : (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={curveData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs><linearGradient id="yieldGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={palette.accent} stopOpacity={0.2} /><stop offset="95%" stopColor={palette.accent} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.chartGrid} />
              <XAxis dataKey="months" type="number" domain={[0, 360]} ticks={[3, 60, 120, 360]} tickFormatter={(months: number) => YIELD_INSTRUMENTS.find((instrument) => instrument.months === months)?.label ?? ''} tick={{ fill: palette.muted, fontSize: 11 }} axisLine={{ stroke: palette.border }} tickLine={false} />
              <YAxis domain={['auto', 'auto']} tick={{ fill: palette.muted, fontSize: 11 }} axisLine={{ stroke: palette.border }} tickLine={false} tickFormatter={(value: number) => `${value.toFixed(2)}%`} />
              <Tooltip contentStyle={{ background: palette.elevated, border: `1px solid ${palette.border}`, borderRadius: '4px', fontSize: '11px' }} labelStyle={{ color: palette.text }} formatter={(value: number) => [`${value.toFixed(3)}%`, 'Yield']} labelFormatter={(months) => YIELD_INSTRUMENTS.find((instrument) => instrument.months === Number(months))?.maturity ?? ''} />
              <Area type="linear" dataKey="rate" stroke={palette.accent} strokeWidth={2} fill="url(#yieldGradient)" dot={{ fill: palette.accent, r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-terminal-panel border border-terminal-border rounded overflow-x-auto">
        <table className="data-table w-full">
          <thead><tr><th className="text-left">MATURITY</th><th>YIELD (%)</th><th>CHANGE (bps)</th><th>PREVIOUS CLOSE (%)</th></tr></thead>
          <tbody>{YIELD_INSTRUMENTS.map((instrument) => {
            const quote = quoteMap.get(instrument.symbol);
            const rate = finiteMarketValue(quote?.regularMarketPrice);
            const change = finiteMarketValue(quote?.regularMarketChange);
            const previous = finiteMarketValue(quote?.regularMarketPreviousClose);
            return <tr key={instrument.symbol}><td className="text-terminal-text">{instrument.maturity}</td><td className="tabular-nums font-bold">{fmt.number(rate, 3)}</td><td className="tabular-nums">{change == null ? '—' : fmt.change(change * 100, 1)}</td><td className="tabular-nums text-terminal-muted">{fmt.number(previous, 3)}</td></tr>;
          })}</tbody>
        </table>
      </div>

      <div className="bg-terminal-panel border border-terminal-border rounded p-3">
        <div className="text-terminal-muted text-xs font-bold tracking-wider mb-2">10-YEAR MINUS 13-WEEK SPREAD</div>
        <div className="flex flex-wrap items-center gap-4"><span className="font-bold tabular-nums text-lg text-terminal-text">{spread == null ? 'Unavailable' : `${fmt.change(spread, 1)} bps`}</span><span className="text-terminal-accent text-sm">{comparison}</span></div>
        <div className="text-terminal-faint text-xs leading-relaxed mt-2">This compares two quoted yields. A negative spread means the longer yield is below the shorter one; it is not a recession forecast or an estimate of recession probability.</div>
      </div>
    </div>
  );
}
