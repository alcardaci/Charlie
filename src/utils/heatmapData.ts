import type { Quote } from '../types';

export type HeatmapSizeMode = 'market-cap' | 'equal';
export type HeatmapEntry = {
  name: string;
  symbol: string;
  shortName: string;
  value: number;
  changePct: number | null;
  group: string;
  marketCap: number | null;
};

/** Recharts Treemap passes flattened node fields, unlike Tooltip's payload. */
export function heatmapNodeEntry(node: unknown): HeatmapEntry | null {
  if (!node || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  const entry = record.payload && typeof record.payload === 'object'
    ? record.payload as Record<string, unknown>
    : record;
  if (typeof entry.symbol !== 'string' || typeof entry.shortName !== 'string' || typeof entry.value !== 'number') return null;
  return {
    name: entry.symbol,
    symbol: entry.symbol,
    shortName: entry.shortName,
    value: entry.value,
    group: typeof entry.group === 'string' ? entry.group : '',
    marketCap: positiveMarketCap(entry.marketCap),
    changePct: typeof entry.changePct === 'number' && Number.isFinite(entry.changePct) ? entry.changePct : null,
  };
}

export function positiveMarketCap(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function heatmapQuoteChange(quote: Pick<Quote, 'regularMarketChangePercent'> | undefined): number | null {
  const value = quote?.regularMarketChangePercent;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function buildHeatmapEntries(
  groups: Array<{ label: string; stocks: string[] }>,
  quotes: Map<string, Quote>,
  sizeMode: HeatmapSizeMode,
): HeatmapEntry[] {
  return groups.flatMap((group) => group.stocks.flatMap((symbol) => {
    const quote = quotes.get(symbol);
    if (!quote) return [];
    const marketCap = positiveMarketCap(quote.marketCap);
    if (sizeMode === 'market-cap' && marketCap == null) return [];
    return [{
      name: symbol, symbol, shortName: quote.shortName || quote.longName || symbol,
      value: sizeMode === 'equal' ? 1 : marketCap!,
      changePct: heatmapQuoteChange(quote), group: group.label, marketCap,
    }];
  })).sort((left, right) => right.value - left.value || left.symbol.localeCompare(right.symbol));
}

/** Unknown returns do not count as flat and do not dilute the weighted sample. */
export function weightedHeatmapChange(entries: HeatmapEntry[]): number | null {
  let denominator = 0;
  let numerator = 0;
  for (const entry of entries) {
    if (entry.changePct == null || !Number.isFinite(entry.changePct)) continue;
    denominator += entry.value;
    numerator += entry.value * entry.changePct;
  }
  return denominator > 0 ? numerator / denominator : null;
}
