import {
  buildAIDiscoveryDashboard,
  buildDiscoveryDashboard,
  buildThemeDiscoverySignalPayload,
} from '../../src/utils/themeDiscoveryEngine.ts';
import { isCachedDiscoverySnapshot } from '../../src/utils/discoveryCache.ts';
import { sanitizePersistedCountryCounts } from '../../src/utils/geopoliticalCache.ts';
import { attachSecEvidenceToExistingThemes, selectSecOpportunityEvidence, selectSecEvidenceForTheme } from '../../src/utils/secOpportunityEvidence.ts';

const now = Date.now();

function news(title: string, index: number, tickers: string[] = []) {
  return {
    title,
    publisher: 'Fixture Wire',
    link: `https://example.test/story-${index}`,
    publishedAt: now - index * 60_000,
    snippet: '',
    tickers,
    countryCodes: [],
  };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    marketNews: [],
    techNews: [],
    economyNews: [],
    energyNews: [],
    geopoliticsNews: [],
    countryCounts: [],
    predictions: [],
    predictionsUpdatedAt: new Date(now).toISOString(),
    sentiment: null,
    calendarEvents: [],
    portfolio: [],
    watchlist: [],
    quotes: [],
    ...overrides,
  } as any;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const bannedLabelTerms = new Set([
  'monthly',
  'hit',
  'will',
  'the',
  'world',
  'politics',
  'david',
  'lisnard',
  'july',
  'now',
]);

function assertNoBannedThemeLanguage(
  dashboard: ReturnType<typeof buildDiscoveryDashboard>,
  fixtureName: string,
) {
  for (const theme of dashboard.themes) {
    const words = `${theme.label} ${theme.keywords.join(' ')}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    const banned = words.find((word) => bannedLabelTerms.has(word));
    assert(!banned, `${fixtureName} leaked low-information token "${banned}" into theme language`);
  }
}

const monthlyHitInput = baseInput({
  marketNews: [
    news('Will the July monthly hit affect oil?', 1),
    news('Monthly oil hit expected now', 2),
    news('July report: will oil hit again?', 3),
  ],
});
const monthlyHitDashboard = buildDiscoveryDashboard(monthlyHitInput);
assert(monthlyHitDashboard.themes.length === 0, 'MONTHLY HIT fixture should be suppressed as incoherent');
assertNoBannedThemeLanguage(monthlyHitDashboard, 'MONTHLY HIT');

const publishingCadenceInput = baseInput({
  marketNews: [
    news('Second Quarter Results: Alpha Holdings Reports Revenue', 4, ['ALPHA']),
    news('Q2 Earnings Report: Beta Industries Posts Profit', 5, ['BETA']),
    news('Quarterly Update: Gamma Group Announces Results', 6, ['GAMMA']),
  ],
});
const publishingCadenceDashboard = buildDiscoveryDashboard(publishingCadenceInput);
assert(
  publishingCadenceDashboard.themes.length === 0,
  'Publishing cadence and earnings boilerplate should not form a theme',
);

const nameFragmentInput = baseInput({
  predictions: [
    {
      id: 'lisnard-1',
      question: 'Will David Lisnard win?',
      theme: 'Politics',
      category: 'World',
      subcategory: 'Profile',
      tags: [],
      leadingProbability: 20,
      leadingOutcome: 'Yes',
      url: 'https://example.test/lisnard-1',
      volume24hr: 1_000,
    },
    {
      id: 'lisnard-2',
      question: 'Will the world politics event feature David Lisnard?',
      theme: 'Politics',
      category: 'World',
      subcategory: 'Event',
      tags: [],
      leadingProbability: 30,
      leadingOutcome: 'Yes',
      url: 'https://example.test/lisnard-2',
      volume24hr: 1_000,
    },
    {
      id: 'lisnard-3',
      question: 'Now: David Lisnard monthly profile',
      theme: 'Politics',
      category: 'World',
      subcategory: 'Profile',
      tags: [],
      leadingProbability: 40,
      leadingOutcome: 'Yes',
      url: 'https://example.test/lisnard-3',
      volume24hr: 1_000,
    },
  ],
});
const nameFragmentDashboard = buildDiscoveryDashboard(nameFragmentInput);
assert(nameFragmentDashboard.themes.length === 0, 'WILL / THE and person-name fixture should be suppressed');
assertNoBannedThemeLanguage(nameFragmentDashboard, 'WILL / THE');

const energySecurityInput = baseInput({
  marketNews: [
    news('Energy Security Strategy Prioritizes Grid Resilience', 11),
    news('Energy Security Investment Expands Grid Storage', 12),
    news('Energy Security Planning Accelerates Power-Grid Upgrades', 13),
  ],
});
const energySecurityDashboard = buildDiscoveryDashboard(energySecurityInput);
assert(energySecurityDashboard.themes.length === 1, 'A coherent energy-security cluster should survive');
assert(
  energySecurityDashboard.themes[0].linkedAssets.every((asset: { symbol: string }) =>
    !['ITA', 'LMT', 'RTX', 'NOC', 'GD'].includes(asset.symbol)
  ),
  'Generic “security” text must not attach defense assets',
);

const oilSupplyInput = baseInput({
  marketNews: [
    news('Oil Supply Tightens as OPEC Cuts Exports', 16),
    news('OPEC Oil Supply Falls After Export Reductions', 17),
    news('Crude Oil Supply Risks Grow as OPEC Curbs Output', 18),
  ],
});
const oilSupplyDashboard = buildDiscoveryDashboard(oilSupplyInput);
assert(oilSupplyDashboard.themes.length === 1, 'A coherent oil-supply cluster should survive');
assert(
  oilSupplyDashboard.themes[0].linkedAssets.every((asset: { symbol: string }) => asset.symbol !== 'UNG'),
  'Oil-only evidence must not attach a natural-gas vehicle',
);

const semiconductorInput = baseInput({
  marketNews: [
    news('Semiconductor capacity expands as chipmakers raise capex', 21, ['XYZ']),
    news('Semiconductor capacity plans accelerate with new fabs', 22),
    news('Chipmakers expand semiconductor capacity amid capex boom', 23),
  ],
  quotes: [{ symbol: 'AAPL', shortName: 'Apple Inc.', regularMarketPrice: 200, regularMarketChangePercent: 0 }],
});
const semiconductorDashboard = buildDiscoveryDashboard(semiconductorInput);
assert(semiconductorDashboard.themes.length === 1, 'A coherent semiconductor-capacity cluster should survive');
const semiconductorTheme = semiconductorDashboard.themes[0];
assert(
  semiconductorTheme.label.toLowerCase().includes('semiconductor') &&
    semiconductorTheme.label.toLowerCase().includes('capacity'),
  `Expected an informative semiconductor-capacity label, received "${semiconductorTheme.label}"`,
);
assert(
  semiconductorTheme.linkedAssets.every((asset: { symbol: string }) => asset.symbol !== 'XYZ'),
  'A ticker supported by only one signal must not become a theme-level asset',
);
assert(
  semiconductorTheme.linkedAssets.every((asset: { symbol: string }) =>
    !['MSFT', 'AMZN', 'GOOGL'].includes(asset.symbol)
  ),
  'Semiconductor-only evidence must not attach cloud-platform assets',
);
assert(
  semiconductorTheme.summary.includes('Semiconductor Capacity is the common thread') &&
    semiconductorTheme.summary.includes('chipmakers raise capex'),
  `Theme summary must explain the validated evidence, received "${semiconductorTheme.summary}"`,
);
assert(
  semiconductorTheme.whyItMatters.includes('It matters because') &&
    semiconductorTheme.whyItMatters.includes('one signal type'),
  `Theme impact must disclose narrow evidence context, received "${semiconductorTheme.whyItMatters}"`,
);

const priceActionInput = baseInput({
  marketNews: [
    news('Broker adjusts price target after routine review', 24),
    news('Analyst adjusts price target in latest update', 25),
    news('Research firm adjusts price target after results', 26),
  ],
});
const priceActionSignalIds = buildThemeDiscoverySignalPayload(priceActionInput).signals.map((signal) => signal.id);
const priceActionDashboard = buildAIDiscoveryDashboard(priceActionInput, {
  generatedAt: new Date(now).toISOString(),
  model: 'fixture-model',
  themes: [{
    id: 'fixture-adjusts-price',
    label: 'Adjusts Price',
    summary: 'Routine price-target changes repeated across several headlines.',
    thesis: 'Fixture thesis',
    whyItMatters: 'Fixture relevance',
    whyItMattersSignalIds: priceActionSignalIds,
    actionSummary: 'Fixture action',
    portfolioAngle: 'Fixture portfolio',
    watchlistAngle: 'Fixture watchlist',
    opportunityAngle: 'Fixture opportunity',
    primaryRecommendation: 'Fixture recommendation',
    playbook: [],
    signalIds: priceActionSignalIds,
    linkedAssets: [],
    catalysts: [],
    invalidationSignals: [],
    watchItems: [],
    confidence: 60,
    importance: 55,
  }],
});
assert(
  priceActionDashboard.themes.length === 0,
  'The headline fragment "Adjusts Price" must be suppressed when no coherent market subject is available',
);

const adjustedSemiconductorInput = baseInput({
  marketNews: [
    news('Chipmaker adjusts price as semiconductor capacity expands', 27),
    news('Supplier adjusts price while semiconductor capacity grows', 28),
    news('Manufacturer adjusts price amid semiconductor capacity investment', 29),
  ],
});
const adjustedSemiconductorSignalIds = buildThemeDiscoverySignalPayload(adjustedSemiconductorInput).signals.map((signal) => signal.id);
const adjustedSemiconductorDashboard = buildAIDiscoveryDashboard(adjustedSemiconductorInput, {
  generatedAt: new Date(now).toISOString(),
  model: 'fixture-model',
  themes: [{
    id: 'fixture-adjusts-price-with-fallback',
    label: 'Adjusts Price',
    summary: 'Semiconductor capacity is expanding across chipmakers and suppliers.',
    thesis: 'Fixture thesis',
    whyItMatters: 'Semiconductor capacity expansion can change equipment demand and supply conditions.',
    whyItMattersSignalIds: adjustedSemiconductorSignalIds,
    actionSummary: 'Fixture action',
    portfolioAngle: 'Fixture portfolio',
    watchlistAngle: 'Fixture watchlist',
    opportunityAngle: 'Fixture opportunity',
    primaryRecommendation: 'Fixture recommendation',
    playbook: [],
    signalIds: adjustedSemiconductorSignalIds,
    linkedAssets: [],
    catalysts: [],
    invalidationSignals: [],
    watchItems: [],
    confidence: 75,
    importance: 75,
  }],
});
assert(adjustedSemiconductorDashboard.themes.length === 1, 'A coherent grounded fallback should preserve the AI-selected evidence cluster');
assert(
  adjustedSemiconductorDashboard.themes[0].label === 'Semiconductor Capacity',
  `"Adjusts Price" should fall back to "Semiconductor Capacity", received "${adjustedSemiconductorDashboard.themes[0].label}"`,
);

const validAiLabelDashboard = buildAIDiscoveryDashboard(semiconductorInput, {
  generatedAt: new Date(now).toISOString(),
  model: 'fixture-model',
  themes: [{
    id: 'fixture-valid-market-label',
    label: 'Semiconductor Capacity',
    summary: 'Chipmakers are expanding semiconductor capacity through new fab spending.',
    thesis: 'Fixture thesis',
    whyItMatters: 'Semiconductor capacity expansion can affect equipment demand and supply conditions.',
    whyItMattersSignalIds: buildThemeDiscoverySignalPayload(semiconductorInput).signals.map((signal) => signal.id),
    actionSummary: 'Fixture action',
    portfolioAngle: 'Fixture portfolio',
    watchlistAngle: 'Fixture watchlist',
    opportunityAngle: 'Fixture opportunity',
    primaryRecommendation: 'Fixture recommendation',
    playbook: [],
    signalIds: buildThemeDiscoverySignalPayload(semiconductorInput).signals.map((signal) => signal.id),
    linkedAssets: [],
    catalysts: [],
    invalidationSignals: [],
    watchItems: [],
    confidence: 75,
    importance: 75,
  }],
});
assert(
  validAiLabelDashboard.themes[0]?.label === 'Semiconductor Capacity',
  'A coherent, repeatedly evidenced market-theme label should remain eligible',
);

const signalIds = buildThemeDiscoverySignalPayload(semiconductorInput).signals.map((signal) => signal.id);
const aiDashboard = buildAIDiscoveryDashboard(semiconductorInput, {
  generatedAt: new Date(now).toISOString(),
  model: 'fixture-model',
  themes: [{
    id: 'fixture-ai-theme',
    label: 'MONTHLY HIT',
    summary: 'Chipmakers are accelerating new fab spending to expand semiconductor capacity.',
    thesis: 'Fixture thesis',
    whyItMatters: 'More semiconductor capacity can lift demand for chipmaking equipment as fab spending accelerates.',
    whyItMattersSignalIds: signalIds,
    actionSummary: 'Fixture action',
    portfolioAngle: 'Fixture portfolio',
    watchlistAngle: 'Fixture watchlist',
    opportunityAngle: 'Fixture opportunity',
    primaryRecommendation: 'Fixture recommendation',
    playbook: [],
    signalIds,
    linkedAssets: ['XYZ', 'NVDA'],
    catalysts: [],
    invalidationSignals: [],
    watchItems: [],
    confidence: 75,
    importance: 75,
  }],
});
assert(aiDashboard.themes.length === 1, 'A coherent AI-selected cluster should survive local validation');
assert(
  aiDashboard.themes[0].label.toLowerCase() === 'semiconductor capacity',
  `An invalid AI label should fall back to grounded cluster language, received "${aiDashboard.themes[0].label}"`,
);
assert(
  aiDashboard.themes[0].linkedAssets.every((asset) => asset.symbol !== 'XYZ'),
  'AI asset output must still meet cluster-level support thresholds',
);
assert(
  aiDashboard.themes[0].summary === 'Chipmakers are accelerating new fab spending to expand semiconductor capacity.' &&
    aiDashboard.themes[0].whyItMatters === 'More semiconductor capacity can lift demand for chipmaking equipment as fab spending accelerates.',
  'AI-selected discovery themes must retain concise, evidence-grounded market interpretation wording',
);

const ungroundedAiDashboard = buildAIDiscoveryDashboard(semiconductorInput, {
  generatedAt: new Date(now).toISOString(),
  model: 'fixture-model',
  themes: [{
    id: 'fixture-ungrounded-theme',
    label: 'Semiconductor Capacity',
    summary: 'Semiconductor capacity expansion will make AAPL the main beneficiary.',
    thesis: 'Fixture thesis',
    whyItMatters: 'Buy XYZ before this market trend accelerates.',
    whyItMattersSignalIds: signalIds,
    actionSummary: 'Fixture action',
    portfolioAngle: 'Fixture portfolio',
    watchlistAngle: 'Fixture watchlist',
    opportunityAngle: 'Fixture opportunity',
    primaryRecommendation: 'Fixture recommendation',
    playbook: [],
    signalIds,
    linkedAssets: ['XYZ'],
    catalysts: [],
    invalidationSignals: [],
    watchItems: [],
    confidence: 75,
    importance: 75,
  }],
});
assert(
  ungroundedAiDashboard.themes[0].summary.includes('Semiconductor Capacity is the common thread') &&
    ungroundedAiDashboard.themes[0].whyItMatters.includes('It matters because'),
  'Generic or recommendation-like AI copy must fall back to deterministic evidence wording',
);

const cachedAiSnapshot = {
  dashboard: aiDashboard,
  evidenceKey: 'fixture-evidence',
};
assert(isCachedDiscoverySnapshot(cachedAiSnapshot), 'A validated AI dashboard cache should be accepted');
assert(
  !isCachedDiscoverySnapshot(aiDashboard) &&
    !isCachedDiscoverySnapshot({ dashboard: null, evidenceKey: 'fixture-evidence' }) &&
    !isCachedDiscoverySnapshot({ dashboard: aiDashboard, evidenceKey: null }),
  'Plain, null, or incompatible discovery cache records must be treated as cache misses',
);

const validCachedCountry = {
  key: 'united-states',
  label: 'United States',
  shortLabel: 'US',
  countryCode: ' us ',
  region: 'north-america',
  count: 2,
  query: 'markets',
  source: 'Fixture cache',
  latestAt: now,
  x: 10,
  y: 20,
  stories: [news('Valid cached geopolitical story', 30), { title: null }],
};
const sanitizedCountries = sanitizePersistedCountryCounts([
  { count: 1, label: 'Legacy row without a country code' },
  validCachedCountry,
]);
assert(sanitizedCountries?.length === 1, 'Malformed cached country rows should be discarded');
assert(sanitizedCountries[0].countryCode === 'US', 'Cached country codes should be normalized');
assert(sanitizedCountries[0].stories?.length === 1, 'Malformed cached stories should be discarded');
assert(
  sanitizePersistedCountryCounts({ countries: [] }) === null &&
    sanitizePersistedCountryCounts([{ count: 1 }]) === null,
  'Malformed or legacy country-count cache shapes should be treated as cache misses',
);
const safeCachedCountryDashboard = buildDiscoveryDashboard(baseInput({
  countryCounts: sanitizePersistedCountryCounts([{ count: 1 }]) ?? [],
}));
assert(
  safeCachedCountryDashboard.stats.clusterCount === 0,
  'A malformed geopolitical cache must degrade to empty evidence instead of breaking discovery',
);

const recentDate = new Date(now).toISOString().slice(0, 10);
const secFixtureData = {
  status: 'ready',
  ticker: 'AAPL',
  identity: { ticker: 'AAPL', title: 'Apple Inc.', cik: '0000320193', verified: true, sourceUrl: 'https://www.sec.gov/files/company_tickers.json' },
  filings: [{
    accessionNumber: '0000320193-26-000001', form: '10-Q', filedDate: recentDate, reportPeriod: recentDate,
    primaryDocument: 'q.htm', filingUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/q.htm', isAmendment: false,
  }],
  metrics: {
    revenue: { metric: 'revenue', label: 'Revenue', value: 100, availability: 'reported', unit: 'USD', periodType: 'quarterly', reportPeriodStart: null, reportPeriodEnd: recentDate, filedDate: recentDate, form: '10-Q', accessionNumber: '0000320193-26-000001', taxonomy: 'us-gaap', concept: 'Revenue', frame: null, measurement: 'reported', sourceUrl: 'https://www.sec.gov' },
    operatingIncome: null, netIncome: null, cash: null, debt: null,
  },
} as any;
const selectedSecEvidence = selectSecOpportunityEvidence(['aapl', 'UNSUPPORTED'], {
  AAPL: secFixtureData,
  UNSUPPORTED: { status: 'unsupported', identity: null, filings: [], metrics: {} } as any,
});
assert(selectedSecEvidence.length === 1 && selectedSecEvidence[0].symbol === 'AAPL', 'Supported SEC evidence should be selected while unsupported symbols are excluded');
assert(selectedSecEvidence[0].metrics[0].value === 100 && selectedSecEvidence[0].url.includes('/Archives/'), 'SEC evidence should retain compact metrics and official provenance');
assert(selectSecOpportunityEvidence(['MSFT'], { AAPL: secFixtureData }).length === 0, 'Irrelevant SEC data must not enter the Opportunities evidence payload');
assert(selectSecOpportunityEvidence(['AAPL'], {}).length === 0, 'Unavailable SEC data must leave Opportunities evidence empty');
const existingTheme = { linkedAssets: [{ symbol: 'AAPL' }] } as any;
const attachedThemes = attachSecEvidenceToExistingThemes([existingTheme], selectedSecEvidence);
assert(attachedThemes.length === 1 && attachedThemes[0].filingEvidence?.length === 1, 'SEC evidence should annotate an existing matching theme');
assert(attachSecEvidenceToExistingThemes([], selectedSecEvidence).length === 0, 'SEC-only evidence must never create a new theme');
assert(selectSecEvidenceForTheme(selectedSecEvidence, ['MSFT']).length === 0, 'Unrelated SEC evidence must not reach theme guidance');
const guidanceSec = selectSecEvidenceForTheme([{ ...selectedSecEvidence[0], rawText: 'Not permitted', metrics: [
  { ...selectedSecEvidence[0].metrics[0], rawText: 'Not permitted' },
] }], ['AAPL']);
assert(guidanceSec.length === 1 && !JSON.stringify(guidanceSec).includes('Not permitted'), 'Guidance SEC context must be projected to compact fields, never raw filings');
assert(selectSecEvidenceForTheme([null, { ...selectedSecEvidence[0], url: 'https://example.test/not-sec' }], ['AAPL']).length === 0, 'Malformed or unofficial SEC context must be rejected');

console.log(JSON.stringify({
  suppressedLabels: ['MONTHLY HIT', 'SECOND QUARTER', 'WILL / THE', 'David Lisnard'],
  preservedTheme: semiconductorTheme.label,
  aiFallbackTheme: aiDashboard.themes[0].label,
  unrelatedAssetsSuppressed: true,
}));
