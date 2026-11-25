import type { PredictionForecast, PredictionForecastSnapshot } from '../types';

/** Source pages can overlap as trading volume changes. Keep the first position of each event. */
export function predictionRowsFromPages(pages: PredictionForecastSnapshot[]): PredictionForecast[] {
  const seen = new Set<string>();
  return pages.flatMap(page => page.forecasts.filter(forecast => {
    const key = forecast.url ?? forecast.eventTitle ?? forecast.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}

/** Symbol text alone is not an identity: unrelated crypto assets can share it. */
export function cryptoChartSymbol(coin: { id: string; symbol: string }): string | null {
  const mappings: Record<string, { symbol: string; chart: string }> = {
    bitcoin: { symbol: 'btc', chart: 'BTC-USD' },
    ethereum: { symbol: 'eth', chart: 'ETH-USD' },
  };
  const match = mappings[coin.id];
  return match && coin.symbol.toLowerCase() === match.symbol ? match.chart : null;
}

export function finiteMarketValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function trackedMarketCap(coins: Array<{ market_cap?: number | null }>): number | null {
  const caps = coins.map(coin => finiteMarketValue(coin.market_cap)).filter((cap): cap is number => cap !== null && cap >= 0);
  return caps.length ? caps.reduce((sum, cap) => sum + cap, 0) : null;
}

/** Reject partial parses such as 12abc and malformed thousands separators. */
export function parseCurrencyAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(trimmed)) return null;
  return finiteMarketValue(Number(trimmed.replace(/,/g, '')));
}

export function formatPredictionProbability(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0 || value > 1) return '—';
  if (value === 0) return '0%';
  if (value === 1) return '100%';
  const decimals = value < 0.01 || value > 0.99 ? 2 : 1;
  const rounded = Number((value * 100).toFixed(decimals));
  if (rounded === 0) return '<0.01%';
  if (rounded === 100) return '>99.99%';
  return `${rounded}%`;
}

export function formatPredictionMove(change: number | null | undefined): string {
  if (change == null || !Number.isFinite(change)) return '—';
  if (change === 0) return '0 pp';
  const points = Math.abs(change * 100);
  if (points < 0.01) return change > 0 ? 'up <0.01 pp' : 'down <0.01 pp';
  const magnitude = Number(points.toFixed(points < 1 ? 2 : 1)).toString();
  return `${change > 0 ? '+' : '−'}${magnitude} pp`;
}

export function formatSentimentScore(score: number | null): string {
  if (score == null || !Number.isFinite(score)) return 'Unavailable';
  if (score > 0 && score < 0.1) return '<0.1';
  if (score < 100 && score > 99.9) return '>99.9';
  return score.toFixed(1);
}

export function yieldSpreadBasisPoints(shortRate: number | null | undefined, longRate: number | null | undefined): number | null {
  return shortRate != null && longRate != null && Number.isFinite(shortRate) && Number.isFinite(longRate)
    ? (longRate - shortRate) * 100
    : null;
}
