import type { Quote } from '../types';

export const indexProfiles: Record<string, { description: string; provider: string; url: string } | undefined> = {
  '^GSPC': {
    description: 'The S&P 500 tracks 500 leading U.S. large-cap companies.',
    provider: 'S&P Dow Jones Indices', url: 'https://www.spglobal.com/spdji/en/indices/equity/sp-500/',
  },
  '^DJI': {
    description: 'The Dow tracks 30 large U.S. companies. Stocks with higher share prices carry more weight.',
    provider: 'S&P Dow Jones Indices', url: 'https://www.spglobal.com/spdji/en/indices/equity/dow-jones-industrial-average/',
  },
  '^IXIC': {
    description: 'The Nasdaq Composite tracks eligible U.S. and international common stocks listed on Nasdaq.',
    provider: 'Nasdaq', url: 'https://indexes.nasdaqomx.com/Index/Overview/COMP',
  },
  '^RUT': {
    description: 'The Russell 2000 measures the small-cap segment of the U.S. equity market.',
    provider: 'FTSE Russell', url: 'https://www.lseg.com/en/ftse-russell/indices/russell-us',
  },
  '^VIX': {
    description: 'VIX uses S&P 500 option prices to measure expected volatility over the next 30 days. Its level expresses that volatility as an annualized percentage.',
    provider: 'Cboe', url: 'https://cdn.cboe.com/api/global/us_indices/governance/VIX_Methodology.pdf',
  },
};

export function indexReferenceLevels(quote: Quote) {
  const references = [
    ['Previous close', quote.regularMarketPreviousClose],
    ['Session open', quote.regularMarketOpen],
    ['50-day average', quote.fiftyDayAverage],
    ['200-day average', quote.twoHundredDayAverage],
    ['52-week high', quote.fiftyTwoWeekHigh],
    ['52-week low', quote.fiftyTwoWeekLow],
  ] as const;
  return references.flatMap(([label, level]) => {
    if (level == null || !Number.isFinite(level)) return [];
    const points = Number.isFinite(quote.regularMarketPrice) ? quote.regularMarketPrice - level : null;
    return [{ label, level, points, percent: points != null && level > 0 ? 100 * points / level : null }];
  });
}
