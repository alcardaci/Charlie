import {
  CalendarEvent,
  CountryNewsCount,
  MarketSentimentSnapshot,
  NewsItem,
  Opportunity,
  OpportunityAssetIdea,
  OpportunityBrief,
  OpportunityDashboard,
  OpportunityEvidence,
  OpportunityHorizon,
  OpportunityPortfolioImpact,
  OpportunityPortfolioMatch,
  PortfolioPosition,
  PredictionForecast,
  Quote,
  TradeDisruptionSnapshot,
} from '../types';

type ThemeId =
  | 'ai-infrastructure'
  | 'energy-supply-risk'
  | 'shipping-stress'
  | 'defense-rearmament'
  | 'macro-policy-window'
  | 'risk-off-hedges';

type ThemeConfig = {
  id: ThemeId;
  title: string;
  theme: string;
  direction: Opportunity['direction'];
  horizon: OpportunityHorizon;
  summary: string;
  thesis: string;
  impactFloor: number;
  beneficiaryAssets: string[];
  riskAssets: string[];
  hedgeAssets: string[];
  watchAssets: string[];
  portfolioKeywords?: string[];
  watchItems: string[];
  invalidationSignals: string[];
};

type PortfolioHolding = {
  symbol: string;
  label: string;
  shares: number;
  avgCost: number;
  currentValue: number;
  gainLossPct: number;
  weightPct: number;
};

type OpportunityEngineInput = {
  aiNews: NewsItem[];
  energyNews: NewsItem[];
  defenseNews: NewsItem[];
  shippingNews: NewsItem[];
  macroNews: NewsItem[];
  tradeSnapshot?: TradeDisruptionSnapshot | null;
  countryCounts: CountryNewsCount[];
  predictions: PredictionForecast[];
  sentiment?: MarketSentimentSnapshot | null;
  calendarEvents: CalendarEvent[];
  portfolio: PortfolioPosition[];
  watchlist: string[];
  quotes: Quote[];
};

const THEME_CONFIGS: ThemeConfig[] = [
  {
    id: 'ai-infrastructure',
    title: 'AI Infrastructure Buildout',
    theme: 'AI, semis, and power demand',
    direction: 'bullish',
    horizon: 'weeks',
    summary: 'AI infrastructure remains a live leadership theme when fresh semiconductor and data-center headlines are reinforced by strong price action in the core beneficiaries.',
    thesis: 'If AI capex and data-center demand stay in the headlines while semiconductor leadership holds, the highest-quality beneficiaries can keep attracting flows ahead of the next earnings cycle.',
    impactFloor: 68,
    beneficiaryAssets: ['NVDA', 'AVGO', 'AMD', 'MSFT', 'AMZN', 'GOOGL', 'META', 'SMH', 'VRT', 'PWR'],
    riskAssets: [],
    hedgeAssets: ['QQQ'],
    watchAssets: ['NVDA', 'SMH', 'VRT', 'PWR'],
    portfolioKeywords: ['technology', 'software', 'semiconductor', 'internet', 'communication services'],
    watchItems: ['Semiconductor leadership vs the broad market', 'Follow-through in hyperscaler capex commentary', 'Power and cooling names holding relative strength'],
    invalidationSignals: ['SMH leadership breaks down for several sessions', 'AI headlines shift from demand to spending pullback', 'Next earnings cycle weakens capex confidence'],
  },
  {
    id: 'energy-supply-risk',
    title: 'Energy Supply Risk',
    theme: 'Oil, gas, and chokepoint disruption',
    direction: 'bullish',
    horizon: 'weeks',
    summary: 'Energy opportunities get more interesting when Middle East tension, maritime chokepoint stress, and fresh oil or LNG headlines reinforce one another.',
    thesis: 'When geopolitics and logistics both raise supply anxiety, energy producers and broad energy ETFs usually have cleaner upside than trying to trade the macro noise directly.',
    impactFloor: 72,
    beneficiaryAssets: ['XLE', 'XOM', 'CVX', 'COP', 'SLB', 'OXY'],
    riskAssets: ['XLY', 'JETS', 'DAL', 'UAL'],
    hedgeAssets: ['GLD'],
    watchAssets: ['XLE', 'XOM', 'CVX', 'GLD'],
    portfolioKeywords: ['energy', 'oil', 'gas', 'airline', 'consumer cyclical'],
    watchItems: ['Escalation around Hormuz, the Red Sea, or major LNG routes', 'Oil price response vs headline intensity', 'Whether shipping stress spills into insurance and freight costs'],
    invalidationSignals: ['Middle East hotspot counts cool quickly', 'PortWatch disruptions resolve without follow-through', 'Energy equities stop confirming the headlines'],
  },
  {
    id: 'shipping-stress',
    title: 'Shipping And Supply Chain Stress',
    theme: 'Ports, canals, and logistics bottlenecks',
    direction: 'mixed',
    horizon: 'weeks',
    summary: 'The best logistics opportunities show up when maritime disruption headlines, structured PortWatch events, and chokepoint congestion all point in the same direction.',
    thesis: 'Persistent bottlenecks can create second-order winners in select shipping names and energy, while import-heavy and transport-sensitive exposures become more vulnerable.',
    impactFloor: 74,
    beneficiaryAssets: ['ZIM', 'MATX', 'KEX', 'XLE'],
    riskAssets: ['UPS', 'FDX', 'WMT', 'COST', 'XLY'],
    hedgeAssets: ['GLD'],
    watchAssets: ['ZIM', 'KEX', 'UPS', 'FDX'],
    portfolioKeywords: ['industrials', 'transportation', 'consumer defensive', 'consumer cyclical'],
    watchItems: ['AIS congestion bands at watched chokepoints', 'Whether live logistics headlines keep accelerating', 'Any spillover from ports into retailers or delivery networks'],
    invalidationSignals: ['AIS congestion normalizes', 'Live logistics headline count fades', 'Structured PortWatch alerts stop building'],
  },
  {
    id: 'defense-rearmament',
    title: 'Defense Re-Armament',
    theme: 'Security spending and defense demand',
    direction: 'bullish',
    horizon: 'months',
    summary: 'Defense ideas become higher conviction when security headlines broaden across regions and public markets keep rewarding the defense complex.',
    thesis: 'A sustained rise in geopolitical hotspots can keep defense names and aerospace-defense ETFs in focus longer than most headline spikes, especially when the tape still confirms the story.',
    impactFloor: 69,
    beneficiaryAssets: ['ITA', 'LMT', 'RTX', 'NOC', 'GD'],
    riskAssets: [],
    hedgeAssets: ['GLD'],
    watchAssets: ['ITA', 'LMT', 'RTX'],
    portfolioKeywords: ['industrials', 'aerospace', 'defense'],
    watchItems: ['Europe and Middle East hotspot intensity', 'Defense ETF relative strength', 'Any budget, procurement, or aid headlines with follow-through'],
    invalidationSignals: ['Hotspot severity falls quickly', 'Defense names stop responding to geopolitical stress', 'Security headlines remain isolated instead of broadening'],
  },
  {
    id: 'macro-policy-window',
    title: 'Macro Policy Window',
    theme: 'Fed, inflation, and rates repricing',
    direction: 'mixed',
    horizon: 'days',
    summary: 'High-impact macro events create short, tradable windows where duration, small caps, real estate, and the broad risk regime can reset quickly.',
    thesis: 'Busy investors do not need a macro view on everything, but they do need to know when CPI, payrolls, or Fed events can force repricing across rates-sensitive assets.',
    impactFloor: 64,
    beneficiaryAssets: ['TLT', 'IEF', 'IWM', 'XLRE', 'QQQ'],
    riskAssets: ['KRE', 'XLF'],
    hedgeAssets: ['GLD', 'TLT'],
    watchAssets: ['TLT', 'IWM', 'XLRE', 'QQQ'],
    portfolioKeywords: ['real estate', 'financial', 'technology'],
    watchItems: ['Nearest high-impact calendar dates', 'Treasury ETF response around macro releases', 'Whether prediction markets start repricing policy odds'],
    invalidationSignals: ['No high-impact events in the near calendar window', 'Rates-sensitive assets ignore macro headlines', 'Prediction market probabilities stay flat'],
  },
  {
    id: 'risk-off-hedges',
    title: 'Risk-Off Hedge Setup',
    theme: 'Defensive rotation and hedges',
    direction: 'bullish',
    horizon: 'days',
    summary: 'When sentiment turns cautious and geopolitical or trade stress remains elevated, defensive assets can offer cleaner opportunities than forcing new high-beta exposure.',
    thesis: 'In stressed tapes the best opportunity may be protecting downside with liquid hedges rather than chasing late-cycle narratives.',
    impactFloor: 60,
    beneficiaryAssets: ['GLD', 'TLT', 'XLP', 'XLU'],
    riskAssets: ['QQQ', 'IWM', 'XLY'],
    hedgeAssets: ['GLD', 'TLT', 'XLP'],
    watchAssets: ['GLD', 'TLT', 'XLP', 'XLU'],
    portfolioKeywords: ['technology', 'consumer cyclical', 'small cap'],
    watchItems: ['Sentiment regime and VIX behavior', 'Broad participation vs narrow leadership', 'Whether defensive ETFs keep outperforming'],
    invalidationSignals: ['Sentiment flips back to bullish or risk-on', 'Geopolitical and trade stress cool together', 'Defensives stop outperforming'],
  },
];

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function upper(value: string): string {
  return value.trim().toUpperCase();
}

function safeNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function byNewest(left: NewsItem, right: NewsItem): number {
  return right.publishedAt - left.publishedAt;
}

function summarizeDate(dateText: string): string {
  return new Date(`${dateText}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function hoursAgo(timestamp: number): number {
  return Math.max(0, (Date.now() - timestamp) / 3_600_000);
}

function buildQuoteMap(quotes: Quote[]): Map<string, Quote> {
  return new Map(quotes.map((quote) => [upper(quote.symbol), quote]));
}

function buildPortfolioHoldings(portfolio: PortfolioPosition[], quoteMap: Map<string, Quote>): PortfolioHolding[] {
  const grouped = new Map<string, { shares: number; totalCost: number; currentValue: number; label: string }>();

  for (const lot of portfolio) {
    const symbol = upper(lot.symbol);
    const quote = quoteMap.get(symbol);
    const currentPrice = quote?.regularMarketPrice ?? lot.avgCost;
    const totalCost = lot.avgCost * lot.shares;
    const currentValue = currentPrice * lot.shares;
    const existing = grouped.get(symbol);

    if (existing) {
      existing.shares += lot.shares;
      existing.totalCost += totalCost;
      existing.currentValue += currentValue;
    } else {
      grouped.set(symbol, {
        shares: lot.shares,
        totalCost,
        currentValue,
        label: quote?.shortName ?? symbol,
      });
    }
  }

  const totalValue = Array.from(grouped.values()).reduce((sum, holding) => sum + holding.currentValue, 0);

  return Array.from(grouped.entries())
    .map(([symbol, holding]) => ({
      symbol,
      label: holding.label,
      shares: holding.shares,
      avgCost: holding.totalCost / Math.max(holding.shares, 1),
      currentValue: holding.currentValue,
      gainLossPct: holding.totalCost ? ((holding.currentValue - holding.totalCost) / holding.totalCost) * 100 : 0,
      weightPct: totalValue ? (holding.currentValue / totalValue) * 100 : 0,
    }))
    .sort((left, right) => right.currentValue - left.currentValue);
}

function buildPortfolioImpact(
  config: ThemeConfig,
  holdings: PortfolioHolding[],
  watchlistSet: Set<string>
): { impact: OpportunityPortfolioImpact; relevanceScore: number } {
  const holdingMap = new Map(holdings.map((holding) => [holding.symbol, holding]));
  const beneficiarySet = new Set(config.beneficiaryAssets.map(upper));
  const riskSet = new Set(config.riskAssets.map(upper));

  const impactedPositions: OpportunityPortfolioMatch[] = holdings
    .filter((holding) => beneficiarySet.has(holding.symbol) || riskSet.has(holding.symbol))
    .map((holding) => ({
      symbol: holding.symbol,
      label: holding.label,
      role: (beneficiarySet.has(holding.symbol) ? 'beneficiary' : 'risk') as 'beneficiary' | 'risk',
      currentValue: holding.currentValue,
      weightPct: holding.weightPct,
      gainLossPct: holding.gainLossPct,
    }))
    .sort((left, right) => right.currentValue - left.currentValue);

  const watchlistOverlap = unique(
    [...config.beneficiaryAssets, ...config.riskAssets]
      .map(upper)
      .filter((symbol) => watchlistSet.has(symbol) && !holdingMap.has(symbol))
  ).slice(0, 4);

  const missingExposure = config.beneficiaryAssets
    .map(upper)
    .filter((symbol) => !holdingMap.has(symbol) && !watchlistSet.has(symbol))
    .slice(0, 3);

  const hedgeIdeas = config.hedgeAssets
    .map(upper)
    .filter((symbol) => !holdingMap.has(symbol))
    .slice(0, 3);

  const beneficiaryCount = impactedPositions.filter((position) => position.role === 'beneficiary').length;
  const riskCount = impactedPositions.filter((position) => position.role === 'risk').length;

  let label = 'No direct portfolio overlap yet';
  if (riskCount > 0) {
    label = `Portfolio risk: ${riskCount} holding${riskCount === 1 ? '' : 's'} directly exposed`;
  } else if (beneficiaryCount > 0) {
    label = `Direct overlap: ${beneficiaryCount} beneficiary holding${beneficiaryCount === 1 ? '' : 's'}`;
  } else if (watchlistOverlap.length > 0) {
    label = `Watchlist overlap: ${watchlistOverlap.join(', ')}`;
  }

  const relevanceScore = clamp(
    beneficiaryCount * 28 +
      riskCount * 24 +
      watchlistOverlap.length * 10 +
      (missingExposure.length > 0 ? 8 : 0),
    8,
    100
  );

  return {
    relevanceScore,
    impact: {
      label,
      impactedPositions,
      watchlistOverlap,
      missingExposure,
      hedgeIdeas,
    },
  };
}

function makeAssetIdeas(config: ThemeConfig, quoteMap: Map<string, Quote>): OpportunityAssetIdea[] {
  const assets: Array<{ symbol: string; role: OpportunityAssetIdea['role'] }> = [
    ...config.beneficiaryAssets.map((symbol) => ({ symbol: upper(symbol), role: 'beneficiary' as const })),
    ...config.riskAssets.map((symbol) => ({ symbol: upper(symbol), role: 'risk' as const })),
    ...config.hedgeAssets.map((symbol) => ({ symbol: upper(symbol), role: 'hedge' as const })),
    ...config.watchAssets.map((symbol) => ({ symbol: upper(symbol), role: 'watch' as const })),
  ];

  const seen = new Set<string>();
  return assets
    .filter((asset) => {
      const key = `${asset.symbol}:${asset.role}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((asset) => {
      const quote = quoteMap.get(asset.symbol);
      return {
        symbol: asset.symbol,
        label: quote?.shortName ?? asset.symbol,
        role: asset.role,
        price: quote?.regularMarketPrice ?? null,
        changePct: quote?.regularMarketChangePercent ?? null,
      };
    })
    .slice(0, 8);
}

function buildNewsEvidence(stories: NewsItem[], limit = 3): OpportunityEvidence[] {
  return stories.slice(0, limit).map((story, index) => ({
    id: `${story.link}-${index}`,
    type: 'news',
    title: story.title,
    detail: `${story.publisher || 'News'}${story.publishedAt ? ` · ${Math.max(1, Math.round(hoursAgo(story.publishedAt)))}h ago` : ''}`,
    url: story.link,
    publishedAt: story.publishedAt,
  }));
}

function buildPredictionEvidence(predictions: PredictionForecast[], limit = 2): OpportunityEvidence[] {
  return predictions.slice(0, limit).map((prediction) => ({
    id: prediction.id,
    type: 'prediction',
    title: prediction.question,
    detail: `${prediction.theme}${prediction.leadingProbability != null ? ` · ${Math.round(prediction.leadingProbability)}% ${prediction.leadingOutcome.toLowerCase()}` : ''}`,
    url: prediction.url,
  }));
}

function buildCalendarEvidence(events: CalendarEvent[], limit = 2): OpportunityEvidence[] {
  return events.slice(0, limit).map((event, index) => ({
    id: `${event.date}-${event.title}-${index}`,
    type: 'macro',
    title: event.title,
    detail: `${summarizeDate(event.date)} · ${event.importance.toUpperCase()} ${event.category.toUpperCase()}`,
  }));
}

function buildCountryEvidence(countryCounts: CountryNewsCount[], limit = 2): OpportunityEvidence[] {
  return countryCounts.slice(0, limit).map((country) => ({
    id: `${country.countryCode}-${country.key}`,
    type: 'geopolitics',
    title: `${country.label} hotspot cluster`,
    detail: `${country.count} clustered events${country.severityScore ? ` · severity ${country.severityScore}/10` : ''}`,
  }));
}

function buildTradeEvidence(snapshot: TradeDisruptionSnapshot | null | undefined): OpportunityEvidence[] {
  if (!snapshot) return [];

  const evidence: OpportunityEvidence[] = [];

  if (snapshot.events[0]) {
    evidence.push({
      id: snapshot.events[0].id,
      type: 'trade',
      title: snapshot.events[0].title,
      detail: `${snapshot.events[0].alertLevel} · ${snapshot.events[0].affectedAssetCount} affected assets`,
      url: snapshot.events[0].sourceUrl,
    });
  }

  if (snapshot.liveSignals.headlines[0]) {
    evidence.push({
      id: snapshot.liveSignals.headlines[0].id,
      type: 'trade',
      title: snapshot.liveSignals.headlines[0].title,
      detail: `${snapshot.liveSignals.headlines[0].publisher} · live trade signal`,
      url: snapshot.liveSignals.headlines[0].url,
    });
  }

  const topZone = [...snapshot.aisChokepoints, ...snapshot.aisPortZones]
    .sort((left, right) => right.congestionScore - left.congestionScore)[0];

  if (topZone) {
    evidence.push({
      id: `${topZone.id}-${topZone.sampledAt}`,
      type: 'trade',
      title: `${topZone.name} congestion watch`,
      detail: `${topZone.congestionBand.toUpperCase()} congestion · ${topZone.vesselCount} vessels`,
    });
  }

  return evidence.slice(0, 3);
}

function buildSentimentEvidence(sentiment: MarketSentimentSnapshot | null | undefined): OpportunityEvidence[] {
  if (!sentiment) return [];
  return [
    {
      id: `sentiment-${sentiment.updatedAt}`,
      type: 'sentiment',
      title: `Cross-asset regime: ${sentiment.regime}`,
      detail: sentiment.summary,
    },
  ];
}

function freshStoryCount(stories: NewsItem[], maxHours = 24): number {
  return stories.filter((story) => hoursAgo(story.publishedAt) <= maxHours).length;
}

function priceMomentum(symbols: string[], quoteMap: Map<string, Quote>): number {
  const values = symbols
    .map((symbol) => quoteMap.get(upper(symbol))?.regularMarketChangePercent)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function filterPredictions(predictions: PredictionForecast[], terms: string[]): PredictionForecast[] {
  const normalizedTerms = terms.map((term) => term.toLowerCase());

  return predictions.filter((prediction) => {
    const haystack = [
      prediction.question,
      prediction.eventTitle,
      prediction.theme,
      prediction.category,
      prediction.subcategory,
      ...prediction.tags,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return normalizedTerms.some((term) => haystack.includes(term));
  });
}

function filterCalendar(events: CalendarEvent[], matcher: (event: CalendarEvent) => boolean): CalendarEvent[] {
  return events.filter(matcher).sort((left, right) => left.date.localeCompare(right.date));
}

function countUrgentCatalysts(opportunities: Opportunity[]): number {
  return opportunities.reduce((count, opportunity) => count + Math.min(opportunity.catalysts.length, 1), 0);
}

function createOpportunity(args: {
  config: ThemeConfig;
  news: NewsItem[];
  predictions: PredictionForecast[];
  calendar: CalendarEvent[];
  extraEvidence?: OpportunityEvidence[];
  whyNow: string[];
  catalysts: string[];
  tradeBoost?: number;
  geopoliticsBoost?: number;
  sentimentBoost?: number;
  holdings: PortfolioHolding[];
  watchlistSet: Set<string>;
  quoteMap: Map<string, Quote>;
  relevanceFloor?: number;
}): Opportunity {
  const { config, news, predictions, calendar, extraEvidence = [], whyNow, catalysts, tradeBoost = 0, geopoliticsBoost = 0, sentimentBoost = 0, holdings, watchlistSet, quoteMap, relevanceFloor } = args;
  const freshness = freshStoryCount(news, 24);
  const momentum = priceMomentum(config.watchAssets, quoteMap);
  const signalFamilies = [
    news.length > 0,
    predictions.length > 0,
    calendar.length > 0,
    extraEvidence.some((item) => item.type === 'trade'),
    extraEvidence.some((item) => item.type === 'geopolitics'),
    extraEvidence.some((item) => item.type === 'sentiment'),
    Math.abs(momentum) >= 0.5,
  ].filter(Boolean).length;

  const { impact: portfolioImpact, relevanceScore } = buildPortfolioImpact(config, holdings, watchlistSet);
  const normalizedRelevance = Math.round(relevanceFloor != null ? Math.max(relevanceFloor, relevanceScore) : relevanceScore);
  const noveltyScore = Math.round(clamp(news.length * 7 + freshness * 10 + predictions.length * 8 + Math.max(momentum, 0) * 3, 20, 100));
  const impactScore = Math.round(clamp(config.impactFloor + tradeBoost + geopoliticsBoost + Math.max(momentum, 0) * 2, 25, 100));
  const confirmationScore = Math.round(clamp(signalFamilies * 17 + Math.min(news.length, 6) * 4 + Math.min(predictions.length, 3) * 5 + tradeBoost * 0.35 + geopoliticsBoost * 0.25 + sentimentBoost, 20, 100));
  const timelinessScore = Math.round(clamp(40 + freshness * 12 + Math.min(calendar.length, 3) * 10 + Math.abs(momentum) * 4, 20, 100));
  const score = Math.round(
    impactScore * 0.29 +
      confirmationScore * 0.24 +
      noveltyScore * 0.18 +
      timelinessScore * 0.14 +
      normalizedRelevance * 0.15
  );
  const confidence = Math.round(clamp(confirmationScore * 0.62 + Math.min(100, (news.length + extraEvidence.length + predictions.length) * 5), 25, 100));

  const evidence = [
    ...extraEvidence,
    ...buildNewsEvidence(news),
    ...buildPredictionEvidence(predictions),
    ...buildCalendarEvidence(calendar),
  ].slice(0, 6);

  return {
    id: config.id,
    title: config.title,
    theme: config.theme,
    summary: config.summary,
    thesis: config.thesis,
    direction: config.direction,
    horizon: config.horizon,
    score,
    confidence,
    noveltyScore,
    impactScore,
    confirmationScore,
    timelinessScore,
    relevanceScore: normalizedRelevance,
    whyNow: unique(whyNow).slice(0, 4),
    catalysts: unique(catalysts).slice(0, 4),
    watchItems: config.watchItems,
    invalidationSignals: config.invalidationSignals,
    assets: makeAssetIdeas(config, quoteMap),
    evidence,
    portfolioImpact,
  };
}

function buildMacroCatalystList(events: CalendarEvent[]): string[] {
  return events.slice(0, 3).map((event) => `${summarizeDate(event.date)} · ${event.title}`);
}

export function buildOpportunityDashboard(input: OpportunityEngineInput): OpportunityDashboard {
  const quoteMap = buildQuoteMap(input.quotes);
  const holdings = buildPortfolioHoldings(input.portfolio, quoteMap);
  const watchlistSet = new Set(input.watchlist.map(upper));
  const countryByCode = new Map(input.countryCounts.map((country) => [country.countryCode.toUpperCase(), country]));
  const meHotspots = ['IL', 'SA', 'AE', 'IR', 'IQ', 'YE', 'EG'].map((code) => countryByCode.get(code)).filter((item): item is CountryNewsCount => Boolean(item));
  const euHotspots = ['UA', 'RU', 'GB', 'DE', 'FR', 'TR'].map((code) => countryByCode.get(code)).filter((item): item is CountryNewsCount => Boolean(item));

  const tradeSnapshot = input.tradeSnapshot ?? null;
  const highCongestionZones = tradeSnapshot
    ? [...tradeSnapshot.aisChokepoints, ...tradeSnapshot.aisPortZones].filter((zone) => zone.congestionBand !== 'normal').length
    : 0;
  const tradeBoost = tradeSnapshot
    ? clamp(
        tradeSnapshot.activeEventCount * 4 +
          tradeSnapshot.gdeltEvents.length * 1.5 +
          tradeSnapshot.liveSignals.headlineCount * 0.8 +
          highCongestionZones * 6,
        0,
        32
      )
    : 0;
  const middleEastBoost = clamp(
    meHotspots.reduce((sum, country) => sum + country.count + safeNumber(country.severityScore), 0),
    0,
    28
  );
  const europeBoost = clamp(
    euHotspots.reduce((sum, country) => sum + country.count + safeNumber(country.severityScore), 0),
    0,
    24
  );
  const sentiment = input.sentiment ?? null;
  const cautiousTape = sentiment?.regime === 'CAUTIOUS' || sentiment?.regime === 'RISK-OFF';
  const riskOnTape = sentiment?.regime === 'BULLISH' || sentiment?.regime === 'RISK-ON';
  const sentimentBoost = cautiousTape ? 14 : riskOnTape ? 8 : 10;

  const aiConfig = THEME_CONFIGS.find((config) => config.id === 'ai-infrastructure')!;
  const energyConfig = THEME_CONFIGS.find((config) => config.id === 'energy-supply-risk')!;
  const shippingConfig = THEME_CONFIGS.find((config) => config.id === 'shipping-stress')!;
  const defenseConfig = THEME_CONFIGS.find((config) => config.id === 'defense-rearmament')!;
  const macroConfig = THEME_CONFIGS.find((config) => config.id === 'macro-policy-window')!;
  const hedgeConfig = THEME_CONFIGS.find((config) => config.id === 'risk-off-hedges')!;

  const aiPredictions = filterPredictions(input.predictions, ['ai', 'technology', 'chip', 'semiconductor']);
  const energyPredictions = filterPredictions(input.predictions, ['oil', 'energy', 'middle east', 'iran', 'opec', 'lng']);
  const defensePredictions = filterPredictions(input.predictions, ['war', 'military', 'defense', 'ukraine', 'middle east', 'security']);
  const macroPredictions = filterPredictions(input.predictions, ['fed', 'inflation', 'rate', 'yield', 'economy', 'recession']);

  const aiCalendar = filterCalendar(input.calendarEvents, (event) => ['NVDA', 'AMD', 'AVGO', 'MSFT', 'AMZN', 'GOOGL', 'META'].includes(upper(event.symbol ?? '')));
  const macroCalendar = filterCalendar(input.calendarEvents, (event) => {
    const title = event.title.toLowerCase();
    return event.importance === 'high' || title.includes('inflation') || title.includes('fed') || title.includes('payroll') || title.includes('cpi') || title.includes('pce');
  });

  const aiOpportunity = createOpportunity({
    config: aiConfig,
    news: [...input.aiNews].sort(byNewest),
    predictions: aiPredictions,
    calendar: aiCalendar,
    extraEvidence: sentiment && riskOnTape ? buildSentimentEvidence(sentiment) : [],
    whyNow: [
      `${input.aiNews.length} AI and semiconductor headlines surfaced in the last 72 hours`,
      `${freshStoryCount(input.aiNews)} of them are fresh inside 24 hours`,
      `Core AI basket is moving ${priceMomentum(aiConfig.watchAssets, quoteMap) >= 0 ? 'with' : 'against'} the narrative at ${priceMomentum(aiConfig.watchAssets, quoteMap).toFixed(2)}% on average`,
    ],
    catalysts: aiCalendar.length ? buildMacroCatalystList(aiCalendar) : ['Next mega-cap and semiconductor earnings cycle'],
    tradeBoost: 0,
    geopoliticsBoost: 0,
    sentimentBoost: riskOnTape ? 12 : 4,
    holdings,
    watchlistSet,
    quoteMap,
  });

  const energyOpportunity = createOpportunity({
    config: energyConfig,
    news: [...input.energyNews].sort(byNewest),
    predictions: energyPredictions,
    calendar: [],
    extraEvidence: [...buildCountryEvidence(meHotspots), ...buildTradeEvidence(tradeSnapshot)].slice(0, 3),
    whyNow: [
      `${meHotspots.reduce((sum, country) => sum + country.count, 0)} clustered geopolitical events are active across key Middle East hotspots`,
      tradeSnapshot ? `${tradeSnapshot.activeEventCount} active PortWatch disruptions and ${tradeSnapshot.liveSignals.headlineCount} live trade headlines reinforce the supply story` : 'Maritime trade stress remains worth watching',
      `Energy basket is moving ${priceMomentum(energyConfig.watchAssets, quoteMap) >= 0 ? 'up' : 'down'} ${Math.abs(priceMomentum(energyConfig.watchAssets, quoteMap)).toFixed(2)}% on average`,
    ],
    catalysts: ['Watch Hormuz and Red Sea escalation headlines', 'Monitor crude response vs headline flow', 'Track whether chokepoint congestion broadens into freight costs'],
    tradeBoost,
    geopoliticsBoost: middleEastBoost,
    sentimentBoost,
    holdings,
    watchlistSet,
    quoteMap,
  });

  const shippingOpportunity = createOpportunity({
    config: shippingConfig,
    news: [...input.shippingNews].sort(byNewest),
    predictions: [],
    calendar: [],
    extraEvidence: buildTradeEvidence(tradeSnapshot),
    whyNow: [
      tradeSnapshot ? `${tradeSnapshot.activeEventCount} active trade disruption events are on the board` : 'Shipping headlines are active',
      tradeSnapshot ? `${tradeSnapshot.liveSignals.headlineCount} live logistics headlines have been captured in the monitor` : `${input.shippingNews.length} logistics stories matched the theme`,
      tradeSnapshot ? `${highCongestionZones} watched chokepoints or ports are running above normal congestion` : 'Shipping stress is still headline-driven rather than telemetry-driven',
    ],
    catalysts: ['Monitor Suez, Panama, Hormuz, and major port updates', 'Watch whether AIS congestion spills into more structured alerts', 'Track freight-sensitive equities for confirmation'],
    tradeBoost: tradeBoost + 6,
    geopoliticsBoost: Math.round(middleEastBoost * 0.35),
    sentimentBoost: 6,
    holdings,
    watchlistSet,
    quoteMap,
  });

  const defenseOpportunity = createOpportunity({
    config: defenseConfig,
    news: [...input.defenseNews].sort(byNewest),
    predictions: defensePredictions,
    calendar: [],
    extraEvidence: [...buildCountryEvidence([...meHotspots, ...euHotspots]), ...(sentiment && cautiousTape ? buildSentimentEvidence(sentiment) : [])].slice(0, 3),
    whyNow: [
      `${input.defenseNews.length} defense and security headlines were picked up in the last 72 hours`,
      `${meHotspots.length + euHotspots.length} high-attention geopolitical zones are reinforcing the theme`,
      `Defense basket is moving ${priceMomentum(defenseConfig.watchAssets, quoteMap) >= 0 ? 'up' : 'down'} ${Math.abs(priceMomentum(defenseConfig.watchAssets, quoteMap)).toFixed(2)}% on average`,
    ],
    catalysts: ['Watch security-aid, procurement, and budget headlines', 'Monitor whether Europe and Middle East hotspots broaden', 'Track ITA and defense primes for follow-through'],
    tradeBoost: 0,
    geopoliticsBoost: Math.round((middleEastBoost + europeBoost) * 0.7),
    sentimentBoost: cautiousTape ? 10 : 4,
    holdings,
    watchlistSet,
    quoteMap,
  });

  const macroOpportunity = createOpportunity({
    config: macroConfig,
    news: [...input.macroNews].sort(byNewest),
    predictions: macroPredictions,
    calendar: macroCalendar,
    extraEvidence: sentiment ? buildSentimentEvidence(sentiment) : [],
    whyNow: [
      `${macroCalendar.filter((event) => event.importance === 'high').length} high-impact macro events are sitting in the near calendar window`,
      `${input.macroNews.length} inflation, Fed, and rates stories were captured in the last 72 hours`,
      `Rates-sensitive basket is moving ${priceMomentum(macroConfig.watchAssets, quoteMap) >= 0 ? 'up' : 'down'} ${Math.abs(priceMomentum(macroConfig.watchAssets, quoteMap)).toFixed(2)}% on average`,
    ],
    catalysts: macroCalendar.length ? buildMacroCatalystList(macroCalendar) : ['Next CPI, payrolls, or Fed catalyst window'],
    tradeBoost: 0,
    geopoliticsBoost: 0,
    sentimentBoost,
    holdings,
    watchlistSet,
    quoteMap,
  });

  const hedgeOpportunity = createOpportunity({
    config: hedgeConfig,
    news: [...input.energyNews, ...input.defenseNews, ...input.macroNews].sort(byNewest),
    predictions: [...energyPredictions, ...macroPredictions].slice(0, 3),
    calendar: macroCalendar,
    extraEvidence: [...buildCountryEvidence(meHotspots), ...buildTradeEvidence(tradeSnapshot), ...buildSentimentEvidence(sentiment)].slice(0, 4),
    whyNow: [
      sentiment ? `Cross-asset regime is ${sentiment.regime}` : 'Cross-asset regime is unavailable, so this stays a lower-conviction hedge read',
      tradeSnapshot ? `${tradeSnapshot.activeEventCount} trade disruptions and ${highCongestionZones} elevated chokepoints keep stress elevated` : 'Trade stress is headline-driven',
      `${meHotspots.reduce((sum, country) => sum + country.count, 0)} Middle East hotspot clusters keep tail-risk alive`,
    ],
    catalysts: macroCalendar.length ? buildMacroCatalystList(macroCalendar) : ['Watch whether stress cools before the next macro catalyst'],
    tradeBoost: Math.round(tradeBoost * 0.65),
    geopoliticsBoost: middleEastBoost,
    sentimentBoost: cautiousTape ? 14 : 6,
    holdings,
    watchlistSet,
    quoteMap,
    relevanceFloor: cautiousTape ? 42 : 20,
  });

  const opportunities = [
    aiOpportunity,
    energyOpportunity,
    shippingOpportunity,
    defenseOpportunity,
    macroOpportunity,
    hedgeOpportunity,
  ]
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const topOpportunities = opportunities.map((opportunity) => `${opportunity.title} (${opportunity.score})`);
  const topRisks = opportunities
    .filter((opportunity) => opportunity.portfolioImpact.impactedPositions.some((position) => position.role === 'risk'))
    .map((opportunity) => opportunity.title)
    .slice(0, 3);
  const nextCatalysts = unique(opportunities.flatMap((opportunity) => opportunity.catalysts)).slice(0, 4);
  const relevantCount = opportunities.filter(
    (opportunity) => opportunity.portfolioImpact.impactedPositions.length > 0 || opportunity.portfolioImpact.watchlistOverlap.length > 0
  ).length;
  const highConfidenceCount = opportunities.filter((opportunity) => opportunity.confidence >= 70).length;

  const brief: OpportunityBrief = {
    generatedAt: new Date().toISOString(),
    headline: opportunities[0]
      ? `${opportunities[0].title} leads the current opportunity set`
      : 'Opportunity engine is waiting for enough signal overlap',
    summary: opportunities[0]
      ? `The strongest setup right now is ${opportunities[0].title.toLowerCase()}, with ${relevantCount} of the top themes touching your portfolio or watchlist. The nearest catalysts are ${nextCatalysts.slice(0, 2).join(' and ') || 'still headline-driven rather than scheduled'}.`
      : 'No high-conviction opportunity clusters were produced from the current data snapshot.',
    topOpportunities,
    topRisks,
    nextCatalysts,
  };

  return {
    generatedAt: new Date().toISOString(),
    opportunities,
    brief,
    stats: {
      trackedThemes: THEME_CONFIGS.length,
      portfolioRelevantCount: relevantCount,
      highConfidenceCount,
      urgentCatalystCount: countUrgentCatalysts(opportunities),
    },
  };
}

export function getOpportunityThemeSearches(): Record<ThemeId | 'macro-policy-window', string> {
  return {
    'ai-infrastructure': 'artificial intelligence semiconductors data center power',
    'energy-supply-risk': 'oil opec energy supply lng refinery',
    'shipping-stress': 'shipping port disruption canal freight logistics',
    'defense-rearmament': 'defense military drone missile security',
    'macro-policy-window': 'inflation fed treasury yields rate cuts',
    'risk-off-hedges': 'risk off volatility gold treasury defensive stocks',
  };
}

export function getOpportunitySymbolUniverse(): string[] {
  return unique(
    THEME_CONFIGS.flatMap((config) => [
      ...config.beneficiaryAssets,
      ...config.riskAssets,
      ...config.hedgeAssets,
      ...config.watchAssets,
    ]).map(upper)
  );
}
