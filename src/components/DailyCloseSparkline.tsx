import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchChartWindow } from '../api/finance';
import { fmt } from '../utils/formatters';
import './DailyCloseSparkline.css';

const DAY = 86_400_000;

function isoDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function exchangeCalendar(timeZone: string) {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit' } as const;
  try {
    return new Intl.DateTimeFormat('en-CA', { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' });
  }
}

function calendarDay(timestamp: number, calendar: Intl.DateTimeFormat) {
  const parts = Object.fromEntries(calendar.formatToParts(timestamp).map(part => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

export function DailyCloseSparkline({ symbol, name = symbol, timeZone = 'UTC' }: {
  symbol: string;
  name?: string;
  timeZone?: string;
}) {
  const now = Date.now();
  const calendar = useMemo(() => exchangeCalendar(timeZone), [timeZone]);
  const end = calendarDay(now, calendar);
  const start = end - 30 * DAY;

  // Fetch once per symbol and UTC day. The extra boundary dates cover every exchange's
  // local sessions, even when the exchange date and Yahoo timestamp's UTC date differ.
  const utcToday = Math.floor(now / DAY) * DAY;
  const from = isoDate(utcToday - 32 * DAY);
  const to = isoDate(utcToday + DAY);
  const { data, dataUpdatedAt, isLoading, refetch } = useQuery({
    queryKey: ['chart', symbol, 'custom', '1d', from, to],
    queryFn: () => fetchChartWindow(symbol, { interval: '1d', period1: from, period2: to }),
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });

  // An overview left open overnight can still have yesterday's intraday reading in cache.
  const completeBefore = dataUpdatedAt ? calendarDay(dataUpdatedAt, calendar) : end;
  useEffect(() => {
    if (completeBefore < end) void refetch({ cancelRefetch: false });
  }, [completeBefore, end, refetch]);

  const observations = useMemo(() => {
    const closes = new Map<number, { timestamp: number; close: number }>();
    const signedContract = symbol.endsWith('=F');
    for (const point of data?.points ?? []) {
      if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.close)) continue;
      if (point.close <= 0 && !signedContract) continue;
      // Date-only daily bars arrive as midnight UTC. Their date is already the
      // session date; unlike an exchange-open timestamp it needs no conversion.
      const day = point.timestamp % DAY === 0 ? point.timestamp : calendarDay(point.timestamp, calendar);
      if (day < start || day >= end || day >= completeBefore) continue;
      const previous = closes.get(day);
      if (!previous || previous.timestamp <= point.timestamp) closes.set(day, point);
    }
    return [...closes].sort(([a], [b]) => a - b);
  }, [data?.points, symbol, calendar, start, end, completeBefore]);

  if (observations.length < 2) {
    const message = isLoading ? 'Loading daily closes' : 'Insufficient daily closes in the last 30 days';
    return <span className="daily-close-sparkline-missing text-terminal-faint" title={message} aria-label={message}>—</span>;
  }

  const values = observations.map(([, point]) => point.close);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const [firstDay, first] = observations[0];
  const [lastDay, last] = observations[observations.length - 1];
  const description = `${name}: ${observations.length} daily closes, ${fmt.price(first.close)} on ${isoDate(firstDay)} to ${fmt.price(last.close)} on ${isoDate(lastDay)}.`;
  const trace = observations.map(([day, { close }]) => ({
    x: 4 + 108 * (day - start) / (end - DAY - start),
    y: high === low ? 16 : 28 - 24 * (close - low) / (high - low),
  }));
  const endpoint = trace[trace.length - 1];

  return <svg className="daily-close-sparkline" viewBox="0 0 116 32" role="img" aria-label={description}>
    <title>{description}</title>
    <polyline
      points={trace.map(({ x, y }) => `${x},${y}`).join(' ')}
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
    <circle cx={endpoint.x} cy={endpoint.y} r="2.5" fill="var(--terminal-accent)" />
  </svg>;
}
