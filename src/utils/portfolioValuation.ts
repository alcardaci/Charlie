import type { PortfolioPosition, Quote } from '../types';

type FxPair = { base: string; quote: string; rate: number };

export function normalizePortfolioCurrency(currency?: string | null): string {
  const normalized = (currency ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'USD';
}

/** Yahoo sometimes quotes prices in minor units while lot costs use major units. */
export function quoteCurrencyUnit(currency?: string | null, fallback = 'USD'): { currency: string; scale: number } {
  const raw = (currency ?? '').trim();
  if (raw === 'GBp' || raw.toUpperCase() === 'GBX') return { currency: 'GBP', scale: 0.01 };
  if (raw === 'ZAc') return { currency: 'ZAR', scale: 0.01 };
  if (raw.toUpperCase() === 'ILA') return { currency: 'ILS', scale: 0.01 };
  return { currency: normalizePortfolioCurrency(raw || fallback), scale: 1 };
}

export function buildPortfolioFxMap(displayCurrency: string, pairs: FxPair[]): Map<string, number> {
  const rates = new Map<string, number>([[`${displayCurrency}:${displayCurrency}`, 1]]);
  for (const pair of pairs) if (Number.isFinite(pair.rate) && pair.rate > 0) rates.set(`${pair.base}:${pair.quote}`, pair.rate);
  return rates;
}

export function valuePortfolioLot(lot: Pick<PortfolioPosition, 'shares' | 'avgCost' | 'currency'>, quote: Quote | undefined, displayCurrency: string, fxRates: Map<string, number>) {
  const currency = normalizePortfolioCurrency(lot.currency);
  const quoteUnit = quoteCurrencyUnit(quote?.currency, currency);
  const costRate = currency === displayCurrency ? 1 : fxRates.get(`${currency}:${displayCurrency}`) ?? null;
  const priceRate = quoteUnit.currency === displayCurrency ? 1 : fxRates.get(`${quoteUnit.currency}:${displayCurrency}`) ?? null;
  const hasQuote = quote != null && Number.isFinite(quote.regularMarketPrice) && quote.regularMarketPrice > 0;
  const priceScale = quote == null ? null : (costRate != null && priceRate != null ? quoteUnit.scale * priceRate / costRate : null);
  const currentPrice = hasQuote && priceScale != null ? quote!.regularMarketPrice * priceScale : Number.NaN;
  const displayCurrentPrice = hasQuote && priceRate != null ? quote!.regularMarketPrice * quoteUnit.scale * priceRate : Number.NaN;
  return {
    currency,
    quoteCurrency: quoteUnit.currency,
    currentPrice,
    currentValue: currentPrice * lot.shares,
    totalCost: lot.avgCost * lot.shares,
    gainLoss: (currentPrice - lot.avgCost) * lot.shares,
    conversionRate: costRate,
    priceScale,
    displayCurrentPrice,
    displayCurrentValue: displayCurrentPrice * lot.shares,
    displayTotalCost: costRate == null ? Number.NaN : lot.avgCost * lot.shares * costRate,
    displayGainLoss: costRate == null ? Number.NaN : displayCurrentPrice * lot.shares - lot.avgCost * lot.shares * costRate,
    missingQuote: !hasQuote,
    missingFx: [costRate == null ? currency : null, priceRate == null ? quoteUnit.currency : null].filter((value): value is string => value != null),
  };
}

export type PortfolioOverviewSnapshot = {
  lotCount: number;
  assetCount: number;
  currency: string;
  complete: boolean;
  missingQuoteSymbols: string[];
  missingFxCurrencies: string[];
  totalCost: number | null;
  totalValue: number | null;
  gainLoss: number | null;
  gainLossPct: number | null;
  topHoldings: Array<{ symbol: string; currentValue: number; gainLoss: number; weightPct: number }>;
};

export function buildPortfolioOverviewSnapshot(lots: PortfolioPosition[], quotes: Quote[], displayCurrency: string, pairs: FxPair[]): PortfolioOverviewSnapshot {
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol.trim().toUpperCase(), quote]));
  const rates = buildPortfolioFxMap(displayCurrency, pairs);
  const grouped = new Map<string, { symbol: string; currentValue: number; gainLoss: number }>();
  const missingQuotes = new Set<string>();
  const missingFx = new Set<string>();
  let totalCost = 0;
  let totalValue = 0;
  for (const lot of lots) {
    const symbol = lot.symbol.trim().toUpperCase();
    const value = valuePortfolioLot(lot, quoteMap.get(symbol), displayCurrency, rates);
    if (value.missingQuote) missingQuotes.add(symbol);
    value.missingFx.forEach((currency) => missingFx.add(currency));
    totalCost += value.displayTotalCost;
    totalValue += value.displayCurrentValue;
    const previous = grouped.get(symbol) ?? { symbol, currentValue: 0, gainLoss: 0 };
    previous.currentValue += value.displayCurrentValue;
    previous.gainLoss += value.displayGainLoss;
    grouped.set(symbol, previous);
  }
  const complete = !missingQuotes.size && !missingFx.size && Number.isFinite(totalCost) && Number.isFinite(totalValue);
  const gainLoss = complete ? totalValue - totalCost : null;
  return {
    lotCount: lots.length, assetCount: grouped.size, currency: displayCurrency, complete,
    missingQuoteSymbols: [...missingQuotes], missingFxCurrencies: [...missingFx],
    totalCost: Number.isFinite(totalCost) ? totalCost : null,
    totalValue: complete ? totalValue : null,
    gainLoss,
    gainLossPct: gainLoss != null && totalCost > 0 ? gainLoss / totalCost * 100 : null,
    topHoldings: complete ? [...grouped.values()].sort((a, b) => b.currentValue - a.currentValue).slice(0, 4)
      .map((holding) => ({ ...holding, weightPct: totalValue ? holding.currentValue / totalValue * 100 : 0 })) : [],
  };
}
