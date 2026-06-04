import {
  CalendarEvent,
  ChartInterval,
  ChartPoint,
  ChartRange,
  ChartWindowRequest,
  ChartWindowResult,
  CompanionChatResult,
  CompanionMessagePayload,
  CompanionPanelContext,
  CompanyDevelopment,
  CompanyEarningsTrendPoint,
  CompanyFinancials,
  CompanyFiling,
  CompanyInstitutionHolder,
  CompanyRecommendationPoint,
  CompanySnapshotScore,
  CompanyTechnicalOutlook,
  CompanyWorkbench,
  ConnectionProvider,
  ConnectionStatusMap,
  CountryNewsCount,
  FinancialPeriod,
  FinancialPeriodType,
  FinancialStatementRow,
  ForexPair,
  GeopoliticalRiskSnapshot,
  FundAllocationSlice,
  FundAnnualReturnRow,
  FundHoldingBrief,
  FundReturnSnapshot,
  FundRiskStatistic,
  FundSectorExposure,
  FundWorkbench,
  InstrumentKind,
  MacroCalendarData,
  MacroCountryCode,
  MacroCountrySnapshot,
  MacroDashboardData,
  MacroMetricKey,
  MacroMetricSnapshot,
  MarketSentimentPillar,
  MarketSentimentSnapshot,
  NewsGeoFilterKey,
  NewsItem,
  OpenAIHarness,
  PanelType,
  PredictionForecastSnapshot,
  RegionalNewsCount,
  Quote,
  SearchResult,
} from '../types';
import {
  FRED_SERIES_REGISTRY,
  MACRO_COUNTRIES,
  MACRO_METRICS,
  US_RELEASE_TARGETS,
  type FredSeriesCandidate,
} from '../data/macroRegistry';
import { POLICY_SCHEDULE_EVENTS } from '../data/policyCalendar';
import type { AIThemeDiscoveryResult, AIThemeGuidanceResult } from '../utils/themeDiscoveryEngine';

const YF = '/api/yf';
const FH = '/api/finnhub';
const FRED = '/api/fred';
const TMF = '/api/tmf';
const OPENAI = '/api/openai';
const GPR = '/api/gpr';
const POLYMARKET = '/api/polymarket';
const GDELT = '/api/gdelt';
const CONNECTIONS = '/api/connections';
const FRED_MAX_CONCURRENT_REQUESTS = 4;
const FRED_MAX_RETRIES = 3;
const FRED_BASE_RETRY_DELAY_MS = 400;
const FRED_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export type OpenAIDebugPayloadRoute =
  | 'overview-summary'
  | 'discovery-themes'
  | 'topic-theme-guidance'
  | 'geopolitical-pipeline'
  | 'geopolitical-events'
  | 'geopolitical-country-summaries';

export interface OpenAIDebugPayloadEntry {
  route: OpenAIDebugPayloadRoute;
  capturedAt: string;
  payload: unknown;
}

const openAIDebugPayloads = new Map<OpenAIDebugPayloadRoute, OpenAIDebugPayloadEntry>();
let activeFredRequests = 0;
const pendingFredRequests: Array<() => void> = [];

function cloneDebugPayload<T>(payload: T): T {
  try {
    return JSON.parse(JSON.stringify(payload)) as T;
  } catch {
    return payload;
  }
}

function recordOpenAIDebugPayload(route: OpenAIDebugPayloadRoute, payload: unknown): void {
  openAIDebugPayloads.set(route, {
    route,
    capturedAt: new Date().toISOString(),
    payload: cloneDebugPayload(payload),
  });
}

export function getOpenAIDebugPayload(route: OpenAIDebugPayloadRoute): OpenAIDebugPayloadEntry | null {
  return openAIDebugPayloads.get(route) ?? null;
}

async function waitForAvailableFredSlot(): Promise<void> {
  if (activeFredRequests < FRED_MAX_CONCURRENT_REQUESTS) {
    activeFredRequests += 1;
    return;
  }

  await new Promise<void>((resolve) => {
    pendingFredRequests.push(() => {
      activeFredRequests += 1;
      resolve();
    });
  });
}

function releaseFredSlot(): void {
  activeFredRequests = Math.max(0, activeFredRequests - 1);
  const next = pendingFredRequests.shift();
  next?.();
}

async function withFredThrottle<T>(task: () => Promise<T>): Promise<T> {
  await waitForAvailableFredSlot();
  try {
    return await task();
  } finally {
    releaseFredSlot();
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getFredRetryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfterSeconds = Number(retryAfterHeader ?? '');
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  return FRED_BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
}

function formatFredErrorMessage(status: number, bodyText: string): string {
  const snippet = bodyText.trim().replace(/\s+/g, ' ').slice(0, 240);
  return snippet ? `FRED ${status}: ${snippet}` : `FRED fetch failed: ${status}`;
}

const SENTIMENT_SYMBOLS = ['^VIX', 'SPY', 'QQQ', 'IWM', 'RSP', 'HYG', 'LQD', 'TLT', 'GLD'] as const;
const MAJOR_EARNINGS_SYMBOLS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'TSLA', 'META', 'AVGO',
  'BRK-B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'BLK', 'C',
  'UNH', 'JNJ', 'LLY', 'ABBV', 'MRK', 'PFE', 'AMGN', 'GILD',
  'XOM', 'CVX', 'COP', 'WMT', 'COST', 'PG', 'KO', 'PEP', 'HD',
  'AMD', 'ORCL', 'CRM', 'NFLX', 'DIS', 'UBER', 'PLTR',
]);
const HIGH_IMPACT_EARNINGS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'JPM', 'BRK-B',
  'UNH', 'LLY', 'XOM', 'WMT', 'AMD', 'NFLX', 'ORCL',
]);
const REGIONAL_NEWS_QUERIES: Array<{
  key: RegionalNewsCount['key'];
  label: string;
  shortLabel: string;
  searchRoots: string[];
}> = [
  { key: 'north-america', label: 'North America', shortLabel: 'NA', searchRoots: ['us stocks', 'wall street', 'canada markets'] },
  { key: 'latin-america', label: 'Latin America', shortLabel: 'LATAM', searchRoots: ['latin america markets', 'brazil stocks', 'mexico markets'] },
  { key: 'europe', label: 'Europe', shortLabel: 'EU', searchRoots: ['europe stocks', 'eurozone markets', 'uk markets'] },
  { key: 'africa', label: 'Africa', shortLabel: 'AF', searchRoots: ['africa markets', 'south africa stocks', 'nigeria markets'] },
  { key: 'middle-east', label: 'Middle East', shortLabel: 'ME', searchRoots: ['middle east markets', 'saudi market', 'uae markets'] },
  { key: 'asia-pacific', label: 'Asia-Pacific', shortLabel: 'APAC', searchRoots: ['asia markets', 'china stocks', 'japan markets'] },
];
const COUNTRY_NEWS_MONITORS: Array<{
  key: string;
  label: string;
  shortLabel: string;
  countryCode: string;
  region: CountryNewsCount['region'];
  x: number;
  y: number;
  labelX?: number;
  labelY?: number;
  searchRoots: string[];
}> = [
  { key: 'united-states', label: 'United States', shortLabel: 'US', countryCode: 'US', region: 'north-america', x: 451, y: 341, labelX: 451, labelY: 304, searchRoots: ['wall street', 'us stocks'] },
  { key: 'canada', label: 'Canada', shortLabel: 'CA', countryCode: 'CA', region: 'north-america', x: 385, y: 253, labelX: 386, labelY: 220, searchRoots: ['canada markets', 'tsx stocks'] },
  { key: 'mexico', label: 'Mexico', shortLabel: 'MX', countryCode: 'MX', region: 'north-america', x: 393, y: 455, labelX: 395, labelY: 492, searchRoots: ['mexico markets', 'mexico economy'] },
  { key: 'brazil', label: 'Brazil', shortLabel: 'BR', countryCode: 'BR', region: 'latin-america', x: 636, y: 771, labelX: 672, labelY: 802, searchRoots: ['brazil stocks', 'bovespa'] },
  { key: 'argentina', label: 'Argentina', shortLabel: 'AR', countryCode: 'AR', region: 'latin-america', x: 662, y: 953, labelX: 699, labelY: 987, searchRoots: ['argentina markets', 'argentina economy'] },
  { key: 'united-kingdom', label: 'United Kingdom', shortLabel: 'UK', countryCode: 'GB', region: 'europe', x: 1134, y: 246, labelX: 1089, labelY: 216, searchRoots: ['uk markets', 'london stocks'] },
  { key: 'france', label: 'France', shortLabel: 'FR', countryCode: 'FR', region: 'europe', x: 1160, y: 316, labelX: 1119, labelY: 349, searchRoots: ['france markets', 'cac 40'] },
  { key: 'germany', label: 'Germany', shortLabel: 'DE', countryCode: 'DE', region: 'europe', x: 1218, y: 286, labelX: 1265, labelY: 258, searchRoots: ['germany stocks', 'dax'] },
  { key: 'italy', label: 'Italy', shortLabel: 'IT', countryCode: 'IT', region: 'europe', x: 1236, y: 353, labelX: 1275, labelY: 387, searchRoots: ['italy markets', 'ftse mib'] },
  { key: 'spain', label: 'Spain', shortLabel: 'ES', countryCode: 'ES', region: 'europe', x: 1107, y: 360, labelX: 1060, labelY: 391, searchRoots: ['spain markets', 'ibex 35'] },
  { key: 'sweden', label: 'Sweden', shortLabel: 'SE', countryCode: 'SE', region: 'europe', x: 1247, y: 187, labelX: 1287, labelY: 158, searchRoots: ['sweden markets', 'stockholm stocks'] },
  { key: 'turkey', label: 'Turkey', shortLabel: 'TR', countryCode: 'TR', region: 'middle-east', x: 1362, y: 354, labelX: 1407, labelY: 326, searchRoots: ['turkey markets', 'bist'] },
  { key: 'ukraine', label: 'Ukraine', shortLabel: 'UA', countryCode: 'UA', region: 'europe', x: 1310, y: 271, labelX: 1360, labelY: 240, searchRoots: ['ukraine economy', 'ukraine markets'] },
  { key: 'russia', label: 'Russia', shortLabel: 'RU', countryCode: 'RU', region: 'europe', x: 1508, y: 212, labelX: 1562, labelY: 178, searchRoots: ['russia economy', 'russia markets'] },
  { key: 'belarus', label: 'Belarus', shortLabel: 'BY', countryCode: 'BY', region: 'europe', x: 1336, y: 236, labelX: 1390, labelY: 205, searchRoots: ['belarus economy', 'belarus markets'] },
  { key: 'iran', label: 'Iran', shortLabel: 'IR', countryCode: 'IR', region: 'middle-east', x: 1458, y: 395, labelX: 1510, labelY: 363, searchRoots: ['iran economy', 'iran markets'] },
  { key: 'iraq', label: 'Iraq', shortLabel: 'IQ', countryCode: 'IQ', region: 'middle-east', x: 1399, y: 402, labelX: 1452, labelY: 373, searchRoots: ['iraq economy', 'iraq markets'] },
  { key: 'syria', label: 'Syria', shortLabel: 'SY', countryCode: 'SY', region: 'middle-east', x: 1363, y: 379, labelX: 1308, labelY: 349, searchRoots: ['syria economy', 'syria markets'] },
  { key: 'lebanon', label: 'Lebanon', shortLabel: 'LB', countryCode: 'LB', region: 'middle-east', x: 1334, y: 390, labelX: 1278, labelY: 360, searchRoots: ['lebanon economy', 'lebanon markets'] },
  { key: 'yemen', label: 'Yemen', shortLabel: 'YE', countryCode: 'YE', region: 'middle-east', x: 1428, y: 554, labelX: 1480, labelY: 590, searchRoots: ['yemen economy', 'yemen markets'] },
  { key: 'saudi-arabia', label: 'Saudi Arabia', shortLabel: 'SA', countryCode: 'SA', region: 'middle-east', x: 1441, y: 480, labelX: 1489, labelY: 518, searchRoots: ['saudi market', 'saudi economy'] },
  { key: 'united-arab-emirates', label: 'United Arab Emirates', shortLabel: 'AE', countryCode: 'AE', region: 'middle-east', x: 1492, y: 496, labelX: 1544, labelY: 534, searchRoots: ['uae markets', 'dubai stocks'] },
  { key: 'israel', label: 'Israel', shortLabel: 'IL', countryCode: 'IL', region: 'middle-east', x: 1330, y: 414, labelX: 1280, labelY: 444, searchRoots: ['israel markets', 'tel aviv stocks'] },
  { key: 'palestine', label: 'Palestine', shortLabel: 'PS', countryCode: 'PS', region: 'middle-east', x: 1321, y: 405, labelX: 1262, labelY: 424, searchRoots: ['palestine economy', 'palestine markets'] },
  { key: 'egypt', label: 'Egypt', shortLabel: 'EG', countryCode: 'EG', region: 'africa', x: 1282, y: 446, labelX: 1228, labelY: 480, searchRoots: ['egypt markets', 'egypt economy'] },
  { key: 'sudan', label: 'Sudan', shortLabel: 'SD', countryCode: 'SD', region: 'africa', x: 1275, y: 513, labelX: 1218, labelY: 548, searchRoots: ['sudan economy', 'sudan markets'] },
  { key: 'ethiopia', label: 'Ethiopia', shortLabel: 'ET', countryCode: 'ET', region: 'africa', x: 1331, y: 523, labelX: 1388, labelY: 558, searchRoots: ['ethiopia economy', 'ethiopia markets'] },
  { key: 'south-africa', label: 'South Africa', shortLabel: 'ZA', countryCode: 'ZA', region: 'africa', x: 1331, y: 863, labelX: 1386, labelY: 895, searchRoots: ['south africa stocks', 'jse'] },
  { key: 'nigeria', label: 'Nigeria', shortLabel: 'NG', countryCode: 'NG', region: 'africa', x: 1130, y: 584, labelX: 1077, labelY: 617, searchRoots: ['nigeria markets', 'nigeria economy'] },
  { key: 'afghanistan', label: 'Afghanistan', shortLabel: 'AF', countryCode: 'AF', region: 'asia-pacific', x: 1565, y: 376, labelX: 1626, labelY: 344, searchRoots: ['afghanistan economy', 'afghanistan markets'] },
  { key: 'pakistan', label: 'Pakistan', shortLabel: 'PK', countryCode: 'PK', region: 'asia-pacific', x: 1601, y: 440, labelX: 1661, labelY: 408, searchRoots: ['pakistan economy', 'pakistan markets'] },
  { key: 'india', label: 'India', shortLabel: 'IN', countryCode: 'IN', region: 'asia-pacific', x: 1652, y: 471, labelX: 1705, labelY: 509, searchRoots: ['india markets', 'sensex'] },
  { key: 'china', label: 'China', shortLabel: 'CN', countryCode: 'CN', region: 'asia-pacific', x: 1856, y: 402, labelX: 1912, labelY: 435, searchRoots: ['china stocks', 'shanghai markets'] },
  { key: 'taiwan', label: 'Taiwan', shortLabel: 'TW', countryCode: 'TW', region: 'asia-pacific', x: 1938, y: 431, labelX: 1995, labelY: 399, searchRoots: ['taiwan economy', 'taiwan markets'] },
  { key: 'japan', label: 'Japan', shortLabel: 'JP', countryCode: 'JP', region: 'asia-pacific', x: 2080, y: 372, labelX: 2126, labelY: 347, searchRoots: ['japan markets', 'nikkei'] },
  { key: 'south-korea', label: 'South Korea', shortLabel: 'KR', countryCode: 'KR', region: 'asia-pacific', x: 1972, y: 343, labelX: 2019, labelY: 311, searchRoots: ['south korea stocks', 'kospi'] },
  { key: 'myanmar', label: 'Myanmar', shortLabel: 'MM', countryCode: 'MM', region: 'asia-pacific', x: 1803, y: 489, labelX: 1751, labelY: 522, searchRoots: ['myanmar economy', 'myanmar markets'] },
  { key: 'vietnam', label: 'Vietnam', shortLabel: 'VN', countryCode: 'VN', region: 'asia-pacific', x: 1860, y: 520, labelX: 1912, labelY: 552, searchRoots: ['vietnam economy', 'vietnam markets'] },
  { key: 'singapore', label: 'Singapore', shortLabel: 'SG', countryCode: 'SG', region: 'asia-pacific', x: 1857, y: 662, labelX: 1914, labelY: 697, searchRoots: ['singapore markets', 'straits times'] },
  { key: 'indonesia', label: 'Indonesia', shortLabel: 'ID', countryCode: 'ID', region: 'asia-pacific', x: 1948, y: 740, labelX: 2009, labelY: 775, searchRoots: ['indonesia markets', 'jakarta stocks'] },
  { key: 'philippines', label: 'Philippines', shortLabel: 'PH', countryCode: 'PH', region: 'asia-pacific', x: 2022, y: 563, labelX: 2083, labelY: 595, searchRoots: ['philippines economy', 'philippines markets'] },
  { key: 'australia', label: 'Australia', shortLabel: 'AU', countryCode: 'AU', region: 'asia-pacific', x: 2043, y: 938, labelX: 2099, labelY: 971, searchRoots: ['australia stocks', 'asx'] },
];
const COUNTRY_LOCATION_ALIASES: Record<string, string[]> = {
  'united-states': ['united states', 'u s', 'america', 'american'],
  canada: ['canada', 'canadian'],
  mexico: ['mexico', 'mexican'],
  brazil: ['brazil', 'brazilian'],
  argentina: ['argentina', 'argentine'],
  'united-kingdom': ['united kingdom', 'britain', 'british', 'uk'],
  france: ['france', 'french'],
  germany: ['germany', 'german'],
  italy: ['italy', 'italian'],
  spain: ['spain', 'spanish'],
  sweden: ['sweden', 'swedish'],
  turkey: ['turkey', 'turkish'],
  ukraine: ['ukraine', 'ukrainian'],
  russia: ['russia', 'russian', 'kremlin', 'moscow'],
  belarus: ['belarus', 'belarusian', 'minsk'],
  iran: ['iran', 'iranian', 'tehran'],
  iraq: ['iraq', 'iraqi', 'baghdad'],
  syria: ['syria', 'syrian', 'damascus'],
  lebanon: ['lebanon', 'lebanese', 'beirut'],
  yemen: ['yemen', 'yemeni', 'sanaa', 'houthi', 'houthis'],
  'saudi-arabia': ['saudi arabia', 'saudi'],
  'united-arab-emirates': ['united arab emirates', 'uae', 'emirati', 'dubai', 'abu dhabi'],
  israel: ['israel', 'israeli', 'gaza', 'west bank', 'jerusalem'],
  palestine: ['palestine', 'palestinian', 'gaza', 'west bank'],
  egypt: ['egypt', 'egyptian'],
  sudan: ['sudan', 'sudanese'],
  ethiopia: ['ethiopia', 'ethiopian'],
  'south-africa': ['south africa', 'south african'],
  nigeria: ['nigeria', 'nigerian'],
  afghanistan: ['afghanistan', 'afghan', 'kabul'],
  pakistan: ['pakistan', 'pakistani', 'islamabad'],
  india: ['india', 'indian'],
  china: ['china', 'chinese', 'beijing'],
  taiwan: ['taiwan', 'taiwanese', 'taipei'],
  japan: ['japan', 'japanese', 'tokyo'],
  'south-korea': ['south korea', 'south korean', 'seoul'],
  myanmar: ['myanmar', 'burma', 'burmese'],
  vietnam: ['vietnam', 'vietnamese', 'hanoi'],
  singapore: ['singapore', 'singaporean'],
  indonesia: ['indonesia', 'indonesian', 'jakarta'],
  philippines: ['philippines', 'philippine', 'manila'],
  australia: ['australia', 'australian'],
};

type CountryMonitor = (typeof COUNTRY_NEWS_MONITORS)[number];

interface GeopoliticalMapDataset {
  countries: CountryNewsCount[];
  regions: RegionalNewsCount[];
}

interface GeopoliticalMapOptions {
  enableAI?: boolean;
  model?: string;
  systemPrompt?: string;
  includeHotspotSummaries?: boolean;
  debugMode?: boolean;
}

interface GeopoliticalHeadlineAssessment {
  link: string;
  locationLabel?: string;
  countryCodes?: string[];
  severityScore?: number | null;
  eventKey?: string;
  eventLabel?: string;
}

interface GeopoliticalCountrySummaryAssessment {
  countryCode: string;
  summary: string;
  sourceLinks?: string[];
}

interface GeopoliticalPipelineDebugStats {
  lookbackHours: number;
  requestedCount: number;
  fetched: {
    yahooHeadlines: number;
    gdeltHeadlines: number;
    gdeltWithSourceCountry: number;
    gdeltWithSourceCountryCode: number;
    gdeltWithSourceCountryLabel: number;
    gdeltWithCountryCodes: number;
    candidateHeadlines: number;
  };
  extraction: {
    aiEnabled: boolean;
    aiReturnedEvents: number;
    aiStories: number;
    fallbackStories: number;
    fallbackOnlyStories: number;
  };
  final: {
    clusteredStories: number;
    gdeltClusteredStories: number;
    countriesWithEvents: number;
  };
}

interface GdeltGeopoliticsHeadline {
  title: string;
  link: string;
  publisher?: string;
  publishedAt: number;
  sourceCountry?: string | null;
  sourceCountryCode?: string | null;
  sourceCountryLabel?: string | null;
}

type CachedPromise<T> = { expiresAt: number; promise: Promise<T> };

let geopoliticsMapCache: Record<string, CachedPromise<GeopoliticalMapDataset> | undefined> = {};
const geopoliticsPipelineDebugCache: Record<string, GeopoliticalPipelineDebugStats | undefined> = {};
const GEOPOLITICS_MAP_CACHE_TTL_MS = 15 * 60_000;
const GEOPOLITICS_MAP_CACHE_STORAGE_PREFIX = 'bterminal-geopolitics-map:';

export function clearGeopoliticalMapCache(): void {
  geopoliticsMapCache = {};
  for (const key of Object.keys(geopoliticsPipelineDebugCache)) {
    delete geopoliticsPipelineDebugCache[key];
  }

  if (typeof window === 'undefined') return;

  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(GEOPOLITICS_MAP_CACHE_STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    // Ignore storage access errors and fall back to in-memory cache invalidation.
  }
}

const GEOPOLITICAL_TOPIC_QUERIES = [
  'war',
  'conflict',
  'armed',
  'military',
  'invasion',
  'airstrike',
  'missile strike',
  'clashes',
  'cross-border attack',
  'troop deployment',
  'geopolitical tensions',
  'territorial dispute',
  'border dispute',
  'sanctions',
  'retaliation',
  'drills',
  'trade war',
  'export controls',
  'shipping disruption',
  'supply chain disruption',
  'energy disruption',
  'protests',
  'civil unrest',
  'coup',
  'escalation',
  'emergency',
  'ceasefire',
  'nuclear threat',
  'terrorist',
  'naval blockade',
  'martial law',
] as const;
const COUNTRY_MONITOR_BY_CODE = new Map(
  COUNTRY_NEWS_MONITORS.map((country) => [country.countryCode.toUpperCase(), country] as const)
);
const COUNTRY_MONITOR_BY_NORMALIZED_NAME = new Map<string, CountryMonitor>(
  COUNTRY_NEWS_MONITORS.flatMap((country) => {
    const aliases = [
      country.label,
      country.shortLabel,
      country.countryCode,
      ...(COUNTRY_LOCATION_ALIASES[country.key] ?? []),
    ];

    return aliases.map((alias) => [normalizeGeoCountryName(alias), country] as const);
  })
);
const SECTOR_ETF_BY_NAME: Record<string, string> = {
  Technology: 'XLK',
  'Communication Services': 'XLC',
  'Consumer Cyclical': 'XLY',
  'Consumer Defensive': 'XLP',
  'Financial Services': 'XLF',
  Healthcare: 'XLV',
  Industrials: 'XLI',
  Energy: 'XLE',
  Utilities: 'XLU',
  'Real Estate': 'XLRE',
  BasicMaterials: 'XLB',
  'Basic Materials': 'XLB',
};
const CURRENCY_NAMES: Record<string, string> = {
  AUD: 'Australian Dollar',
  BRL: 'Brazilian Real',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  CNY: 'Chinese Yuan',
  DKK: 'Danish Krone',
  EUR: 'Euro',
  GBP: 'British Pound',
  HKD: 'Hong Kong Dollar',
  INR: 'Indian Rupee',
  JPY: 'Japanese Yen',
  MXN: 'Mexican Peso',
  NOK: 'Norwegian Krone',
  NZD: 'New Zealand Dollar',
  SEK: 'Swedish Krona',
  SGD: 'Singapore Dollar',
  USD: 'US Dollar',
};

const EQUITY_SUMMARY_MODULES = [
  'assetProfile',
  'summaryProfile',
  'quoteType',
  'summaryDetail',
  'calendarEvents',
  'financialData',
  'recommendationTrend',
  'earningsTrend',
  'institutionOwnership',
  'majorHoldersBreakdown',
  'netSharePurchaseActivity',
  'insiderTransactions',
  'secFilings',
] as const;

const FUND_SUMMARY_MODULES = [
  'quoteType',
  'summaryDetail',
  'summaryProfile',
  'fundProfile',
  'fundPerformance',
  'topHoldings',
] as const;

interface YahooSummaryResponse {
  assetProfile?: {
    sector?: string;
    industry?: string;
    website?: string;
    country?: string;
    city?: string;
    state?: string;
    longBusinessSummary?: string;
    fullTimeEmployees?: number;
    overallRisk?: number;
    companyOfficers?: Array<{
      name: string;
      title: string;
      age?: number;
      totalPay?: number;
    }>;
  };
  calendarEvents?: {
    earnings?: {
      earningsDate?: string[];
      earningsCallDate?: string[];
      isEarningsDateEstimate?: boolean;
      earningsAverage?: number;
      earningsLow?: number;
      earningsHigh?: number;
      revenueAverage?: number;
      revenueLow?: number;
      revenueHigh?: number;
    };
    exDividendDate?: string;
    dividendDate?: string;
  };
  financialData?: {
    targetHighPrice?: number;
    targetLowPrice?: number;
    targetMeanPrice?: number;
    targetMedianPrice?: number;
    recommendationKey?: string;
    recommendationMean?: number;
    numberOfAnalystOpinions?: number;
    totalCash?: number;
    totalDebt?: number;
    freeCashflow?: number;
    operatingCashflow?: number;
    revenueGrowth?: number;
    earningsGrowth?: number;
    grossMargins?: number;
    operatingMargins?: number;
    profitMargins?: number;
    returnOnAssets?: number;
    returnOnEquity?: number;
  };
  recommendationTrend?: {
    trend?: CompanyRecommendationPoint[];
  };
  quoteType?: {
    quoteType?: string;
    longName?: string | null;
    shortName?: string | null;
  };
  summaryProfile?: {
    website?: string;
    country?: string;
    city?: string;
    state?: string;
    longBusinessSummary?: string;
    description?: string;
    family?: string;
    name?: string;
  };
  summaryDetail?: {
    dividendYield?: number;
    yield?: number;
    totalAssets?: number;
    navPrice?: number;
    ytdReturn?: number;
    beta?: number;
    averageVolume?: number;
    averageDailyVolume10Day?: number;
  };
  fundProfile?: {
    family?: string | null;
    categoryName?: string | null;
    legalType?: string | null;
    managementInfo?: {
      managerName?: string | null;
      managerBio?: string | null;
      startdate?: string;
    };
    feesExpensesInvestment?: {
      annualHoldingsTurnover?: number;
      annualReportExpenseRatio?: number;
      grossExpRatio?: number;
      netExpRatio?: number;
      totalNetAssets?: number;
    };
    initInvestment?: number;
  };
  fundPerformance?: {
    fundCategoryName?: string;
    performanceOverview?: {
      ytdReturnPct?: number;
      oneYearTotalReturn?: number;
      threeYearTotalReturn?: number;
      fiveYrAvgReturnPct?: number;
      morningStarReturnRating?: number;
    };
    performanceOverviewCat?: {
      ytdReturnPct?: number;
      oneYearTotalReturn?: number;
      threeYearTotalReturn?: number;
      fiveYrAvgReturnPct?: number;
    };
    trailingReturns?: {
      ytd?: number;
      oneMonth?: number;
      threeMonth?: number;
      oneYear?: number;
      threeYear?: number;
      fiveYear?: number;
      tenYear?: number;
    };
    trailingReturnsCat?: {
      ytd?: number;
      oneMonth?: number;
      threeMonth?: number;
      oneYear?: number;
      threeYear?: number;
      fiveYear?: number;
      tenYear?: number;
    };
    annualTotalReturns?: {
      returns?: Array<{
        year: number;
        annualValue?: number;
        q1?: number;
        q2?: number;
        q3?: number;
        q4?: number;
      }>;
      returnsCat?: Array<{
        year: number;
        annualValue?: number;
        q1?: number;
        q2?: number;
        q3?: number;
        q4?: number;
      }>;
    };
    riskOverviewStatistics?: {
      riskRating?: number;
      riskStatistics?: Array<{
        year: string;
        alpha: number;
        beta: number;
        meanAnnualReturn: number;
        rSquared: number;
        stdDev?: number;
        sharpeRatio: number;
        treynorRatio: number;
      }>;
    };
    riskOverviewStatisticsCat?: {
      riskStatisticsCat?: Array<{
        year: string;
        alpha: number;
        beta: number;
        meanAnnualReturn: number;
        rSquared: number;
        stdDev?: number;
        sharpeRatio: number;
        treynorRatio: number;
      }>;
    };
  };
  topHoldings?: {
    holdings?: Array<{
      symbol?: string;
      holdingName: string;
      holdingPercent: number;
    }>;
    sectorWeightings?: Array<Record<string, number | undefined>>;
    stockPosition?: number;
    bondPosition?: number;
    cashPosition?: number;
    otherPosition?: number;
    equityHoldings?: {
      priceToBook?: number;
      priceToBookCat?: number;
      priceToCashflow?: number;
      priceToCashflowCat?: number;
      priceToEarnings?: number;
      priceToEarningsCat?: number;
      priceToSales?: number;
      priceToSalesCat?: number;
      threeYearEarningsGrowth?: number;
      threeYearEarningsGrowthCat?: number;
    };
  };
  earningsTrend?: {
    trend?: Array<{
      period: string;
      endDate?: string | null;
      earningsEstimate?: {
        avg?: number | null;
        growth?: number | null;
        numberOfAnalysts?: number | null;
      };
      revenueEstimate?: {
        avg?: number | null;
        growth?: number | null;
      };
      epsTrend?: {
        current?: number | null;
        '7daysAgo'?: number | null;
        '30daysAgo'?: number | null;
        '90daysAgo'?: number | null;
      };
      epsRevisions?: {
        upLast30days?: number | null;
        downLast30days?: number | null;
        upLast90days?: number | null;
        downLast90days?: number | null;
      };
    }>;
  };
  institutionOwnership?: {
    ownershipList?: Array<{
      organization: string;
      reportDate: string;
      pctHeld: number;
      position: number;
      value: number;
      pctChange?: number;
    }>;
  };
  majorHoldersBreakdown?: {
    insidersPercentHeld?: number;
    institutionsPercentHeld?: number;
    institutionsFloatPercentHeld?: number;
    institutionsCount?: number;
  };
  insiderTransactions?: {
    transactions?: Array<{
      filerName: string;
      filerRelation?: string;
      transactionText: string;
      startDate: string;
      value?: number;
      shares: number;
    }>;
  };
  netSharePurchaseActivity?: {
    netInfoShares?: number;
    netInfoCount?: number;
  };
  secFilings?: {
    filings?: Array<{
      date: string;
      type: string;
      title: string;
      edgarUrl?: string;
      url?: string;
      exhibits?: Array<unknown>;
    }>;
  };
}

interface YahooInsightsResponse {
  instrumentInfo?: {
    technicalEvents?: {
      shortTermOutlook?: RawOutlook;
      intermediateTermOutlook?: RawOutlook;
      longTermOutlook?: RawOutlook;
    };
    valuation?: {
      description?: string;
      relativeValue?: string;
    };
  };
  companySnapshot?: {
    company?: Record<string, number | undefined>;
    sector?: Record<string, number | undefined>;
  };
  recommendation?: {
    rating?: string;
    provider?: string;
    targetPrice?: number;
  };
  reports?: Array<{
    reportTitle?: string;
    title?: string;
    provider: string;
    reportDate: string;
    investmentRating?: string;
    targetPrice?: number;
  }>;
  sigDevs?: Array<{
    headline: string;
    date: string;
  }>;
}

interface RawOutlook {
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

interface FundamentalRecord {
  date: string;
  periodType?: string;
  totalRevenue?: number;
  grossProfit?: number;
  EBITDA?: number;
  normalizedEBITDA?: number;
  totalOperatingIncomeAsReported?: number;
  operatingIncome?: number;
  netIncomeContinuousOperations?: number;
  netIncomeFromContinuingOperationNetMinorityInterest?: number;
  basicEPS?: number;
  cashAndCashEquivalents?: number;
  totalAssets?: number;
  totalDebt?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  commonStockEquity?: number;
  stockholdersEquity?: number;
  workingCapital?: number;
  operatingCashFlow?: number;
  freeCashFlow?: number;
  capitalExpenditure?: number;
  investingCashFlow?: number;
  financingCashFlow?: number;
  cashDividendsPaid?: number;
  commonStockDividendPaid?: number;
  [key: string]: string | number | undefined | null;
}

interface FredSeriesSearchResponse {
  seriess?: Array<{
    id: string;
    title: string;
  }>;
}

interface FredObservationsResponse {
  observations?: Array<{
    date: string;
    value: string;
  }>;
}

interface FredReleasesResponse {
  releases?: Array<{
    id: number;
    name: string;
  }>;
}

interface FredReleaseDatesResponse {
  release_dates?: Array<{
    date: string;
  }>;
}

export interface FinnhubEarning {
  date: string;
  symbol: string;
  hour: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  quarter: number;
  year: number;
}

export interface FinnhubEconomicEvent {
  time: string;
  event: string;
  country: string;
  impact: string;
  actual: number | null;
  estimate: number | null;
  prev: number | null;
  unit: string;
}

const fredSeriesCache = new Map<string, { id: string; title: string } | null>();
const teleborsaQuoteCache = new Map<string, Promise<Quote | null>>();
const teleborsaWorkbenchCache = new Map<string, Promise<CompanyWorkbench | null>>();

function normalizeInstrumentType(value?: string | null): string {
  return (value ?? '').toLowerCase().replace(/[\s_-]+/g, '');
}

function normalizeLookupSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeCurrencyCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

function buildForexSymbol(base: string, quote: string): string {
  return `${normalizeCurrencyCode(base)}${normalizeCurrencyCode(quote)}=X`;
}

function buildForexName(base: string, quote: string): string {
  return `${CURRENCY_NAMES[base] ?? base} / ${CURRENCY_NAMES[quote] ?? quote}`;
}

function resolveForexDayStatsFromInverse(quote: Quote): Pick<ForexPair, 'regularMarketDayHigh' | 'regularMarketDayLow' | 'fiftyTwoWeekHigh' | 'fiftyTwoWeekLow'> {
  const invert = (value?: number | null) => (value && value > 0 ? 1 / value : null);

  return {
    regularMarketDayHigh: invert(quote.regularMarketDayLow),
    regularMarketDayLow: invert(quote.regularMarketDayHigh),
    fiftyTwoWeekHigh: invert(quote.fiftyTwoWeekLow),
    fiftyTwoWeekLow: invert(quote.fiftyTwoWeekHigh),
  };
}

function buildForexPairFromRate(
  base: string,
  quote: string,
  current: number,
  previous: number,
  sourceSymbol?: string,
  stats: Pick<ForexPair, 'regularMarketDayHigh' | 'regularMarketDayLow' | 'fiftyTwoWeekHigh' | 'fiftyTwoWeekLow'> = {}
): ForexPair | null {
  if (!Number.isFinite(current) || current <= 0) return null;
  const safePrevious = Number.isFinite(previous) && previous > 0 ? previous : current;
  const change = current - safePrevious;
  const changePct = safePrevious ? (change / safePrevious) * 100 : 0;

  return {
    symbol: buildForexSymbol(base, quote),
    name: buildForexName(base, quote),
    rate: current,
    change,
    changePct,
    base,
    quote,
    sourceSymbol,
    ...stats,
  };
}

function resolveCurrencyUsdRate(currency: string, quoteMap: Map<string, Quote>): { current: number; previous: number } | null {
  const normalized = normalizeCurrencyCode(currency);
  if (!normalized) return null;
  if (normalized === 'USD') return { current: 1, previous: 1 };

  const direct = quoteMap.get(normalizeLookupSymbol(buildForexSymbol(normalized, 'USD')));
  if (direct?.regularMarketPrice) {
    return {
      current: direct.regularMarketPrice,
      previous: direct.regularMarketPreviousClose || direct.regularMarketPrice,
    };
  }

  const inverse = quoteMap.get(normalizeLookupSymbol(buildForexSymbol('USD', normalized)));
  if (inverse?.regularMarketPrice) {
    const current = 1 / inverse.regularMarketPrice;
    const previous = inverse.regularMarketPreviousClose ? 1 / inverse.regularMarketPreviousClose : current;
    return { current, previous };
  }

  return null;
}

function looksLikeTeleborsaFundCandidate(symbol: string): boolean {
  return /^[A-Z0-9]{6,12}$/.test(normalizeLookupSymbol(symbol));
}

function extractTeleborsaSearchSymbol(query: string): string | null {
  const trimmed = query.trim();
  const parenthetical = trimmed.match(/\(([A-Za-z0-9.-]{4,16})\)\s*$/);
  if (parenthetical) {
    return normalizeLookupSymbol(parenthetical[1]).replace(/[^A-Z0-9]/g, '');
  }

  if (/^[A-Za-z0-9.-]{4,16}$/.test(trimmed)) {
    return normalizeLookupSymbol(trimmed).replace(/[^A-Z0-9]/g, '');
  }

  return null;
}

function shouldSearchTeleborsaFunds(query: string): boolean {
  const trimmed = query.trim();
  const symbol = extractTeleborsaSearchSymbol(trimmed);
  if (symbol && looksLikeTeleborsaFundCandidate(symbol)) return true;
  return /\b(allianz|automatic|fondo|fund|sicav|azimut|eurizon|amundi|fida)\b/i.test(trimmed);
}

function isYahooFundQuote(quote?: Quote | null): boolean {
  const normalized = normalizeInstrumentType(quote?.quoteType ?? quote?.typeDisp);
  return normalized === 'mutualfund' || normalized === 'moneymarket';
}

async function requestTeleborsaQuote(symbol: string): Promise<Quote | null> {
  if (!looksLikeTeleborsaFundCandidate(symbol)) return null;
  const normalized = normalizeLookupSymbol(symbol).replace(/[^A-Z0-9]/g, '');
  const res = await fetch(`${TMF}/quote/${encodeURIComponent(normalized)}`);
  if (!res.ok) return null;
  return res.json();
}

function fetchTeleborsaQuote(symbol: string): Promise<Quote | null> {
  const normalized = normalizeLookupSymbol(symbol).replace(/[^A-Z0-9]/g, '');
  if (!looksLikeTeleborsaFundCandidate(normalized)) return Promise.resolve(null);
  const cached = teleborsaQuoteCache.get(normalized);
  if (cached) return cached;

  const request = requestTeleborsaQuote(normalized).catch(() => null);
  teleborsaQuoteCache.set(normalized, request);
  return request;
}

async function requestTeleborsaWorkbench(symbol: string): Promise<CompanyWorkbench | null> {
  const normalized = normalizeLookupSymbol(symbol).replace(/[^A-Z0-9]/g, '');
  const res = await fetch(`${TMF}/workbench/${encodeURIComponent(normalized)}`);
  if (!res.ok) return null;
  return res.json();
}

function fetchTeleborsaWorkbench(symbol: string): Promise<CompanyWorkbench | null> {
  const normalized = normalizeLookupSymbol(symbol).replace(/[^A-Z0-9]/g, '');
  if (!looksLikeTeleborsaFundCandidate(normalized)) return Promise.resolve(null);
  const cached = teleborsaWorkbenchCache.get(normalized);
  if (cached) return cached;

  const request = requestTeleborsaWorkbench(normalized).catch(() => null);
  teleborsaWorkbenchCache.set(normalized, request);
  return request;
}

async function fetchTeleborsaChartRows(symbol: string): Promise<Array<{
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}>> {
  const normalized = normalizeLookupSymbol(symbol).replace(/[^A-Z0-9]/g, '');
  if (!looksLikeTeleborsaFundCandidate(normalized)) return [];
  const res = await fetch(`${TMF}/chart/${encodeURIComponent(normalized)}`);
  if (!res.ok) return [];
  return res.json();
}

async function searchTeleborsaFunds(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (!shouldSearchTeleborsaFunds(trimmed)) return [];
  const params = new URLSearchParams({ q: trimmed });
  const res = await fetch(`${TMF}/search?${params}`);
  if (!res.ok) return [];
  return res.json();
}

function instrumentKindFromQuoteType(quoteType?: string | null): InstrumentKind {
  const normalized = normalizeInstrumentType(quoteType);
  if (normalized === 'mutualfund' || normalized === 'moneymarket') return 'fund';
  if (normalized === 'equity' || normalized === 'etf') return 'equity';
  return 'other';
}

function instrumentLabelFromQuote(quote: Quote, fallbackType?: string | null): string {
  const raw = quote.typeDisp ?? quote.quoteType ?? fallbackType;
  const normalized = normalizeInstrumentType(raw);
  if (normalized === 'mutualfund') return 'MUTUAL FUND';
  if (normalized === 'moneymarket') return 'MONEY MARKET';
  if (normalized === 'etf') return 'ETF';
  if (normalized === 'equity') return 'EQUITY';
  if (normalized === 'index') return 'INDEX';
  if (normalized === 'cryptocurrency') return 'CRYPTO';
  if (!raw) return quote.exchange ?? 'INSTRUMENT';
  return String(raw).replace(/_/g, ' ').toUpperCase();
}

function normalizeFundWorkbench(summary: YahooSummaryResponse): FundWorkbench {
  const fundProfile = summary.fundProfile ?? {};
  const fees = fundProfile.feesExpensesInvestment ?? {};
  const performance = summary.fundPerformance ?? {};
  const performanceOverview = performance.performanceOverview ?? {};
  const performanceOverviewCat = performance.performanceOverviewCat ?? {};
  const topHoldings = summary.topHoldings ?? {};
  const riskStats = performance.riskOverviewStatistics?.riskStatistics ?? [];
  const categoryRiskStats = performance.riskOverviewStatisticsCat?.riskStatisticsCat ?? [];
  const categoryRiskMap = new Map(categoryRiskStats.map((row) => [row.year, row]));
  const annualReturnRows = performance.annualTotalReturns?.returns ?? [];
  const categoryAnnualReturnRows = performance.annualTotalReturns?.returnsCat ?? [];
  const categoryAnnualMap = new Map(categoryAnnualReturnRows.map((row) => [row.year, row]));
  const sectorWeightings = normalizeSectorWeightings(topHoldings.sectorWeightings ?? []);
  const assetAllocation: FundAllocationSlice[] = [
    { label: 'Stock', weight: topHoldings.stockPosition ?? null },
    { label: 'Bond', weight: topHoldings.bondPosition ?? null },
    { label: 'Cash', weight: topHoldings.cashPosition ?? null },
    { label: 'Other', weight: topHoldings.otherPosition ?? null },
  ].filter((slice) => slice.weight != null);
  const summaryDetail = summary.summaryDetail ?? {};
  const summaryProfile = summary.summaryProfile ?? {};

  return {
    family: fundProfile.family ?? summaryProfile.family,
    categoryName: fundProfile.categoryName ?? performance.fundCategoryName,
    legalType: fundProfile.legalType ?? undefined,
    description: summaryProfile.description ?? summaryProfile.longBusinessSummary,
    managerName: fundProfile.managementInfo?.managerName ?? undefined,
    managerBio: fundProfile.managementInfo?.managerBio ?? undefined,
    managerStartDate: normalizeDateString(fundProfile.managementInfo?.startdate),
    netAssets: fees.totalNetAssets ?? summaryDetail.totalAssets ?? null,
    netExpenseRatio: fees.netExpRatio ?? fees.annualReportExpenseRatio ?? null,
    grossExpenseRatio: fees.grossExpRatio ?? null,
    annualHoldingsTurnover: fees.annualHoldingsTurnover ?? null,
    yield: summaryDetail.yield ?? summaryDetail.dividendYield ?? null,
    navPrice: summaryDetail.navPrice ?? null,
    ytdReturn: performanceOverview.ytdReturnPct ?? summaryDetail.ytdReturn ?? null,
    oneYearReturn: performanceOverview.oneYearTotalReturn ?? null,
    threeYearReturn: performanceOverview.threeYearTotalReturn ?? null,
    fiveYearReturn: performanceOverview.fiveYrAvgReturnPct ?? null,
    categoryOneYearReturn: performanceOverviewCat.oneYearTotalReturn ?? null,
    categoryThreeYearReturn: performanceOverviewCat.threeYearTotalReturn ?? null,
    categoryFiveYearReturn: performanceOverviewCat.fiveYrAvgReturnPct ?? null,
    riskRating: performance.riskOverviewStatistics?.riskRating ?? null,
    returnRating: performanceOverview.morningStarReturnRating ?? null,
    initialInvestment: fundProfile.initInvestment ?? null,
    trailingReturns: buildFundTrailingReturns(performance),
    annualReturns: annualReturnRows.map((row): FundAnnualReturnRow => ({
      year: row.year,
      annualValue: row.annualValue ?? null,
      categoryAnnualValue: categoryAnnualMap.get(row.year)?.annualValue ?? null,
      q1: row.q1 ?? null,
      q2: row.q2 ?? null,
      q3: row.q3 ?? null,
      q4: row.q4 ?? null,
    })),
    riskStatistics: riskStats.map((row): FundRiskStatistic => ({
      year: row.year,
      alpha: row.alpha ?? null,
      beta: row.beta ?? null,
      meanAnnualReturn: row.meanAnnualReturn ?? null,
      standardDeviation: row.stdDev ?? null,
      rSquared: row.rSquared ?? null,
      sharpeRatio: row.sharpeRatio ?? null,
      treynorRatio: row.treynorRatio ?? null,
      categoryMeanAnnualReturn: categoryRiskMap.get(row.year)?.meanAnnualReturn ?? null,
      categorySharpeRatio: categoryRiskMap.get(row.year)?.sharpeRatio ?? null,
    })),
    holdings: (topHoldings.holdings ?? []).slice(0, 10).map((holding): FundHoldingBrief => ({
      symbol: holding.symbol,
      name: holding.holdingName,
      weight: holding.holdingPercent ?? null,
    })),
    sectorWeightings,
    assetAllocation,
    equityStyle: topHoldings.equityHoldings
      ? {
          priceToBook: topHoldings.equityHoldings.priceToBook ?? null,
          categoryPriceToBook: topHoldings.equityHoldings.priceToBookCat ?? null,
          priceToCashflow: topHoldings.equityHoldings.priceToCashflow ?? null,
          categoryPriceToCashflow: topHoldings.equityHoldings.priceToCashflowCat ?? null,
          priceToEarnings: topHoldings.equityHoldings.priceToEarnings ?? null,
          categoryPriceToEarnings: topHoldings.equityHoldings.priceToEarningsCat ?? null,
          priceToSales: topHoldings.equityHoldings.priceToSales ?? null,
          categoryPriceToSales: topHoldings.equityHoldings.priceToSalesCat ?? null,
          threeYearEarningsGrowth: topHoldings.equityHoldings.threeYearEarningsGrowth ?? null,
          categoryThreeYearEarningsGrowth: topHoldings.equityHoldings.threeYearEarningsGrowthCat ?? null,
        }
      : undefined,
  };
}

function buildFundTrailingReturns(performance: NonNullable<YahooSummaryResponse['fundPerformance']>): FundReturnSnapshot[] {
  const trailing = performance.trailingReturns ?? {};
  const trailingCat = performance.trailingReturnsCat ?? {};
  const periods: Array<[FundReturnSnapshot['label'], keyof typeof trailing]> = [
    ['YTD', 'ytd'],
    ['1M', 'oneMonth'],
    ['3M', 'threeMonth'],
    ['1Y', 'oneYear'],
    ['3Y', 'threeYear'],
    ['5Y', 'fiveYear'],
    ['10Y', 'tenYear'],
  ];

  return periods.map(([label, key]) => ({
    label,
    value: trailing[key] ?? null,
    categoryValue: trailingCat[key] ?? null,
  }));
}

function normalizeSectorWeightings(rows: Array<Record<string, number | undefined>>): FundSectorExposure[] {
  const labels: Record<string, string> = {
    realestate: 'Real Estate',
    consumer_cyclical: 'Consumer Cyclical',
    basic_materials: 'Basic Materials',
    consumer_defensive: 'Consumer Defensive',
    technology: 'Technology',
    communication_services: 'Communication Services',
    financial_services: 'Financial Services',
    utilities: 'Utilities',
    industrials: 'Industrials',
    energy: 'Energy',
    healthcare: 'Healthcare',
  };

  return rows
    .flatMap((row) =>
      Object.entries(row).map(([key, value]) => ({
        label: labels[key] ?? key.replace(/_/g, ' '),
        weight: value ?? null,
      }))
    )
    .filter((entry) => entry.weight != null)
    .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0));
}

function normalizeDateString(value?: string | null): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export async function fetchQuotes(symbols: string[]): Promise<Quote[]> {
  if (!symbols.length) return [];
  const params = new URLSearchParams({ symbols: symbols.join(',') });
  let yahooError: Error | null = null;
  let yahooQuotes: Quote[] = [];

  try {
    const res = await fetch(`${YF}/quotes?${params}`);
    if (!res.ok) throw new Error(`Quote fetch failed: ${res.status}`);
    yahooQuotes = ((await res.json()) as Quote[]).map((quote) => ({
      ...quote,
      dataSource: 'yahoo' as const,
    }));
  } catch (error) {
    yahooError = error instanceof Error ? error : new Error(String(error));
  }

  const yahooBySymbol = new Map(yahooQuotes.map((quote) => [normalizeLookupSymbol(quote.symbol), quote]));
  const teleborsaCandidates = Array.from(new Set(symbols.map((symbol) => normalizeLookupSymbol(symbol))))
    .filter((symbol) => looksLikeTeleborsaFundCandidate(symbol))
    .filter((symbol) => !isYahooFundQuote(yahooBySymbol.get(symbol)));

  const teleborsaQuotes = await Promise.all(teleborsaCandidates.map((symbol) => fetchTeleborsaQuote(symbol)));
  const teleborsaBySymbol = new Map(
    teleborsaQuotes
      .filter((quote): quote is Quote => Boolean(quote))
      .map((quote) => [normalizeLookupSymbol(quote.symbol), quote])
  );

  const mergedQuotes = Array.from(new Set(symbols.map((symbol) => normalizeLookupSymbol(symbol))))
    .map((symbol) => teleborsaBySymbol.get(symbol) ?? yahooBySymbol.get(symbol))
    .filter((quote): quote is Quote => Boolean(quote));

  if (mergedQuotes.length) return mergedQuotes;
  if (yahooError) throw yahooError;
  return [];
}

export async function fetchQuote(symbol: string): Promise<Quote | null> {
  const results = await fetchQuotes([symbol]);
  return results[0] ?? null;
}

export async function fetchForexPairs(
  pairs: Array<{ base: string; quote: string; name?: string }>
): Promise<ForexPair[]> {
  const normalizedPairs = pairs
    .map(({ base, quote, name }) => ({
      base: normalizeCurrencyCode(base),
      quote: normalizeCurrencyCode(quote),
      name,
    }))
    .filter((pair) => pair.base.length === 3 && pair.quote.length === 3 && pair.base !== pair.quote);

  if (!normalizedPairs.length) return [];

  const symbolsToFetch = new Set<string>();
  normalizedPairs.forEach((pair) => {
    symbolsToFetch.add(buildForexSymbol(pair.base, pair.quote));
    symbolsToFetch.add(buildForexSymbol(pair.quote, pair.base));

    if (pair.base !== 'USD') {
      symbolsToFetch.add(buildForexSymbol(pair.base, 'USD'));
      symbolsToFetch.add(buildForexSymbol('USD', pair.base));
    }

    if (pair.quote !== 'USD') {
      symbolsToFetch.add(buildForexSymbol(pair.quote, 'USD'));
      symbolsToFetch.add(buildForexSymbol('USD', pair.quote));
    }
  });

  const quotes = await fetchQuotes(Array.from(symbolsToFetch));
  const quoteMap = new Map(quotes.map((quote) => [normalizeLookupSymbol(quote.symbol), quote]));

  return normalizedPairs
    .map((pair) => {
      const directSymbol = normalizeLookupSymbol(buildForexSymbol(pair.base, pair.quote));
      const inverseSymbol = normalizeLookupSymbol(buildForexSymbol(pair.quote, pair.base));

      const directQuote = quoteMap.get(directSymbol);
      if (directQuote?.regularMarketPrice) {
        return {
          ...buildForexPairFromRate(
            pair.base,
            pair.quote,
            directQuote.regularMarketPrice,
            directQuote.regularMarketPreviousClose || directQuote.regularMarketPrice,
            directQuote.symbol,
            {
              regularMarketDayHigh: directQuote.regularMarketDayHigh ?? null,
              regularMarketDayLow: directQuote.regularMarketDayLow ?? null,
              fiftyTwoWeekHigh: directQuote.fiftyTwoWeekHigh ?? null,
              fiftyTwoWeekLow: directQuote.fiftyTwoWeekLow ?? null,
            }
          ),
          name: pair.name ?? buildForexName(pair.base, pair.quote),
        } as ForexPair;
      }

      const inverseQuote = quoteMap.get(inverseSymbol);
      if (inverseQuote?.regularMarketPrice) {
        const inverted = buildForexPairFromRate(
          pair.base,
          pair.quote,
          1 / inverseQuote.regularMarketPrice,
          inverseQuote.regularMarketPreviousClose ? 1 / inverseQuote.regularMarketPreviousClose : 1 / inverseQuote.regularMarketPrice,
          inverseQuote.symbol,
          resolveForexDayStatsFromInverse(inverseQuote)
        );

        return inverted
          ? {
              ...inverted,
              name: pair.name ?? buildForexName(pair.base, pair.quote),
            }
          : null;
      }

      const baseUsd = resolveCurrencyUsdRate(pair.base, quoteMap);
      const quoteUsd = resolveCurrencyUsdRate(pair.quote, quoteMap);
      if (!baseUsd || !quoteUsd) return null;

      const cross = buildForexPairFromRate(
        pair.base,
        pair.quote,
        baseUsd.current / quoteUsd.current,
        baseUsd.previous / quoteUsd.previous,
        `${pair.base}/USD · ${pair.quote}/USD`
      );

      return cross
        ? {
            ...cross,
            name: pair.name ?? buildForexName(pair.base, pair.quote),
          }
        : null;
    })
    .filter((pair): pair is ForexPair => Boolean(pair));
}

export async function fetchQuoteDetail(symbol: string): Promise<Quote | null> {
  const teleborsaQuote = await fetchTeleborsaQuote(symbol);
  if (teleborsaQuote) return teleborsaQuote;

  const [quoteRes, summaryRes] = await Promise.allSettled([
    fetchQuotes([symbol]),
    fetchSummary<YahooSummaryResponse>(symbol, ['assetProfile']),
  ]);

  const quote = quoteRes.status === 'fulfilled' ? quoteRes.value[0] : null;
  const assetProfile = summaryRes.status === 'fulfilled' ? summaryRes.value.assetProfile : undefined;

  if (!quote) return null;
  return {
    ...quote,
    sector: assetProfile?.sector,
    industry: assetProfile?.industry,
    longBusinessSummary: assetProfile?.longBusinessSummary,
    website: assetProfile?.website,
    country: assetProfile?.country,
    fullTimeEmployees: assetProfile?.fullTimeEmployees,
  };
}

function filterChartRowsByRange<T extends { date: string }>(rows: T[], range: ChartRange): T[] {
  if (range === 'max') return rows;
  const latest = rows[rows.length - 1];
  if (!latest) return rows;

  const latestTs = new Date(latest.date).getTime();
  const cutoff = new Date(latestTs);

  switch (range) {
    case '1d':
      cutoff.setDate(cutoff.getDate() - 1);
      break;
    case '5d':
      cutoff.setDate(cutoff.getDate() - 5);
      break;
    case '1mo':
      cutoff.setMonth(cutoff.getMonth() - 1);
      break;
    case '3mo':
      cutoff.setMonth(cutoff.getMonth() - 3);
      break;
    case '6mo':
      cutoff.setMonth(cutoff.getMonth() - 6);
      break;
    case '1y':
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      break;
    case '2y':
      cutoff.setFullYear(cutoff.getFullYear() - 2);
      break;
    case '5y':
      cutoff.setFullYear(cutoff.getFullYear() - 5);
      break;
    case '10y':
      cutoff.setFullYear(cutoff.getFullYear() - 10);
      break;
  }

  const cutoffTs = cutoff.getTime();
  const filtered = rows.filter((row) => new Date(row.date).getTime() >= cutoffTs);
  return filtered.length ? filtered : rows;
}

function filterChartRowsByWindow<T extends { date: string }>(
  rows: T[],
  requestedStart: string,
  requestedEnd: string
): { rows: T[]; actualStart: string | null; actualEnd: string | null; adjusted: boolean } {
  if (!rows.length) {
    return { rows, actualStart: null, actualEnd: null, adjusted: false };
  }

  const availableStart = rows[0].date.slice(0, 10);
  const availableEnd = rows[rows.length - 1].date.slice(0, 10);
  const clampedStart = requestedStart < availableStart ? availableStart : requestedStart;
  const clampedEnd = requestedEnd > availableEnd ? availableEnd : requestedEnd;
  const adjusted = clampedStart !== requestedStart || clampedEnd !== requestedEnd;

  let filtered = rows.filter((row) => {
    const date = row.date.slice(0, 10);
    return date >= clampedStart && date <= clampedEnd;
  });

  if (!filtered.length) {
    filtered = rows;
    return {
      rows: filtered,
      actualStart: availableStart,
      actualEnd: availableEnd,
      adjusted: true,
    };
  }

  return {
    rows: filtered,
    actualStart: filtered[0]?.date.slice(0, 10) ?? null,
    actualEnd: filtered[filtered.length - 1]?.date.slice(0, 10) ?? null,
    adjusted,
  };
}

function inferChartRangeFromWindow(start: string, end: string): ChartRange {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const days = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)));

  if (days <= 1) return '1d';
  if (days <= 5) return '5d';
  if (days <= 31) return '1mo';
  if (days <= 92) return '3mo';
  if (days <= 183) return '6mo';
  if (days <= 366) return '1y';
  if (days <= 730) return '2y';
  if (days <= 1826) return '5y';
  if (days <= 3652) return '10y';
  return 'max';
}

function normalizeChartRows(
  rows: Array<{
    date: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
  }>,
  range: ChartRange,
  intradayCapable = true
): ChartPoint[] {
  const isIntraday = intradayCapable && ['1d', '5d'].includes(range);
  return addMovingAverages(
    rows
      .filter((quotePoint) => quotePoint.close != null)
      .map((quotePoint) => {
        const ts = new Date(quotePoint.date).getTime();
        const close = quotePoint.close!;
        return {
          timestamp: ts,
          date: new Date(ts).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            ...(isIntraday ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
            ...(range === '5y' || range === '10y' || range === 'max' ? { year: '2-digit' } : {}),
          }),
          open: quotePoint.open ?? close,
          high: quotePoint.high ?? close,
          low: quotePoint.low ?? close,
          close,
          volume: quotePoint.volume ?? 0,
        };
      })
  );
}

async function fetchSummary<T>(symbol: string, modules: string[]): Promise<T> {
  const params = new URLSearchParams({ modules: modules.join(',') });
  const res = await fetch(`${YF}/summary/${encodeURIComponent(symbol)}?${params}`);
  if (!res.ok) throw new Error(`Summary fetch failed: ${res.status}`);
  return res.json();
}

async function fetchInsights(symbol: string, reportsCount = 5): Promise<YahooInsightsResponse | null> {
  const params = new URLSearchParams({ reportsCount: String(reportsCount) });
  const res = await fetch(`${YF}/insights/${encodeURIComponent(symbol)}?${params}`);
  if (!res.ok) return null;
  return res.json();
}

async function fetchFundamentals(
  symbol: string,
  periodType: FinancialPeriodType,
  module: 'financials' | 'balance-sheet' | 'cash-flow',
  period1: string
): Promise<FundamentalRecord[]> {
  const params = new URLSearchParams({
    type: periodType,
    module,
    period1,
  });
  const res = await fetch(`${YF}/fundamentals/${encodeURIComponent(symbol)}?${params}`);
  if (!res.ok) throw new Error(`Fundamentals fetch failed: ${res.status}`);
  const data = (await res.json()) as FundamentalRecord[];
  return data;
}

export async function fetchChart(
  symbol: string,
  range: ChartRange = '1y',
  interval: ChartInterval = '1d'
): Promise<ChartPoint[]> {
  const result = await fetchChartWindow(symbol, { range, interval });
  return result.points;
}

export async function fetchChartWindow(
  symbol: string,
  options: ChartWindowRequest = {}
): Promise<ChartWindowResult> {
  const range = options.range ?? '1y';
  const interval = options.interval ?? '1d';
  const requestedStart = options.period1?.trim() || null;
  const requestedEnd = options.period2?.trim() || null;
  const customWindow = Boolean(requestedStart && requestedEnd);

  const teleborsaQuote = await fetchTeleborsaQuote(symbol);
  if (teleborsaQuote) {
    const allRows = await fetchTeleborsaChartRows(symbol);
    const teleborsaWindow = customWindow
      ? filterChartRowsByWindow(allRows, requestedStart!, requestedEnd!)
      : {
          rows: filterChartRowsByRange(allRows, range),
          actualStart: null,
          actualEnd: null,
          adjusted: false,
        };
    if (teleborsaWindow.rows.length) {
      const actualStart = customWindow
        ? teleborsaWindow.actualStart
        : teleborsaWindow.rows[0]?.date.slice(0, 10) ?? null;
      const actualEnd = customWindow
        ? teleborsaWindow.actualEnd
        : teleborsaWindow.rows[teleborsaWindow.rows.length - 1]?.date.slice(0, 10) ?? null;
      const normalizedRange = actualStart && actualEnd
        ? inferChartRangeFromWindow(actualStart, actualEnd)
        : range;

      return {
        points: normalizeChartRows(teleborsaWindow.rows, normalizedRange, false),
        requestedStart,
        requestedEnd,
        actualStart,
        actualEnd,
        adjusted: customWindow ? teleborsaWindow.adjusted : false,
      };
    }

    const snapshotDate = new Date().toISOString();
    const snapshotPoint = normalizeChartRows(
      [{
        date: snapshotDate,
        open: teleborsaQuote.regularMarketOpen ?? teleborsaQuote.regularMarketPrice,
        high: teleborsaQuote.regularMarketDayHigh ?? teleborsaQuote.regularMarketPrice,
        low: teleborsaQuote.regularMarketDayLow ?? teleborsaQuote.regularMarketPrice,
        close: teleborsaQuote.regularMarketPrice,
        volume: teleborsaQuote.regularMarketVolume ?? 0,
      }],
      range,
      false
    );

    return {
      points: snapshotPoint,
      requestedStart,
      requestedEnd,
      actualStart: snapshotDate.slice(0, 10),
      actualEnd: snapshotDate.slice(0, 10),
      adjusted: Boolean(customWindow),
    };
  }

  const params = new URLSearchParams({ interval });
  if (customWindow && requestedStart && requestedEnd) {
    params.set('period1', requestedStart);
    params.set('period2', requestedEnd);
  } else {
    params.set('range', range);
  }
  const res = await fetch(`${YF}/chart/${encodeURIComponent(symbol)}?${params}`);
  if (!res.ok) throw new Error(`Chart fetch failed: ${res.status}`);
  const data = await res.json();

  const quotes: Array<{
    date: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
  }> = data.quotes ?? [];

  if (customWindow && quotes.length === 0) {
    const fallbackRes = await fetch(`${YF}/chart/${encodeURIComponent(symbol)}?${new URLSearchParams({ range: 'max', interval })}`);
    if (!fallbackRes.ok) throw new Error(`Chart fetch failed: ${fallbackRes.status}`);
    const fallbackData = await fallbackRes.json();
    const fallbackQuotes: typeof quotes = fallbackData.quotes ?? [];
    const fallbackStart = fallbackQuotes[0]?.date?.slice(0, 10) ?? null;
    const fallbackEnd = fallbackQuotes[fallbackQuotes.length - 1]?.date?.slice(0, 10) ?? null;
    const fallbackRange = fallbackStart && fallbackEnd
      ? inferChartRangeFromWindow(fallbackStart, fallbackEnd)
      : range;

    return {
      points: normalizeChartRows(fallbackQuotes, fallbackRange, true),
      requestedStart,
      requestedEnd,
      actualStart: fallbackStart,
      actualEnd: fallbackEnd,
      adjusted: true,
    };
  }

  const actualStart = quotes[0]?.date?.slice(0, 10) ?? null;
  const actualEnd = quotes[quotes.length - 1]?.date?.slice(0, 10) ?? null;
  const normalizedRange = customWindow && actualStart && actualEnd
    ? inferChartRangeFromWindow(actualStart, actualEnd)
    : range;

  return {
    points: normalizeChartRows(quotes, normalizedRange, true),
    requestedStart,
    requestedEnd,
    actualStart,
    actualEnd,
    adjusted: Boolean(customWindow && requestedStart && actualStart && requestedStart < actualStart),
  };
}

function addMovingAverages(points: ChartPoint[]): ChartPoint[] {
  const sma = (index: number, period: number): number | undefined => {
    if (index < period - 1) return undefined;
    const sum = points.slice(index - period + 1, index + 1).reduce((acc, point) => acc + point.close, 0);
    return parseFloat((sum / period).toFixed(4));
  };

  return points.map((point, index) => ({
    ...point,
    sma20: sma(index, 20),
    sma50: sma(index, 50),
    sma200: sma(index, 200),
  }));
}

export async function fetchNews(query = '', count = 25): Promise<NewsItem[]> {
  const params = new URLSearchParams({
    q: query || 'market stocks finance',
    newsCount: String(count),
  });

  const res = await fetch(`${YF}/search?${params}`);
  if (!res.ok) return [];
  const data = await res.json();

  const news: NewsItem[] = (data.news ?? []).map(
    (item: {
      title: string;
      publisher?: string;
      providerPublishTime?: { raw?: number } | number | string;
      link: string;
      thumbnail?: { resolutions?: { url: string }[] };
      relatedTickers?: string[];
      summary?: string;
      snippet?: string;
      description?: string;
      summaryText?: string;
    }) => ({
      title: item.title,
      publisher: item.publisher ?? '',
      link: item.link,
      publishedAt: (() => {
        const published = item.providerPublishTime;
        if (typeof published === 'number') return published * 1000;
        if (typeof published === 'string') return new Date(published).getTime();
        return (published?.raw ?? 0) * 1000;
      })(),
      thumbnail: item.thumbnail?.resolutions?.[0]?.url,
      feedSource: 'yahoo-finance',
      snippet: [item.summary, item.snippet, item.description, item.summaryText]
        .find((value) => typeof value === 'string' && value.trim().length > 0)
        ?.trim(),
      tickers: item.relatedTickers,
    })
  );

  return news.sort((a: NewsItem, b: NewsItem) => b.publishedAt - a.publishedAt);
}

export async function fetchNewsFeed(
  topicQuery = 'markets',
  geoFilter: NewsGeoFilterKey = 'all',
  count = 25
): Promise<NewsItem[]> {
  const topicQueries = buildTopicFeedQueries(topicQuery);

  if (geoFilter === 'all') {
    if (topicQueries.length === 1) {
      return fetchNews(topicQueries[0], count);
    }

    const perQueryCount = Math.max(8, Math.ceil(count / topicQueries.length) + 4);
    const merged = await fetchMergedNewsForQueries(topicQueries, perQueryCount);
    return merged.slice(0, count);
  }

  const region = REGIONAL_NEWS_QUERIES.find((item) => item.key === geoFilter);
  if (!region) {
    return topicQueries.length === 1
      ? fetchNews(topicQueries[0], count)
      : (await fetchMergedNewsForQueries(topicQueries, Math.max(8, Math.ceil(count / topicQueries.length) + 4))).slice(0, count);
  }

  const queries = buildRegionalFeedQueries(region.searchRoots, topicQuery);
  const perQueryCount = Math.max(8, Math.ceil(count / queries.length) + 4);
  const merged = await fetchMergedNewsForQueries(queries, perQueryCount);
  return merged.slice(0, count);
}

export async function searchNewsArchive(
  query: string,
  lookbackHours = 24,
  geoFilter: NewsGeoFilterKey = 'all',
  count = 30
): Promise<NewsItem[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return fetchNewsFeed('markets', geoFilter, count);
  }

  const lookbackStart = Date.now() - lookbackHours * 60 * 60 * 1000;
  const requestedCount = lookbackHours <= 24 ? 50 : lookbackHours <= 24 * 7 ? 80 : lookbackHours <= 24 * 30 ? 120 : 160;

  const queries = geoFilter === 'all'
    ? [trimmedQuery]
    : (() => {
        const region = REGIONAL_NEWS_QUERIES.find((item) => item.key === geoFilter);
        return region ? buildRegionalFeedQueries(region.searchRoots, trimmedQuery) : [trimmedQuery];
      })();

  const merged = queries.length === 1
    ? await fetchNews(queries[0], requestedCount)
    : await fetchMergedNewsForQueries(queries, Math.max(12, Math.ceil(requestedCount / queries.length) + 8));

  return merged
    .filter((item) => item.publishedAt >= lookbackStart)
    .slice(0, count);
}

export async function fetchRegionalNewsCounts(
  topicQuery = 'markets',
  lookbackHours = 24,
  geopoliticsOptions?: GeopoliticalMapOptions
): Promise<RegionalNewsCount[]> {
  if (topicQuery.trim().toLowerCase() === 'geopolitics') {
    const dataset = await fetchGeopoliticalMapDataset(lookbackHours, geopoliticsOptions);
    return dataset.regions;
  }

  const lookbackStart = Date.now() - lookbackHours * 60 * 60 * 1000;
  const searchCount = lookbackHours <= 6 ? 10 : lookbackHours <= 24 ? 14 : lookbackHours <= 72 ? 18 : 24;

  return Promise.all(
    REGIONAL_NEWS_QUERIES.map(async (region): Promise<RegionalNewsCount> => {
      const queries = buildRegionalNewsQueries(region.searchRoots, topicQuery);
      const recent = await fetchRecentNewsForQueries(queries, searchCount, lookbackStart);

      return {
        key: region.key,
        label: region.label,
        shortLabel: region.shortLabel,
        count: recent.length,
        query: queries.join(' | '),
        source: 'Yahoo Finance News Search',
        latestAt: recent[0]?.publishedAt ?? null,
        sampleTitle: recent[0]?.title,
        samplePublisher: recent[0]?.publisher,
        stories: recent,
      };
    })
  );
}

export async function fetchCountryNewsCounts(
  topicQuery = 'markets',
  lookbackHours = 24,
  geopoliticsOptions?: GeopoliticalMapOptions
): Promise<CountryNewsCount[]> {
  if (topicQuery.trim().toLowerCase() === 'geopolitics') {
    const dataset = await fetchGeopoliticalMapDataset(lookbackHours, geopoliticsOptions);
    return dataset.countries;
  }

  const lookbackStart = Date.now() - lookbackHours * 60 * 60 * 1000;
  const searchCount = lookbackHours <= 6 ? 8 : lookbackHours <= 24 ? 10 : lookbackHours <= 72 ? 12 : 16;

  return Promise.all(
    COUNTRY_NEWS_MONITORS.map(async (country): Promise<CountryNewsCount> => {
      const queries = buildRegionalNewsQueries(country.searchRoots, topicQuery);
      const recent = await fetchRecentNewsForQueries(queries, searchCount, lookbackStart);

      return {
        key: country.key,
        label: country.label,
        shortLabel: country.shortLabel,
        countryCode: country.countryCode,
        region: country.region,
        count: recent.length,
        query: queries.join(' | '),
        source: 'Yahoo Finance News Search',
        latestAt: recent[0]?.publishedAt ?? null,
        x: country.x,
        y: country.y,
        labelX: country.labelX,
        labelY: country.labelY,
        sampleTitle: recent[0]?.title,
        samplePublisher: recent[0]?.publisher,
        stories: recent,
      };
    })
  );
}

export async function fetchGeopoliticalRiskSnapshot(): Promise<GeopoliticalRiskSnapshot> {
  const res = await fetch(`${GPR}/snapshot`);
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Geopolitical risk fetch failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchPredictionForecasts(limit = 6): Promise<PredictionForecastSnapshot> {
  const params = new URLSearchParams({
    limit: String(Math.max(1, Math.min(12, Math.trunc(limit) || 6))),
  });
  const res = await fetch(`${POLYMARKET}/forecasts?${params}`);
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Prediction forecast fetch failed: ${res.status}`);
  }

  return res.json();
}

export async function searchSymbols(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, newsCount: '0' });
  const res = await fetch(`${YF}/search?${params}`);
  const teleborsaResults = await searchTeleborsaFunds(query);
  if (!res.ok) return teleborsaResults;
  const data = await res.json();

  const yahooResults = (data.quotes ?? [])
    .filter((quoteResult: { typeDisp?: string; quoteType?: string }) =>
      ['equity', 'etf', 'index', 'cryptocurrency', 'mutualfund', 'moneymarket'].includes(
        normalizeInstrumentType(quoteResult.typeDisp ?? quoteResult.quoteType)
      )
    )
    .slice(0, 8)
    .map((quoteResult: SearchResult) => ({
      ...quoteResult,
      dataSource: 'yahoo',
    }));

  const teleborsaSymbols = new Set(teleborsaResults.map((result) => normalizeLookupSymbol(result.symbol)));
  return [...teleborsaResults, ...yahooResults.filter((result: SearchResult) => !teleborsaSymbols.has(normalizeLookupSymbol(result.symbol)))].slice(0, 8);
}

export async function generateMarketOverviewSummary(args: {
  model: string;
  harness: OpenAIHarness;
  systemPrompt: string;
  snapshot: unknown;
}): Promise<{ summary: string; generatedAt: string; model: string; harness: OpenAIHarness }> {
  recordOpenAIDebugPayload('overview-summary', args);
  const res = await fetch(`${OPENAI}/overview-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Overview summary failed: ${res.status}`);
  }

  return res.json();
}

export async function generateThemeDiscovery(args: {
  model: string;
  systemPrompt?: string;
  snapshot: unknown;
  signal?: AbortSignal;
}): Promise<AIThemeDiscoveryResult> {
  const { signal, ...payload } = args;
  recordOpenAIDebugPayload('discovery-themes', payload);
  const res = await fetch(`${OPENAI}/discovery-themes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Theme discovery failed: ${res.status}`);
  }

  return res.json();
}

export async function generateTopicThemeGuidance(args: {
  model: string;
  systemPrompt?: string;
  snapshot: unknown;
  signal?: AbortSignal;
}): Promise<AIThemeGuidanceResult> {
  const { signal, ...payload } = args;
  recordOpenAIDebugPayload('topic-theme-guidance', payload);
  const res = await fetch(`${OPENAI}/topic-theme-guidance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Topic theme guidance failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchConnectionStatuses(): Promise<ConnectionStatusMap> {
  const res = await fetch(`${CONNECTIONS}/status`);
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Connection status fetch failed: ${res.status}`);
  }

  return res.json();
}

export async function storeConnectionSecret(
  provider: ConnectionProvider,
  secret: string
): Promise<{ configured: boolean }> {
  const res = await fetch(`${CONNECTIONS}/${encodeURIComponent(provider)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret }),
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Connection secret save failed: ${res.status}`);
  }

  return res.json();
}

export async function deleteConnectionSecret(
  provider: ConnectionProvider
): Promise<{ configured: boolean }> {
  const res = await fetch(`${CONNECTIONS}/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Connection secret delete failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchOpenAIKeyStatus(): Promise<{ configured: boolean }> {
  const status = await fetchConnectionStatuses();
  return { configured: status.openai };
}

export async function storeOpenAIKey(apiKey: string): Promise<{ configured: boolean }> {
  return storeConnectionSecret('openai', apiKey);
}

export async function deleteOpenAIKey(): Promise<{ configured: boolean }> {
  return deleteConnectionSecret('openai');
}

export async function askPanelCompanion(args: {
  model: string;
  activePanel: PanelType;
  panels: PanelType[];
  messages: CompanionMessagePayload[];
  contexts: CompanionPanelContext[];
}): Promise<CompanionChatResult> {
  const res = await fetch(`${OPENAI}/panel-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Panel companion request failed: ${res.status}`);
  }

  return res.json();
}

export async function streamPanelCompanion(
  args: {
    model: string;
    activePanel: PanelType;
    panels: PanelType[];
    messages: CompanionMessagePayload[];
    contexts: CompanionPanelContext[];
  },
  handlers: {
    onChunk: (chunk: string) => void;
  }
): Promise<CompanionChatResult> {
  const res = await fetch(`${OPENAI}/panel-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...args,
      stream: true,
    }),
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Panel companion stream failed: ${res.status}`);
  }

  if (!res.body) {
    return askPanelCompanion(args);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let answer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    if (!chunk) continue;
    answer += chunk;
    handlers.onChunk(chunk);
  }

  answer += decoder.decode();

  return {
    answer,
    generatedAt: new Date().toISOString(),
    model: args.model,
    panels: args.panels,
  };
}

export async function fetchSentimentSnapshot(): Promise<MarketSentimentSnapshot> {
  const quotes = await fetchQuotes([...SENTIMENT_SYMBOLS]);
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const getPct = (symbol: string) => quoteMap.get(symbol)?.regularMarketChangePercent;
  const getPrice = (symbol: string) => quoteMap.get(symbol)?.regularMarketPrice;

  // Transparent scoring model:
  // - volatility rewards lower VIX and falling implied vol
  // - breadth rewards equal-weight and small-cap participation
  // - credit rewards high-yield outperformance over duration/quality
  // - leadership rewards tech/cyclical leadership over defensive havens
  const volatilityScore = averageNumbers([
    scaleValue(getPrice('^VIX'), 12, 32, true),
    scaleValue(getPct('^VIX'), -4, 4, true),
  ]);
  const breadthScore = clampNumber(
    50 +
      safeNumber(getPct('SPY')) * 8 +
      (safeNumber(getPct('IWM')) - safeNumber(getPct('SPY'))) * 14 +
      (safeNumber(getPct('RSP')) - safeNumber(getPct('SPY'))) * 14,
    0,
    100
  );
  const creditScore = clampNumber(
    50 +
      safeNumber(getPct('HYG')) * 10 +
      (safeNumber(getPct('HYG')) - safeNumber(getPct('LQD'))) * 18 -
      safeNumber(getPct('TLT')) * 6,
    0,
    100
  );
  const leadershipScore = clampNumber(
    50 +
      safeNumber(getPct('QQQ')) * 10 +
      (safeNumber(getPct('QQQ')) - safeNumber(getPct('SPY'))) * 14 -
      safeNumber(getPct('GLD')) * 6,
    0,
    100
  );

  const pillars: MarketSentimentPillar[] = [
    {
      key: 'volatility',
      label: 'Volatility',
      score: volatilityScore,
      signal: scoreSignal(volatilityScore),
      detail: `VIX ${formatSignedNumber(getPrice('^VIX'))} | ${formatSignedPercent(getPct('^VIX'))}`,
      symbols: ['^VIX'],
    },
    {
      key: 'breadth',
      label: 'Breadth',
      score: breadthScore,
      signal: scoreSignal(breadthScore),
      detail: `IWM-SPY ${formatSpread(getPct('IWM'), getPct('SPY'))} | RSP-SPY ${formatSpread(getPct('RSP'), getPct('SPY'))}`,
      symbols: ['SPY', 'IWM', 'RSP'],
    },
    {
      key: 'credit',
      label: 'Credit',
      score: creditScore,
      signal: scoreSignal(creditScore),
      detail: `HYG-LQD ${formatSpread(getPct('HYG'), getPct('LQD'))} | TLT ${formatSignedPercent(getPct('TLT'))}`,
      symbols: ['HYG', 'LQD', 'TLT'],
    },
    {
      key: 'leadership',
      label: 'Leadership',
      score: leadershipScore,
      signal: scoreSignal(leadershipScore),
      detail: `QQQ-SPY ${formatSpread(getPct('QQQ'), getPct('SPY'))} | GLD ${formatSignedPercent(getPct('GLD'))}`,
      symbols: ['QQQ', 'SPY', 'GLD'],
    },
  ];

  const scores = pillars.map((pillar) => pillar.score).filter((score): score is number => score != null);
  const composite = scores.length ? parseFloat((scores.reduce((acc, score) => acc + score, 0) / scores.length).toFixed(1)) : null;
  const regime = sentimentRegime(composite);

  return {
    score: composite,
    regime,
    summary: sentimentSummary(regime, pillars),
    pillars,
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchCompanyWorkbench(symbol: string): Promise<CompanyWorkbench | null> {
  const quote = await fetchQuote(symbol);
  if (!quote) return null;

  if (quote.dataSource === 'teleborsa-fida') {
    const teleborsaWorkbench = await fetchTeleborsaWorkbench(symbol);
    if (teleborsaWorkbench) return teleborsaWorkbench;
  }

  const instrumentKind = instrumentKindFromQuoteType(quote.quoteType);
  const summaryModules = instrumentKind === 'fund' ? [...FUND_SUMMARY_MODULES] : [...EQUITY_SUMMARY_MODULES];

  const [summaryRes, insightsRes] = await Promise.allSettled([
    fetchSummary<YahooSummaryResponse>(symbol, summaryModules as string[]),
    instrumentKind === 'fund' ? Promise.resolve(null) : fetchInsights(symbol, 5),
  ]);

  const summary = summaryRes.status === 'fulfilled' ? summaryRes.value : {};
  const insights = insightsRes.status === 'fulfilled' ? insightsRes.value : null;
  const profile = summary.assetProfile ?? {};
  const summaryProfile = summary.summaryProfile ?? {};
  const calendar = summary.calendarEvents;
  const financialData = summary.financialData ?? {};
  const summaryDetail = summary.summaryDetail ?? {};
  const snapshotCompany = insights?.companySnapshot?.company ?? {};
  const snapshotSector = insights?.companySnapshot?.sector ?? {};
  const fund = instrumentKind === 'fund' ? normalizeFundWorkbench(summary) : null;
  const instrumentLabel = instrumentLabelFromQuote(quote, summary.quoteType?.quoteType);

  return {
    quote,
    instrumentKind,
    instrumentLabel,
    profile: {
      sector: profile.sector,
      industry: profile.industry,
      website: profile.website ?? summaryProfile.website,
      country: profile.country ?? summaryProfile.country,
      city: profile.city ?? summaryProfile.city,
      state: profile.state ?? summaryProfile.state,
      longBusinessSummary: profile.longBusinessSummary ?? summaryProfile.longBusinessSummary ?? summaryProfile.description ?? fund?.description,
      fullTimeEmployees: profile.fullTimeEmployees,
      overallRisk: profile.overallRisk,
      officers: (profile.companyOfficers ?? [])
        .slice()
        .sort((left, right) => (right.totalPay ?? 0) - (left.totalPay ?? 0))
        .slice(0, 6)
        .map((officer) => ({
          name: officer.name,
          title: officer.title,
          age: officer.age,
          totalPay: officer.totalPay,
        })),
    },
    sectorContext: {
      sector: profile.sector,
      industry: profile.industry,
      sectorEtf: profile.sector ? SECTOR_ETF_BY_NAME[profile.sector] : undefined,
    },
    calendar: calendar
      ? {
          earningsDate: calendar.earnings?.earningsDate?.[0],
          earningsCallDate: calendar.earnings?.earningsCallDate?.[0],
          exDividendDate: calendar.exDividendDate,
          dividendDate: calendar.dividendDate,
          earningsAverage: calendar.earnings?.earningsAverage ?? null,
          revenueAverage: calendar.earnings?.revenueAverage ?? null,
          earningsLow: calendar.earnings?.earningsLow ?? null,
          earningsHigh: calendar.earnings?.earningsHigh ?? null,
          revenueLow: calendar.earnings?.revenueLow ?? null,
          revenueHigh: calendar.earnings?.revenueHigh ?? null,
          isEarningsDateEstimate: calendar.earnings?.isEarningsDateEstimate,
        }
      : null,
    analysis: {
      targetLowPrice: financialData.targetLowPrice,
      targetMeanPrice: financialData.targetMeanPrice,
      targetHighPrice: financialData.targetHighPrice,
      targetMedianPrice: financialData.targetMedianPrice,
      recommendationKey: financialData.recommendationKey,
      recommendationMean: financialData.recommendationMean,
      analystOpinionCount: financialData.numberOfAnalystOpinions,
      grossMargins: financialData.grossMargins,
      operatingMargins: financialData.operatingMargins,
      profitMargins: financialData.profitMargins,
      revenueGrowth: financialData.revenueGrowth,
      earningsGrowth: financialData.earningsGrowth,
      returnOnAssets: financialData.returnOnAssets,
      returnOnEquity: financialData.returnOnEquity,
      totalCash: financialData.totalCash ?? summaryDetail.totalAssets,
      totalDebt: financialData.totalDebt,
      freeCashflow: financialData.freeCashflow,
      operatingCashflow: financialData.operatingCashflow,
      recommendationTrend: summary.recommendationTrend?.trend ?? [],
      earningsTrend: normalizeEarningsTrend(summary.earningsTrend?.trend ?? []),
      technicalOutlooks: normalizeTechnicalOutlooks(insights?.instrumentInfo?.technicalEvents),
      snapshotScores: normalizeSnapshotScores(snapshotCompany, snapshotSector),
      valuationDescription: insights?.instrumentInfo?.valuation?.description,
      valuationRelativeValue: insights?.instrumentInfo?.valuation?.relativeValue,
      insightRecommendation: insights?.recommendation,
      reports: (insights?.reports ?? []).slice(0, 5).map((report) => ({
        title: report.reportTitle ?? report.title ?? 'Research Update',
        provider: report.provider,
        date: report.reportDate,
        rating: report.investmentRating,
        targetPrice: report.targetPrice,
      })),
      developments: (insights?.sigDevs ?? []).slice(0, 6).map((development) => ({
        headline: development.headline,
        date: development.date,
      })),
    },
    ownership: {
      institutions: (summary.institutionOwnership?.ownershipList ?? [])
        .slice()
        .sort((left, right) => right.pctHeld - left.pctHeld)
        .slice(0, 8)
        .map((holder): CompanyInstitutionHolder => ({
          organization: holder.organization,
          reportDate: holder.reportDate,
          pctHeld: holder.pctHeld,
          position: holder.position,
          value: holder.value,
          pctChange: holder.pctChange,
        })),
      insiders: (summary.insiderTransactions?.transactions ?? [])
        .slice(0, 8)
        .map((transaction) => ({
          filerName: transaction.filerName,
          filerRelation: transaction.filerRelation,
          transactionText: transaction.transactionText,
          startDate: transaction.startDate,
          value: transaction.value,
          shares: transaction.shares,
        })),
      insidersPercentHeld: summary.majorHoldersBreakdown?.insidersPercentHeld,
      institutionsPercentHeld: summary.majorHoldersBreakdown?.institutionsPercentHeld,
      institutionsFloatPercentHeld: summary.majorHoldersBreakdown?.institutionsFloatPercentHeld,
      institutionsCount: summary.majorHoldersBreakdown?.institutionsCount,
      netInsiderShares: summary.netSharePurchaseActivity?.netInfoShares,
      netInsiderCount: summary.netSharePurchaseActivity?.netInfoCount,
    },
    filings: (summary.secFilings?.filings ?? []).slice(0, 8).map((filing): CompanyFiling => ({
      date: filing.date,
      type: filing.type,
      title: filing.title,
      url: filing.edgarUrl ?? filing.url ?? '',
      exhibitCount: filing.exhibits?.length ?? 0,
    })),
    fund,
  };
}

export async function fetchCompanyFinancials(
  symbol: string,
  periodType: FinancialPeriodType = 'annual'
): Promise<CompanyFinancials> {
  const period1 = periodType === 'annual' ? relativeDateYears(6) : relativeDateYears(3);
  const [incomeRes, balanceRes, cashRes] = await Promise.allSettled([
    fetchFundamentals(symbol, periodType, 'financials', period1),
    fetchFundamentals(symbol, periodType, 'balance-sheet', period1),
    fetchFundamentals(symbol, periodType, 'cash-flow', period1),
  ]);

  const incomeRecords = normalizeFundamentalRecords(incomeRes.status === 'fulfilled' ? incomeRes.value : []);
  const balanceRecords = normalizeFundamentalRecords(balanceRes.status === 'fulfilled' ? balanceRes.value : []);
  const cashRecords = normalizeFundamentalRecords(cashRes.status === 'fulfilled' ? cashRes.value : []);

  const periodDates = Array.from(
    new Set([...incomeRecords, ...balanceRecords, ...cashRecords].map((record) => record.date))
  )
    .sort((left, right) => left.localeCompare(right))
    .slice(periodType === 'annual' ? -5 : -8);

  const periods: FinancialPeriod[] = periodDates.map((date) => ({
    date,
    label: formatFinancialPeriod(date, periodType),
  }));

  const incomeSection = {
    key: 'income' as const,
    label: 'Income Statement',
    rows: buildFinancialRows(periodDates, incomeRecords, [
      { key: 'revenue', label: 'Revenue', fields: ['totalRevenue'] },
      { key: 'grossProfit', label: 'Gross Profit', fields: ['grossProfit'] },
      { key: 'ebitda', label: 'EBITDA', fields: ['EBITDA', 'normalizedEBITDA'] },
      { key: 'operatingIncome', label: 'Operating Income', fields: ['operatingIncome', 'totalOperatingIncomeAsReported'] },
      { key: 'netIncome', label: 'Net Income', fields: ['netIncomeFromContinuingOperationNetMinorityInterest', 'netIncomeContinuousOperations'] },
      { key: 'basicEps', label: 'Basic EPS', fields: ['basicEPS'] },
    ]),
  };
  const balanceSection = {
    key: 'balance' as const,
    label: 'Balance Sheet',
    rows: buildFinancialRows(periodDates, balanceRecords, [
      { key: 'cash', label: 'Cash & Equivalents', fields: ['cashAndCashEquivalents'] },
      { key: 'assets', label: 'Total Assets', fields: ['totalAssets'] },
      { key: 'debt', label: 'Total Debt', fields: ['totalDebt'] },
      { key: 'currentAssets', label: 'Current Assets', fields: ['currentAssets'] },
      { key: 'currentLiabilities', label: 'Current Liabilities', fields: ['currentLiabilities'] },
      { key: 'equity', label: 'Common Equity', fields: ['commonStockEquity', 'stockholdersEquity'] },
      { key: 'workingCapital', label: 'Working Capital', fields: ['workingCapital'] },
    ]),
  };
  const cashSection = {
    key: 'cash' as const,
    label: 'Cash Flow',
    rows: buildFinancialRows(periodDates, cashRecords, [
      { key: 'operatingCashFlow', label: 'Operating Cash Flow', fields: ['operatingCashFlow'] },
      { key: 'freeCashFlow', label: 'Free Cash Flow', fields: ['freeCashFlow'] },
      { key: 'capex', label: 'Capital Expenditure', fields: ['capitalExpenditure'] },
      { key: 'investingCashFlow', label: 'Investing Cash Flow', fields: ['investingCashFlow'] },
      { key: 'financingCashFlow', label: 'Financing Cash Flow', fields: ['financingCashFlow'] },
      { key: 'dividends', label: 'Dividends Paid', fields: ['cashDividendsPaid', 'commonStockDividendPaid'] },
    ]),
  };

  const latestIncome = incomeRecords[incomeRecords.length - 1];
  const latestBalance = balanceRecords[balanceRecords.length - 1];
  const latestCash = cashRecords[cashRecords.length - 1];
  const latestRevenue = readRecordNumber(latestIncome, ['totalRevenue']);
  const latestNetIncome = readRecordNumber(latestIncome, ['netIncomeFromContinuingOperationNetMinorityInterest', 'netIncomeContinuousOperations']);
  const latestGrossProfit = readRecordNumber(latestIncome, ['grossProfit']);
  const latestFreeCashFlow = readRecordNumber(latestCash, ['freeCashFlow']);
  const latestAssets = readRecordNumber(latestBalance, ['totalAssets']);
  const latestDebt = readRecordNumber(latestBalance, ['totalDebt']);

  return {
    periodType,
    periods,
    cards: [
      { label: 'Revenue', value: latestRevenue, format: 'currency' },
      { label: 'Net Income', value: latestNetIncome, format: 'currency' },
      { label: 'Gross Margin', value: ratioOrNull(latestGrossProfit, latestRevenue), format: 'percent' },
      { label: 'Free Cash Flow', value: latestFreeCashFlow, format: 'currency' },
      { label: 'Debt / Assets', value: ratioOrNull(latestDebt, latestAssets), format: 'percent' },
    ],
    sections: [incomeSection, balanceSection, cashSection],
  };
}

export async function fetchMacroDashboard(countryCodes?: MacroCountryCode[]): Promise<MacroDashboardData> {
  let configError: string | undefined;
  const requestedCountries = countryCodes?.length
    ? MACRO_COUNTRIES.filter((country) => countryCodes.includes(country.code))
    : MACRO_COUNTRIES;

  const countries = await Promise.all(
    requestedCountries.map(async (country): Promise<MacroCountrySnapshot> => {
      const entries = await Promise.all(
        (Object.keys(MACRO_METRICS) as MacroMetricKey[]).map(async (metricKey) => {
          try {
            const snapshot = await fetchMacroMetric(country.code, metricKey);
            return [metricKey, snapshot] as const;
          } catch (error) {
            const fredError = getFredErrorMessage(error);
            if (!configError && fredError) {
              configError = fredError;
            }
            return [metricKey, null] as const;
          }
        })
      );

      return {
        country: country.code,
        label: country.label,
        values: Object.fromEntries(entries) as Record<MacroMetricKey, MacroMetricSnapshot | null>,
      };
    })
  );

  const hasAnyMetricData = countries.some((country) =>
    (Object.keys(MACRO_METRICS) as MacroMetricKey[]).some((metricKey) => Boolean(country.values[metricKey]))
  );

  return {
    configured: !configError || hasAnyMetricData,
    error: hasAnyMetricData ? undefined : configError,
    asOf: new Date().toISOString(),
    countries,
  };
}

export async function fetchMacroReleaseCalendar(from: string, to: string): Promise<MacroCalendarData> {
  let configError: string | undefined;

  const [earningsRes, releasesRes] = await Promise.allSettled([
    fetchEarningsCalendar(from, to),
    fetchFredReleaseDates(from, to),
  ]);

  if (releasesRes.status === 'rejected') {
    configError = getFredErrorMessage(releasesRes.reason);
  }

  const earningsEvents = earningsRes.status === 'fulfilled'
    ? earningsRes.value
        .filter((earning) => MAJOR_EARNINGS_SYMBOLS.has(earning.symbol))
        .map((earning): CalendarEvent => ({
          date: earning.date,
          title: `${earning.symbol} Earnings`,
          category: 'earnings',
          importance: HIGH_IMPACT_EARNINGS.has(earning.symbol) ? 'high' : 'medium',
          description: [
            earning.hour === 'bmo' ? 'Before Open' : earning.hour === 'amc' ? 'After Close' : '',
            earning.epsEstimate != null ? `EPS est ${earning.epsEstimate.toFixed(2)}` : '',
          ].filter(Boolean).join(' | '),
          source: 'Finnhub',
          symbol: earning.symbol,
        }))
    : [];

  const policyEvents = POLICY_SCHEDULE_EVENTS.filter((event) => event.date >= from && event.date <= to);
  const releaseEvents = releasesRes.status === 'fulfilled' ? releasesRes.value : [];
  const hasAnyEvents = policyEvents.length > 0 || releaseEvents.length > 0 || earningsEvents.length > 0;

  return {
    configured: !configError || hasAnyEvents,
    error: hasAnyEvents ? undefined : configError,
    events: [...policyEvents, ...releaseEvents, ...earningsEvents].sort((left, right) => left.date.localeCompare(right.date)),
  };
}

export async function fetchEarningsCalendar(from: string, to: string): Promise<FinnhubEarning[]> {
  const params = new URLSearchParams({ from, to });
  const res = await fetch(`${FH}/calendar/earnings?${params}`);
  if (!res.ok) throw new Error(`Earnings calendar fetch failed: ${res.status}`);
  const data = await res.json();
  return data.earningsCalendar ?? [];
}

export async function fetchEconomicCalendar(from: string, to: string): Promise<FinnhubEconomicEvent[]> {
  const params = new URLSearchParams({ from, to });
  const res = await fetch(`${FH}/calendar/economic?${params}`);
  if (!res.ok) throw new Error(`Economic calendar fetch failed: ${res.status}`);
  const data = await res.json();
  return data.economicCalendar ?? [];
}

async function fetchMacroMetric(countryCode: MacroCountryCode, metricKey: MacroMetricKey): Promise<MacroMetricSnapshot | null> {
  const candidate = FRED_SERIES_REGISTRY[countryCode][metricKey];
  const metric = MACRO_METRICS[metricKey];
  const resolved = await resolveFredSeries(candidate);
  if (!resolved) return null;

  const observations = await fetchFredObservations(resolved.id, candidate.units);
  const series = observations
    .filter((observation) => observation.value !== '.')
    .map((observation) => ({
      date: observation.date,
      value: Number(observation.value),
    }))
    .filter((point) => !Number.isNaN(point.value));

  if (!series.length) return null;
  const latest = series[series.length - 1];
  const previous = series[series.length - 2];

  return {
    key: metricKey,
    label: metric.label,
    shortLabel: metric.shortLabel,
    unit: metric.unit,
    value: latest?.value ?? null,
    previous: previous?.value ?? null,
    change: latest && previous ? latest.value - previous.value : null,
    date: latest?.date,
    source: resolved.title,
    seriesId: resolved.id,
    series: series.slice(-24),
  };
}

async function resolveFredSeries(candidate: FredSeriesCandidate): Promise<{ id: string; title: string } | null> {
  const cacheKey = JSON.stringify(candidate);
  if (fredSeriesCache.has(cacheKey)) {
    return fredSeriesCache.get(cacheKey) ?? null;
  }

  for (const id of candidate.ids ?? []) {
    try {
      const observations = await fetchFredObservations(id, candidate.units);
      const hasData = observations.some((observation) => observation.value !== '.');
      if (hasData) {
        const resolved = { id, title: id };
        fredSeriesCache.set(cacheKey, resolved);
        return resolved;
      }
    } catch {
      // fall through to search-based lookup
    }
  }

  const params = new URLSearchParams({
    search_text: candidate.searchText,
    limit: '12',
    order_by: 'search_rank',
    sort_order: 'asc',
  });
  const search = await fetchFredJson<FredSeriesSearchResponse>(`/series/search?${params}`);
  const results = search.seriess ?? [];
  const preferred = results.find((result) =>
    (candidate.preferredTitleIncludes ?? []).some((fragment) =>
      result.title.toLowerCase().includes(fragment.toLowerCase())
    )
  ) ?? results[0];

  fredSeriesCache.set(cacheKey, preferred ? { id: preferred.id, title: preferred.title } : null);
  return preferred ? { id: preferred.id, title: preferred.title } : null;
}

async function fetchFredObservations(seriesId: string, units?: string): Promise<Array<{ date: string; value: string }>> {
  const params = new URLSearchParams({
    series_id: seriesId,
    sort_order: 'desc',
    limit: '60',
  });
  if (units) params.set('units', units);
  const data = await fetchFredJson<FredObservationsResponse>(`/series/observations?${params}`);
  return (data.observations ?? []).reverse();
}

async function fetchFredReleaseDates(from: string, to: string): Promise<CalendarEvent[]> {
  const catalog = await fetchFredJson<FredReleasesResponse>('/releases?limit=1000&order_by=name&sort_order=asc');
  const releases = catalog.releases ?? [];

  const matched = US_RELEASE_TARGETS.flatMap((target) => {
    const release = releases.find((candidate) =>
      target.matchers.every((matcher) => matcher.test(candidate.name))
    ) ?? releases.find((candidate) =>
      target.matchers.some((matcher) => matcher.test(candidate.name))
    );

    return release ? [{ target, release }] : [];
  });

  const dateGroups = await Promise.all(
    matched.map(async ({ target, release }) => {
      const params = new URLSearchParams({
        release_id: String(release.id),
        include_release_dates_with_no_data: 'true',
        sort_order: 'asc',
      });
      const response = await fetchFredJson<FredReleaseDatesResponse>(`/release/dates?${params}`);
      return (response.release_dates ?? [])
        .filter((item) => item.date >= from && item.date <= to)
        .map((item): CalendarEvent => ({
          date: item.date,
          title: target.label,
          category: 'economic',
          importance: 'high',
          description: release.name,
          country: 'US',
          source: 'FRED',
        }));
    })
  );

  return dateGroups.flat();
}

async function fetchFredJson<T>(pathWithQuery: string): Promise<T> {
  for (let attempt = 1; attempt <= FRED_MAX_RETRIES; attempt += 1) {
    let res: Response;

    try {
      res = await withFredThrottle(() => fetch(`${FRED}${pathWithQuery}`));
    } catch (error) {
      if (attempt >= FRED_MAX_RETRIES) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`FRED request failed: ${message}`);
      }

      await wait(getFredRetryDelayMs(attempt, null));
      continue;
    }

    if (res.ok) {
      return res.json();
    }

    const text = await res.text();
    const errorMessage = formatFredErrorMessage(res.status, text);

    if (attempt < FRED_MAX_RETRIES && FRED_RETRYABLE_STATUS_CODES.has(res.status)) {
      await wait(getFredRetryDelayMs(attempt, res.headers.get('retry-after')));
      continue;
    }

    throw new Error(errorMessage);
  }

  throw new Error('FRED request failed after retries.');
}

function normalizeEarningsTrend(
  trendRows: NonNullable<YahooSummaryResponse['earningsTrend']>['trend']
): CompanyEarningsTrendPoint[] {
  return (trendRows ?? []).map((row) => ({
    period: row.period,
    endDate: row.endDate ?? null,
    analystCount: row.earningsEstimate?.numberOfAnalysts ?? null,
    earningsEstimate: row.earningsEstimate?.avg ?? null,
    earningsGrowth: row.earningsEstimate?.growth ?? null,
    revenueEstimate: row.revenueEstimate?.avg ?? null,
    revenueGrowth: row.revenueEstimate?.growth ?? null,
    epsCurrent: row.epsTrend?.current ?? null,
    eps7DaysAgo: row.epsTrend?.['7daysAgo'] ?? null,
    eps30DaysAgo: row.epsTrend?.['30daysAgo'] ?? null,
    eps90DaysAgo: row.epsTrend?.['90daysAgo'] ?? null,
    upLast30days: row.epsRevisions?.upLast30days ?? null,
    downLast30days: row.epsRevisions?.downLast30days ?? null,
    upLast90days: row.epsRevisions?.upLast90days ?? null,
    downLast90days: row.epsRevisions?.downLast90days ?? null,
  }));
}

function normalizeTechnicalOutlooks(technicalEvents?: {
  shortTermOutlook?: RawOutlook;
  intermediateTermOutlook?: RawOutlook;
  longTermOutlook?: RawOutlook;
}): CompanyTechnicalOutlook[] {
  const entries: Array<[string, RawOutlook | undefined]> = [
    ['Short Term', technicalEvents?.shortTermOutlook],
    ['Intermediate', technicalEvents?.intermediateTermOutlook],
    ['Long Term', technicalEvents?.longTermOutlook],
  ];

  return entries
    .filter((entry): entry is [string, RawOutlook] => Boolean(entry[1]))
    .map(([label, value]) => ({
      label,
      direction: value.direction,
      score: value.score,
      scoreDescription: value.scoreDescription,
      sectorDirection: value.sectorDirection,
      sectorScore: value.sectorScore,
      sectorScoreDescription: value.sectorScoreDescription,
      indexDirection: value.indexDirection,
      indexScore: value.indexScore,
      indexScoreDescription: value.indexScoreDescription,
    }));
}

function normalizeSnapshotScores(
  company: Record<string, number | undefined>,
  sector: Record<string, number | undefined>
): CompanySnapshotScore[] {
  const rows: Array<{ key: string; label: string }> = [
    { key: 'innovativeness', label: 'Innovation' },
    { key: 'hiring', label: 'Hiring' },
    { key: 'sustainability', label: 'Sustainability' },
    { key: 'insiderSentiments', label: 'Insider Sentiment' },
    { key: 'earningsReports', label: 'Earnings' },
    { key: 'dividends', label: 'Dividends' },
  ];

  return rows
    .map((row) => ({
      label: row.label,
      company: company[row.key],
      sector: sector[row.key],
    }))
    .filter((row) => row.company != null || row.sector != null);
}

function normalizeFundamentalRecords(records: FundamentalRecord[]): FundamentalRecord[] {
  return records
    .filter((record) => Boolean(record.date))
    .map((record) => ({
      ...record,
      date: String(record.date).slice(0, 10),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildFinancialRows(
  periodDates: string[],
  records: FundamentalRecord[],
  config: Array<{ key: string; label: string; fields: string[] }>
): FinancialStatementRow[] {
  const recordMap = new Map(records.map((record) => [record.date, record]));
  return config
    .map((row) => ({
      key: row.key,
      label: row.label,
      values: periodDates.map((date) => readRecordNumber(recordMap.get(date), row.fields)),
    }))
    .filter((row) => row.values.some((value) => value != null));
}

function readRecordNumber(record: FundamentalRecord | undefined, fields: string[]): number | null {
  if (!record) return null;
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function ratioOrNull(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

function relativeDateYears(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function formatFinancialPeriod(dateText: string, periodType: FinancialPeriodType): string {
  const date = new Date(`${dateText}T00:00:00`);
  if (periodType === 'annual') return `FY ${date.getFullYear()}`;
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `Q${quarter} ${String(date.getFullYear()).slice(-2)}`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createGeopoliticalPipelineDebugStats(lookbackHours: number, requestedCount: number): GeopoliticalPipelineDebugStats {
  return {
    lookbackHours,
    requestedCount,
    fetched: {
      yahooHeadlines: 0,
      gdeltHeadlines: 0,
      gdeltWithSourceCountry: 0,
      gdeltWithSourceCountryCode: 0,
      gdeltWithSourceCountryLabel: 0,
      gdeltWithCountryCodes: 0,
      candidateHeadlines: 0,
    },
    extraction: {
      aiEnabled: false,
      aiReturnedEvents: 0,
      aiStories: 0,
      fallbackStories: 0,
      fallbackOnlyStories: 0,
    },
    final: {
      clusteredStories: 0,
      gdeltClusteredStories: 0,
      countriesWithEvents: 0,
    },
  };
}

async function fetchRecentNewsForQueries(queries: string[], searchCount: number, lookbackStart: number): Promise<NewsItem[]> {
  const merged = await fetchMergedNewsForQueries(queries, searchCount);
  return merged.filter((item) => item.publishedAt >= lookbackStart);
}

async function fetchMergedNewsForQueries(queries: string[], searchCount: number): Promise<NewsItem[]> {
  const newsGroups = await Promise.all(queries.map((query) => fetchNews(query, searchCount)));
  return Array.from(
    new Map(
      newsGroups
        .flat()
        .sort((a, b) => b.publishedAt - a.publishedAt)
        .map((item) => [item.link, item])
    ).values()
  );
}

async function fetchGeopoliticalMapDataset(
  lookbackHours: number,
  options: GeopoliticalMapOptions = {}
): Promise<GeopoliticalMapDataset> {
  const cacheKey = JSON.stringify({
    pipelineVersion: 'geopolitics-events-v14-headline-only-country-attribution',
    lookbackHours,
    enableAI: Boolean(options.enableAI && options.model?.trim()),
    model: options.model?.trim() ?? '',
    systemPrompt: options.systemPrompt?.trim() ?? '',
    includeHotspotSummaries: options.includeHotspotSummaries !== false,
  });
  const cached = geopoliticsMapCache[cacheKey];
  if (cached && cached.expiresAt > Date.now()) {
    const cachedDebug = geopoliticsPipelineDebugCache[cacheKey];
    if (cachedDebug) {
      recordOpenAIDebugPayload('geopolitical-pipeline', cachedDebug);
    }
    return cached.promise;
  }

  const persisted = readPersistedGeopoliticalMapDataset(cacheKey);
  if (persisted) {
    const promise = Promise.resolve(persisted);
    geopoliticsMapCache[cacheKey] = {
      expiresAt: Date.now() + GEOPOLITICS_MAP_CACHE_TTL_MS,
      promise,
    };
    const cachedDebug = geopoliticsPipelineDebugCache[cacheKey];
    if (cachedDebug) {
      recordOpenAIDebugPayload('geopolitical-pipeline', cachedDebug);
    }
    return promise;
  }

  const promise = buildGeopoliticalMapDataset(lookbackHours, options).catch((error) => {
    delete geopoliticsMapCache[cacheKey];
    throw error;
  }).then(({ dataset, debug }) => {
    geopoliticsPipelineDebugCache[cacheKey] = debug;
    recordOpenAIDebugPayload('geopolitical-pipeline', debug);
    if (options.debugMode) {
      console.debug('[geopolitics-map] pipeline', {
        lookbackHours: debug.lookbackHours,
        requestedCount: debug.requestedCount,
        gdeltFetched: debug.fetched.gdeltHeadlines,
        gdeltMapped: debug.fetched.gdeltWithCountryCodes,
        candidateHeadlines: debug.fetched.candidateHeadlines,
        aiStories: debug.extraction.aiStories,
        fallbackStories: debug.extraction.fallbackStories,
        finalClusteredStories: debug.final.clusteredStories,
      });
    }
    writePersistedGeopoliticalMapDataset(cacheKey, dataset);
    return dataset;
  });

  geopoliticsMapCache[cacheKey] = {
    expiresAt: Date.now() + GEOPOLITICS_MAP_CACHE_TTL_MS,
    promise,
  };

  return promise;
}

async function buildGeopoliticalMapDataset(
  lookbackHours: number,
  options: GeopoliticalMapOptions = {}
): Promise<{ dataset: GeopoliticalMapDataset; debug: GeopoliticalPipelineDebugStats }> {
  const requestedCount = resolveGeopoliticalHeadlineRequestCount(lookbackHours);
  const pipelineDebug = createGeopoliticalPipelineDebugStats(lookbackHours, requestedCount);
  const queryLabel = buildTopicFeedQueries('geopolitics').join(' | ');
  const candidateHeadlines = await fetchGeopoliticalHeadlines(lookbackHours, pipelineDebug);
  const { stories, source } = await annotateGeopoliticalHeadlines(candidateHeadlines, lookbackHours, options, pipelineDebug);
  const clusteredStories = clusterGeopoliticalStories(stories);
  pipelineDebug.final.clusteredStories = clusteredStories.length;
  pipelineDebug.final.gdeltClusteredStories = clusteredStories.filter((story) => story.feedSource === 'gdelt').length;

  const baseCountries = COUNTRY_NEWS_MONITORS.map((country): CountryNewsCount => {
    const countryStories = clusteredStories.filter((story) => story.countryCodes?.includes(country.countryCode));
    const severityScore = computeCountrySeverityScore(countryStories);

    return {
      key: country.key,
      label: country.label,
      shortLabel: country.shortLabel,
      countryCode: country.countryCode,
      region: country.region,
      count: countryStories.length,
      severityScore,
      query: queryLabel,
      source,
      latestAt: countryStories[0]?.publishedAt ?? null,
      x: country.x,
      y: country.y,
      labelX: country.labelX,
      labelY: country.labelY,
      sampleTitle: countryStories[0]?.title,
      samplePublisher: countryStories[0]?.publisher,
      stories: countryStories,
    };
  });
  const countries = options.includeHotspotSummaries === false
    ? baseCountries
    : await annotateCountryHotspotSummaries(baseCountries, lookbackHours, options);
  pipelineDebug.final.countriesWithEvents = countries.filter((country) => country.count > 0).length;

  recordOpenAIDebugPayload('geopolitical-pipeline', pipelineDebug);

  return {
    dataset: {
      countries,
      regions: buildRegionalDatasetFromCountries(countries, source, queryLabel),
    },
    debug: pipelineDebug,
  };
}

function computeCountrySeverityScore(stories: NewsItem[]): number | null {
  if (!stories.length) return null;

  const normalizedScores = stories
    .map((story) => normalizeGeopoliticalSeverityScore(story.severityScore))
    .filter((score) => score > 0);

  if (!normalizedScores.length) return null;

  // Avoid letting one outlier dominate the country score:
  // blend a robust percentile with recent average and max.
  const sorted = [...normalizedScores].sort((a, b) => a - b);
  const p70 = sorted[Math.floor((sorted.length - 1) * 0.70)] ?? sorted[sorted.length - 1];
  const recentTop = normalizedScores.slice(0, Math.min(3, normalizedScores.length));
  const recentAverage = recentTop.reduce((sum, score) => sum + score, 0) / recentTop.length;
  const maximum = sorted[sorted.length - 1];

  const blendedScore = (p70 * 0.55) + (recentAverage * 0.30) + (maximum * 0.15);
  return clampNumber(Math.round(blendedScore), 1, 10);
}

async function fetchGeopoliticalHeadlines(
  lookbackHours: number,
  pipelineDebug?: GeopoliticalPipelineDebugStats
): Promise<NewsItem[]> {
  const lookbackStart = Date.now() - lookbackHours * 60 * 60 * 1000;
  const requestedCount = resolveGeopoliticalHeadlineRequestCount(lookbackHours);
  if (pipelineDebug) {
    pipelineDebug.lookbackHours = lookbackHours;
    pipelineDebug.requestedCount = requestedCount;
  }
  const [yahooHeadlines, gdeltHeadlines] = await Promise.all([
    fetchGeopoliticalYahooHeadlines(lookbackHours),
    fetchGeopoliticalGdeltHeadlines(lookbackHours, pipelineDebug),
  ]);
  if (pipelineDebug) {
    pipelineDebug.fetched.yahooHeadlines = yahooHeadlines.length;
  }

  const deduped = dedupeGeopoliticalCandidateStories([...gdeltHeadlines, ...yahooHeadlines]);
  const filtered = deduped.filter((item) => item.publishedAt >= lookbackStart);
  if (pipelineDebug) {
    pipelineDebug.fetched.candidateHeadlines = filtered.length;
  }

  return filtered.slice(0, requestedCount);
}

async function fetchGeopoliticalYahooHeadlines(lookbackHours: number): Promise<NewsItem[]> {
  const lookbackStart = Date.now() - lookbackHours * 60 * 60 * 1000;
  const perQueryCount = resolveGeopoliticalHeadlinePerQueryCount(lookbackHours);
  const merged = await fetchMergedNewsForQueries([...GEOPOLITICAL_TOPIC_QUERIES], perQueryCount);

  return merged.filter((item) => item.publishedAt >= lookbackStart);
}

async function fetchGeopoliticalGdeltHeadlines(
  lookbackHours: number,
  pipelineDebug?: GeopoliticalPipelineDebugStats
): Promise<NewsItem[]> {
  const limit = resolveGdeltGeopoliticalHeadlineRequestCount(lookbackHours);
  const params = new URLSearchParams({
    timeframeHours: String(Math.max(1, Math.min(720, Math.trunc(lookbackHours) || 24))),
    limit: String(limit),
  });
  const res = await fetch(`${GDELT}/geopolitics?${params}`);
  if (!res.ok) return [];

  const payload = (await res.json().catch(() => [])) as GdeltGeopoliticsHeadline[] | null;
  if (!Array.isArray(payload)) return [];
  if (pipelineDebug) {
    pipelineDebug.fetched.gdeltHeadlines = payload.length;
  }

  return payload
    .flatMap((item): NewsItem[] => {
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const link = typeof item.link === 'string' ? item.link.trim() : '';
      const publishedAt = Number.parseInt(String(item.publishedAt ?? 0), 10);
      if (!title || !link || !Number.isFinite(publishedAt) || publishedAt <= 0) return [];

      const sourceCountry = typeof item.sourceCountry === 'string' && item.sourceCountry.trim()
        ? item.sourceCountry.trim()
        : '';
      const sourceCountryInfo = resolveSourceCountryMetadata(sourceCountry);
      const countryCodesFromHeadline = collectCountryCodesFromText(title);
      const countryCodes = countryCodesFromHeadline;
      const locationLabel = countryCodes.length
        ? countryCodes.map((code) => COUNTRY_MONITOR_BY_CODE.get(code)?.label ?? code).join(', ')
        : undefined;

      if (pipelineDebug) {
        if (sourceCountry) pipelineDebug.fetched.gdeltWithSourceCountry += 1;
        if (sourceCountryInfo.sourceCountryCode) pipelineDebug.fetched.gdeltWithSourceCountryCode += 1;
        if (sourceCountryInfo.sourceCountryLabel) pipelineDebug.fetched.gdeltWithSourceCountryLabel += 1;
        if (countryCodes.length) pipelineDebug.fetched.gdeltWithCountryCodes += 1;
      }

      return [{
        title,
        publisher: typeof item.publisher === 'string' && item.publisher.trim() ? item.publisher.trim() : 'GDELT',
        link,
        publishedAt,
        feedSource: 'gdelt',
        sourceCountry: sourceCountry || undefined,
        sourceCountryCode: sourceCountryInfo.sourceCountryCode ?? undefined,
        sourceCountryLabel: sourceCountryInfo.sourceCountryLabel ?? undefined,
        locationLabel,
        countryCodes: countryCodes.length ? countryCodes : undefined,
        severityScore: estimateHeadlineSeverityScore(title),
        eventLabel: title,
      }];
    })
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

function resolveGeopoliticalHeadlineRequestCount(lookbackHours: number): number {
  if (lookbackHours <= 1) return 48;
  if (lookbackHours <= 6) return 96;
  if (lookbackHours <= 24) return 180;
  if (lookbackHours <= 72) return 260;
  return 320;
}

function resolveGeopoliticalHeadlinePerQueryCount(lookbackHours: number): number {
  if (lookbackHours <= 1) return 12;
  if (lookbackHours <= 6) return 14;
  if (lookbackHours <= 24) return 18;
  if (lookbackHours <= 72) return 24;
  return 28;
}

function resolveGdeltGeopoliticalHeadlineRequestCount(lookbackHours: number): number {
  if (lookbackHours <= 1) return 48;
  if (lookbackHours <= 6) return 72;
  if (lookbackHours <= 24) return 120;
  if (lookbackHours <= 72) return 160;
  return 200;
}

async function annotateGeopoliticalHeadlines(
  headlines: NewsItem[],
  lookbackHours: number,
  options: GeopoliticalMapOptions,
  pipelineDebug?: GeopoliticalPipelineDebugStats
): Promise<{ stories: NewsItem[]; source: string }> {
  const feedSource = formatGeopoliticalFeedSourceLabel(headlines);
  if (pipelineDebug) {
    pipelineDebug.extraction.aiEnabled = Boolean(options.enableAI && options.model?.trim());
  }
  if (!headlines.length) {
    return {
      stories: [],
      source: `${feedSource} · AI headline extraction`,
    };
  }

  if (options.enableAI && options.model?.trim()) {
    try {
      const assessments = await extractGeopoliticalHeadlineAssessments(headlines, lookbackHours, options);
      const aiStories = applyHeadlineAssessments(headlines, assessments, { skipLexicalGate: true });
      const aiMatchedLinks = new Set(aiStories.map((story) => canonicalizeStoryLink(story.link)));
      const fallbackStories = applyHeadlineAssessments(headlines, fallbackHeadlineAssessments(headlines));
      const fallbackOnlyStories = fallbackStories.filter((story) => !aiMatchedLinks.has(canonicalizeStoryLink(story.link)));
      // Keep dedupe strict by link before clustering so increased recall does not inflate severity counts.
      const stories = dedupeStories([...aiStories, ...fallbackOnlyStories]);
      if (pipelineDebug) {
        pipelineDebug.extraction.aiReturnedEvents = assessments.length;
        pipelineDebug.extraction.aiStories = aiStories.filter((story) => story.feedSource === 'gdelt').length;
        pipelineDebug.extraction.fallbackStories = fallbackStories.filter((story) => story.feedSource === 'gdelt').length;
        pipelineDebug.extraction.fallbackOnlyStories = fallbackOnlyStories.filter((story) => story.feedSource === 'gdelt').length;
      }
      return {
        stories,
        source: fallbackOnlyStories.length > 0
          ? `${feedSource} · AI extraction + fallback matcher`
          : `${feedSource} · AI headline extraction`,
      };
    } catch (error) {
      console.warn('[geopolitics-map] AI extraction failed, falling back to conservative headline matching.', error);
    }
  }

  const fallbackStories = applyHeadlineAssessments(headlines, fallbackHeadlineAssessments(headlines));
  if (pipelineDebug) {
    pipelineDebug.extraction.aiReturnedEvents = 0;
    pipelineDebug.extraction.aiStories = 0;
    pipelineDebug.extraction.fallbackStories = fallbackStories.filter((story) => story.feedSource === 'gdelt').length;
    pipelineDebug.extraction.fallbackOnlyStories = pipelineDebug.extraction.fallbackStories;
  }

  return {
    stories: fallbackStories,
    source: `${feedSource} · headline matcher`,
  };
}

const GEOPOLITICAL_COUNTRY_SUMMARY_CHUNK_SIZE = 8;
const GEOPOLITICAL_COUNTRY_SUMMARY_SOURCE_LIMIT = 8;
const GEOPOLITICAL_COUNTRY_SUMMARY_DISPLAY_SOURCE_LIMIT = 6;

async function annotateCountryHotspotSummaries(
  countries: CountryNewsCount[],
  lookbackHours: number,
  options: GeopoliticalMapOptions
): Promise<CountryNewsCount[]> {
  const countriesWithStories = countries.filter((country) => country.count > 0 && (country.stories ?? []).length > 0);
  if (!countriesWithStories.length) return countries;

  if (options.enableAI && options.model?.trim()) {
    try {
      const assessments: GeopoliticalCountrySummaryAssessment[] = [];
      const chunks = chunkArray(countriesWithStories, GEOPOLITICAL_COUNTRY_SUMMARY_CHUNK_SIZE);
      for (const chunk of chunks) {
        const chunkAssessments = await extractGeopoliticalCountrySummaries(chunk, lookbackHours, options);
        assessments.push(...chunkAssessments);
      }
      return applyCountryHotspotSummaries(countries, assessments);
    } catch (error) {
      console.warn('[geopolitics-map] Country hotspot summary generation failed, using deterministic fallback.', error);
    }
  }

  return applyCountryHotspotSummaries(countries, []);
}

async function extractGeopoliticalCountrySummaries(
  countries: CountryNewsCount[],
  lookbackHours: number,
  options: GeopoliticalMapOptions
): Promise<GeopoliticalCountrySummaryAssessment[]> {
  const requestBody = {
    model: options.model,
    lookbackHours,
    countries: countries.map((country) => ({
      key: country.key,
      label: country.label,
      countryCode: country.countryCode,
      count: country.count,
      severityScore: country.severityScore ?? null,
      stories: dedupeStories(country.stories ?? [])
        .slice(0, GEOPOLITICAL_COUNTRY_SUMMARY_SOURCE_LIMIT)
        .map((story) => ({
          title: story.title,
          publisher: story.publisher,
          link: story.link,
          publishedAt: story.publishedAt,
          feedSource: story.feedSource,
          eventLabel: story.eventLabel,
          severityScore: story.severityScore ?? null,
          locationLabel: story.locationLabel,
        })),
    })),
  };
  recordOpenAIDebugPayload('geopolitical-country-summaries', requestBody);

  const res = await fetch(`${OPENAI}/geopolitical-country-summaries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const payload = (await res.json().catch(() => null)) as { error?: string; summaries?: GeopoliticalCountrySummaryAssessment[] } | null;
  if (!res.ok) {
    throw new Error(payload?.error ?? `Geopolitical country summary generation failed: ${res.status}`);
  }

  return Array.isArray(payload?.summaries) ? payload.summaries : [];
}

function applyCountryHotspotSummaries(
  countries: CountryNewsCount[],
  assessments: GeopoliticalCountrySummaryAssessment[]
): CountryNewsCount[] {
  const assessmentByCountryCode = new Map(
    assessments
      .filter((assessment) => /^[A-Z]{2}$/.test(String(assessment.countryCode ?? '').toUpperCase()))
      .map((assessment) => [String(assessment.countryCode).toUpperCase(), assessment] as const)
  );

  return countries.map((country) => {
    const dedupedStories = dedupeStories(country.stories ?? []);
    if (!dedupedStories.length || country.count <= 0) {
      return {
        ...country,
        hotspotSummary: undefined,
        hotspotSummarySources: undefined,
      };
    }

    const assessment = assessmentByCountryCode.get(country.countryCode.toUpperCase());
    const summary = typeof assessment?.summary === 'string' ? assessment.summary.trim() : '';
    const hotspotSummary = summary || buildFallbackCountryHotspotSummary(country);

    return {
      ...country,
      hotspotSummary,
      hotspotSummarySources: resolveCountrySummarySources(dedupedStories, assessment?.sourceLinks),
    };
  });
}

function resolveCountrySummarySources(stories: NewsItem[], sourceLinks?: string[]): NewsItem[] {
  const dedupedStories = dedupeStories(stories);
  if (!dedupedStories.length) return [];

  const storiesByLink = new Map(
    dedupedStories.map((story) => [canonicalizeStoryLink(story.link), story] as const)
  );

  const mappedFromLinks = Array.isArray(sourceLinks)
    ? sourceLinks.flatMap((link) => {
        const normalizedLink = canonicalizeStoryLink(String(link ?? ''));
        const story = storiesByLink.get(normalizedLink);
        return story ? [story] : [];
      })
    : [];

  const selectedSources = dedupeStories(mappedFromLinks).slice(0, GEOPOLITICAL_COUNTRY_SUMMARY_DISPLAY_SOURCE_LIMIT);
  if (selectedSources.length > 0) return selectedSources;

  return dedupedStories.slice(0, GEOPOLITICAL_COUNTRY_SUMMARY_DISPLAY_SOURCE_LIMIT);
}

function buildFallbackCountryHotspotSummary(country: CountryNewsCount): string {
  const dedupedStories = dedupeStories(country.stories ?? []);
  const topEventLabels = dedupedStories
    .slice(0, 3)
    .map((story) => (story.eventLabel?.trim() || story.title.trim()).replace(/\.$/, ''))
    .filter(Boolean);

  if (!topEventLabels.length) {
    return `In ${country.label}, recent reporting indicates active geopolitical tension, but specific event detail is limited in the current feed.`;
  }

  if (topEventLabels.length === 1) {
    return `In ${country.label}, current reporting is centered on ${topEventLabels[0]}.`;
  }

  if (topEventLabels.length === 2) {
    return `In ${country.label}, current reporting highlights ${topEventLabels[0]} and ${topEventLabels[1]}.`;
  }

  return `In ${country.label}, current reporting highlights ${topEventLabels[0]}, ${topEventLabels[1]}, and ${topEventLabels[2]}.`;
}

async function extractGeopoliticalHeadlineAssessments(
  headlines: NewsItem[],
  lookbackHours: number,
  options: GeopoliticalMapOptions
): Promise<GeopoliticalHeadlineAssessment[]> {
  const headlineIds = headlines.map((headline, index) => ({
    title: headline.title,
    link: `headline-${index + 1}`,
    originalLink: headline.link,
  }));
  const originalLinkByHeadlineId = new Map(
    headlineIds.map((headline) => [headline.link, headline.originalLink] as const)
  );
  const requestBody = {
    model: options.model,
    systemPrompt: options.systemPrompt ?? '',
    lookbackHours,
    headlines: headlineIds.map(({ title, link }) => ({ title, link })),
    supportedCountries: COUNTRY_NEWS_MONITORS.map((country) => ({
      code: country.countryCode,
      label: country.label,
    })),
  };
  recordOpenAIDebugPayload('geopolitical-events', requestBody);

  const res = await fetch(`${OPENAI}/geopolitical-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const payload = (await res.json().catch(() => null)) as { error?: string; events?: GeopoliticalHeadlineAssessment[] } | null;
  if (!res.ok) {
    throw new Error(payload?.error ?? `Geopolitical headline extraction failed: ${res.status}`);
  }

  if (!Array.isArray(payload?.events)) return [];

  return payload.events.flatMap((event): GeopoliticalHeadlineAssessment[] => {
    const headlineId = typeof event.link === 'string' ? event.link.trim() : '';
    const originalLink = originalLinkByHeadlineId.get(headlineId);
    if (!originalLink) return [];

    return [{
      ...event,
      link: originalLink,
    }];
  });
}

function applyHeadlineAssessments(
  headlines: NewsItem[],
  assessments: GeopoliticalHeadlineAssessment[],
  options: { skipLexicalGate?: boolean } = {}
): NewsItem[] {
  const assessmentByLink = new Map(
    assessments
      .filter((assessment) => typeof assessment.link === 'string' && assessment.link.trim())
      .map((assessment) => [canonicalizeStoryLink(assessment.link), assessment] as const)
  );

  return headlines.flatMap((headline): NewsItem[] => {
    const assessment = assessmentByLink.get(canonicalizeStoryLink(headline.link));
    if (!assessment) return [];
    if (!options.skipLexicalGate && isClearlyNonGeopoliticalHeadline(headline.title)) return [];

    const countryCodes = resolveHeadlineCountryCodes({
      ...headline,
      countryCodes: assessment.countryCodes,
      locationLabel: assessment.locationLabel,
    });
    const severityScore = normalizeGeopoliticalSeverityScore(assessment.severityScore);
    if (!countryCodes.length || severityScore <= 0) return [];

    return [{
      ...headline,
      locationLabel: assessment.locationLabel?.trim() || countryCodes.map((code) => COUNTRY_MONITOR_BY_CODE.get(code)?.label ?? code).join(', '),
      countryCodes,
      severityScore,
      eventKey: normalizeGeopoliticalEventKey(assessment.eventKey),
      eventLabel: assessment.eventLabel?.trim() || headline.title.trim(),
    }];
  });
}

const GEOPOLITICAL_EXCLUSION_TERMS = [
  'opinion',
  'analysis',
  'analyst',
  'preview',
  'commentary',
  'interview',
  'what to know',
  'how to watch',
  'report says',
  'research note',
  'column',
  'editorial',
  'live updates',
  'live blog',
  'ticker',
  'morning news',
  'week ahead',
  'what we know',
  'explainer',
  'podcast',
] as const;

const GEOPOLITICAL_IMPACT_ONLY_TERMS = [
  'oil',
  'crude',
  'gas prices',
  'stocks',
  'shares',
  'bonds',
  'investors',
  'markets',
  'earnings',
  'company',
  'companies',
  'business',
  'airline',
  'airlines',
  'freight',
  'shipping disruption',
  'supply chain disruption',
  'travel advisory',
  'flight',
  'flights',
  'outlook',
  'forecast',
] as const;

const GEOPOLITICAL_HARD_EVENT_TERMS = [
  'attack',
  'airstrike',
  'air strike',
  'missile',
  'drone',
  'raid',
  'troops',
  'deployment',
  'sanction',
  'ceasefire',
  'truce',
  'protest',
  'civil unrest',
  'clash',
  'war',
  'invasion',
  'military',
  'coup',
  'detain',
  'detention',
  'arrest',
  'embargo',
  'blockade',
  'martial law',
  'state of emergency',
  'shell',
  'bombard',
  'hostage',
  'expel',
  'cross border',
  'border clash',
  'territorial dispute',
  'border dispute',
  'nuclear threat',
  'nuclear site',
  'nuclear facility',
] as const;

const GEOPOLITICAL_DIPLOMACY_ONLY_TERMS = ['talks', 'summit', 'meeting', 'warning', 'warns', 'comment', 'comments', 'urges', 'urge', 'calls for'] as const;
const GEOPOLITICAL_LABOR_STRIKE_TERMS = ['worker', 'workers', 'union', 'dockworker', 'dockworkers', 'labor', 'port strike'] as const;

function normalizeAssessmentCountryCodes(countryCodes?: string[], locationLabel?: string): string[] {
  const normalizedCodes = Array.from(
    new Set(
      (countryCodes ?? [])
        .map((value) => String(value ?? '').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase())
        .filter((value) => COUNTRY_MONITOR_BY_CODE.has(value))
    )
  );

  if (normalizedCodes.length) {
    return normalizedCodes;
  }

  if (typeof locationLabel === 'string' && locationLabel.trim()) {
    const matchedCountry = COUNTRY_MONITOR_BY_NORMALIZED_NAME.get(normalizeGeoCountryName(locationLabel));
    if (matchedCountry) return [matchedCountry.countryCode];

    const codesFromLocationLabel = collectCountryCodesFromText(locationLabel);
    if (codesFromLocationLabel.length) {
      return codesFromLocationLabel;
    }
  }

  return [];
}

function resolveHeadlineCountryCodes(
  headline: Pick<NewsItem, 'countryCodes' | 'locationLabel' | 'title'>
): string[] {
  const assessmentCountryCodes = normalizeAssessmentCountryCodes(headline.countryCodes, headline.locationLabel);
  if (assessmentCountryCodes.length) {
    return assessmentCountryCodes;
  }

  return collectCountryCodesFromText(headline.title);
}

function resolveSourceCountryMetadata(sourceCountry: string): {
  countryCodes: string[];
  sourceCountryCode: string | null;
  sourceCountryLabel: string | null;
} {
  const countryCodes = resolveCountryCodesFromSourceCountry(sourceCountry);
  const sourceCountryCode = countryCodes[0] ?? null;
  const sourceCountryLabel = sourceCountryCode ? COUNTRY_MONITOR_BY_CODE.get(sourceCountryCode)?.label ?? null : null;

  return {
    countryCodes,
    sourceCountryCode,
    sourceCountryLabel,
  };
}

function resolveCountryCodesFromSourceCountry(sourceCountry: string): string[] {
  const compact = sourceCountry.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(compact) && COUNTRY_MONITOR_BY_CODE.has(compact)) {
    return [compact];
  }

  const iso3ToIso2: Record<string, string> = {
    USA: 'US', CAN: 'CA', MEX: 'MX', BRA: 'BR', ARG: 'AR',
    GBR: 'GB', FRA: 'FR', DEU: 'DE', ITA: 'IT', ESP: 'ES', SWE: 'SE',
    UKR: 'UA', RUS: 'RU', BLR: 'BY', TUR: 'TR',
    IRN: 'IR', IRQ: 'IQ', SYR: 'SY', LBN: 'LB', YEM: 'YE', SAU: 'SA',
    ARE: 'AE', ISR: 'IL', EGY: 'EG', SDN: 'SD', ETH: 'ET', ZAF: 'ZA', NGA: 'NG',
    AFG: 'AF', PAK: 'PK', IND: 'IN', CHN: 'CN', TWN: 'TW', JPN: 'JP',
    KOR: 'KR', MMR: 'MM', VNM: 'VN', SGP: 'SG', IDN: 'ID', PHL: 'PH', AUS: 'AU',
  };
  if (/^[A-Z]{3}$/.test(compact) && iso3ToIso2[compact]) {
    return [iso3ToIso2[compact]];
  }

  const normalizedSource = normalizeGeoCountryName(sourceCountry);
  if (!normalizedSource) return [];

  const directMatch = COUNTRY_MONITOR_BY_NORMALIZED_NAME.get(normalizedSource);
  if (directMatch) return [directMatch.countryCode];

  return collectCountryCodesFromText(sourceCountry);
}

function fallbackHeadlineAssessments(headlines: NewsItem[]): GeopoliticalHeadlineAssessment[] {
  return headlines.flatMap((headline): GeopoliticalHeadlineAssessment[] => {
    const title = headline.title.trim();
    if (!title || !isLikelyGeopoliticalEventHeadline(title)) return [];

    const fallbackCountryCodes = resolveHeadlineCountryCodes(headline);
    if (!fallbackCountryCodes.length) return [];

    const eventLabel = headline.eventLabel?.trim() || title;
    const severityScore = normalizeGeopoliticalSeverityScore(headline.severityScore ?? estimateHeadlineSeverityScore(title));
    if (severityScore <= 0) return [];

    const resolvedLocationLabel = fallbackCountryCodes
      .map((code) => COUNTRY_MONITOR_BY_CODE.get(code)?.label ?? code)
      .join(', ');
    if (!resolvedLocationLabel) return [];

    return [{
      link: headline.link,
      locationLabel: resolvedLocationLabel,
      countryCodes: fallbackCountryCodes,
      severityScore,
      eventKey: buildFallbackGeopoliticalEventKey({
        ...headline,
        title,
        eventLabel,
        locationLabel: resolvedLocationLabel,
        countryCodes: fallbackCountryCodes,
      }),
      eventLabel,
    }];
  });
}

function isLikelyGeopoliticalEventHeadline(title: string): boolean {
  const normalized = normalizeHeadlineForMatching(title);
  if (GEOPOLITICAL_EXCLUSION_TERMS.some((term) => normalized.includes(term))) {
    return false;
  }

  const hasHardEventTerm = GEOPOLITICAL_HARD_EVENT_TERMS.some((term) => normalized.includes(term));
  const isLaborStrike = normalized.includes('strike') && GEOPOLITICAL_LABOR_STRIKE_TERMS.some((term) => normalized.includes(term));
  if (isLaborStrike && !normalized.includes('missile strike') && !normalized.includes('air strike') && !normalized.includes('airstrike')) {
    return false;
  }
  if (GEOPOLITICAL_IMPACT_ONLY_TERMS.some((term) => normalized.includes(term)) && !hasHardEventTerm) {
    return false;
  }
  if (GEOPOLITICAL_DIPLOMACY_ONLY_TERMS.some((term) => normalized.includes(term)) && !hasHardEventTerm) {
    return false;
  }

  return hasHardEventTerm;
}

function isClearlyNonGeopoliticalHeadline(title: string): boolean {
  const normalized = normalizeHeadlineForMatching(title);
  if (!normalized) return true;
  if (GEOPOLITICAL_EXCLUSION_TERMS.some((term) => normalized.includes(term))) return true;

  const hasHardEventTerm = GEOPOLITICAL_HARD_EVENT_TERMS.some((term) => normalized.includes(term));
  const isLaborStrike = normalized.includes('strike') && GEOPOLITICAL_LABOR_STRIKE_TERMS.some((term) => normalized.includes(term));
  if (isLaborStrike && !normalized.includes('missile strike') && !normalized.includes('air strike') && !normalized.includes('airstrike')) {
    return true;
  }
  if (GEOPOLITICAL_IMPACT_ONLY_TERMS.some((term) => normalized.includes(term)) && !hasHardEventTerm) {
    return true;
  }
  if (GEOPOLITICAL_DIPLOMACY_ONLY_TERMS.some((term) => normalized.includes(term)) && !hasHardEventTerm) {
    return true;
  }

  return false;
}

function estimateHeadlineSeverityScore(title: string): number {
  const normalized = normalizeHeadlineForMatching(title);
  const highImpactTerms = ['war', 'invasion', 'airstrike', 'missile', 'drone', 'attack', 'coup', 'nuclear', 'blockade'];
  if (highImpactTerms.some((term) => normalized.includes(term))) return 8;

  const elevatedTerms = ['sanction', 'troops', 'border', 'ceasefire', 'raid', 'clash', 'protest', 'tariff', 'embargo', 'strike'];
  if (elevatedTerms.some((term) => normalized.includes(term))) return 5;

  return 2;
}

function normalizeGeopoliticalSeverityScore(value: number | string | null | undefined): number {
  const numericValue = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));
  if (!Number.isFinite(numericValue) || numericValue < 1) return 0;
  if (numericValue > 10) {
    return clampNumber(Math.round(numericValue / 10), 1, 10);
  }
  return clampNumber(Math.round(numericValue), 1, 10);
}

function readPersistedGeopoliticalMapDataset(cacheKey: string): GeopoliticalMapDataset | null {
  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.localStorage.getItem(`${GEOPOLITICS_MAP_CACHE_STORAGE_PREFIX}${encodeURIComponent(cacheKey)}`);
    if (!rawValue) return null;

    const payload = JSON.parse(rawValue) as { expiresAt?: number; dataset?: GeopoliticalMapDataset } | null;
    if (!payload?.dataset || typeof payload.expiresAt !== 'number') return null;
    if (payload.expiresAt <= Date.now()) {
      window.localStorage.removeItem(`${GEOPOLITICS_MAP_CACHE_STORAGE_PREFIX}${encodeURIComponent(cacheKey)}`);
      return null;
    }

    return payload.dataset;
  } catch {
    return null;
  }
}

function writePersistedGeopoliticalMapDataset(cacheKey: string, dataset: GeopoliticalMapDataset): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      `${GEOPOLITICS_MAP_CACHE_STORAGE_PREFIX}${encodeURIComponent(cacheKey)}`,
      JSON.stringify({
        expiresAt: Date.now() + GEOPOLITICS_MAP_CACHE_TTL_MS,
        dataset,
      })
    );
  } catch {
    // Ignore storage quota or serialization errors and fall back to in-memory caching.
  }
}

function collectCountryCodesFromText(value: string): string[] {
  const normalized = normalizeHeadlineForMatching(value);
  return Array.from(
    new Set(
      COUNTRY_NEWS_MONITORS.flatMap((country) => {
        const aliases = COUNTRY_LOCATION_ALIASES[country.key] ?? [country.label];
        const matched = aliases.some((alias) => {
          const normalizedAlias = normalizeHeadlineForMatching(alias);
          if (!normalizedAlias) return false;
          return new RegExp(`\\b${escapeRegex(normalizedAlias)}\\b`, 'i').test(normalized);
        });
        return matched ? [country.countryCode] : [];
      })
    )
  );
}

function buildRegionalDatasetFromCountries(countries: CountryNewsCount[], source: string, query: string): RegionalNewsCount[] {
  return REGIONAL_NEWS_QUERIES.map((region): RegionalNewsCount => {
    const regionCountries = countries.filter((country) => country.region === region.key);
    const stories = clusterGeopoliticalStories(regionCountries.flatMap((country) => country.stories ?? []));

    return {
      key: region.key,
      label: region.label,
      shortLabel: region.shortLabel,
      count: regionCountries.reduce((sum, country) => sum + country.count, 0),
      query,
      source,
      latestAt: stories[0]?.publishedAt ?? null,
      sampleTitle: stories[0]?.title,
      samplePublisher: stories[0]?.publisher,
      stories,
    };
  });
}

function canonicalizeStoryLink(link: string): string {
  try {
    const url = new URL(link);
    url.hash = '';
    return url.toString();
  } catch {
    return link.trim();
  }
}

function dedupeStories(stories: NewsItem[]): NewsItem[] {
  return Array.from(
    new Map(
      stories
        .filter((story) => Boolean(story.link && story.title))
        .sort((a, b) => b.publishedAt - a.publishedAt)
        .map((story) => [canonicalizeStoryLink(story.link), story] as const)
    ).values()
  );
}

function dedupeGeopoliticalCandidateStories(stories: NewsItem[]): NewsItem[] {
  const byLink = new Map<string, NewsItem>();
  const byTitleFingerprint = new Map<string, NewsItem[]>();

  for (const story of stories
    .filter((candidate) => Boolean(candidate.link && candidate.title))
    .sort((a, b) => b.publishedAt - a.publishedAt)
  ) {
    const canonicalLink = canonicalizeStoryLink(story.link);
    const existingByLink = byLink.get(canonicalLink);
    if (existingByLink) {
      const merged = mergeDuplicateNewsItems(existingByLink, story);
      byLink.set(canonicalLink, merged);
      continue;
    }

    const titleFingerprint = buildHeadlineFingerprint(story.title);
    const fingerprintBucket = byTitleFingerprint.get(titleFingerprint) ?? [];
    const existingByTitle = fingerprintBucket.find(
      (candidate) => Math.abs((candidate.publishedAt - story.publishedAt) / (60 * 60 * 1000)) <= 18
    );

    if (existingByTitle) {
      const merged = mergeDuplicateNewsItems(existingByTitle, story);
      const mergedLink = canonicalizeStoryLink(merged.link);
      byLink.delete(canonicalizeStoryLink(existingByTitle.link));
      byLink.set(mergedLink, merged);
      const candidateIndex = fingerprintBucket.indexOf(existingByTitle);
      if (candidateIndex >= 0) fingerprintBucket[candidateIndex] = merged;
      byTitleFingerprint.set(titleFingerprint, fingerprintBucket);
      continue;
    }

    byLink.set(canonicalLink, story);
    fingerprintBucket.push(story);
    byTitleFingerprint.set(titleFingerprint, fingerprintBucket);
  }

  return [...byLink.values()].sort((a, b) => b.publishedAt - a.publishedAt);
}

function buildHeadlineFingerprint(title: string): string {
  return normalizeHeadlineForMatching(title)
    .split(' ')
    .filter((token) => token.length > 2 && !GEOPOLITICAL_EVENT_KEY_STOPWORDS.has(token))
    .slice(0, 12)
    .join(' ');
}

function mergeDuplicateNewsItems(existing: NewsItem, incoming: NewsItem): NewsItem {
  const preferred = incoming.publishedAt >= existing.publishedAt ? incoming : existing;
  const fallback = preferred === incoming ? existing : incoming;
  const mergedCountryCodes = Array.from(new Set([
    ...(preferred.countryCodes ?? []),
    ...(fallback.countryCodes ?? []),
  ])).sort();

  return {
    ...preferred,
    title: preferred.title || fallback.title,
    publisher: preferred.publisher || fallback.publisher,
    link: preferred.link || fallback.link,
    publishedAt: Math.max(preferred.publishedAt, fallback.publishedAt),
    feedSource: resolveMergedFeedSource(preferred.feedSource, fallback.feedSource),
    sourceCountry: preferred.sourceCountry ?? fallback.sourceCountry,
    sourceCountryCode: preferred.sourceCountryCode ?? fallback.sourceCountryCode,
    sourceCountryLabel: preferred.sourceCountryLabel ?? fallback.sourceCountryLabel,
    thumbnail: preferred.thumbnail ?? fallback.thumbnail,
    snippet: preferred.snippet ?? fallback.snippet,
    tickers: preferred.tickers?.length ? preferred.tickers : fallback.tickers,
    locationLabel: preferred.locationLabel?.trim()
      || fallback.locationLabel?.trim()
      || mergedCountryCodes.map((code) => COUNTRY_MONITOR_BY_CODE.get(code)?.label ?? code).join(', ')
      || undefined,
    countryCodes: mergedCountryCodes.length ? mergedCountryCodes : undefined,
    severityScore: blendGeopoliticalSeverityScores(preferred.severityScore, fallback.severityScore),
    eventKey: preferred.eventKey || fallback.eventKey,
    eventLabel: preferred.eventLabel || fallback.eventLabel,
  };
}

function formatGeopoliticalFeedSourceLabel(headlines: NewsItem[]): string {
  const feedSources = new Set(headlines.map((headline) => headline.feedSource).filter(Boolean));
  const labels: string[] = [];
  if (feedSources.has('gdelt')) labels.push('GDELT DOC 2.0');
  if (feedSources.has('yahoo-finance')) labels.push('Yahoo Finance News Feed');
  return labels.join(' + ') || 'Yahoo Finance News Feed';
}

function clusterGeopoliticalStories(stories: NewsItem[]): NewsItem[] {
  const clusters = new Map<string, NewsItem>();

  for (const story of stories
    .filter((candidate) => Boolean(candidate.link && candidate.title) && !isClearlyNonGeopoliticalHeadline(candidate.title))
    .sort((a, b) => b.publishedAt - a.publishedAt)
  ) {
    const clusterKey = resolveGeopoliticalStoryClusterKey(story, clusters);
    const existing = clusters.get(clusterKey);
    if (!existing) {
      clusters.set(clusterKey, {
        ...story,
        eventKey: clusterKey,
        eventLabel: story.eventLabel?.trim() || story.title.trim(),
        countryCodes: Array.from(new Set(story.countryCodes ?? [])).sort(),
      });
      continue;
    }

    const mergedCountryCodes = Array.from(new Set([...(existing.countryCodes ?? []), ...(story.countryCodes ?? [])])).sort();
    const representative = story.publishedAt >= existing.publishedAt ? story : existing;
    clusters.set(clusterKey, {
      ...representative,
      countryCodes: mergedCountryCodes,
      severityScore: blendGeopoliticalSeverityScores(existing.severityScore, story.severityScore),
      locationLabel: representative.locationLabel?.trim()
        || existing.locationLabel?.trim()
        || story.locationLabel?.trim()
        || mergedCountryCodes.map((code) => COUNTRY_MONITOR_BY_CODE.get(code)?.label ?? code).join(', '),
      eventKey: clusterKey,
      eventLabel: representative.eventLabel?.trim() || existing.eventLabel?.trim() || story.eventLabel?.trim() || representative.title.trim(),
      feedSource: resolveMergedFeedSource(existing.feedSource, story.feedSource),
    });
  }

  return [...clusters.values()].sort((a, b) => b.publishedAt - a.publishedAt);
}

function resolveGeopoliticalStoryClusterKey(story: NewsItem, clusters: Map<string, NewsItem>): string {
  const baseKey = buildGeopoliticalEventClusterKey(story);

  for (let index = 0; index < 12; index += 1) {
    const key = index === 0 ? baseKey : `${baseKey}::${index + 1}`;
    const existing = clusters.get(key);
    if (!existing) return key;
    if (shouldMergeGeopoliticalStories(existing, story)) return key;
  }

  return `${baseKey}::overflow`;
}

function resolveMergedFeedSource(
  primary: NewsItem['feedSource'],
  secondary: NewsItem['feedSource']
): NewsItem['feedSource'] {
  const sources = new Set([primary, secondary].filter(Boolean));
  if (sources.has('gdelt')) return 'gdelt';
  if (sources.has('yahoo-finance')) return 'yahoo-finance';
  return primary ?? secondary;
}

function blendGeopoliticalSeverityScores(
  a: number | string | null | undefined,
  b: number | string | null | undefined
): number {
  const left = normalizeGeopoliticalSeverityScore(a);
  const right = normalizeGeopoliticalSeverityScore(b);
  if (!left && !right) return 0;
  if (!left) return right;
  if (!right) return left;

  const max = Math.max(left, right);
  const avg = (left + right) / 2;
  return clampNumber(Math.round((max * 0.55) + (avg * 0.45)), 1, 10);
}

function shouldMergeGeopoliticalStories(existing: NewsItem, incoming: NewsItem): boolean {
  const publishedGapHours = Math.abs((existing.publishedAt - incoming.publishedAt) / (60 * 60 * 1000));
  if (publishedGapHours > 18) return false;

  const existingCountries = [...new Set(existing.countryCodes ?? [])].sort().join(',');
  const incomingCountries = [...new Set(incoming.countryCodes ?? [])].sort().join(',');
  if (existingCountries && incomingCountries && existingCountries !== incomingCountries) return false;

  const existingLocation = normalizeGeoCountryName(existing.locationLabel ?? '');
  const incomingLocation = normalizeGeoCountryName(incoming.locationLabel ?? '');
  const sameLocation = Boolean(existingLocation && incomingLocation && existingLocation === incomingLocation);
  const sharedTokens = countSharedEventDescriptorTokens(existing, incoming);
  const existingIncidentKey = extractIncidentEventKey(existing.eventKey);
  const incomingIncidentKey = extractIncidentEventKey(incoming.eventKey);

  if (sharedTokens >= 3) return true;
  if (sameLocation && sharedTokens >= 2 && publishedGapHours <= 12) return true;
  if (sameLocation && publishedGapHours <= 4 && existingIncidentKey && existingIncidentKey === incomingIncidentKey) return true;

  return false;
}

function buildGeopoliticalEventClusterKey(story: NewsItem): string {
  const explicitKey = normalizeGeopoliticalEventKey(story.eventKey);
  const dayBucket = Math.floor((story.publishedAt || 0) / (24 * 60 * 60 * 1000));
  const countryPart = [...new Set(story.countryCodes ?? [])].sort().join('-')
    || normalizeGeoCountryName(story.locationLabel ?? '').replace(/\s+/g, '-')
    || 'global';
  if (explicitKey) return `${dayBucket}|${countryPart}|${explicitKey}`;
  return buildFallbackGeopoliticalEventKey(story);
}

function buildFallbackGeopoliticalEventKey(story: Pick<NewsItem, 'title' | 'publishedAt' | 'countryCodes' | 'locationLabel' | 'eventLabel'>): string {
  const bucket = Math.floor((story.publishedAt || 0) / (4 * 60 * 60 * 1000));
  const countryPart = [...new Set(story.countryCodes ?? [])].sort().join('-')
    || normalizeGeoCountryName(story.locationLabel ?? '').replace(/\s+/g, '-')
    || 'global';
  const descriptor = normalizeHeadlineForMatching(story.eventLabel || story.title)
    .split(' ')
    .filter((token) => token.length > 2 && !GEOPOLITICAL_EVENT_KEY_STOPWORDS.has(token))
    .slice(0, 6)
    .join('-')
    || 'event';
  return `${bucket}|${countryPart}|${descriptor}`;
}

function normalizeGeopoliticalEventKey(value: string | null | undefined): string {
  const normalized = normalizeHeadlineForMatching(value ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 12)
    .join('-');
  return normalized || '';
}

function extractIncidentEventKey(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const withoutSuffix = raw.split('::')[0] ?? raw;
  const parts = withoutSuffix.split('|');
  const incident = parts.length >= 3 ? parts.slice(2).join('|') : withoutSuffix;
  return normalizeGeopoliticalEventKey(incident);
}

function normalizeGeoCountryName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeadlineForMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractEventDescriptorTokens(story: Pick<NewsItem, 'title' | 'eventLabel'>): string[] {
  return normalizeHeadlineForMatching(story.eventLabel || story.title)
    .split(' ')
    .filter((token) => token.length > 2 && !GEOPOLITICAL_EVENT_KEY_STOPWORDS.has(token));
}

function countSharedEventDescriptorTokens(left: Pick<NewsItem, 'title' | 'eventLabel'>, right: Pick<NewsItem, 'title' | 'eventLabel'>): number {
  const leftTokens = new Set(extractEventDescriptorTokens(left));
  let shared = 0;

  for (const token of extractEventDescriptorTokens(right)) {
    if (leftTokens.has(token)) shared += 1;
  }

  return shared;
}

const GEOPOLITICAL_EVENT_KEY_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'after',
  'amid',
  'over',
  'near',
  'says',
  'warns',
  'urges',
  'officials',
  'official',
  'state',
  'government',
  'country',
  'countries',
]);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const size = Math.max(1, Math.trunc(chunkSize) || 1);
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function buildTopicFeedQueries(topicQuery: string): string[] {
  const normalizedTopic = topicQuery.trim().toLowerCase();
  if (!normalizedTopic || normalizedTopic === 'markets') {
    return ['markets'];
  }

  if (normalizedTopic === 'geopolitics') {
    return [...GEOPOLITICAL_TOPIC_QUERIES];
  }

  return [topicQuery.trim()];
}

function buildRegionalFeedQueries(regionRoots: string[], topicQuery: string): string[] {
  const topicQueries = buildTopicFeedQueries(topicQuery);
  if (topicQueries.length === 1 && topicQueries[0] === 'markets') {
    return regionRoots;
  }

  const locationRoots = regionRoots.map((root) => root.replace(/\b(markets?|stocks?)\b/gi, '').replace(/\s+/g, ' ').trim() || root);
  return Array.from(
    new Set(
      locationRoots.flatMap((location) => topicQueries.map((topic) => `${location} ${topic}`.trim()))
    )
  );
}

function buildRegionalNewsQueries(regionRoots: string[], topicQuery: string): string[] {
  const topicQueries = buildTopicFeedQueries(topicQuery);
  if (topicQueries.length === 1 && topicQueries[0] === 'markets') {
    return regionRoots;
  }

  const locationRoots = regionRoots.map((root) => root.replace(/\b(markets?|stocks?)\b/gi, '').replace(/\s+/g, ' ').trim() || root);
  return Array.from(
    new Set(
      locationRoots.flatMap((location) => topicQueries.map((topic) => `${location} ${topic}`.trim()))
    )
  );
}

function scaleValue(value: number | undefined, min: number, max: number, invert = false): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const normalized = (value - min) / (max - min);
  const score = invert ? 100 - normalized * 100 : normalized * 100;
  return clampNumber(score, 0, 100);
}

function averageNumbers(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!filtered.length) return null;
  return parseFloat((filtered.reduce((acc, value) => acc + value, 0) / filtered.length).toFixed(1));
}

function safeNumber(value: number | undefined): number {
  return value ?? 0;
}

function scoreSignal(score: number | null): MarketSentimentPillar['signal'] {
  if (score == null) return 'unavailable';
  if (score >= 60) return 'positive';
  if (score <= 40) return 'negative';
  return 'neutral';
}

function sentimentRegime(score: number | null): MarketSentimentSnapshot['regime'] {
  if (score == null) return 'NEUTRAL';
  if (score >= 75) return 'RISK-ON';
  if (score >= 60) return 'BULLISH';
  if (score >= 45) return 'NEUTRAL';
  if (score >= 30) return 'CAUTIOUS';
  return 'RISK-OFF';
}

function sentimentSummary(regime: MarketSentimentSnapshot['regime'], pillars: MarketSentimentPillar[]): string {
  const strongest = pillars
    .filter((pillar) => pillar.score != null)
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))[0];
  const weakest = pillars
    .filter((pillar) => pillar.score != null)
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0))[0];

  if (!strongest || !weakest) {
    return 'Sentiment is waiting for enough live market inputs.';
  }

  switch (regime) {
    case 'RISK-ON':
      return `${strongest.label} is leading and defensive signals remain subdued.`;
    case 'BULLISH':
      return `${strongest.label} is supportive, though the tape is not fully euphoric.`;
    case 'NEUTRAL':
      return `${strongest.label} is offset by softer ${weakest.label.toLowerCase()} inputs.`;
    case 'CAUTIOUS':
      return `${weakest.label} is deteriorating faster than other pillars can offset.`;
    case 'RISK-OFF':
      return `${weakest.label} is dominant and risk appetite is broadly defensive.`;
    default:
      return 'Sentiment is mixed across the current market pillars.';
  }
}

function formatSignedPercent(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatSignedNumber(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return '--';
  return value.toFixed(value < 10 ? 2 : 1);
}

function formatSpread(left: number | undefined, right: number | undefined): string {
  if (left == null || right == null) return '--';
  const spread = left - right;
  return `${spread >= 0 ? '+' : ''}${spread.toFixed(2)} pts`;
}

function getFredErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;

  const message = error.message;
  if (
    message.includes('FRED is not configured on this device yet.') ||
    message.includes('VITE_FRED_API_KEY') ||
    message.includes('FRED_API_KEY')
  ) {
    return 'FRED is not configured on this device yet. Add your key in Connections to unlock macro data.';
  }

  if (message.includes('Access Denied') || message.includes('FRED 403')) {
    return 'FRED is rejecting requests from this runtime environment (HTTP 403), so macro data cannot load here right now.';
  }

  if (message.includes('FRED 429') || message.includes('Too Many Requests')) {
    return 'FRED is rate-limiting requests right now. Try again in a moment.';
  }

  if (message.includes('FRED')) {
    return 'FRED data is temporarily unavailable.';
  }

  return undefined;
}
