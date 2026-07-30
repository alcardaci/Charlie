import {
  buildAIDiscoveryDashboard,
  buildDiscoveryDashboard,
  buildThemeDiscoverySignalPayload,
} from '../../src/utils/themeDiscoveryEngine.ts';

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

const signalIds = buildThemeDiscoverySignalPayload(semiconductorInput).signals.map((signal) => signal.id);
const aiDashboard = buildAIDiscoveryDashboard(semiconductorInput, {
  generatedAt: new Date(now).toISOString(),
  model: 'fixture-model',
  themes: [{
    id: 'fixture-ai-theme',
    label: 'MONTHLY HIT',
    summary: 'Fixture summary',
    thesis: 'Fixture thesis',
    whyItMatters: 'Fixture why',
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

console.log(JSON.stringify({
  suppressedLabels: ['MONTHLY HIT', 'SECOND QUARTER', 'WILL / THE', 'David Lisnard'],
  preservedTheme: semiconductorTheme.label,
  aiFallbackTheme: aiDashboard.themes[0].label,
  unrelatedAssetsSuppressed: true,
}));
