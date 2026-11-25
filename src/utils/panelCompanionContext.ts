import { fmt } from './formatters';
import { predictionRowsFromPages, trackedMarketCap } from './marketPanelDisplay';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { buildPortfolioOverviewSnapshot, normalizePortfolioCurrency, quoteCurrencyUnit, type PortfolioOverviewSnapshot } from './portfolioValuation';
import { fetchCryptoMarkets } from '../api/crypto';
import {
  fetchChart,
  fetchCompanyWorkbench,
  fetchForexPairs,
  fetchGeopoliticalRiskSnapshot,
  fetchMacroDashboard,
  fetchMacroReleaseCalendar,
  fetchNewsFeed,
  fetchPredictionForecasts,
  fetchQuotes,
  fetchSentimentSnapshot,
} from '../api/finance';
import type {
  CompanionPanelContext,
  CryptoAsset,
  ForexPair,
  MacroMetricKey,
  MacroCountryCode,
  PanelType,
  PortfolioPosition,
  PredictionForecastPage,
  Quote,
} from '../types';

type CompanionState = {
  macroCountry?: MacroCountryCode;
  activePanel: PanelType;
  activeSymbol: string;
  watchlist: string[];
  portfolio: PortfolioPosition[];
  portfolioDisplayCurrency: string;
  forexPairs: string[];
};

type BuildPanelContextArgs = {
  panel: PanelType;
  queryClient: QueryClient;
  state: CompanionState;
  renderedText?: string;
};

const OVERVIEW_INDEX_SYMBOLS = ['^GSPC', '^DJI', '^IXIC', '^RUT', '^VIX'] as const;
const OVERVIEW_SECTOR_SYMBOLS = ['XLK', 'XLF', 'XLV', 'XLE', 'XLI', 'XLC', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE'] as const;
const OVERVIEW_MOVER_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'BRK-B', 'JPM', 'V', 'UNH', 'JNJ', 'XOM', 'WMT', 'PG', 'AVGO', 'MA', 'HD', 'CVX', 'MRK'] as const;
const OVERVIEW_CROSS_ASSET_SYMBOLS = ['CL=F', 'GC=F', 'SI=F', 'HG=F', 'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'DX-Y.NYB'] as const;
const ETF_MONITOR_SYMBOLS = [
  'SPY', 'QQQ', 'IWM', 'DIA', 'VTI',
  'XLK', 'XLF', 'XLE', 'XLV', 'XLC', 'XLI', 'XLY', 'XLP', 'XLRE', 'XLB', 'XLU',
  'TLT', 'IEF', 'SHY', 'HYG', 'LQD', 'BND',
  'GLD', 'SLV', 'USO', 'UNG', 'DJP',
  'EFA', 'EEM', 'FXI', 'EWJ', 'EWG',
] as const;
const HEATMAP_SYMBOLS = [
  'XLK', 'AAPL', 'MSFT', 'ORCL', 'PLTR', 'PANW', 'CRWD', 'FTNT', 'SNPS', 'CDNS', 'NVDA', 'AVGO', 'AMD', 'QCOM', 'TXN', 'MU', 'AMAT', 'LRCX', 'KLAC', 'ADI', 'INTC',
  'XLY', 'AMZN', 'TSLA', 'GM', 'F', 'HD', 'LOW', 'MCD', 'SBUX', 'BKNG', 'RCL', 'ABNB', 'CMG', 'TJX', 'NKE',
  'XLF', 'BRK-B', 'JPM', 'BAC', 'WFC', 'C', 'V', 'MA', 'AXP', 'GS', 'MS', 'BLK', 'BX', 'SCHW', 'SPGI', 'CME', 'ICE', 'PGR', 'CB',
  'XLP', 'WMT', 'COST', 'TGT', 'KR', 'PG', 'CL', 'KMB', 'KO', 'PEP', 'MDLZ', 'PM', 'MO',
  'XLC', 'GOOGL', 'META', 'NFLX', 'DIS', 'WBD', 'TMUS', 'VZ', 'T', 'CMCSA', 'CHTR',
  'XLV', 'LLY', 'JNJ', 'ABBV', 'MRK', 'BMY', 'PFE', 'GILD', 'UNH', 'ELV', 'CI', 'CVS', 'HCA', 'ABT', 'SYK', 'BSX', 'MDT', 'ISRG', 'EW', 'TMO', 'DHR',
  'XLI', 'GE', 'RTX', 'LMT', 'BA', 'NOC', 'GD', 'CAT', 'DE', 'HON', 'ETN', 'PH', 'ITW', 'EMR', 'CMI', 'UNP', 'UPS', 'WM', 'CTAS', 'TT', 'JCI',
  'XLB', 'LIN', 'APD', 'ECL', 'SHW', 'DD', 'DOW', 'NEM', 'FCX', 'NUE', 'CF', 'MLM',
  'XLE', 'XOM', 'CVX', 'COP', 'EOG', 'OXY', 'SLB', 'MPC', 'PSX', 'VLO', 'HAL', 'KMI', 'WMB',
  'XLU', 'NEE', 'SO', 'DUK', 'AEP', 'SRE', 'XEL', 'PEG', 'ED', 'EXC', 'ETR', 'WEC', 'AWK',
  'XLRE', 'PLD', 'EQIX', 'DLR', 'PSA', 'CCI', 'AMT', 'O', 'WELL', 'SPG', 'VICI', 'AVB',
] as const;

const PANEL_LABELS: Record<PanelType, string> = {
  overview: 'Market Overview',
  opportunities: 'Opportunities',
  equity: 'Equity Workspace',
  chart: 'Chart View',
  multiAsset: 'Multi-Asset Workspace',
  news: 'News Feed',
  geopolitics: 'Geopolitics',
  predictions: 'Prediction Markets',
  macro: 'Macro Monitor',
  portfolio: 'Portfolio',
  heatmap: 'Heatmap',
  forex: 'Forex',
  crypto: 'Crypto',
  yield: 'Yield Curve',
  etf: 'ETF Monitor',
  screener: 'Screener',
  help: 'Help',
  settings: 'AI Settings',
};

function cleanRenderedText(value?: string): string | undefined {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return undefined;
  return normalized.slice(0, 12000);
}

function buildBaseContext(
  panel: PanelType,
  source: CompanionPanelContext['source'],
  summary: string,
  data: unknown,
  renderedText?: string
): CompanionPanelContext {
  return {
    panel,
    title: PANEL_LABELS[panel] ?? panel.toUpperCase(),
    summary,
    capturedAt: new Date().toISOString(),
    source,
    renderedText: cleanRenderedText(renderedText),
    data,
  };
}

function toCompactQuote(quote: Quote) {
  return {
    symbol: quote.symbol,
    label: quote.longName ?? quote.shortName,
    price: quote.regularMarketPrice,
    changePct: quote.regularMarketChangePercent,
    marketCap: quote.marketCap ?? null,
    sector: quote.sector ?? null,
    industry: quote.industry ?? null,
    currency: quote.currency,
  };
}

async function fetchPortfolioSnapshot(queryClient: QueryClient, state: CompanionState, quotes: Quote[]): Promise<PortfolioOverviewSnapshot> {
  const currency = normalizePortfolioCurrency(state.portfolioDisplayCurrency);
  const currencies = [...new Set([...state.portfolio.map((lot) => normalizePortfolioCurrency(lot.currency)), ...quotes.map((quote) => quoteCurrencyUnit(quote.currency).currency)])].sort();
  const pairs = currencies.filter((base) => base !== currency).map((base) => ({ base, quote: currency }));
  const fx = pairs.length ? await queryClient.fetchQuery({
    queryKey: ['portfolio-fx-rates', currencies.join(','), currency],
    queryFn: () => fetchForexPairs(pairs),
    staleTime: 300000,
    retry: 1,
  }).catch(() => []) : [];
  return buildPortfolioOverviewSnapshot(state.portfolio, quotes, currency, fx);
}

function summarizeOverview(indices: Quote[], sentiment: Awaited<ReturnType<typeof fetchSentimentSnapshot>> | null, portfolio: PortfolioOverviewSnapshot) {
  const spx = indices.find((quote) => quote.symbol === '^GSPC');
  const ndx = indices.find((quote) => quote.symbol === '^IXIC');
  const vix = indices.find((quote) => quote.symbol === '^VIX');
  const parts = [
    spx && Number.isFinite(spx.regularMarketChangePercent) ? `S&P 500 ${spx.regularMarketChangePercent.toFixed(2)}%` : null,
    ndx && Number.isFinite(ndx.regularMarketChangePercent) ? `Nasdaq ${ndx.regularMarketChangePercent.toFixed(2)}%` : null,
    vix ? `VIX ${vix.regularMarketPrice?.toFixed(2) ?? '—'}` : null,
    sentiment?.regime ? `sentiment ${sentiment.regime}` : null,
    portfolio.assetCount ? portfolio.complete ? `portfolio return ${fmt.pct(portfolio.gainLossPct)}` : 'portfolio valuation incomplete' : null,
  ].filter(Boolean);

  return parts.join(' | ') || 'Cross-asset overview snapshot.';
}

async function buildOverviewContext({ queryClient, state, renderedText }: BuildPanelContextArgs): Promise<CompanionPanelContext> {
  const [
    indices,
    sectors,
    movers,
    sentiment,
    crossAssets,
    predictions,
    calendarData,
    portfolioQuotes,
  ] = await Promise.all([
    queryClient.fetchQuery({
      queryKey: ['indices'],
      queryFn: () => fetchQuotes([...OVERVIEW_INDEX_SYMBOLS]),
      staleTime: 30000,
    }),
    queryClient.fetchQuery({
      queryKey: ['sectors'],
      queryFn: () => fetchQuotes([...OVERVIEW_SECTOR_SYMBOLS]),
      staleTime: 10000,
    }),
    queryClient.fetchQuery({
      queryKey: ['movers'],
      queryFn: () => fetchQuotes([...OVERVIEW_MOVER_SYMBOLS]),
      staleTime: 30000,
    }),
    queryClient.fetchQuery({
      queryKey: ['market-sentiment'],
      queryFn: fetchSentimentSnapshot,
      staleTime: 30000,
    }).catch(() => null),
    queryClient.fetchQuery({
      queryKey: ['overview-cross-asset'],
      queryFn: () => fetchQuotes([...OVERVIEW_CROSS_ASSET_SYMBOLS]),
      staleTime: 30000,
    }).catch(() => []),
    queryClient.fetchQuery({
      queryKey: ['overview-predictions', 4],
      queryFn: () => fetchPredictionForecasts(4),
      staleTime: 60 * 1000,
    }).catch(() => ({ forecasts: [], updatedAt: null })),
    queryClient.fetchQuery({
      queryKey: ['overview-calendar-summary', 'companion'],
      queryFn: async () => {
        const from = new Date().toISOString().slice(0, 10);
        const toDate = new Date();
        toDate.setDate(toDate.getDate() + 14);
        return fetchMacroReleaseCalendar(from, toDate.toISOString().slice(0, 10));
      },
      staleTime: 30 * 60 * 1000,
    }).catch(() => ({ events: [] })),
    state.portfolio.length
      ? queryClient.fetchQuery({
          queryKey: ['portfolio-quotes', [...new Set(state.portfolio.map((position) => position.symbol.trim().toUpperCase()))].sort()],
          queryFn: () => fetchQuotes(Array.from(new Set(state.portfolio.map((position) => position.symbol.toUpperCase())))),
          staleTime: 30000,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const portfolio = await fetchPortfolioSnapshot(queryClient, state, portfolioQuotes);

  return buildBaseContext(
    'overview',
    renderedText ? 'visible-panel' : 'query-snapshot',
    summarizeOverview(indices, sentiment, portfolio),
    {
      indices: indices.map(toCompactQuote),
      sectorLeaders: sectors.filter((quote) => Number.isFinite(quote.regularMarketChangePercent) && quote.regularMarketChangePercent > 0)
        .sort((left, right) => (right.regularMarketChangePercent ?? 0) - (left.regularMarketChangePercent ?? 0))
        .slice(0, 5)
        .map(toCompactQuote),
      sectorLaggards: sectors.filter((quote) => Number.isFinite(quote.regularMarketChangePercent) && quote.regularMarketChangePercent < 0)
        .sort((left, right) => (left.regularMarketChangePercent ?? 0) - (right.regularMarketChangePercent ?? 0))
        .slice(0, 5)
        .map(toCompactQuote),
      moversScope: 'Fixed sample of tracked US stocks, not market-wide rankings',
      gainers: movers.filter((quote) => Number.isFinite(quote.regularMarketChangePercent) && quote.regularMarketChangePercent > 0)
        .sort((left, right) => (right.regularMarketChangePercent ?? 0) - (left.regularMarketChangePercent ?? 0))
        .slice(0, 6)
        .map(toCompactQuote),
      losers: movers.filter((quote) => Number.isFinite(quote.regularMarketChangePercent) && quote.regularMarketChangePercent < 0)
        .sort((left, right) => (left.regularMarketChangePercent ?? 0) - (right.regularMarketChangePercent ?? 0))
        .slice(0, 6)
        .map(toCompactQuote),
      sentiment,
      crossAssets: crossAssets.map(toCompactQuote),
      portfolio,
      predictions: (predictions.forecasts ?? []).slice(0, 6),
      calendarEvents: (calendarData.events ?? []).slice(0, 8),
      watchlist: state.watchlist.slice(0, 20),
    },
    renderedText
  );
}

async function buildEquityContext({ queryClient, state, renderedText }: BuildPanelContextArgs): Promise<CompanionPanelContext> {
  const symbol = state.activeSymbol;
  const workbench = await queryClient.fetchQuery({
    queryKey: ['equity-workbench', symbol],
    queryFn: () => fetchCompanyWorkbench(symbol),
    staleTime: 15000,
  });

  if (!workbench) {
    return buildBaseContext('equity', 'query-snapshot', `${symbol} research data is unavailable right now.`, { symbol }, renderedText);
  }

  return buildBaseContext(
    'equity',
    renderedText ? 'visible-panel' : 'query-snapshot',
    `${symbol} ${workbench.quote.regularMarketPrice?.toFixed(2) ?? '—'} ${workbench.quote.currency} | ${workbench.profile.sector ?? 'Unknown sector'} | ${workbench.analysis.recommendationKey ?? 'no analyst tilt'}`,
    {
      symbol,
      quote: toCompactQuote(workbench.quote),
      instrumentKind: workbench.instrumentKind,
      instrumentLabel: workbench.instrumentLabel,
      profile: {
        sector: workbench.profile.sector ?? null,
        industry: workbench.profile.industry ?? null,
        country: workbench.profile.country ?? null,
        website: workbench.profile.website ?? null,
        fullTimeEmployees: workbench.profile.fullTimeEmployees ?? null,
        longBusinessSummary: workbench.profile.longBusinessSummary ?? null,
      },
      sectorContext: workbench.sectorContext,
      calendar: workbench.calendar,
      analysis: {
        recommendationKey: workbench.analysis.recommendationKey ?? null,
        recommendationMean: workbench.analysis.recommendationMean ?? null,
        analystOpinionCount: workbench.analysis.analystOpinionCount ?? null,
        targetLowPrice: workbench.analysis.targetLowPrice ?? null,
        targetMeanPrice: workbench.analysis.targetMeanPrice ?? null,
        targetHighPrice: workbench.analysis.targetHighPrice ?? null,
        revenueGrowth: workbench.analysis.revenueGrowth ?? null,
        earningsGrowth: workbench.analysis.earningsGrowth ?? null,
        grossMargins: workbench.analysis.grossMargins ?? null,
        operatingMargins: workbench.analysis.operatingMargins ?? null,
        profitMargins: workbench.analysis.profitMargins ?? null,
        returnOnAssets: workbench.analysis.returnOnAssets ?? null,
        returnOnEquity: workbench.analysis.returnOnEquity ?? null,
        totalCash: workbench.analysis.totalCash ?? null,
        totalDebt: workbench.analysis.totalDebt ?? null,
        freeCashflow: workbench.analysis.freeCashflow ?? null,
        operatingCashflow: workbench.analysis.operatingCashflow ?? null,
        technicalOutlooks: workbench.analysis.technicalOutlooks.slice(0, 4),
        reports: workbench.analysis.reports.slice(0, 4),
        developments: workbench.analysis.developments.slice(0, 5),
      },
      ownership: {
        institutionsPercentHeld: workbench.ownership.institutionsPercentHeld ?? null,
        insidersPercentHeld: workbench.ownership.insidersPercentHeld ?? null,
        institutions: workbench.ownership.institutions.slice(0, 6),
        insiders: workbench.ownership.insiders.slice(0, 6),
      },
      filingSummary: {
        count: workbench.filings.length,
        recent: workbench.filings.slice(0, 8).map((filing) => ({
          type: filing.type,
          date: filing.date,
        })),
      },
      fund: workbench.fund
        ? {
            family: workbench.fund.family ?? null,
            categoryName: workbench.fund.categoryName ?? null,
            netAssets: workbench.fund.netAssets ?? null,
            netExpenseRatio: workbench.fund.netExpenseRatio ?? null,
            yield: workbench.fund.yield ?? null,
            holdings: workbench.fund.holdings.slice(0, 10),
          }
        : null,
    },
    renderedText
  );
}

async function buildChartContext({ queryClient, state, renderedText }: BuildPanelContextArgs): Promise<CompanionPanelContext> {
  const symbol = state.activeSymbol;
  const [quote, chart] = await Promise.all([
    queryClient.fetchQuery({
      queryKey: ['chart-quote', symbol],
      queryFn: () => fetchQuotes([symbol]).then((quotes) => quotes[0] ?? null),
      staleTime: 10000,
    }).catch(() => null),
    queryClient.fetchQuery({
      queryKey: ['chart-series', symbol, '6mo', '1d'],
      queryFn: () => fetchChart(symbol, '6mo', '1d'),
      staleTime: 60 * 1000,
    }).catch(() => []),
  ]);

  const points = chart.slice(-30);
  const first = points[0];
  const last = points[points.length - 1];
  const performancePct = first && last && first.close !== 0 ? ((last.close - first.close) / first.close) * 100 : null;

  return buildBaseContext(
    'chart',
    renderedText ? 'visible-panel' : 'query-snapshot',
    `${symbol} ${quote?.regularMarketPrice?.toFixed(2) ?? '—'} | 30-sample move ${performancePct?.toFixed(2) ?? '—'}%`,
    {
      symbol,
      quote: quote ? toCompactQuote(quote) : null,
      samples: points.map((point) => ({
        date: point.date,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.volume,
        sma20: point.sma20 ?? null,
        sma50: point.sma50 ?? null,
        sma200: point.sma200 ?? null,
      })),
      sampleCount: chart.length,
      performancePct,
    },
    renderedText
  );
}

async function buildMacroContext({ queryClient, renderedText, state }: BuildPanelContextArgs): Promise<CompanionPanelContext> {
  const dashboard = await queryClient.fetchQuery({
    queryKey: ['macro-dashboard', state.macroCountry ?? 'US'],
    queryFn: () => fetchMacroDashboard([state.macroCountry ?? 'US']),
    staleTime: 5 * 60 * 1000,
  });
  const country = dashboard.countries[0];
  const metrics = country
    ? (Object.keys(country.values) as MacroMetricKey[]).map((key) => ({
        key,
        label: country.values[key]?.label ?? key,
        value: country.values[key]?.value ?? null,
        change: country.values[key]?.change ?? null,
        date: country.values[key]?.date ?? null,
        unit: country.values[key]?.unit ?? null,
        source: country.values[key]?.source ?? null,
      }))
    : [];

  return buildBaseContext(
    'macro',
    renderedText ? 'visible-panel' : 'query-snapshot',
    metrics.length ? `${country?.label ?? 'US'} macro dashboard with ${metrics.length} tracked metrics.` : 'Macro dashboard snapshot.',
    {
      asOf: dashboard.asOf,
      country: country?.label ?? 'United States',
      metrics,
      error: dashboard.error ?? null,
    },
    renderedText
  );
}

async function buildPortfolioContext({ queryClient, state, renderedText }: BuildPanelContextArgs): Promise<CompanionPanelContext> {
  const symbols = Array.from(new Set(state.portfolio.map((position) => position.symbol.trim().toUpperCase()))).sort();
  const quotes = symbols.length
    ? await queryClient.fetchQuery({
        queryKey: ['portfolio-quotes', symbols],
        queryFn: () => fetchQuotes(symbols),
        staleTime: 10000,
      }).catch(() => [])
    : [];
  const portfolio = await fetchPortfolioSnapshot(queryClient, state, quotes);

  return buildBaseContext(
    'portfolio',
    state.portfolio.length && renderedText ? 'visible-panel' : 'local-state',
    state.portfolio.length
      ? portfolio.complete
        ? `${portfolio.assetCount} assets, ${portfolio.lotCount} lots | value ${portfolio.currency} ${portfolio.totalValue?.toFixed(2) ?? '—'} | P/L ${fmt.pct(portfolio.gainLossPct)}`
        : `${portfolio.assetCount} assets | valuation incomplete: missing quotes ${portfolio.missingQuoteSymbols.join(', ') || 'none'}; missing FX ${portfolio.missingFxCurrencies.join(', ') || 'none'}`
      : 'Portfolio is currently empty.',
    portfolio,
    renderedText
  );
}

async function buildPredictionsContext({ queryClient, renderedText }: BuildPanelContextArgs): Promise<CompanionPanelContext> {
  const pages = queryClient.getQueryData<InfiniteData<PredictionForecastPage>>(['prediction-market-pages'])?.pages;
  const snapshot = pages?.length ? { ...pages[0], forecasts: predictionRowsFromPages(pages) } : await queryClient.fetchQuery({
    queryKey: ['prediction-markets-panel', 12],
    queryFn: () => fetchPredictionForecasts(12),
    staleTime: 60 * 1000,
  });

  return buildBaseContext(
    'predictions',
    renderedText ? 'visible-panel' : 'query-snapshot',
    `${snapshot.forecasts.length} prediction markets loaded.`,
    {
      updatedAt: snapshot.updatedAt,
      forecasts: snapshot.forecasts.slice(0, 24),
    },
    renderedText
  );
}

async function buildGeopoliticsContext({ queryClient, renderedText }: BuildPanelContextArgs): Promise<CompanionPanelContext> {
  const [risk, hotspots] = await Promise.all([
    queryClient.fetchQuery({
      queryKey: ['geopolitical-risk-snapshot'],
      queryFn: fetchGeopoliticalRiskSnapshot,
      staleTime: 10 * 60 * 1000,
    }),
    queryClient.fetchQuery({
      queryKey: ['geopolitics-hotspots', 24],
      queryFn: () => fetchNewsFeed('geopolitics', 'all', 12),
      staleTime: 2 * 60 * 1000,
    }).catch(() => []),
  ]);

  return buildBaseContext(
    'geopolitics',
    renderedText ? 'visible-panel' : 'query-snapshot',
    `Official GPR ${risk.latest.value.toFixed(1)} | daily delta ${fmt.change(risk.change, 1)}`,
    {
      updatedAt: risk.updatedAt,
      latest: risk.latest,
      previous: risk.previous,
      change: risk.change,
      changePct: risk.changePct,
      weeklyHigh: risk.weeklyHigh,
      weeklyLow: risk.weeklyLow,
      hotspots: hotspots.slice(0, 10),
      sourceUrl: risk.sourceUrl,
    },
    renderedText
  );
}

async function buildNewsContext({ queryClient, state, renderedText }: BuildPanelContextArgs): Promise<CompanionPanelContext> {
  const headlines = await queryClient.fetchQuery({
    queryKey: ['news-companion', state.activePanel === 'equity' ? state.activeSymbol : 'markets'],
    queryFn: () => (
      state.activePanel === 'equity'
        ? fetchNewsFeed(state.activeSymbol, 'all', 20)
        : fetchNewsFeed('markets', 'all', 20)
    ),
    staleTime: 2 * 60 * 1000,
  }).catch(() => []);

  return buildBaseContext(
    'news',
    renderedText ? 'visible-panel' : 'query-snapshot',
    `${headlines.length} recent headlines loaded.`,
    {
      headlines: headlines.slice(0, 12),
    },
    renderedText
  );
}

async function buildForexContext({ queryClient, state, renderedText }: BuildPanelContextArgs): Promise<CompanionPanelContext> {
  const pairs = state.forexPairs
    .map((pair) => {
      const [base, quote] = pair.split('/');
      return base && quote ? { base, quote } : null;
    })
    .filter((pair): pair is { base: string; quote: string } => Boolean(pair));
  const quotes: ForexPair[] = pairs.length
    ? await queryClient.fetchQuery({
        queryKey: ['forex-custom', pairs],
        queryFn: () => fetchForexPairs(pairs),
        staleTime: 15000,
      }).catch(() => [])
    : [];

  return buildBaseContext(
    'forex',
    renderedText ? 'visible-panel' : 'query-snapshot',
    quotes.length ? `${quotes.length} tracked forex pairs.` : 'No forex pairs are currently tracked.',
    {
      pairs: quotes.slice(0, 12),
    },
    renderedText
  );
}

async function buildCryptoContext({ queryClient, renderedText }: BuildPanelContextArgs): Promise<CompanionPanelContext> {
  const coins: CryptoAsset[] = await queryClient.fetchQuery({
    queryKey: ['crypto-markets'],
    queryFn: () => fetchCryptoMarkets('usd', 50),
    staleTime: 30000,
  });
  const sampleMarketCap = trackedMarketCap(coins);

  return buildBaseContext(
    'crypto',
    renderedText ? 'visible-panel' : 'query-snapshot',
    `${coins.length} crypto assets loaded | tracked sample market cap ${fmt.marketCap(sampleMarketCap)}`,
    {
      sampleMarketCap,
      leaders: coins.slice(0, 12).map((coin) => ({
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        price: coin.current_price,
        changePct: coin.price_change_percentage_24h,
        marketCap: coin.market_cap,
        volume: coin.total_volume,
      })),
    },
    renderedText
  );
}

async function buildEtfContext({ queryClient, renderedText }: BuildPanelContextArgs): Promise<CompanionPanelContext> {
  const quotes = await queryClient.fetchQuery({
    queryKey: ['etf-quotes', ETF_MONITOR_SYMBOLS.join(',')],
    queryFn: () => fetchQuotes([...ETF_MONITOR_SYMBOLS]),
    staleTime: 15000,
  });

  return buildBaseContext(
    'etf',
    renderedText ? 'visible-panel' : 'query-snapshot',
    `${quotes.length} ETF quotes loaded.`,
    {
      leaders: [...quotes]
        .sort((left, right) => (right.regularMarketChangePercent ?? 0) - (left.regularMarketChangePercent ?? 0))
        .slice(0, 10)
        .map(toCompactQuote),
      laggards: [...quotes]
        .sort((left, right) => (left.regularMarketChangePercent ?? 0) - (right.regularMarketChangePercent ?? 0))
        .slice(0, 10)
        .map(toCompactQuote),
    },
    renderedText
  );
}

async function buildHeatmapContext({ queryClient, renderedText }: BuildPanelContextArgs): Promise<CompanionPanelContext> {
  const quotes = await queryClient.fetchQuery({
    queryKey: ['heatmap-quotes', HEATMAP_SYMBOLS.join(',')],
    queryFn: () => fetchQuotes([...HEATMAP_SYMBOLS]),
    staleTime: 15000,
  });

  return buildBaseContext(
    'heatmap',
    renderedText ? 'visible-panel' : 'query-snapshot',
    `${quotes.length} heatmap securities loaded.`,
    {
      biggestWinners: [...quotes]
        .sort((left, right) => (right.regularMarketChangePercent ?? 0) - (left.regularMarketChangePercent ?? 0))
        .slice(0, 12)
        .map(toCompactQuote),
      biggestLosers: [...quotes]
        .sort((left, right) => (left.regularMarketChangePercent ?? 0) - (right.regularMarketChangePercent ?? 0))
        .slice(0, 12)
        .map(toCompactQuote),
    },
    renderedText
  );
}

function buildLocalOnlyContext(panel: PanelType, state: CompanionState, renderedText?: string): CompanionPanelContext {
  if (panel === 'settings') {
    return buildBaseContext(
      panel,
      'local-state',
      'Local AI configuration panel.',
      {
        activePanel: state.activePanel,
        activeSymbol: state.activeSymbol,
        watchlistCount: state.watchlist.length,
        portfolioCount: state.portfolio.length,
      },
      renderedText
    );
  }

  if (panel === 'help') {
    return buildBaseContext(
      panel,
      'local-state',
      'Help and command reference panel.',
      {
        activeSymbol: state.activeSymbol,
        activePanel: state.activePanel,
      },
      renderedText
    );
  }

  return buildBaseContext(
    panel,
    'local-state',
    `${PANEL_LABELS[panel] ?? panel} snapshot is not specialized yet, so only local context is available.`,
    {
      activeSymbol: state.activeSymbol,
      activePanel: state.activePanel,
      watchlist: state.watchlist.slice(0, 20),
      portfolioCount: state.portfolio.length,
    },
    renderedText
  );
}

export async function buildPanelCompanionContext(args: BuildPanelContextArgs): Promise<CompanionPanelContext> {
  const normalizedPanel = args.panel === 'yield' ? 'macro' : args.panel;

  switch (normalizedPanel) {
    case 'overview':
      return buildOverviewContext({ ...args, panel: normalizedPanel });
    case 'equity':
      return buildEquityContext({ ...args, panel: normalizedPanel });
    case 'chart':
      return buildChartContext({ ...args, panel: normalizedPanel });
    case 'macro':
      return buildMacroContext({ ...args, panel: normalizedPanel });
    case 'portfolio':
      return buildPortfolioContext({ ...args, panel: normalizedPanel });
    case 'predictions':
      return buildPredictionsContext({ ...args, panel: normalizedPanel });
    case 'geopolitics':
      return buildGeopoliticsContext({ ...args, panel: normalizedPanel });
    case 'news':
      return buildNewsContext({ ...args, panel: normalizedPanel });
    case 'forex':
      return buildForexContext({ ...args, panel: normalizedPanel });
    case 'crypto':
      return buildCryptoContext({ ...args, panel: normalizedPanel });
    case 'etf':
      return buildEtfContext({ ...args, panel: normalizedPanel });
    case 'heatmap':
      return buildHeatmapContext({ ...args, panel: normalizedPanel });
    default:
      return buildLocalOnlyContext(normalizedPanel, args.state, args.renderedText);
  }
}

export async function buildCompanionContexts(args: {
  panels: PanelType[];
  queryClient: QueryClient;
  state: CompanionState;
  renderedTextByPanel?: Partial<Record<PanelType, string>>;
}): Promise<CompanionPanelContext[]> {
  const uniquePanels = Array.from(new Set(args.panels.map((panel) => panel === 'yield' ? 'macro' : panel))) as PanelType[];
  const settled = await Promise.allSettled(
    uniquePanels.map((panel) =>
      buildPanelCompanionContext({
        panel,
        queryClient: args.queryClient,
        state: args.state,
        renderedText: args.renderedTextByPanel?.[panel],
      })
    )
  );

  return settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [result.value];

    return [
      buildBaseContext(
        uniquePanels[index],
        'local-state',
        `${PANEL_LABELS[uniquePanels[index]] ?? uniquePanels[index]} could not be refreshed automatically.`,
        { error: result.reason instanceof Error ? result.reason.message : String(result.reason ?? 'Unknown error') },
        args.renderedTextByPanel?.[uniquePanels[index]]
      ),
    ];
  });
}

export function getCompanionPanelLabel(panel: PanelType): string {
  return PANEL_LABELS[panel] ?? panel.toUpperCase();
}
