import type { ChartPoint } from '../types';

/** Chart libraries require finite, unique, strictly increasing observations. */
export function prepareChartPoints(points: ChartPoint[]): ChartPoint[] {
  const byTime = new Map<number, ChartPoint>();
  for (const point of points) {
    if (![point.timestamp, point.open, point.high, point.low, point.close].every(Number.isFinite)) continue;
    if (point.low > Math.min(point.open, point.close) || point.high < Math.max(point.open, point.close) || point.low > point.high) continue;
    const timestamp = Math.floor(point.timestamp / 1000) * 1000;
    byTime.set(timestamp, { ...point, timestamp, volume: Number.isFinite(point.volume) && point.volume >= 0 ? point.volume : 0 });
  }
  return [...byTime.values()].sort((left, right) => left.timestamp - right.timestamp);
}
