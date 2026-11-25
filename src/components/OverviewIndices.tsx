import { useQueries } from '@tanstack/react-query';
import { fetchChartWindow } from '../api/finance';
import type { ChartPoint, Quote } from '../types';
import { changeColor, fmt } from '../utils/formatters';
import './OverviewIndices.css';

const DAY = 86_400_000;
const tradingDate = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York',
});

function isoDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function IndexHistory({ name, points, start, end, loading }: {
  name: string;
  points: readonly ChartPoint[];
  start: number;
  end: number;
  loading: boolean;
}) {
  const closes = new Map<number, number>();
  for (const { timestamp, close } of points) {
    if (timestamp >= start && timestamp < end && Number.isFinite(close) && close > 0) {
      // These five US indices trade on the same UTC date as their New York session.
      closes.set(Math.floor(timestamp / DAY) * DAY, close);
    }
  }
  const observations = [...closes].sort(([a], [b]) => a - b);
  if (observations.length < 2) {
    const message = loading ? 'Loading daily closes' : 'Insufficient daily closes in the last 30 days';
    return <span className="text-terminal-faint" title={message} aria-label={message}>—</span>;
  }

  const values = observations.map(([, close]) => close);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const first = observations[0];
  const last = observations[observations.length - 1];
  const description = `${name}: ${observations.length} daily closes, ${fmt.price(first[1])} on ${isoDate(first[0])} to ${fmt.price(last[1])} on ${isoDate(last[0])}.`;
  // Keep the same calendar axis on every row, including weekends and missing sessions.
  const trace = observations.map(([day, close]) => ({
    x: 4 + 108 * (day - start) / (end - DAY - start),
    y: high === low ? 16 : 28 - 24 * (close - low) / (high - low),
  }));
  const endpoint = trace[trace.length - 1];

  return <svg className="overview-index-trend" viewBox="0 0 116 32" role="img" aria-label={description}>
    <title>{description}</title>
    <polyline
      points={trace.map(({ x, y }) => `${x},${y}`).join(' ')}
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
    <circle cx={endpoint.x} cy={endpoint.y} r="2.5" fill="var(--terminal-accent)" />
  </svg>;
}

export function OverviewIndices({ symbols, names, quotes, loading, onSelect }: {
  symbols: readonly string[];
  names: Readonly<Record<string, string>>;
  quotes: readonly Quote[];
  loading: boolean;
  onSelect: (symbol: string) => void;
}) {
  // Yahoo's end date is exclusive. A completed-day window omits today's provisional candle.
  const { year, month, day } = Object.fromEntries(tradingDate.formatToParts(new Date()).map(part => [part.type, part.value]));
  const end = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const start = end - 30 * DAY;
  const from = isoDate(start);
  const to = isoDate(end);
  const history = useQueries({
    queries: symbols.map(symbol => ({
      queryKey: ['chart', symbol, 'custom', '1d', from, to],
      queryFn: () => fetchChartWindow(symbol, { interval: '1d', period1: from, period2: to }),
      staleTime: 60 * 60_000,
      gcTime: 60 * 60_000,
      retry: 1,
    })),
  });

  return <section className="overview-primary-panel" aria-label="Major indices">
    <h2 className="instrument-heading">MAJOR INDICES</h2>
    <table className="overview-indices-table" aria-label="Major indices" aria-busy={loading}>
      <thead><tr>
        <th scope="col">Index</th>
        <th scope="col">Last</th>
        <th scope="col">1D move</th>
        <th scope="col" title="Reported daily closes for the last 30 complete calendar days, New York time">30D</th>
      </tr></thead>
      <tbody>{symbols.map((symbol, index) => {
        const name = names[symbol] ?? symbol;
        const quote = quotes.find(item => item.symbol === symbol);
        const series = history[index];
        return <tr key={symbol} onClick={() => onSelect(symbol)}>
          <th scope="row"><button type="button" aria-label={`Open ${name} in Equity`}>{name}</button></th>
          <td className="overview-index-price">{fmt.price(quote?.regularMarketPrice)}</td>
          <td className="overview-index-move">
            <div className={changeColor(quote?.regularMarketChangePercent)}>{fmt.pct(quote?.regularMarketChangePercent)}</div>
            <div className="overview-index-points" title="Point change">{fmt.change(quote?.regularMarketChange)}</div>
          </td>
          <td><IndexHistory name={name} points={series.data?.points ?? []} start={start} end={end} loading={series.isLoading} /></td>
        </tr>;
      })}</tbody>
    </table>
  </section>;
}
