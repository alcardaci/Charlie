import type { ChartPoint, ChartRange } from '../types';

export type PortfolioHistoryLot = {
  id: string;
  symbol: string;
  shares: number;
  avgCost: number;
  purchaseDate: string;
  conversionRate: number | null;
  priceScale?: number | null;
};

export type PortfolioHistoryPoint = {
  timestamp: number;
  label: string;
  value: number;
  cost: number;
  gainLoss: number;
  gainLossPct: number;
};

export type PortfolioChartPoint = PortfolioHistoryPoint & { benchmarkClose?: number };

export function isValidPortfolioPurchaseDate(value: string, today = new Date().toISOString().slice(0, 10)): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value && value <= today;
}

export function formatPortfolioHistoryLabel(timestamp: number, range: ChartRange): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: range === '5y' || range === 'max' ? undefined : 'numeric',
    ...(range === '5y' || range === 'max' ? { year: '2-digit' } : {}),
  }).format(new Date(timestamp));
}

// Align daily closes by observation date rather than mixing exchange close times.
// A market holiday carries the latest available close; no future close is used.
export function buildPortfolioHistory(
  lots: PortfolioHistoryLot[],
  chartSeries: Array<{ symbol: string; points: ChartPoint[] }>,
  range: ChartRange
): PortfolioHistoryPoint[] {
  const normalizedSeries = chartSeries.map((series) => {
    const byDay = new Map<number, ChartPoint>();
    for (const point of [...series.points].sort((left, right) => left.timestamp - right.timestamp)) {
      if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.close) || point.close <= 0) continue;
      const day = Math.floor(point.timestamp / 86400000) * 86400000;
      byDay.set(day, { ...point, timestamp: day });
    }
    return { symbol: series.symbol, points: [...byDay.values()] };
  }).filter((series) => series.points.length > 0);
  const symbolsWithHistory = new Set(normalizedSeries.map((series) => series.symbol));
  const coveredLots = lots.filter((lot) => symbolsWithHistory.has(lot.symbol)
    && lot.conversionRate != null && Number.isFinite(lot.conversionRate) && lot.conversionRate > 0
    && lot.priceScale !== null);
  const timeline = [...new Set(normalizedSeries.flatMap((series) => series.points.map((point) => point.timestamp)))].sort((a, b) => a - b);
  const cursors = new Map<string, number>();
  const latestPrices = new Map<string, number>();
  const history: PortfolioHistoryPoint[] = [];

  for (const timestamp of timeline) {
    for (const series of normalizedSeries) {
      let cursor = cursors.get(series.symbol) ?? 0;
      while (cursor < series.points.length && series.points[cursor].timestamp <= timestamp) {
        latestPrices.set(series.symbol, series.points[cursor].close);
        cursor += 1;
      }
      cursors.set(series.symbol, cursor);
    }
    let value = 0;
    let cost = 0;
    let activeCount = 0;
    let incomplete = false;
    for (const lot of coveredLots) {
      const purchaseTime = Date.parse(`${lot.purchaseDate}T00:00:00Z`);
      if (!Number.isFinite(purchaseTime) || purchaseTime > timestamp) continue;
      const price = latestPrices.get(lot.symbol);
      if (price == null) { incomplete = true; break; }
      activeCount += 1;
      value += lot.shares * price * (lot.priceScale ?? 1) * lot.conversionRate!;
      cost += lot.shares * lot.avgCost * lot.conversionRate!;
    }
    if (!activeCount || incomplete) continue;
    const gainLoss = value - cost;
    history.push({ timestamp, label: formatPortfolioHistoryLabel(timestamp, range), value, cost, gainLoss, gainLossPct: cost ? gainLoss / cost * 100 : 0 });
  }
  // Missing history stays missing: a current quote is not a historical observation.
  return history;
}

export function trimPortfolioHistory(points: PortfolioHistoryPoint[], lookbackDays?: number): PortfolioHistoryPoint[] {
  if (!lookbackDays || points.length <= 1) return points;
  const start = points[points.length - 1].timestamp - lookbackDays * 86400000;
  return points.filter((point) => point.timestamp >= start);
}

export function buildBenchmarkOverlay(history: PortfolioHistoryPoint[], benchmarkPoints: ChartPoint[]): PortfolioChartPoint[] {
  const sorted = benchmarkPoints.filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.close) && point.close > 0)
    .map((point) => ({ ...point, timestamp: Math.floor(point.timestamp / 86400000) * 86400000 }))
    .sort((a, b) => a.timestamp - b.timestamp);
  let cursor = 0;
  let close: number | undefined;
  return history.map((point) => {
    while (cursor < sorted.length && sorted[cursor].timestamp <= point.timestamp) close = sorted[cursor++].close;
    return close == null ? point : { ...point, benchmarkClose: close };
  });
}

export type AxisScale = { domain: [number, number]; ticks: number[]; step: number };

function niceStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const niceFraction = [1, 2, 2.5, 5, 10].find((candidate) => candidate >= fraction) ?? 10;
  return niceFraction * 10 ** exponent;
}

export function buildAdaptiveAxisScale(values: number[], options?: { clampMinToZero?: boolean; tickCount?: number }): AxisScale {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1], step: 0.25 };
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const spread = max - min;
  // For varying data, pad its visible spread, not its absolute monetary level.
  // Truly flat data receives a modest range without inventing movement.
  const padding = spread > 0 ? Math.max(spread * 0.1, Math.abs(max) * 1e-10, 1e-8) : Math.max(Math.abs(min) * 0.01, 0.01);
  const paddedMin = options?.clampMinToZero ? Math.max(0, min - padding) : min - padding;
  const paddedMax = max + padding;
  const step = niceStep((paddedMax - paddedMin) / Math.max(1, (options?.tickCount ?? 5) - 1));
  let lower = Math.floor(paddedMin / step) * step;
  if (options?.clampMinToZero) lower = Math.max(0, lower);
  const upper = Math.max(Math.ceil(paddedMax / step) * step, lower + step);
  const ticks = Array.from({ length: Math.min(20, Math.round((upper - lower) / step) + 1) }, (_, index) => Number((lower + index * step).toPrecision(12)));
  return { domain: [lower, upper], ticks, step };
}
