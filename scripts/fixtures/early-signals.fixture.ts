import {
  buildEarlySignalsDashboard,
  canonicalizeEarlySignalEvidence,
  mergeEarlySignalEvidence,
} from '../../src/utils/earlySignalsEngine.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const asOf = Date.UTC(2026, 6, 30, 12, 0, 0);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function story(args: {
  title: string;
  publisher: string;
  daysAgo: number;
  index: number;
  snippet?: string;
  tickers?: string[];
  link?: string;
}) {
  return {
    title: args.title,
    publisher: args.publisher,
    link: args.link ?? `https://${args.publisher.toLowerCase().replace(/\s+/g, '-')}.test/story-${args.index}`,
    publishedAt: asOf - args.daysAgo * DAY_MS,
    snippet: args.snippet ?? '',
    tickers: args.tickers ?? [],
  };
}

const dataCenterStories = [
  story({
    title: 'Data center power constraints delay new capacity',
    publisher: 'Alpha Wire',
    daysAgo: 3,
    index: 1,
    snippet: 'Eaton equipment is named in a substation power-management order.',
    tickers: ['ETN', 'UNRELATED'],
  }),
  story({
    title: 'Hyperscale data centers face grid capacity limits',
    publisher: 'Beta Journal',
    daysAgo: 8,
    index: 2,
    snippet: 'Eaton won an electrical equipment order while utilities review interconnection timing.',
    tickers: ['ETN'],
  }),
  story({
    title: 'Data center electricity demand drives substation backlog',
    publisher: 'Gamma News',
    daysAgo: 12,
    index: 3,
    snippet: 'Vertiv was mentioned once in the discussion of facility cooling.',
    tickers: ['VRT'],
  }),
  story({
    title: 'Power shortage slows hyperscale data center buildout',
    publisher: 'Delta Report',
    daysAgo: 17,
    index: 4,
  }),
  story({
    title: 'Data centers seek onsite generation amid power constraints',
    publisher: 'Epsilon Wire',
    daysAgo: 23,
    index: 5,
  }),
  story({
    title: 'Interconnection delays constrain data center expansion',
    publisher: 'Zeta Journal',
    daysAgo: 27,
    index: 6,
  }),
  story({
    title: 'Data center grid capacity expansion begins',
    publisher: 'Historical One',
    daysAgo: 70,
    index: 7,
  }),
  story({
    title: 'Hyperscale data center power demand enters utility plans',
    publisher: 'Historical Two',
    daysAgo: 125,
    index: 8,
  }),
];

const duplicate = story({
  title: dataCenterStories[0].title,
  publisher: 'Syndication Copy',
  daysAgo: 3,
  index: 9,
  link: dataCenterStories[0].link,
});
const cadenceNoise = [
  story({
    title: 'Monthly results report and market update',
    publisher: 'Noise Daily',
    daysAgo: 2,
    index: 10,
  }),
  story({
    title: 'Quarterly business report published today',
    publisher: 'Noise Weekly',
    daysAgo: 9,
    index: 11,
  }),
];

const canonical = canonicalizeEarlySignalEvidence([...dataCenterStories, duplicate, ...cadenceNoise], asOf);
assert(
  canonical.length === dataCenterStories.length,
  `Exact URL duplicates and unrelated publishing noise should be removed; expected ${dataCenterStories.length}, received ${canonical.length}: ${canonical.map((item) => item.title).join(' | ')}`,
);
assert(canonical.every((item) => item.topicId === 'data-center-power-constraints'), 'Evidence must map to one coherent structural topic');

const merged = mergeEarlySignalEvidence(canonical.slice(0, 4), canonical, asOf);
assert(merged.length === canonical.length, 'History merge must be idempotent');

const dashboard = buildEarlySignalsDashboard(merged, asOf);
assert(dashboard.signals.length === 1, `Expected one qualified signal, received ${dashboard.signals.length}`);
const signal = dashboard.signals[0];
assert(signal.label === 'Data-center power constraints', `Expected a canonical grounded label, received "${signal.label}"`);
assert(signal.accelerationRatio > 1.25, 'Qualified signal must be accelerating against its historical baseline');
assert(signal.activeWeekCount >= 2, 'Qualified signal must persist across multiple weeks');
assert(signal.independentSourceCount >= 4, 'Qualified signal must have broad independent-source support');
assert(signal.evidenceGrade !== 'thin', 'The strong fixture should not receive a thin evidence grade');
assert(signal.confirmationConditions.length >= 3, 'Signal must expose confirmation conditions');
assert(signal.invalidationConditions.length >= 3, 'Signal must expose invalidation conditions');

const companySymbols = signal.beneficiaries.flatMap((beneficiary) => beneficiary.companies.map((company) => company.symbol));
assert(companySymbols.includes('ETN'), 'A company supported by two independent sources should be linked');
assert(!companySymbols.includes('VRT'), 'A company supported by only one source must not be linked');
assert(!companySymbols.includes('UNRELATED'), 'Unrecognized tickers must never be attached');

const underSupported = canonicalizeEarlySignalEvidence([
  story({
    title: 'Grid transformer shortage delays modernization',
    publisher: 'Single Source',
    daysAgo: 3,
    index: 12,
  }),
  story({
    title: 'Transmission grid upgrade faces transformer backlog',
    publisher: 'Second Source',
    daysAgo: 10,
    index: 13,
  }),
], asOf);
const suppressedDashboard = buildEarlySignalsDashboard(underSupported, asOf);
assert(suppressedDashboard.signals.length === 0, 'Under-supported candidates must be suppressed');

const coldStart = canonicalizeEarlySignalEvidence(dataCenterStories.slice(0, 6), asOf);
const coldStartDashboard = buildEarlySignalsDashboard(coldStart, asOf);
assert(coldStartDashboard.signals.length === 1, 'A cold start should require and admit only unusually broad current evidence');
assert(coldStartDashboard.signals[0].uncertainty === 'high', 'Cold-start signals must disclose high uncertainty');
assert(coldStartDashboard.baseline.status === 'partial', 'Timestamped current evidence spanning weeks should report a partial baseline');

console.log(JSON.stringify({
  signal: signal.label,
  accelerationRatio: signal.accelerationRatio,
  evidenceGrade: signal.evidenceGrade,
  linkedCompanies: companySymbols,
  duplicateSuppressed: true,
  underSupportedSuppressed: true,
  coldStartUncertainty: coldStartDashboard.signals[0].uncertainty,
}));
