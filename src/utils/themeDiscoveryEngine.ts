import {
  CalendarEvent,
  CountryNewsCount,
  MarketSentimentSnapshot,
  NewsItem,
  PortfolioPosition,
  PredictionForecast,
  Quote,
} from '../types';

type SignalType = 'news' | 'geopolitics' | 'prediction' | 'macro' | 'sentiment';

type DiscoveredSignal = {
  id: string;
  type: SignalType;
  sourceLabel: string;
  title: string;
  detail: string;
  context?: string;
  url?: string | null;
  timestamp: number;
  intensity: number;
  keywords: string[];
  phrases: string[];
  assets: string[];
  countries: string[];
};

export interface ThemeDiscoverySignalPayload {
  id: string;
  type: SignalType;
  sourceLabel: string;
  title: string;
  detail: string;
  context?: string;
  url?: string | null;
  timestamp: number;
  assets: string[];
  countries: string[];
  keywords: string[];
}

type DiscoveryAssetOverlap = 'portfolio' | 'watchlist' | 'external';

export interface DiscoveredThemeAsset {
  symbol: string;
  label: string;
  overlap: DiscoveryAssetOverlap;
  mentionCount: number;
  price: number | null;
  changePct: number | null;
}

export interface DiscoveredThemeEvidence {
  id: string;
  type: SignalType;
  title: string;
  detail: string;
  context?: string;
  sourceLabel: string;
  url?: string | null;
  timestamp: number;
}

export interface DiscoveredThemePortfolioMatch {
  symbol: string;
  label: string;
  currentValue: number;
  weightPct: number;
}

export interface DiscoveredThemeAction {
  label: string;
  detail: string;
}

export interface DiscoveredTheme {
  id: string;
  label: string;
  summary: string;
  thesis: string;
  whyItMatters: string;
  actionSummary: string;
  primaryRecommendation: string;
  playbook: string[];
  score: number;
  emergenceScore: number;
  breadthScore: number;
  urgencyScore: number;
  relevanceScore: number;
  confidenceScore: number;
  signalCount: number;
  sourceDiversity: number;
  freshestAt: number;
  keywords: string[];
  sourceMix: Array<{ source: string; count: number }>;
  linkedAssets: DiscoveredThemeAsset[];
  catalysts: string[];
  whyEmerging: string[];
  implications: string[];
  actionItems: DiscoveredThemeAction[];
  watchItems: string[];
  invalidationSignals: string[];
  evidence: DiscoveredThemeEvidence[];
  portfolioImpact: {
    label: string;
    portfolioLabel: string;
    watchlistLabel: string;
    opportunityLabel: string;
    holdings: DiscoveredThemePortfolioMatch[];
    portfolioWeightPct: number;
    watchlistOverlap: string[];
    externalIdeas: string[];
    portfolioRecommendation: string;
    watchlistRecommendation: string;
    opportunityRecommendation: string;
  };
  portfolioAngle: string;
  watchlistAngle: string;
  opportunityAngle: string;
}

export interface DiscoveryDashboard {
  generatedAt: string;
  mode: 'ai' | 'heuristic' | 'keyword';
  model?: string;
  themes: DiscoveredTheme[];
  brief: {
    headline: string;
    summary: string;
    sourceCount: number;
    signalCount: number;
  };
  stats: {
    clusterCount: number;
    signalCount: number;
    portfolioRelevantCount: number;
    avgSourceDiversity: number;
  };
}

export interface KeywordThemeDashboard extends DiscoveryDashboard {
  mode: 'keyword';
  requestedTopics: string[];
  matchedTopics: string[];
  unmatchedTopics: string[];
  stats: DiscoveryDashboard['stats'] & {
    requestedTopicCount: number;
    matchedTopicCount: number;
    unmatchedTopicCount: number;
  };
}

export interface TopicThemeGuidanceSnapshot {
  generatedAt: string;
  requestedTopics: string[];
  portfolio: {
    holdings: Array<{ symbol: string; label: string; currentValue: number; weightPct: number }>;
    symbols: string[];
  };
  watchlist: string[];
  themes: Array<{
    id: string;
    label: string;
    summary: string;
    thesis: string;
    score: number;
    signalCount: number;
    sourceMix: Array<{ source: string; count: number }>;
    keywords: string[];
    linkedAssets: string[];
    catalysts: string[];
    watchItems: string[];
    invalidationSignals: string[];
    evidence: Array<{
      id: string;
      type: SignalType;
      title: string;
      detail: string;
      context?: string;
      sourceLabel: string;
      url?: string | null;
      timestamp: number;
    }>;
    portfolioImpact: {
      label: string;
      holdings: Array<{ symbol: string; label: string; currentValue: number; weightPct: number }>;
      portfolioWeightPct: number;
      watchlistOverlap: string[];
      externalIdeas: string[];
      portfolioRecommendation: string;
      watchlistRecommendation: string;
      opportunityRecommendation: string;
    };
  }>;
}

export interface AIThemeDiscoveryTheme {
  id: string;
  label: string;
  summary: string;
  thesis: string;
  whyItMatters: string;
  actionSummary: string;
  portfolioAngle: string;
  watchlistAngle: string;
  opportunityAngle: string;
  primaryRecommendation: string;
  playbook: string[];
  signalIds: string[];
  linkedAssets: string[];
  catalysts: string[];
  invalidationSignals: string[];
  watchItems: string[];
  confidence: number;
  importance: number;
}

export interface AIThemeDiscoveryResult {
  generatedAt: string;
  model: string;
  themes: AIThemeDiscoveryTheme[];
}

export interface AIThemeGuidanceTheme {
  id: string;
  summary?: string;
  thesis?: string;
  whyItMatters?: string;
  actionSummary?: string;
  portfolioAngle?: string;
  watchlistAngle?: string;
  opportunityAngle?: string;
  primaryRecommendation?: string;
  playbook?: string[];
  catalysts?: string[];
  watchItems?: string[];
  invalidationSignals?: string[];
}

export interface AIThemeGuidanceResult {
  generatedAt: string;
  model: string;
  themes: AIThemeGuidanceTheme[];
}

type DiscoveryInput = {
  marketNews: NewsItem[];
  techNews: NewsItem[];
  economyNews: NewsItem[];
  energyNews: NewsItem[];
  geopoliticsNews: NewsItem[];
  countryCounts: CountryNewsCount[];
  predictions: PredictionForecast[];
  predictionsUpdatedAt?: string;
  sentiment: MarketSentimentSnapshot | null;
  calendarEvents: CalendarEvent[];
  portfolio: PortfolioPosition[];
  watchlist: string[];
  quotes: Quote[];
};

type PortfolioHolding = {
  symbol: string;
  label: string;
  currentValue: number;
  weightPct: number;
};

type Cluster = {
  id: string;
  signals: DiscoveredSignal[];
  keywordCounts: Map<string, number>;
  phraseCounts: Map<string, number>;
  assetCounts: Map<string, number>;
  countryCounts: Map<string, number>;
  sourceCounts: Map<string, number>;
  newestAt: number;
  oldestAt: number;
  totalIntensity: number;
};

type KeywordTopic = {
  raw: string;
  label: string;
  normalized: string;
  keywords: string[];
  assets: string[];
};

const GENERIC_WORDS = new Set([
  'about', 'according', 'after', 'again', 'all', 'also', 'amid', 'analyst', 'analysts', 'and', 'annual',
  'announced', 'announces', 'any', 'are', 'around', 'bank', 'because', 'been', 'before', 'being', 'below',
  'between', 'boost', 'breaking', 'business', 'but', 'can', 'could', 'daily', 'data', 'despite', 'during',
  'earnings', 'economy', 'exclusive', 'financial', 'finance', 'first', 'for', 'fourth', 'from', 'global',
  'had', 'has', 'have', 'headline', 'headlines', 'her', 'here', 'higher', 'him', 'his', 'hit', 'hits',
  'how', 'impact', 'inc', 'into', 'investor', 'investors', 'its', 'latest', 'live', 'lower', 'market',
  'markets', 'may', 'might', 'month', 'monthly', 'months', 'more', 'must', 'new', 'news', 'nor', 'not',
  'now', 'one', 'opinion', 'our', 'outlook', 'over', 'quarter', 'quarterly', 'quarters', 'rate', 'rates',
  'report', 'reported', 'reporting', 'reports', 'results', 'risk', 'said', 'say', 'says', 'second',
  'sector', 'shares', 'should', 'signal', 'signals', 'since', 'some', 'stock', 'stocks', 'story', 'than',
  'the', 'their', 'them', 'then', 'there', 'these', 'they', 'third', 'this', 'those', 'through', 'today',
  'two', 'under', 'update', 'updates', 'was', 'watch', 'weekly', 'were', 'what', 'when', 'where', 'which',
  'while', 'who', 'why', 'will', 'with', 'world', 'worry', 'worries', 'would', 'year', 'years', 'yet',
  'you', 'your',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'politics', 'q1', 'q2', 'q3', 'q4',
]);

const ASSET_HINTS: Array<{ keywords: string[]; symbols: string[] }> = [
  { keywords: ['semiconductor', 'chip', 'chips', 'gpu'], symbols: ['SMH', 'NVDA', 'AMD', 'AVGO'] },
  { keywords: ['ai', 'artificial intelligence'], symbols: ['NVDA', 'MSFT', 'GOOGL', 'AMZN'] },
  { keywords: ['data center', 'cloud'], symbols: ['MSFT', 'AMZN', 'GOOGL'] },
  { keywords: ['oil', 'crude', 'opec', 'refinery', 'brent'], symbols: ['XLE', 'XOM', 'CVX', 'COP', 'SLB'] },
  { keywords: ['lng', 'natural gas'], symbols: ['UNG'] },
  { keywords: ['shipping', 'freight', 'port', 'ports', 'canal', 'logistics', 'container', 'rerouting'], symbols: ['ZIM', 'MATX', 'KEX', 'UPS', 'FDX'] },
  { keywords: ['defense', 'defense spending', 'military', 'missile', 'missiles', 'drone', 'national security', 'rearmament'], symbols: ['ITA', 'LMT', 'RTX', 'NOC', 'GD'] },
  { keywords: ['inflation', 'fed', 'treasury', 'yield', 'yields', 'payrolls', 'cpi', 'pce', 'rate cuts', 'policy'], symbols: ['TLT', 'IEF'] },
  { keywords: ['gold', 'safe haven'], symbols: ['GLD'] },
  { keywords: ['consumer', 'retail'], symbols: ['XLY', 'XLP', 'WMT', 'COST'] },
  { keywords: ['tariff', 'tariffs'], symbols: ['XLY', 'XLP'] },
  { keywords: ['banks', 'banking', 'credit', 'regional bank'], symbols: ['XLF', 'KRE', 'JPM'] },
];

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function upper(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesTerm(text: string, term: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedTerm = normalizeText(term);
  if (!normalizedText || !normalizedTerm) return false;
  return ` ${normalizedText} `.includes(` ${normalizedTerm} `);
}

function toTitleCase(text: string): string {
  return text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .map((token) => token.trim())
    .filter(isInformativeToken);
}

function isInformativeToken(token: string): boolean {
  return token.length >= 3 &&
    token.length <= 24 &&
    !GENERIC_WORDS.has(token) &&
    !/^\d+$/.test(token);
}

function extractKeywords(...segments: Array<string | null | undefined>): string[] {
  return unique(
    segments
      .filter((segment): segment is string => Boolean(segment))
      .flatMap((segment) => tokenize(segment))
  ).slice(0, 16);
}

function extractPhrases(...segments: Array<string | null | undefined>): string[] {
  const phrases: string[] = [];

  for (const segment of segments) {
    if (!segment) continue;
    const tokens = normalizeText(segment).split(' ').filter(Boolean);

    for (let index = 0; index < tokens.length - 1; index += 1) {
      if (isInformativeToken(tokens[index]) && isInformativeToken(tokens[index + 1])) {
        const phrase = `${tokens[index]} ${tokens[index + 1]}`;
        phrases.push(phrase);
      }
    }
  }

  return unique(phrases).slice(0, 10);
}

function inferAssetsFromText(text: string, explicitTickers: string[] = []): string[] {
  const inferred = ASSET_HINTS.flatMap((entry) =>
    entry.keywords.some((keyword) => includesTerm(text, keyword))
      ? entry.symbols
      : []
  );

  return unique([...explicitTickers.map(upper), ...inferred.map(upper)]).slice(0, 10);
}

function buildQuoteMap(quotes: Quote[]): Map<string, Quote> {
  return new Map(quotes.map((quote) => [upper(quote.symbol), quote]));
}

function buildPortfolioHoldings(portfolio: PortfolioPosition[], quoteMap: Map<string, Quote>): PortfolioHolding[] {
  const grouped = new Map<string, { shares: number; totalCost: number; currentValue: number; label: string }>();

  for (const position of portfolio) {
    const symbol = upper(position.symbol);
    const quote = quoteMap.get(symbol);
    const currentPrice = quote?.regularMarketPrice ?? position.avgCost;
    const currentValue = currentPrice * position.shares;
    const totalCost = position.avgCost * position.shares;
    const existing = grouped.get(symbol);

    if (existing) {
      existing.shares += position.shares;
      existing.totalCost += totalCost;
      existing.currentValue += currentValue;
    } else {
      grouped.set(symbol, {
        shares: position.shares,
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
      currentValue: holding.currentValue,
      weightPct: totalValue > 0 ? (holding.currentValue / totalValue) * 100 : 0,
    }))
    .sort((left, right) => right.currentValue - left.currentValue);
}

function signalAgeHours(timestamp: number): number {
  return Math.abs(Date.now() - timestamp) / 3_600_000;
}

function closestSignalTimestamp(cluster: Cluster): number {
  return cluster.signals.reduce((closest, signal) => (
    Math.abs(Date.now() - signal.timestamp) < Math.abs(Date.now() - closest)
      ? signal.timestamp
      : closest
  ), cluster.signals[0]?.timestamp ?? Date.now());
}

function evidenceScoreCap(sourceDiversity: number): number {
  if (sourceDiversity <= 1) return 72;
  if (sourceDiversity === 2) return 88;
  return 96;
}

function intersectionCount(left: Iterable<string>, right: Iterable<string>): number {
  const rightSet = new Set(right);
  let count = 0;
  for (const value of left) {
    if (rightSet.has(value)) count += 1;
  }
  return count;
}

function topKeys(counts: Map<string, number>, limit = 8): string[] {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([key]) => key);
}

type ClusterQuality = {
  eligible: boolean;
  score: number;
  repeatedKeywords: string[];
  repeatedPhrases: string[];
  properNameTokens: Set<string>;
};

function isCapitalizedNameWord(word: string): boolean {
  return /^[A-Z][a-z]+(?:['-][A-Z]?[a-z]+)?$/.test(word);
}

function getProperNameTokens(cluster: Cluster): Set<string> {
  const properNames = new Set<string>();
  const nameLeadWords = new Set([
    'candidate', 'ceo', 'chairman', 'could', 'did', 'does', 'dr', 'governor', 'mayor', 'minister',
    'mr', 'mrs', 'ms', 'president', 'representative', 'senator', 'should', 'will', 'would',
  ]);

  for (const signal of cluster.signals) {
    const words = signal.title.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
    for (let index = 0; index < words.length - 1; index += 1) {
      const left = normalizeText(words[index]);
      const right = normalizeText(words[index + 1]);
      const previous = normalizeText(words[index - 1] ?? '');
      const hasNameContext = signal.type === 'prediction' || nameLeadWords.has(previous);
      if (
        hasNameContext &&
        isCapitalizedNameWord(words[index]) &&
        isCapitalizedNameWord(words[index + 1]) &&
        isInformativeToken(left) &&
        isInformativeToken(right)
      ) {
        properNames.add(left);
        properNames.add(right);
      }
    }
  }

  return properNames;
}

function analyzeClusterQuality(cluster: Cluster): ClusterQuality {
  const properNameTokens = getProperNameTokens(cluster);
  const repeatedKeywords = [...cluster.keywordCounts.entries()]
    .filter(([keyword, count]) => count >= 2 && isInformativeToken(keyword) && !properNameTokens.has(keyword))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([keyword]) => keyword);
  const repeatedPhrases = [...cluster.phraseCounts.entries()]
    .filter(([phrase, count]) => {
      if (count < 2) return false;
      const tokens = phrase.split(' ').filter(Boolean);
      return tokens.length === 2 &&
        tokens.every(isInformativeToken) &&
        !tokens.every((token) => properNameTokens.has(token));
    })
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([phrase]) => phrase);
  const uniqueEvidenceCount = new Set(
    cluster.signals.map((signal) => signal.url?.trim().toLowerCase() || normalizeText(signal.title))
  ).size;
  const enoughEvidence = uniqueEvidenceCount >= 2 &&
    (cluster.sourceCounts.size >= 2 || cluster.signals.length >= 3);
  const semanticallyCoherent = repeatedPhrases.length > 0 || repeatedKeywords.length >= 2;
  const score = repeatedPhrases.length * 5 +
    Math.min(repeatedKeywords.length, 6) * 2 +
    Math.min(cluster.sourceCounts.size, 4) * 2 +
    Math.min(uniqueEvidenceCount, 6);

  return {
    eligible: enoughEvidence && semanticallyCoherent,
    score,
    repeatedKeywords,
    repeatedPhrases,
    properNameTokens,
  };
}

function proposedThemeLabelIsGrounded(label: string, cluster: Cluster, quality = analyzeClusterQuality(cluster)): boolean {
  const labelTokens = tokenize(label).filter((token) => !quality.properNameTokens.has(token));
  if (labelTokens.length < 2) return false;

  const supportedTokens = labelTokens.filter((token) => (cluster.keywordCounts.get(token) ?? 0) >= 2);
  return supportedTokens.length >= 2;
}

function createCluster(signal: DiscoveredSignal, index: number): Cluster {
  const cluster: Cluster = {
    id: `cluster-${index}-${signal.id}`,
    signals: [],
    keywordCounts: new Map<string, number>(),
    phraseCounts: new Map<string, number>(),
    assetCounts: new Map<string, number>(),
    countryCounts: new Map<string, number>(),
    sourceCounts: new Map<string, number>(),
    newestAt: signal.timestamp,
    oldestAt: signal.timestamp,
    totalIntensity: 0,
  };

  addSignalToCluster(cluster, signal);
  return cluster;
}

function incrementCounts(map: Map<string, number>, values: string[]) {
  for (const value of values) {
    map.set(value, (map.get(value) ?? 0) + 1);
  }
}

function addSignalToCluster(cluster: Cluster, signal: DiscoveredSignal) {
  cluster.signals.push(signal);
  incrementCounts(cluster.keywordCounts, signal.keywords);
  incrementCounts(cluster.phraseCounts, signal.phrases);
  incrementCounts(cluster.assetCounts, signal.assets);
  incrementCounts(cluster.countryCounts, signal.countries);
  incrementCounts(cluster.sourceCounts, [signal.type]);
  cluster.newestAt = Math.max(cluster.newestAt, signal.timestamp);
  cluster.oldestAt = Math.min(cluster.oldestAt, signal.timestamp);
  cluster.totalIntensity += signal.intensity;
}

function clusterSimilarity(signal: DiscoveredSignal, cluster: Cluster): number {
  const sharedAssets = intersectionCount(signal.assets, cluster.assetCounts.keys());
  const sharedCountries = intersectionCount(signal.countries, cluster.countryCounts.keys());
  const sharedKeywords = intersectionCount(signal.keywords, topKeys(cluster.keywordCounts, 12));
  const sharedPhrases = intersectionCount(signal.phrases, topKeys(cluster.phraseCounts, 10));
  const hoursGap = Math.abs(cluster.newestAt - signal.timestamp) / 3_600_000;
  const recencyBonus = hoursGap <= 8 ? 1.5 : hoursGap <= 24 ? 0.9 : hoursGap <= 72 ? 0.35 : 0;
  const hasSemanticMatch = sharedPhrases > 0 ||
    sharedKeywords >= 2 ||
    (sharedCountries > 0 && sharedKeywords > 0);

  if (!hasSemanticMatch) return 0;

  return Math.min(sharedAssets, 2) * 0.8 +
    sharedCountries * 2.2 +
    sharedPhrases * 2.8 +
    sharedKeywords * 1.6 +
    recencyBonus;
}

function clusterSignals(signals: DiscoveredSignal[]): Cluster[] {
  const sortedSignals = [...signals].sort((left, right) => right.timestamp - left.timestamp);
  const clusters: Cluster[] = [];

  for (const signal of sortedSignals) {
    let bestCluster: Cluster | null = null;
    let bestScore = 0;

    for (const cluster of clusters) {
      const score = clusterSimilarity(signal, cluster);
      if (score > bestScore) {
        bestScore = score;
        bestCluster = cluster;
      }
    }

    if (bestCluster && bestScore >= 4.5) {
      addSignalToCluster(bestCluster, signal);
    } else {
      clusters.push(createCluster(signal, clusters.length));
    }
  }

  return clusters;
}

function pickClusterLabel(cluster: Cluster, quality = analyzeClusterQuality(cluster)): string | null {
  if (!quality.eligible) return null;

  const phraseCandidate = quality.repeatedPhrases.find((phrase) =>
    proposedThemeLabelIsGrounded(phrase, cluster, quality)
  );
  if (phraseCandidate) return toTitleCase(phraseCandidate);

  if (quality.repeatedKeywords.length >= 2) {
    return toTitleCase(quality.repeatedKeywords.slice(0, 2).join(' '));
  }

  return null;
}

function summarizeCluster(label: string, cluster: Cluster, sourceDiversity: number): string {
  const leadSignal = [...cluster.signals]
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  const evidenceLead = leadSignal?.title?.trim()
    ? ` The newest supporting evidence is: ${leadSignal.title.trim()}.`
    : '';
  const breadth = sourceDiversity > 1
    ? `${sourceDiversity} signal types`
    : 'one signal type';
  return `${label} is the common thread across ${cluster.signals.length} validated signals from ${breadth}.${evidenceLead}`;
}

function summarizeWhyItMatters(
  label: string,
  cluster: Cluster,
  sourceDiversity: number,
  linkedAssets: DiscoveredThemeAsset[],
  portfolioImpact: Pick<DiscoveredTheme['portfolioImpact'], 'holdings' | 'portfolioWeightPct' | 'watchlistOverlap'>,
): string {
  const confirmation = sourceDiversity > 1
    ? `${sourceDiversity} signal types are reinforcing the same ${label.toLowerCase()} development rather than one isolated headline.`
    : `${cluster.signals.length} signals point to the same development, but they come from one signal type, so confirmation is still limited.`;
  const portfolioContext = portfolioImpact.holdings.length > 0
    ? ` It already touches ${portfolioImpact.holdings.length} portfolio holding${portfolioImpact.holdings.length === 1 ? '' : 's'} (${portfolioImpact.portfolioWeightPct.toFixed(1)}% by value).`
    : portfolioImpact.watchlistOverlap.length > 0
      ? ` It already overlaps the watchlist through ${portfolioImpact.watchlistOverlap.slice(0, 3).join(', ')}.`
      : linkedAssets.length > 0
        ? ` Repeated evidence links it to ${linkedAssets.slice(0, 3).map((asset) => asset.symbol).join(', ')} for follow-up research.`
        : '';
  return `It matters because ${confirmation}${portfolioContext}`;
}

function buildNewsSignals(newsItems: NewsItem[], sourceLabel: string): DiscoveredSignal[] {
  return newsItems.map((item, index) => {
    const keywords = extractKeywords(item.title, item.snippet);
    const phrases = extractPhrases(item.title, item.snippet);
    const countries = unique((item.countryCodes ?? []).map((country) => country.toUpperCase()));
    const assets = inferAssetsFromText(`${item.title} ${item.snippet ?? ''}`, item.tickers ?? []);

    return {
      id: `${sourceLabel}-${index}-${item.link}`,
      type: 'news',
      sourceLabel,
      title: item.title,
      detail: item.publisher || sourceLabel,
      context: item.snippet?.trim().slice(0, 480),
      url: item.link,
      timestamp: item.publishedAt,
      intensity: 45 + Math.min((item.tickers?.length ?? 0) * 6, 12),
      keywords,
      phrases,
      assets,
      countries,
    };
  });
}

function buildCountrySignals(countryCounts: CountryNewsCount[]): DiscoveredSignal[] {
  return countryCounts
    .filter((country) => country.count > 0)
    .map((country) => {
      const representativeTitle = country.sampleTitle ?? `${country.label} geopolitical hotspot`;
      const storyText = (country.stories ?? [])
        .slice(0, 4)
        .map((story) => `${story.title} ${story.snippet ?? ''}`)
        .join(' ');
      const combined = `${representativeTitle} ${storyText}`;

      return {
        id: `geo-${country.key}-${country.latestAt ?? 0}`,
        type: 'geopolitics',
        sourceLabel: 'Geopolitics',
        title: representativeTitle,
        detail: `${country.label} · ${country.count} clustered events`,
        url: country.stories?.[0]?.link,
        timestamp: country.latestAt ?? Date.now(),
        intensity: 52 + country.count * 6 + Math.round((country.severityScore ?? 0) * 2),
        keywords: extractKeywords(country.label, combined),
        phrases: extractPhrases(representativeTitle, storyText),
        assets: inferAssetsFromText(combined, country.stories?.flatMap((story) => story.tickers ?? []) ?? []),
        countries: [country.countryCode.toUpperCase(), ...extractKeywords(country.label)],
      };
    });
}

function buildPredictionSignals(predictions: PredictionForecast[], updatedAt?: string): DiscoveredSignal[] {
  const snapshotTimestamp = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  const timestamp = Number.isFinite(snapshotTimestamp) ? snapshotTimestamp : Date.now();

  return predictions.map((prediction) => {
    const text = [
      prediction.question,
      prediction.theme,
      prediction.category,
      prediction.subcategory,
      ...prediction.tags,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      id: `prediction-${prediction.id}`,
      type: 'prediction',
      sourceLabel: 'Prediction',
      title: prediction.question,
      detail: `${prediction.theme}${prediction.leadingProbability != null ? ` · ${Math.round(prediction.leadingProbability)}% ${prediction.leadingOutcome.toLowerCase()}` : ''}`,
      url: prediction.url,
      timestamp,
      intensity: 44 + Math.min(Math.round((prediction.volume24hr ?? 0) / 25_000), 20),
      keywords: extractKeywords(text),
      phrases: extractPhrases(text),
      assets: inferAssetsFromText(text),
      countries: [],
    };
  });
}

function buildMacroSignals(events: CalendarEvent[]): DiscoveredSignal[] {
  return events
    .filter((event) => event.importance !== 'low')
    .map((event, index) => {
      const text = `${event.title} ${event.description ?? ''} ${event.country ?? ''} ${event.symbol ?? ''}`;
      const timestamp = new Date(`${event.date}T13:00:00Z`).getTime();
      return {
        id: `macro-${event.date}-${event.title}-${index}`,
        type: 'macro',
        sourceLabel: 'Macro',
        title: event.title,
        detail: `${event.importance.toUpperCase()} ${event.category.toUpperCase()} · ${event.date}`,
        timestamp,
        intensity: event.importance === 'high' ? 62 : 46,
        keywords: extractKeywords(text),
        phrases: extractPhrases(text),
        assets: inferAssetsFromText(text, event.symbol ? [event.symbol] : []),
        countries: unique([event.country ?? ''].filter(Boolean)),
      };
    });
}

function buildSentimentSignals(sentiment: MarketSentimentSnapshot | null): DiscoveredSignal[] {
  if (!sentiment) return [];

  const text = `${sentiment.regime} ${sentiment.summary} ${sentiment.pillars.map((pillar) => `${pillar.label} ${pillar.signal} ${pillar.detail}`).join(' ')}`;
  return [{
    id: `sentiment-${sentiment.updatedAt}`,
    type: 'sentiment',
    sourceLabel: 'Sentiment',
    title: `Cross-asset regime: ${sentiment.regime}`,
    detail: sentiment.summary,
    timestamp: new Date(sentiment.updatedAt).getTime(),
    intensity: sentiment.regime === 'RISK-OFF' || sentiment.regime === 'RISK-ON' ? 65 : 48,
    keywords: extractKeywords(text),
    phrases: extractPhrases(text),
    assets: inferAssetsFromText(text),
    countries: [],
  }];
}

function buildPortfolioImpact(
  linkedAssets: string[],
  holdings: PortfolioHolding[],
  watchlistSet: Set<string>
): {
  relevanceScore: number;
  label: string;
  portfolioLabel: string;
  watchlistLabel: string;
  opportunityLabel: string;
  holdings: DiscoveredThemePortfolioMatch[];
  portfolioWeightPct: number;
  watchlistOverlap: string[];
  externalIdeas: string[];
  portfolioRecommendation: string;
  watchlistRecommendation: string;
  opportunityRecommendation: string;
} {
  const overlapHoldings = holdings
    .filter((holding) => linkedAssets.includes(holding.symbol))
    .map((holding) => ({
      symbol: holding.symbol,
      label: holding.label,
      currentValue: holding.currentValue,
      weightPct: holding.weightPct,
    }));

  const watchlistOverlap = linkedAssets.filter((symbol) => watchlistSet.has(symbol) && !overlapHoldings.some((holding) => holding.symbol === symbol));
  const externalIdeas = linkedAssets.filter(
    (symbol) => !watchlistSet.has(symbol) && !overlapHoldings.some((holding) => holding.symbol === symbol)
  );
  const portfolioWeight = overlapHoldings.reduce((sum, holding) => sum + holding.weightPct, 0);
  const relevanceScore = Math.round(
    clamp(overlapHoldings.length * 26 + watchlistOverlap.length * 11 + externalIdeas.length * 4 + portfolioWeight * 1.3, 6, 100)
  );

  let label = 'No direct overlap with current holdings';
  if (overlapHoldings.length > 0) {
    label = `${overlapHoldings.length} holding${overlapHoldings.length === 1 ? '' : 's'} overlap with ${portfolioWeight.toFixed(1)}% portfolio weight`;
  } else if (watchlistOverlap.length > 0) {
    label = `Watchlist overlap: ${watchlistOverlap.slice(0, 3).join(', ')}`;
  } else if (externalIdeas.length > 0) {
    label = `Fresh external idea set: ${externalIdeas.slice(0, 3).join(', ')}`;
  }

  const portfolioLabel = overlapHoldings.length > 0
    ? `${overlapHoldings.length} portfolio holding${overlapHoldings.length === 1 ? '' : 's'} are directly linked to this cluster`
    : 'No current portfolio holdings map directly to this cluster';
  const watchlistLabel = watchlistOverlap.length > 0
    ? `${watchlistOverlap.length} watchlist name${watchlistOverlap.length === 1 ? '' : 's'} already overlap`
    : 'No current watchlist overlap';
  const opportunityLabel = externalIdeas.length > 0
    ? `External idea set available: ${externalIdeas.slice(0, 3).join(', ')}`
    : 'Most obvious linked assets are already in your portfolio or watchlist';

  const portfolioRecommendation = overlapHoldings.length > 0
    ? `Stress-test ${overlapHoldings.slice(0, 3).map((holding) => holding.symbol).join(', ')} before the next catalyst. This is a portfolio management question first, not just a new-idea question.`
    : 'No urgent portfolio action yet. Treat this as optional research unless the cluster broadens further.';
  const watchlistRecommendation = watchlistOverlap.length > 0
    ? `Move ${watchlistOverlap.slice(0, 3).join(', ')} to the top of the watchlist and wait for confirmation in both headlines and price behavior.`
    : 'There is no watchlist shortcut here yet, so any follow-up research would start from scratch.';
  const opportunityRecommendation = externalIdeas.length > 0
    ? `If you want a fast expression of the theme, start research with ${externalIdeas.slice(0, 3).join(', ')} before looking for smaller or less liquid names.`
    : 'There is no obvious outside opportunity gap right now beyond what you already track.';

  return {
    relevanceScore,
    label,
    portfolioLabel,
    watchlistLabel,
    opportunityLabel,
    holdings: overlapHoldings,
    portfolioWeightPct: portfolioWeight,
    watchlistOverlap,
    externalIdeas,
    portfolioRecommendation,
    watchlistRecommendation,
    opportunityRecommendation,
  };
}

function buildLinkedAssets(
  cluster: Cluster,
  quoteMap: Map<string, Quote>,
  portfolioSymbols: Set<string>,
  watchlistSymbols: Set<string>
): DiscoveredThemeAsset[] {
  const minimumSupport = Math.max(2, Math.ceil(cluster.signals.length * 0.25));

  return [...cluster.assetCounts.entries()]
    .filter(([, mentionCount]) => mentionCount >= minimumSupport)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([symbol, mentionCount]) => {
      const quote = quoteMap.get(symbol);
      const overlap: DiscoveryAssetOverlap = portfolioSymbols.has(symbol)
        ? 'portfolio'
        : watchlistSymbols.has(symbol)
          ? 'watchlist'
          : 'external';

      return {
        symbol,
        label: quote?.shortName ?? symbol,
        overlap,
        mentionCount,
        price: quote?.regularMarketPrice ?? null,
        changePct: quote?.regularMarketChangePercent ?? null,
      };
    });
}

function buildEvidence(cluster: Cluster): DiscoveredThemeEvidence[] {
  return [...cluster.signals]
    .sort((left, right) => {
      if (right.timestamp !== left.timestamp) return right.timestamp - left.timestamp;
      return right.intensity - left.intensity;
    })
    .slice(0, 6)
    .map((signal) => ({
      id: signal.id,
      type: signal.type,
      title: signal.title,
      detail: signal.detail,
      context: signal.context,
      sourceLabel: signal.sourceLabel,
      url: signal.url,
      timestamp: signal.timestamp,
    }));
}

function buildCatalysts(cluster: Cluster): string[] {
  const macroSignals = cluster.signals
    .filter((signal) => signal.type === 'macro')
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(0, 3)
    .map((signal) => signal.title);

  if (macroSignals.length > 0) return macroSignals;

  const predictionSignals = cluster.signals
    .filter((signal) => signal.type === 'prediction')
    .slice(0, 2)
    .map((signal) => signal.title);

  if (predictionSignals.length > 0) return predictionSignals;

  return [];
}

function buildWhyEmerging(cluster: Cluster, sourceDiversity: number, linkedAssets: DiscoveredThemeAsset[]): string[] {
  const freshSignals = cluster.signals.filter((signal) => signalAgeHours(signal.timestamp) <= 24).length;
  const sourceMix = [...cluster.sourceCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([source]) => source)
    .join(', ');

  return [
    `${cluster.signals.length} signals clustered together across ${sourceDiversity} source types`,
    `${freshSignals} of those signals are fresh inside the last 24 hours`,
    sourceMix ? `Source mix is led by ${sourceMix}` : 'Source mix is still narrow',
    linkedAssets.length > 0 ? `Most-linked assets right now: ${linkedAssets.slice(0, 3).map((asset) => asset.symbol).join(', ')}` : 'No strong asset linkage detected yet',
  ].slice(0, 4);
}

function buildClusterFromSignals(signals: DiscoveredSignal[], id: string): Cluster {
  const cluster: Cluster = {
    id,
    signals: [],
    keywordCounts: new Map<string, number>(),
    phraseCounts: new Map<string, number>(),
    assetCounts: new Map<string, number>(),
    countryCounts: new Map<string, number>(),
    sourceCounts: new Map<string, number>(),
    newestAt: 0,
    oldestAt: Number.MAX_SAFE_INTEGER,
    totalIntensity: 0,
  };

  for (const signal of signals) {
    addSignalToCluster(cluster, signal);
  }

  if (cluster.oldestAt === Number.MAX_SAFE_INTEGER) {
    cluster.oldestAt = 0;
  }

  return cluster;
}

function buildDisplayAssets(
  symbols: string[],
  cluster: Cluster,
  quoteMap: Map<string, Quote>,
  portfolioSymbols: Set<string>,
  watchlistSymbols: Set<string>
): DiscoveredThemeAsset[] {
  const rankedFromCluster = buildLinkedAssets(cluster, quoteMap, portfolioSymbols, watchlistSymbols);
  const merged = new Map(rankedFromCluster.map((asset) => [asset.symbol, asset]));
  const minimumSupport = Math.max(2, Math.ceil(cluster.signals.length * 0.25));

  for (const symbol of symbols.map(upper)) {
    if (merged.has(symbol)) continue;
    const mentionCount = cluster.assetCounts.get(symbol) ?? 0;
    if (mentionCount < minimumSupport) continue;

    const quote = quoteMap.get(symbol);
    const overlap: DiscoveryAssetOverlap = portfolioSymbols.has(symbol)
      ? 'portfolio'
      : watchlistSymbols.has(symbol)
        ? 'watchlist'
        : 'external';

    merged.set(symbol, {
      symbol,
      label: quote?.shortName ?? symbol,
      overlap,
      mentionCount,
      price: quote?.regularMarketPrice ?? null,
      changePct: quote?.regularMarketChangePercent ?? null,
    });
  }

  return [...merged.values()]
    .sort((left, right) => right.mentionCount - left.mentionCount)
    .slice(0, 6);
}

function buildWatchItems(cluster: Cluster, linkedAssets: DiscoveredThemeAsset[]): string[] {
  const items: string[] = [];
  const leadingSources = [...cluster.sourceCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([source]) => source);

  if (linkedAssets.length > 0) {
    items.push(`Watch whether ${linkedAssets.slice(0, 3).map((asset) => asset.symbol).join(', ')} keep confirming the cluster in price action.`);
  }

  if (leadingSources.includes('macro')) {
    items.push('Track the nearest macro event in this cluster and whether price response matches the headline significance.');
  }

  if (leadingSources.includes('geopolitics')) {
    items.push('Check whether hotspot intensity broadens to more countries or quickly fades back into isolated headlines.');
  }

  if (leadingSources.includes('prediction')) {
    items.push('Monitor whether prediction-market odds keep repricing or stall before the next deadline.');
  }

  if (items.length === 0) {
    items.push('Watch whether fresh signals continue to join the cluster over the next 24 hours.');
  }

  return unique(items).slice(0, 3);
}

function buildInvalidationSignals(cluster: Cluster, linkedAssets: DiscoveredThemeAsset[]): string[] {
  const signals: string[] = [];
  const freshSignals = cluster.signals.filter((signal) => signalAgeHours(signal.timestamp) <= 24).length;

  signals.push('Fresh signals stop arriving and the cluster shrinks back to isolated headlines.');

  if (linkedAssets.length > 0) {
    signals.push(`${linkedAssets.slice(0, 3).map((asset) => asset.symbol).join(', ')} stop confirming the story in price action.`);
  }

  if (cluster.sourceCounts.has('geopolitics')) {
    signals.push('Geopolitical hotspot counts cool quickly instead of broadening.');
  }

  if (cluster.sourceCounts.has('macro')) {
    signals.push('Macro events pass without cross-asset repricing.');
  }

  if (freshSignals <= 1) {
    signals.push('The theme fails to attract additional confirming evidence over the next session.');
  }

  return unique(signals).slice(0, 3);
}

function buildImplications(
  cluster: Cluster,
  sourceDiversity: number,
  linkedAssets: DiscoveredThemeAsset[],
  portfolioImpact: {
    holdings: DiscoveredThemePortfolioMatch[];
    portfolioWeightPct: number;
    watchlistOverlap: string[];
    externalIdeas: string[];
  }
): string[] {
  const implications: string[] = [];

  implications.push(
    `${cluster.signals.length} signals across ${sourceDiversity} source types are reinforcing the same theme, so this looks more like a developing market narrative than a single isolated headline.`
  );

  if (linkedAssets.length > 0) {
    implications.push(
      `The clearest liquid expressions right now are ${linkedAssets.slice(0, 3).map((asset) => asset.symbol).join(', ')}, which gives the user a short list for immediate follow-up research.`
    );
  }

  if (portfolioImpact.holdings.length > 0) {
    implications.push(
      `This already touches ${portfolioImpact.holdings.length} portfolio holding${portfolioImpact.holdings.length === 1 ? '' : 's'}, representing ${portfolioImpact.portfolioWeightPct.toFixed(1)}% of current portfolio value.`
    );
  } else if (portfolioImpact.watchlistOverlap.length > 0) {
    implications.push(
      `There is no direct portfolio exposure yet, but ${portfolioImpact.watchlistOverlap.slice(0, 3).join(', ')} already sit on the watchlist, so the research path is shorter than starting from zero.`
    );
  } else if (portfolioImpact.externalIdeas.length > 0) {
    implications.push(
      `This is primarily a new-idea cluster rather than a portfolio-management issue right now, with ${portfolioImpact.externalIdeas.slice(0, 3).join(', ')} as the most obvious liquid starting points.`
    );
  }

  return implications.slice(0, 3);
}

function buildActionItems(
  cluster: Cluster,
  linkedAssets: DiscoveredThemeAsset[],
  portfolioImpact: {
    holdings: DiscoveredThemePortfolioMatch[];
    watchlistOverlap: string[];
    externalIdeas: string[];
    portfolioRecommendation: string;
    watchlistRecommendation: string;
    opportunityRecommendation: string;
  }
): DiscoveredThemeAction[] {
  const actions: DiscoveredThemeAction[] = [
    { label: 'Portfolio', detail: portfolioImpact.portfolioRecommendation },
    { label: 'Watchlist', detail: portfolioImpact.watchlistRecommendation },
    { label: 'Ideas', detail: portfolioImpact.opportunityRecommendation },
  ];

  const catalysts = buildCatalysts(cluster);
  if (catalysts.length > 0) {
    actions.push({
      label: 'Catalyst',
      detail: `Use ${catalysts[0]} as the next decision point. If the cluster weakens before then, conviction should fall quickly.`,
    });
  } else if (linkedAssets.length > 0) {
    actions.push({
      label: 'Confirmation',
      detail: `Wait for continued confirmation in ${linkedAssets.slice(0, 2).map((asset) => asset.symbol).join(', ')} before treating this as a higher-conviction opportunity.`,
    });
  }

  return actions.slice(0, 4);
}

function dedupeSignalsByEvidence(signals: DiscoveredSignal[]): DiscoveredSignal[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const evidenceKey = signal.url?.trim().toLowerCase() || normalizeText(signal.title);
    if (!evidenceKey || seen.has(evidenceKey)) return false;
    seen.add(evidenceKey);
    return true;
  });
}

function buildRawSignals(input: DiscoveryInput): DiscoveredSignal[] {
  const newsSignals = dedupeSignalsByEvidence([
    ...buildNewsSignals(input.marketNews, 'Markets'),
    ...buildNewsSignals(input.techNews, 'Technology'),
    ...buildNewsSignals(input.economyNews, 'Economy'),
    ...buildNewsSignals(input.energyNews, 'Energy'),
    ...buildNewsSignals(input.geopoliticsNews, 'Geopolitics News'),
  ]);

  return [
    ...newsSignals,
    ...buildCountrySignals(input.countryCounts),
    ...buildPredictionSignals(input.predictions, input.predictionsUpdatedAt),
    ...buildMacroSignals(input.calendarEvents),
    ...buildSentimentSignals(input.sentiment),
  ].filter((signal) => signal.keywords.length >= 2 || signal.assets.length > 0 || signal.countries.length > 0);
}

function toThemeSignalPayload(signal: DiscoveredSignal): ThemeDiscoverySignalPayload {
  return {
    id: signal.id,
    type: signal.type,
    sourceLabel: signal.sourceLabel,
    title: signal.title,
    detail: signal.detail,
    context: signal.context,
    url: signal.url,
    timestamp: signal.timestamp,
    assets: signal.assets,
    countries: signal.countries,
    keywords: signal.keywords.slice(0, 8),
  };
}

export function buildThemeDiscoverySignalPayload(input: DiscoveryInput): {
  generatedAt: string;
  signals: ThemeDiscoverySignalPayload[];
  portfolio: {
    holdings: Array<{ symbol: string; label: string; currentValue: number; weightPct: number }>;
    symbols: string[];
  };
  watchlist: string[];
} {
  const quoteMap = buildQuoteMap(input.quotes);
  const holdings = buildPortfolioHoldings(input.portfolio, quoteMap);
  const signals = buildRawSignals(input)
    .sort((left, right) => {
      if (right.timestamp !== left.timestamp) return right.timestamp - left.timestamp;
      return right.intensity - left.intensity;
    })
    .slice(0, 90)
    .map(toThemeSignalPayload);

  return {
    generatedAt: new Date().toISOString(),
    signals,
    portfolio: {
      holdings: holdings.slice(0, 12).map((holding) => ({
        symbol: holding.symbol,
        label: holding.label,
        currentValue: holding.currentValue,
        weightPct: Number(holding.weightPct.toFixed(2)),
      })),
      symbols: holdings.map((holding) => holding.symbol),
    },
    watchlist: input.watchlist.map(upper),
  };
}

function slugifyTopic(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-').slice(0, 48) || 'topic';
}

function dedupeSignals(signals: DiscoveredSignal[]): DiscoveredSignal[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    if (seen.has(signal.id)) return false;
    seen.add(signal.id);
    return true;
  });
}

function prepareKeywordTopics(topics: string[]): KeywordTopic[] {
  return unique(topics.map((topic) => topic.trim()).filter(Boolean))
    .slice(0, 5)
    .flatMap((topic) => {
      const keywords = extractKeywords(topic);
      const assets = inferAssetsFromText(topic);
      const normalized = normalizeText(topic);

      if (!normalized || (keywords.length === 0 && assets.length === 0)) {
        return [];
      }

      return [{
        raw: topic,
        label: toTitleCase(topic),
        normalized,
        keywords,
        assets,
      }];
    });
}

function scoreSignalForTopic(signal: DiscoveredSignal, topic: KeywordTopic): number {
  const haystack = `${signal.title} ${signal.detail} ${signal.context ?? ''}`;
  const sharedKeywords = intersectionCount(signal.keywords, topic.keywords);
  const sharedAssets = intersectionCount(signal.assets, topic.assets);
  const exactPhrase = includesTerm(haystack, topic.normalized) ? 1 : 0;
  const keywordCoverage = topic.keywords.length > 1
    ? topic.keywords.filter((keyword) => includesTerm(haystack, keyword)).length / topic.keywords.length
    : sharedKeywords > 0
      ? 1
      : 0;

  if (exactPhrase === 0 && keywordCoverage === 0) return 0;

  return sharedKeywords * 2.4 +
    sharedAssets * 3.2 +
    exactPhrase * 5.5 +
    keywordCoverage * 4 +
    (sharedKeywords >= 2 ? 2.5 : 0);
}

function summarizeKeywordTheme(topic: KeywordTopic, cluster: Cluster, sourceDiversity: number, linkedAssets: DiscoveredThemeAsset[]): string {
  const topSource = [...cluster.sourceCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'signals';
  const assets = linkedAssets.length > 0 ? ` Linked assets: ${linkedAssets.slice(0, 3).map((asset) => asset.symbol).join(', ')}.` : '';
  return `${cluster.signals.length} matching signals across ${sourceDiversity} source types for ${topic.label.toLowerCase()}, led by ${topSource}.${assets}`;
}

export function buildKeywordThemeDashboard(
  input: DiscoveryInput,
  topics: string[],
  topicNewsByTopic: Record<string, NewsItem[]> = {}
): KeywordThemeDashboard {
  const preparedTopics = prepareKeywordTopics(topics);
  const quoteMap = buildQuoteMap(input.quotes);
  const holdings = buildPortfolioHoldings(input.portfolio, quoteMap);
  const portfolioSymbols = new Set(holdings.map((holding) => holding.symbol));
  const watchlistSymbols = new Set(input.watchlist.map(upper));
  const baseSignals = buildRawSignals(input);

  const themes = preparedTopics.flatMap((topic, index) => {
    const topicSignals = buildNewsSignals(topicNewsByTopic[topic.raw] ?? [], `Topic Search · ${topic.label}`);
    const matches = dedupeSignals([...topicSignals, ...baseSignals])
      .map((signal) => ({ signal, score: scoreSignalForTopic(signal, topic) }))
      .filter(({ signal, score }) => score >= 3.5 || intersectionCount(signal.keywords, topic.keywords) >= 2)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        if (right.signal.timestamp !== left.signal.timestamp) return right.signal.timestamp - left.signal.timestamp;
        return right.signal.intensity - left.signal.intensity;
      })
      .slice(0, 14);

    const strongMatches = matches.filter((match) => match.score >= 5.5);
    if (matches.length < 2 || strongMatches.length === 0) return [];

    const cluster = buildClusterFromSignals(matches.map(({ signal }) => signal), `keyword-${index}-${slugifyTopic(topic.raw)}`);
    const linkedAssets = buildDisplayAssets(
      [...topic.assets, ...topKeys(cluster.assetCounts, 6)],
      cluster,
      quoteMap,
      portfolioSymbols,
      watchlistSymbols
    );
    const portfolioImpact = buildPortfolioImpact(linkedAssets.map((asset) => asset.symbol), holdings, watchlistSymbols);
    const signalCount = cluster.signals.length;
    const sourceDiversity = cluster.sourceCounts.size;
    const scoreCap = evidenceScoreCap(sourceDiversity);
    const freshSignals = cluster.signals.filter((signal) => signalAgeHours(signal.timestamp) <= 24).length;
    const newestAgePenalty = clamp(24 - signalAgeHours(cluster.newestAt), 0, 24);
    const avgMatchScore = matches.reduce((sum, match) => sum + match.score, 0) / Math.max(matches.length, 1);
    const matchStrength = Math.round(clamp(avgMatchScore * 11 + matches.filter((match) => match.score >= 7).length * 4, 18, 100));
    const emergenceScore = Math.round(clamp(signalCount * 8 + freshSignals * 11 + newestAgePenalty * 1.2 + cluster.totalIntensity * 0.06 + matchStrength * 0.18, 18, scoreCap));
    const breadthScore = Math.round(clamp(sourceDiversity * 18 + topKeys(cluster.keywordCounts, 10).length * 2 + linkedAssets.length * 5 + Math.min(signalCount, 6) * 4, 18, scoreCap));
    const urgencyScore = Math.round(clamp(34 + freshSignals * 10 + buildCatalysts(cluster).length * 10 + newestAgePenalty * 1.6 + Math.min(avgMatchScore * 4, 12), 20, scoreCap));
    const confidenceScore = Math.round(clamp(matchStrength * 0.45 + sourceDiversity * 12 + signalCount * 4 + cluster.totalIntensity * 0.04, 22, scoreCap));
    const score = Math.round(
      emergenceScore * 0.24 +
        breadthScore * 0.18 +
        urgencyScore * 0.18 +
        portfolioImpact.relevanceScore * 0.16 +
        confidenceScore * 0.14 +
        matchStrength * 0.1
    );
    const sourceMix = [...cluster.sourceCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([source, count]) => ({ source, count }));
    const watchItems = buildWatchItems(cluster, linkedAssets);
    const invalidationSignals = buildInvalidationSignals(cluster, linkedAssets);
    const implications = buildImplications(cluster, sourceDiversity, linkedAssets, portfolioImpact);
    const actionItems = buildActionItems(cluster, linkedAssets, portfolioImpact);
    const summary = summarizeKeywordTheme(topic, cluster, sourceDiversity, linkedAssets);
    const thesis = sourceDiversity > 1
      ? `${topic.label} is supported by ${signalCount} matching signals across ${sourceDiversity} source types, making it a cross-source research lead rather than an isolated headline.`
      : `${topic.label} is supported by ${signalCount} matching signals from one source type. Treat it as an early research lead until another source confirms it.`;
    const whyItMatters = implications[1] ?? (sourceDiversity > 1
      ? `The evidence is broad enough to justify focused follow-up research in ${linkedAssets.slice(0, 3).map((asset) => asset.symbol).join(', ') || 'the linked asset set'}.`
      : 'The topic is active, but the narrow source mix means conviction should remain limited.');
    const actionSummary = actionItems.slice(0, 2).map((item) => item.detail).join(' ');
    const playbook = actionItems.map((item) => item.detail).slice(0, 4);
    const primaryRecommendation = playbook[0] ?? portfolioImpact.portfolioRecommendation;

    return [{
      id: cluster.id,
      label: topic.label,
      summary,
      thesis,
      whyItMatters,
      actionSummary,
      primaryRecommendation,
      playbook,
      score,
      emergenceScore,
      breadthScore,
      urgencyScore,
      relevanceScore: portfolioImpact.relevanceScore,
      confidenceScore,
      signalCount,
      sourceDiversity,
      freshestAt: closestSignalTimestamp(cluster),
      keywords: unique([...topic.keywords, ...topKeys(cluster.keywordCounts, 6)]).map((keyword) => toTitleCase(keyword)).slice(0, 6),
      sourceMix,
      linkedAssets,
      catalysts: buildCatalysts(cluster),
      whyEmerging: buildWhyEmerging(cluster, sourceDiversity, linkedAssets),
      implications,
      actionItems,
      watchItems,
      invalidationSignals,
      evidence: buildEvidence(cluster),
      portfolioImpact: {
        label: portfolioImpact.label,
        portfolioLabel: portfolioImpact.portfolioLabel,
        watchlistLabel: portfolioImpact.watchlistLabel,
        opportunityLabel: portfolioImpact.opportunityLabel,
        holdings: portfolioImpact.holdings,
        portfolioWeightPct: portfolioImpact.portfolioWeightPct,
        watchlistOverlap: portfolioImpact.watchlistOverlap,
        externalIdeas: portfolioImpact.externalIdeas,
        portfolioRecommendation: portfolioImpact.portfolioRecommendation,
        watchlistRecommendation: portfolioImpact.watchlistRecommendation,
        opportunityRecommendation: portfolioImpact.opportunityRecommendation,
      },
      portfolioAngle: portfolioImpact.portfolioRecommendation,
      watchlistAngle: portfolioImpact.watchlistRecommendation,
      opportunityAngle: portfolioImpact.opportunityRecommendation,
    }];
  })
    .sort((left, right) => right.score - left.score);

  const matchedTopics = themes.map((theme) => theme.label);
  const unmatchedTopics = preparedTopics
    .map((topic) => topic.label)
    .filter((label) => !matchedTopics.includes(label));
  const allSignals = themes.reduce((sum, theme) => sum + theme.signalCount, 0);
  const sourceCount = unique(themes.flatMap((theme) => theme.sourceMix.map((source) => source.source))).length;
  const portfolioRelevantCount = themes.filter(
    (theme) => theme.portfolioImpact.holdings.length > 0 || theme.portfolioImpact.watchlistOverlap.length > 0
  ).length;
  const avgSourceDiversity = themes.length > 0
    ? Math.round(themes.reduce((sum, theme) => sum + theme.sourceDiversity, 0) / themes.length)
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    mode: 'keyword',
    requestedTopics: preparedTopics.map((topic) => topic.label),
    matchedTopics,
    unmatchedTopics,
    themes,
    brief: {
      headline: themes[0]
        ? `${themes[0].label} is the strongest requested topic right now`
        : 'No requested topics have enough live overlap yet',
      summary: themes[0]
        ? `Built ${themes.length} topic-driven themes from ${preparedTopics.length} requested topics. ${portfolioRelevantCount} of them already touch your portfolio or watchlist.${unmatchedTopics.length > 0 ? ` Still waiting for clearer overlap in ${unmatchedTopics.slice(0, 2).join(' and ')}.` : ''}`
        : 'The requested topics do not yet have enough overlapping live signals to produce strong theme cards.',
      sourceCount,
      signalCount: allSignals,
    },
    stats: {
      clusterCount: themes.length,
      signalCount: allSignals,
      portfolioRelevantCount,
      avgSourceDiversity,
      requestedTopicCount: preparedTopics.length,
      matchedTopicCount: matchedTopics.length,
      unmatchedTopicCount: unmatchedTopics.length,
    },
  };
}

export function buildTopicThemeGuidancePayload(dashboard: KeywordThemeDashboard): TopicThemeGuidanceSnapshot {
  const holdings = unique(
    dashboard.themes.flatMap((theme) => theme.portfolioImpact.holdings.map((holding) => holding.symbol))
  );

  return {
    generatedAt: dashboard.generatedAt,
    requestedTopics: dashboard.requestedTopics,
    portfolio: {
      holdings: dashboard.themes
        .flatMap((theme) => theme.portfolioImpact.holdings)
        .filter((holding, index, array) => array.findIndex((candidate) => candidate.symbol === holding.symbol) === index)
        .slice(0, 15)
        .map((holding) => ({
          symbol: holding.symbol,
          label: holding.label,
          currentValue: holding.currentValue,
          weightPct: Number(holding.weightPct.toFixed(2)),
        })),
      symbols: holdings,
    },
    watchlist: unique(dashboard.themes.flatMap((theme) => theme.portfolioImpact.watchlistOverlap)).slice(0, 25),
    themes: dashboard.themes.map((theme) => ({
      id: theme.id,
      label: theme.label,
      summary: theme.summary,
      thesis: theme.thesis,
      score: theme.score,
      signalCount: theme.signalCount,
      sourceMix: theme.sourceMix,
      keywords: theme.keywords,
      linkedAssets: theme.linkedAssets.map((asset) => asset.symbol),
      catalysts: theme.catalysts,
      watchItems: theme.watchItems,
      invalidationSignals: theme.invalidationSignals,
      evidence: theme.evidence.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        detail: item.detail,
        context: item.context,
        sourceLabel: item.sourceLabel,
        url: item.url,
        timestamp: item.timestamp,
      })),
      portfolioImpact: {
        label: theme.portfolioImpact.label,
        holdings: theme.portfolioImpact.holdings.map((holding) => ({
          symbol: holding.symbol,
          label: holding.label,
          currentValue: holding.currentValue,
          weightPct: Number(holding.weightPct.toFixed(2)),
        })),
        portfolioWeightPct: Number(theme.portfolioImpact.portfolioWeightPct.toFixed(2)),
        watchlistOverlap: theme.portfolioImpact.watchlistOverlap,
        externalIdeas: theme.portfolioImpact.externalIdeas,
        portfolioRecommendation: theme.portfolioImpact.portfolioRecommendation,
        watchlistRecommendation: theme.portfolioImpact.watchlistRecommendation,
        opportunityRecommendation: theme.portfolioImpact.opportunityRecommendation,
      },
    })),
  };
}

export function applyAIThemeGuidanceDashboard(
  dashboard: KeywordThemeDashboard,
  aiResult: AIThemeGuidanceResult
): KeywordThemeDashboard {
  const guidanceMap = new Map(aiResult.themes.map((theme) => [theme.id, theme]));

  return {
    ...dashboard,
    generatedAt: aiResult.generatedAt,
    themes: dashboard.themes.map((theme) => {
      const guidance = guidanceMap.get(theme.id);
      if (!guidance) return theme;

      const chooseList = (candidate: string[] | undefined, fallback: string[], limit = 4) =>
        Array.isArray(candidate) && candidate.length > 0 ? candidate.slice(0, limit) : fallback;

      return {
        ...theme,
        summary: guidance.summary?.trim() || theme.summary,
        thesis: guidance.thesis?.trim() || theme.thesis,
        whyItMatters: guidance.whyItMatters?.trim() || theme.whyItMatters,
        actionSummary: guidance.actionSummary?.trim() || theme.actionSummary,
        primaryRecommendation: guidance.primaryRecommendation?.trim() || theme.primaryRecommendation,
        playbook: chooseList(guidance.playbook, theme.playbook),
        catalysts: chooseList(guidance.catalysts, theme.catalysts),
        watchItems: chooseList(guidance.watchItems, theme.watchItems),
        invalidationSignals: chooseList(guidance.invalidationSignals, theme.invalidationSignals),
        portfolioAngle: guidance.portfolioAngle?.trim() || theme.portfolioAngle,
        watchlistAngle: guidance.watchlistAngle?.trim() || theme.watchlistAngle,
        opportunityAngle: guidance.opportunityAngle?.trim() || theme.opportunityAngle,
      };
    }),
  };
}

function buildDiscoveredThemes(input: DiscoveryInput): DiscoveredTheme[] {
  const quoteMap = buildQuoteMap(input.quotes);
  const holdings = buildPortfolioHoldings(input.portfolio, quoteMap);
  const portfolioSymbols = new Set(holdings.map((holding) => holding.symbol));
  const watchlistSymbols = new Set(input.watchlist.map(upper));
  const rawSignals = buildRawSignals(input);

  const clusters = clusterSignals(rawSignals)
    .flatMap((cluster) => {
      const quality = analyzeClusterQuality(cluster);
      const label = pickClusterLabel(cluster, quality);
      return quality.eligible && label ? [{ cluster, quality, label }] : [];
    })
    .sort((left, right) => {
      if (right.quality.score !== left.quality.score) return right.quality.score - left.quality.score;
      return right.cluster.totalIntensity - left.cluster.totalIntensity;
    });

  return clusters.slice(0, 8).map(({ cluster, quality, label }) => {
    const linkedAssets = buildLinkedAssets(cluster, quoteMap, portfolioSymbols, watchlistSymbols);
    const portfolioImpact = buildPortfolioImpact(linkedAssets.map((asset) => asset.symbol), holdings, watchlistSymbols);
    const signalCount = cluster.signals.length;
    const sourceDiversity = cluster.sourceCounts.size;
    const scoreCap = evidenceScoreCap(sourceDiversity);
    const freshSignals = cluster.signals.filter((signal) => signalAgeHours(signal.timestamp) <= 24).length;
    const newestAgePenalty = clamp(24 - signalAgeHours(cluster.newestAt), 0, 24);
    const emergenceScore = Math.round(clamp(signalCount * 9 + freshSignals * 12 + newestAgePenalty * 1.3 + cluster.totalIntensity * 0.08, 18, scoreCap));
    const breadthScore = Math.round(clamp(sourceDiversity * 18 + topKeys(cluster.keywordCounts, 10).length * 2 + linkedAssets.length * 5 + topKeys(cluster.countryCounts, 6).length * 6, 18, scoreCap));
    const urgencyScore = Math.round(clamp(36 + freshSignals * 11 + buildCatalysts(cluster).length * 10 + newestAgePenalty * 1.8, 20, scoreCap));
    const confidenceScore = Math.round(clamp(sourceDiversity * 14 + signalCount * 5 + topKeys(cluster.keywordCounts, 8).length * 2 + cluster.totalIntensity * 0.06, 22, scoreCap));
    const score = Math.round(
      emergenceScore * 0.27 +
        breadthScore * 0.2 +
        urgencyScore * 0.2 +
        portfolioImpact.relevanceScore * 0.18 +
        confidenceScore * 0.15
    );
    const sourceMix = [...cluster.sourceCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([source, count]) => ({ source, count }));
    const watchItems = buildWatchItems(cluster, linkedAssets);
    const invalidationSignals = buildInvalidationSignals(cluster, linkedAssets);
    const implications = buildImplications(cluster, sourceDiversity, linkedAssets, portfolioImpact);
    const actionItems = buildActionItems(cluster, linkedAssets, portfolioImpact);
    const summary = summarizeCluster(label, cluster, sourceDiversity);
    const thesis = implications[0] ?? summary;
    const whyItMatters = summarizeWhyItMatters(label, cluster, sourceDiversity, linkedAssets, portfolioImpact);
    const actionSummary = actionItems.slice(0, 2).map((item) => item.detail).join(' ');
    const playbook = actionItems.map((item) => item.detail).slice(0, 4);
    const primaryRecommendation = playbook[0] ?? portfolioImpact.portfolioRecommendation;

    return {
      id: cluster.id,
      label,
      summary,
      thesis,
      whyItMatters,
      actionSummary,
      primaryRecommendation,
      playbook,
      score,
      emergenceScore,
      breadthScore,
      urgencyScore,
      relevanceScore: portfolioImpact.relevanceScore,
      confidenceScore,
      signalCount,
      sourceDiversity,
      freshestAt: closestSignalTimestamp(cluster),
      keywords: quality.repeatedKeywords.slice(0, 6).map((keyword) => toTitleCase(keyword)),
      sourceMix,
      linkedAssets,
      catalysts: buildCatalysts(cluster),
      whyEmerging: buildWhyEmerging(cluster, sourceDiversity, linkedAssets),
      implications,
      actionItems,
      watchItems,
      invalidationSignals,
      evidence: buildEvidence(cluster),
      portfolioImpact: {
        label: portfolioImpact.label,
        portfolioLabel: portfolioImpact.portfolioLabel,
        watchlistLabel: portfolioImpact.watchlistLabel,
        opportunityLabel: portfolioImpact.opportunityLabel,
        holdings: portfolioImpact.holdings,
        portfolioWeightPct: portfolioImpact.portfolioWeightPct,
        watchlistOverlap: portfolioImpact.watchlistOverlap,
        externalIdeas: portfolioImpact.externalIdeas,
        portfolioRecommendation: portfolioImpact.portfolioRecommendation,
        watchlistRecommendation: portfolioImpact.watchlistRecommendation,
        opportunityRecommendation: portfolioImpact.opportunityRecommendation,
      },
      portfolioAngle: portfolioImpact.portfolioRecommendation,
      watchlistAngle: portfolioImpact.watchlistRecommendation,
      opportunityAngle: portfolioImpact.opportunityRecommendation,
    };
  });
}

export function buildAIDiscoveryDashboard(input: DiscoveryInput, aiResult: AIThemeDiscoveryResult): DiscoveryDashboard {
  const rawSignals = buildRawSignals(input);
  const signalMap = new Map(rawSignals.map((signal) => [signal.id, signal]));
  const quoteMap = buildQuoteMap(input.quotes);
  const holdings = buildPortfolioHoldings(input.portfolio, quoteMap);
  const portfolioSymbols = new Set(holdings.map((holding) => holding.symbol));
  const watchlistSymbols = new Set(input.watchlist.map(upper));

  const themes = aiResult.themes
    .flatMap((theme, index) => {
      const resolvedSignals = unique(theme.signalIds)
        .map((signalId) => signalMap.get(signalId))
        .filter((signal): signal is DiscoveredSignal => Boolean(signal));

      if (resolvedSignals.length < 2) return [];

      const cluster = buildClusterFromSignals(resolvedSignals, theme.id || `ai-theme-${index}`);
      const quality = analyzeClusterQuality(cluster);
      const groundedFallbackLabel = pickClusterLabel(cluster, quality);
      if (!quality.eligible || !groundedFallbackLabel) return [];
      const label = proposedThemeLabelIsGrounded(theme.label, cluster, quality)
        ? theme.label.trim()
        : groundedFallbackLabel;
      const supportedAssets = new Set(resolvedSignals.flatMap((signal) => signal.assets));
      const modelAssets = theme.linkedAssets.filter((symbol) => supportedAssets.has(upper(symbol)));
      const linkedAssets = buildDisplayAssets(
        modelAssets.length > 0 ? modelAssets : topKeys(cluster.assetCounts, 6),
        cluster,
        quoteMap,
        portfolioSymbols,
        watchlistSymbols
      );
      const portfolioImpact = buildPortfolioImpact(linkedAssets.map((asset) => asset.symbol), holdings, watchlistSymbols);
      const signalCount = cluster.signals.length;
      const sourceDiversity = cluster.sourceCounts.size;
      const scoreCap = evidenceScoreCap(sourceDiversity);
      const freshSignals = cluster.signals.filter((signal) => signalAgeHours(signal.timestamp) <= 24).length;
      const newestAgePenalty = clamp(24 - signalAgeHours(cluster.newestAt), 0, 24);
      const emergenceScore = Math.round(clamp(signalCount * 9 + freshSignals * 12 + newestAgePenalty * 1.3 + cluster.totalIntensity * 0.08, 18, scoreCap));
      const breadthScore = Math.round(clamp(sourceDiversity * 18 + topKeys(cluster.keywordCounts, 10).length * 2 + linkedAssets.length * 5 + topKeys(cluster.countryCounts, 6).length * 6, 18, scoreCap));
      const urgencyScore = Math.round(clamp(36 + freshSignals * 11 + theme.catalysts.length * 10 + newestAgePenalty * 1.8, 20, scoreCap));
      const localConfidence = clamp(sourceDiversity * 14 + signalCount * 5 + topKeys(cluster.keywordCounts, 8).length * 2 + cluster.totalIntensity * 0.06, 22, scoreCap);
      const confidenceScore = Math.round(clamp(localConfidence * 0.55 + theme.confidence * 0.45, 22, scoreCap));
      const score = Math.round(
        emergenceScore * 0.2 +
          breadthScore * 0.16 +
          urgencyScore * 0.16 +
          portfolioImpact.relevanceScore * 0.14 +
          confidenceScore * 0.14 +
          theme.importance * 0.2
      );
      const sourceMix = [...cluster.sourceCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([source, count]) => ({ source, count }));
      const actionItems = [
        { label: 'Primary', detail: theme.primaryRecommendation },
        ...theme.playbook.slice(0, 3).map((detail, itemIndex) => ({ label: `Step ${itemIndex + 1}`, detail })),
      ].filter((item) => item.detail);
      const implications = [
        summarizeCluster(label, cluster, sourceDiversity),
        theme.thesis,
        portfolioImpact.holdings.length > 0
          ? `This theme already affects ${portfolioImpact.holdings.length} portfolio holding${portfolioImpact.holdings.length === 1 ? '' : 's'} with ${portfolioImpact.portfolioWeightPct.toFixed(1)}% total weight.`
          : portfolioImpact.watchlistOverlap.length > 0
            ? `This theme does not hit the portfolio yet, but it already overlaps the watchlist through ${portfolioImpact.watchlistOverlap.slice(0, 3).join(', ')}.`
            : `This is mostly a fresh research opportunity, with ${portfolioImpact.externalIdeas.slice(0, 3).join(', ') || 'no obvious liquid expression yet'} as the first place to look.`,
      ].filter(Boolean);

      return [{
        id: theme.id || `ai-theme-${index}`,
        label,
        summary: summarizeCluster(label, cluster, sourceDiversity),
        thesis: theme.thesis,
        whyItMatters: summarizeWhyItMatters(label, cluster, sourceDiversity, linkedAssets, portfolioImpact),
        actionSummary: theme.actionSummary,
        primaryRecommendation: theme.primaryRecommendation,
        playbook: theme.playbook.slice(0, 4),
        score,
        emergenceScore,
        breadthScore,
        urgencyScore,
        relevanceScore: portfolioImpact.relevanceScore,
        confidenceScore,
        signalCount,
        sourceDiversity,
        freshestAt: closestSignalTimestamp(cluster),
        keywords: quality.repeatedKeywords.slice(0, 6).map((keyword) => toTitleCase(keyword)),
        sourceMix,
        linkedAssets,
        catalysts: theme.catalysts.length > 0 ? theme.catalysts.slice(0, 4) : buildCatalysts(cluster),
        whyEmerging: buildWhyEmerging(cluster, sourceDiversity, linkedAssets),
        implications: implications.slice(0, 3),
        actionItems,
        watchItems: theme.watchItems.length > 0 ? theme.watchItems.slice(0, 3) : buildWatchItems(cluster, linkedAssets),
        invalidationSignals: theme.invalidationSignals.length > 0 ? theme.invalidationSignals.slice(0, 3) : buildInvalidationSignals(cluster, linkedAssets),
        evidence: buildEvidence(cluster),
        portfolioImpact: {
          label: portfolioImpact.label,
          portfolioLabel: portfolioImpact.portfolioLabel,
          watchlistLabel: portfolioImpact.watchlistLabel,
          opportunityLabel: portfolioImpact.opportunityLabel,
          holdings: portfolioImpact.holdings,
          portfolioWeightPct: portfolioImpact.portfolioWeightPct,
          watchlistOverlap: portfolioImpact.watchlistOverlap,
          externalIdeas: portfolioImpact.externalIdeas,
          portfolioRecommendation: portfolioImpact.portfolioRecommendation,
          watchlistRecommendation: portfolioImpact.watchlistRecommendation,
          opportunityRecommendation: portfolioImpact.opportunityRecommendation,
        },
        portfolioAngle: theme.portfolioAngle || portfolioImpact.portfolioRecommendation,
        watchlistAngle: theme.watchlistAngle || portfolioImpact.watchlistRecommendation,
        opportunityAngle: theme.opportunityAngle || portfolioImpact.opportunityRecommendation,
      }];
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const allSignals = themes.reduce((sum, theme) => sum + theme.signalCount, 0);
  const sourceCount = unique(themes.flatMap((theme) => theme.sourceMix.map((source) => source.source))).length;
  const portfolioRelevantCount = themes.filter(
    (theme) => theme.portfolioImpact.holdings.length > 0 || theme.portfolioImpact.watchlistOverlap.length > 0
  ).length;
  const avgSourceDiversity = themes.length > 0
    ? Math.round(themes.reduce((sum, theme) => sum + theme.sourceDiversity, 0) / themes.length)
    : 0;

  return {
    generatedAt: aiResult.generatedAt,
    mode: 'ai',
    model: aiResult.model,
    themes,
    brief: {
      headline: themes[0]
        ? `${themes[0].label} is the strongest theme right now`
        : 'No high-conviction themes yet',
      summary: themes[0]
        ? `The latest pass identified ${themes.length} high-signal themes from the live snapshot, and ${portfolioRelevantCount} of them already touch your portfolio or watchlist.`
        : 'The latest theme pass did not return enough evidence-backed themes to display.',
      sourceCount,
      signalCount: allSignals,
    },
    stats: {
      clusterCount: themes.length,
      signalCount: allSignals,
      portfolioRelevantCount,
      avgSourceDiversity,
    },
  };
}

export function buildDiscoveryDashboard(input: DiscoveryInput): DiscoveryDashboard {
  const themes = buildDiscoveredThemes(input)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const allSignals = themes.reduce((sum, theme) => sum + theme.signalCount, 0);
  const sourceCount = unique(themes.flatMap((theme) => theme.sourceMix.map((source) => source.source))).length;
  const portfolioRelevantCount = themes.filter(
    (theme) => theme.portfolioImpact.holdings.length > 0 || theme.portfolioImpact.watchlistOverlap.length > 0
  ).length;
  const avgSourceDiversity = themes.length > 0
    ? Math.round(themes.reduce((sum, theme) => sum + theme.sourceDiversity, 0) / themes.length)
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    mode: 'heuristic',
    themes,
    brief: {
      headline: themes[0]
        ? `${themes[0].label} has the strongest current signal overlap`
        : 'No high-conviction discovered clusters yet',
      summary: themes[0]
        ? `${themes.length} evidence clusters cleared the minimum overlap threshold; ${portfolioRelevantCount} touch your portfolio or watchlist. Scores rank this snapshot and are not probabilities or forecasts.`
        : 'The discovery engine did not find enough overlapping signals to surface strong clusters.',
      sourceCount,
      signalCount: allSignals,
    },
    stats: {
      clusterCount: themes.length,
      signalCount: allSignals,
      portfolioRelevantCount,
      avgSourceDiversity,
    },
  };
}

export function getDiscoveryAssetUniverse(): string[] {
  return unique(ASSET_HINTS.flatMap((entry) => entry.symbols).map(upper));
}
