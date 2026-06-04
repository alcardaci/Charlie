export type PanelType =
  | 'overview'
  | 'opportunities'
  | 'equity'
  | 'chart'
  | 'news'
  | 'geopolitics'
  | 'predictions'
  | 'macro'
  | 'portfolio'
  | 'heatmap'
  | 'forex'
  | 'crypto'
  | 'yield'
  | 'etf'
  | 'screener'
  | 'help'
  | 'settings';

export type OpenAIHarness = 'comprehensive' | 'custom';

export type OpenAIHarnessPrompts = Record<OpenAIHarness, string>;

export type ConnectionProvider = 'openai' | 'fred' | 'finnhub';

export interface ConnectionStatusMap {
  openai: boolean;
  fred: boolean;
  finnhub: boolean;
}

export interface AIMarketSummary {
  summary: string;
  generatedAt: string;
  model: string;
  harness: OpenAIHarness;
}

export interface OpenAISettings {
  model: string;
  harness: OpenAIHarness;
  systemPrompt: string;
  systemPrompts: OpenAIHarnessPrompts;
  geopoliticsModel: string;
  geopoliticsSystemPrompt: string;
  hasStoredApiKey: boolean;
}

export type CompanionMessageRole = 'user' | 'assistant';

export interface CompanionMessagePayload {
  role: CompanionMessageRole;
  content: string;
}

export interface CompanionPanelContext {
  panel: PanelType;
  title: string;
  summary: string;
  capturedAt: string;
  source: 'visible-panel' | 'query-snapshot' | 'local-state';
  renderedText?: string;
  data: unknown;
}

export interface CompanionChatResult {
  answer: string;
  generatedAt: string;
  model: string;
  panels: PanelType[];
}

export interface Quote {
  symbol: string;
  shortName: string;
  longName?: string;
  dataSource?: 'yahoo' | 'teleborsa-fida';
  quoteType?: string;
  typeDisp?: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  regularMarketPreviousClose: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
  beta?: number;
  epsTrailingTwelveMonths?: number;
  averageVolume?: number;
  averageDailyVolume10Day?: number;
  currency: string;
  marketState: string;
  preMarketPrice?: number;
  preMarketChangePercent?: number;
  postMarketPrice?: number;
  postMarketChangePercent?: number;
  exchange?: string;
  exchangeTimezoneName?: string;
  sector?: string;
  industry?: string;
  longBusinessSummary?: string;
  website?: string;
  country?: string;
  fullTimeEmployees?: number;
}

export type InstrumentKind = 'equity' | 'fund' | 'other';

export interface ChartPoint {
  date: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
}

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  publishedAt: number;
  feedSource?: 'yahoo-finance' | 'gdelt';
  sourceCountry?: string | null;
  sourceCountryCode?: string | null;
  sourceCountryLabel?: string | null;
  thumbnail?: string;
  snippet?: string;
  tickers?: string[];
  locationLabel?: string;
  countryCodes?: string[];
  severityScore?: number | null;
  eventKey?: string;
  eventLabel?: string;
}

export type NewsRegionKey =
  | 'north-america'
  | 'latin-america'
  | 'europe'
  | 'africa'
  | 'middle-east'
  | 'asia-pacific';

export type NewsGeoFilterKey = 'all' | NewsRegionKey;

export interface RegionalNewsCount {
  key: NewsRegionKey;
  label: string;
  shortLabel: string;
  count: number;
  query: string;
  source: string;
  latestAt: number | null;
  sampleTitle?: string;
  samplePublisher?: string;
  stories?: NewsItem[];
}

export interface CountryNewsCount {
  key: string;
  label: string;
  shortLabel: string;
  countryCode: string;
  region: NewsRegionKey;
  count: number;
  severityScore?: number | null;
  query: string;
  source: string;
  latestAt: number | null;
  x: number;
  y: number;
  labelX?: number;
  labelY?: number;
  sampleTitle?: string;
  samplePublisher?: string;
  stories?: NewsItem[];
  hotspotSummary?: string;
  hotspotSummarySources?: NewsItem[];
}

export interface TradeDisruptionEvent {
  id: string;
  title: string;
  typeCode: string;
  typeLabel: string;
  alertLevel: 'RED' | 'ORANGE' | 'YELLOW' | 'UNKNOWN';
  status: 'active' | 'resolved';
  country: string | null;
  summary: string | null;
  detail: string | null;
  affectedAssetIds: string[];
  affectedAssetNames: string[];
  affectedAssetCount: number;
  coordinates: { lat: number; lon: number } | null;
  startedAt: string | null;
  endedAt: string | null;
  updatedAt: string | null;
  sourceUrl: string;
  sourceLabel: string;
}

export interface TradePortActivityItem {
  id: string;
  label: string;
  country: string | null;
  portCalls: number;
  importVolume: number;
  exportVolume: number;
  sourceUrl: string | null;
}

export interface TradePortActivitySnapshot {
  date: string | null;
  portCount: number;
  totalPortCalls: number;
  topPorts: TradePortActivityItem[];
}

export interface TradeChokepointActivityItem {
  id: string;
  label: string;
  transitCalls: number;
  capacity: number;
  sourceUrl: string | null;
}

export interface TradeChokepointActivitySnapshot {
  date: string | null;
  chokepointCount: number;
  totalTransitCalls: number;
  totalCapacity: number;
  topChokepoints: TradeChokepointActivityItem[];
}

export interface TradeLiveSignalHeadline {
  id: string;
  title: string;
  url: string;
  publisher: string;
  query: string;
  seenAt: string | null;
}

export interface TradeLiveSignalSnapshot {
  source: string;
  sourceUrl: string;
  queryLabel: string;
  queryTerms: string[];
  timespanHours: number;
  headlineCount: number;
  latestSeenAt: string | null;
  headlines: TradeLiveSignalHeadline[];
}

export interface GdeltNewsEvent {
  id: string;
  title: string;
  url: string;
  locationName: string;
  lat: number;
  lon: number;
  articleCount: number;
  severityScore: number;
  seenAt: string | null;
  domain: string | null;
}

export interface AisChokepointZone {
  id: string;
  name: string;
  zoneType: 'chokepoint' | 'port';
  lat: number;
  lon: number;
  vesselCount: number;
  anchoredCount: number;
  slowCount: number;
  avgSog: number | null;
  congestionScore: number;
  congestionBand: 'normal' | 'elevated' | 'high';
  congestionMethod: 'history' | 'warmup';
  baselineSampleCount: number;
  baselineWindowMinutes: number;
  baselineVesselCount: number | null;
  baselineAnchoredCount: number | null;
  baselineSlowCount: number | null;
  baselineAvgSog: number | null;
  sampledAt: string;
}

export interface TradeDisruptionSnapshot {
  updatedAt: string;
  source: string;
  sourceUrl: string;
  methodologyUrl: string;
  trackedEventCount: number;
  activeEventCount: number;
  affectedAssetTotal: number;
  liveSignals: TradeLiveSignalSnapshot;
  events: TradeDisruptionEvent[];
  portActivity: TradePortActivitySnapshot;
  chokepointActivity: TradeChokepointActivitySnapshot;
  gdeltEvents: GdeltNewsEvent[];
  gdeltClusterWindowHours?: number;
  aisChokepoints: AisChokepointZone[];
  aisPortZones: AisChokepointZone[];
  aisAvailable: boolean;
}

export interface GeopoliticalRiskPoint {
  date: string;
  articleCount: number;
  value: number;
  acts: number;
  threats: number;
  movingAverage7: number;
  movingAverage30: number;
  event?: string;
}

export interface GeopoliticalRiskSnapshot {
  latest: GeopoliticalRiskPoint;
  previous: GeopoliticalRiskPoint | null;
  change: number | null;
  changePct: number | null;
  weeklyHigh: number | null;
  weeklyLow: number | null;
  series: GeopoliticalRiskPoint[];
  source: string;
  sourceUrl: string;
  dataUrl: string;
  license: string;
  cadence: string;
  methodology: string;
  updatedAt: string;
}

export interface PortfolioPosition {
  id: string;
  symbol: string;
  shares: number;
  avgCost: number;
  purchaseDate?: string;
  addedAt: string;
}

export interface CryptoAsset {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  image: string;
  market_cap_rank: number;
  circulating_supply: number;
}

export interface ForexPair {
  symbol: string;
  name: string;
  rate: number;
  change: number;
  changePct: number;
  base: string;
  quote: string;
  sourceSymbol?: string;
  regularMarketDayHigh?: number | null;
  regularMarketDayLow?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
}

export interface YieldPoint {
  maturity: string;
  label: string;
  rate: number;
  symbol: string;
}

export interface SearchResult {
  symbol: string;
  shortname?: string;
  longname?: string;
  dataSource?: 'yahoo' | 'teleborsa-fida';
  exchDisp?: string;
  typeDisp?: string;
  sector?: string;
}

export type SentimentRegime =
  | 'RISK-ON'
  | 'BULLISH'
  | 'NEUTRAL'
  | 'CAUTIOUS'
  | 'RISK-OFF';

export interface MarketSentimentPillar {
  key: 'volatility' | 'breadth' | 'credit' | 'leadership';
  label: string;
  score: number | null;
  signal: 'positive' | 'neutral' | 'negative' | 'unavailable';
  detail: string;
  symbols: string[];
}

export interface MarketSentimentSnapshot {
  score: number | null;
  regime: SentimentRegime;
  summary: string;
  pillars: MarketSentimentPillar[];
  updatedAt: string;
}

export interface PredictionForecast {
  id: string;
  question: string;
  eventTitle: string | null;
  theme: string;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  endDate: string | null;
  yesPrice: number | null;
  noPrice: number | null;
  leadingOutcome: string;
  leadingProbability: number | null;
  volume24hr: number | null;
  volume: number | null;
  liquidity: number | null;
  url: string | null;
  source: string;
}

export interface PredictionForecastSnapshot {
  updatedAt: string;
  source: string;
  forecasts: PredictionForecast[];
}

export type CalendarCategory = 'economic' | 'earnings' | 'policy' | 'geopolitical';

export interface CalendarEvent {
  date: string;
  title: string;
  category: CalendarCategory;
  importance: 'high' | 'medium' | 'low';
  description?: string;
  source?: string;
  country?: string;
  symbol?: string;
  value?: number | null;
  estimate?: number | null;
  previous?: number | null;
  unit?: string;
}

export type OpportunityDirection = 'bullish' | 'bearish' | 'mixed';

export type OpportunityHorizon = 'days' | 'weeks' | 'months';

export type OpportunityEvidenceType =
  | 'news'
  | 'trade'
  | 'geopolitics'
  | 'prediction'
  | 'macro'
  | 'sentiment'
  | 'price';

export interface OpportunityEvidence {
  id: string;
  type: OpportunityEvidenceType;
  title: string;
  detail: string;
  url?: string | null;
  publishedAt?: number | null;
}

export interface OpportunityAssetIdea {
  symbol: string;
  label: string;
  role: 'beneficiary' | 'risk' | 'hedge' | 'watch';
  price: number | null;
  changePct: number | null;
}

export interface OpportunityPortfolioMatch {
  symbol: string;
  label: string;
  role: 'beneficiary' | 'risk';
  currentValue: number;
  weightPct: number;
  gainLossPct: number;
}

export interface OpportunityPortfolioImpact {
  label: string;
  impactedPositions: OpportunityPortfolioMatch[];
  watchlistOverlap: string[];
  missingExposure: string[];
  hedgeIdeas: string[];
}

export interface Opportunity {
  id: string;
  title: string;
  theme: string;
  summary: string;
  thesis: string;
  direction: OpportunityDirection;
  horizon: OpportunityHorizon;
  score: number;
  confidence: number;
  noveltyScore: number;
  impactScore: number;
  confirmationScore: number;
  timelinessScore: number;
  relevanceScore: number;
  whyNow: string[];
  catalysts: string[];
  watchItems: string[];
  invalidationSignals: string[];
  assets: OpportunityAssetIdea[];
  evidence: OpportunityEvidence[];
  portfolioImpact: OpportunityPortfolioImpact;
}

export interface OpportunityBrief {
  generatedAt: string;
  headline: string;
  summary: string;
  topOpportunities: string[];
  topRisks: string[];
  nextCatalysts: string[];
}

export interface OpportunityDashboard {
  generatedAt: string;
  opportunities: Opportunity[];
  brief: OpportunityBrief;
  stats: {
    trackedThemes: number;
    portfolioRelevantCount: number;
    highConfidenceCount: number;
    urgentCatalystCount: number;
  };
}

export interface CompanyOfficerBrief {
  name: string;
  title: string;
  age?: number;
  totalPay?: number;
}

export interface CompanyCalendarSnapshot {
  earningsDate?: string;
  earningsCallDate?: string;
  exDividendDate?: string;
  dividendDate?: string;
  earningsAverage?: number | null;
  revenueAverage?: number | null;
  earningsLow?: number | null;
  earningsHigh?: number | null;
  revenueLow?: number | null;
  revenueHigh?: number | null;
  isEarningsDateEstimate?: boolean;
}

export interface CompanyRecommendationPoint {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface CompanyEarningsTrendPoint {
  period: string;
  endDate?: string | null;
  analystCount?: number | null;
  earningsEstimate?: number | null;
  earningsGrowth?: number | null;
  revenueEstimate?: number | null;
  revenueGrowth?: number | null;
  epsCurrent?: number | null;
  eps7DaysAgo?: number | null;
  eps30DaysAgo?: number | null;
  eps90DaysAgo?: number | null;
  upLast30days?: number | null;
  downLast30days?: number | null;
  upLast90days?: number | null;
  downLast90days?: number | null;
}

export interface CompanyTechnicalOutlook {
  label: string;
  direction: string;
  score: number;
  scoreDescription: string;
  sectorDirection?: string;
  sectorScore?: number;
  sectorScoreDescription?: string;
  indexDirection?: string;
  indexScore?: number;
  indexScoreDescription?: string;
}

export interface CompanySnapshotScore {
  label: string;
  company?: number;
  sector?: number;
}

export interface CompanyReport {
  title: string;
  provider: string;
  date: string;
  rating?: string;
  targetPrice?: number;
}

export interface CompanyDevelopment {
  headline: string;
  date: string;
}

export interface CompanyInstitutionHolder {
  organization: string;
  reportDate: string;
  pctHeld: number;
  position: number;
  value: number;
  pctChange?: number;
}

export interface CompanyInsiderTransaction {
  filerName: string;
  filerRelation?: string;
  transactionText: string;
  startDate: string;
  value?: number;
  shares: number;
}

export interface CompanyFiling {
  date: string;
  type: string;
  title: string;
  url: string;
  exhibitCount: number;
}

export interface FundReturnSnapshot {
  label: string;
  value?: number | null;
  categoryValue?: number | null;
}

export interface FundAnnualReturnRow {
  year: number;
  annualValue?: number | null;
  categoryAnnualValue?: number | null;
  q1?: number | null;
  q2?: number | null;
  q3?: number | null;
  q4?: number | null;
}

export interface FundRiskStatistic {
  year: string;
  alpha?: number | null;
  beta?: number | null;
  meanAnnualReturn?: number | null;
  standardDeviation?: number | null;
  rSquared?: number | null;
  sharpeRatio?: number | null;
  treynorRatio?: number | null;
  categoryMeanAnnualReturn?: number | null;
  categorySharpeRatio?: number | null;
}

export interface FundHoldingBrief {
  symbol?: string;
  name: string;
  weight: number | null;
}

export interface FundAllocationSlice {
  label: string;
  weight: number | null;
}

export interface FundSectorExposure {
  label: string;
  weight: number | null;
}

export interface FundWorkbench {
  family?: string;
  categoryName?: string;
  legalType?: string;
  description?: string;
  managerName?: string;
  managerBio?: string;
  managerStartDate?: string;
  netAssets?: number | null;
  netExpenseRatio?: number | null;
  grossExpenseRatio?: number | null;
  annualHoldingsTurnover?: number | null;
  yield?: number | null;
  navPrice?: number | null;
  ytdReturn?: number | null;
  oneYearReturn?: number | null;
  threeYearReturn?: number | null;
  fiveYearReturn?: number | null;
  categoryOneYearReturn?: number | null;
  categoryThreeYearReturn?: number | null;
  categoryFiveYearReturn?: number | null;
  riskRating?: number | null;
  returnRating?: number | null;
  initialInvestment?: number | null;
  trailingReturns: FundReturnSnapshot[];
  annualReturns: FundAnnualReturnRow[];
  riskStatistics: FundRiskStatistic[];
  holdings: FundHoldingBrief[];
  sectorWeightings: FundSectorExposure[];
  assetAllocation: FundAllocationSlice[];
  equityStyle?: {
    priceToBook?: number | null;
    categoryPriceToBook?: number | null;
    priceToCashflow?: number | null;
    categoryPriceToCashflow?: number | null;
    priceToEarnings?: number | null;
    categoryPriceToEarnings?: number | null;
    priceToSales?: number | null;
    categoryPriceToSales?: number | null;
    threeYearEarningsGrowth?: number | null;
    categoryThreeYearEarningsGrowth?: number | null;
  };
}

export interface CompanyWorkbench {
  quote: Quote;
  instrumentKind: InstrumentKind;
  instrumentLabel: string;
  profile: {
    sector?: string;
    industry?: string;
    website?: string;
    country?: string;
    city?: string;
    state?: string;
    longBusinessSummary?: string;
    fullTimeEmployees?: number;
    overallRisk?: number;
    officers: CompanyOfficerBrief[];
  };
  sectorContext: {
    sector?: string;
    industry?: string;
    sectorEtf?: string;
  };
  calendar: CompanyCalendarSnapshot | null;
  analysis: {
    targetLowPrice?: number;
    targetMeanPrice?: number;
    targetHighPrice?: number;
    targetMedianPrice?: number;
    recommendationKey?: string;
    recommendationMean?: number;
    analystOpinionCount?: number;
    grossMargins?: number;
    operatingMargins?: number;
    profitMargins?: number;
    revenueGrowth?: number;
    earningsGrowth?: number;
    returnOnAssets?: number;
    returnOnEquity?: number;
    totalCash?: number;
    totalDebt?: number;
    freeCashflow?: number;
    operatingCashflow?: number;
    recommendationTrend: CompanyRecommendationPoint[];
    earningsTrend: CompanyEarningsTrendPoint[];
    technicalOutlooks: CompanyTechnicalOutlook[];
    snapshotScores: CompanySnapshotScore[];
    valuationDescription?: string;
    valuationRelativeValue?: string;
    insightRecommendation?: {
      rating?: string;
      provider?: string;
      targetPrice?: number;
    };
    reports: CompanyReport[];
    developments: CompanyDevelopment[];
  };
  ownership: {
    institutions: CompanyInstitutionHolder[];
    insiders: CompanyInsiderTransaction[];
    insidersPercentHeld?: number;
    institutionsPercentHeld?: number;
    institutionsFloatPercentHeld?: number;
    institutionsCount?: number;
    netInsiderShares?: number;
    netInsiderCount?: number;
  };
  filings: CompanyFiling[];
  fund: FundWorkbench | null;
}

export type FinancialPeriodType = 'annual' | 'quarterly';

export interface FinancialPeriod {
  label: string;
  date: string;
}

export interface FinancialStatementRow {
  key: string;
  label: string;
  values: Array<number | null>;
}

export interface FinancialStatementSection {
  key: 'income' | 'balance' | 'cash';
  label: string;
  rows: FinancialStatementRow[];
}

export interface FinancialSummaryCard {
  label: string;
  value: number | null;
  format: 'currency' | 'percent' | 'number';
}

export interface CompanyFinancials {
  currency?: string | null;
  periodType: FinancialPeriodType;
  periods: FinancialPeriod[];
  cards: FinancialSummaryCard[];
  sections: FinancialStatementSection[];
}

export type MacroCountryCode = 'US' | 'EA' | 'GB' | 'CA' | 'JP' | 'CH' | 'SE' | 'NO' | 'AU' | 'NZ';
export type MacroMetricKey = 'policyRate' | 'inflation' | 'unemployment' | 'gdpGrowth' | 'yield10y';

export interface MacroSeriesPoint {
  date: string;
  value: number;
}

export interface MacroMetricSnapshot {
  key: MacroMetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  value: number | null;
  previous: number | null;
  change: number | null;
  date?: string;
  source?: string;
  seriesId?: string;
  series: MacroSeriesPoint[];
}

export interface MacroCountrySnapshot {
  country: MacroCountryCode;
  label: string;
  values: Record<MacroMetricKey, MacroMetricSnapshot | null>;
}

export interface MacroDashboardData {
  configured: boolean;
  error?: string;
  asOf: string;
  countries: MacroCountrySnapshot[];
}

export interface MacroCalendarData {
  configured: boolean;
  error?: string;
  events: CalendarEvent[];
}

export type ChartInterval = '1m' | '5m' | '15m' | '1h' | '1d' | '1wk' | '1mo';
export type ChartRange = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | '10y' | 'max';
export type ChartStyle = 'candlestick' | 'ohlc' | 'line' | 'area';

export interface ChartWindowRequest {
  range?: ChartRange;
  interval?: ChartInterval;
  period1?: string;
  period2?: string;
}

export interface ChartWindowResult {
  points: ChartPoint[];
  requestedStart: string | null;
  requestedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  adjusted: boolean;
}
