import type { NewsItem } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_WINDOW_DAYS = 365;
const CURRENT_WINDOW_DAYS = 30;
const BASELINE_WINDOW_DAYS = 150;
const MINIMUM_BASELINE_DAYS = 14;

export type EarlySignalEvidenceGrade = 'thin' | 'developing' | 'supported';
export type EarlySignalUncertainty = 'high' | 'medium' | 'guarded';

export interface EarlySignalEvidence {
  id: string;
  topicId: string;
  title: string;
  summary: string;
  url: string;
  publisher: string;
  sourceKey: string;
  publishedAt: number;
  observedAt: number;
  matchedTerms: string[];
  explicitTickers: string[];
}

export interface EarlySignalBeneficiary {
  role: string;
  rationale: string;
  companies: Array<{
    symbol: string;
    name: string;
    evidenceCount: number;
    independentSourceCount: number;
  }>;
}

export interface EarlySignal {
  id: string;
  label: string;
  horizon: '6–18 months' | '12–36 months' | '18–36 months';
  whyEmerging: string;
  longRunImplication: string;
  evidenceGrade: EarlySignalEvidenceGrade;
  uncertainty: EarlySignalUncertainty;
  rankingScore: number;
  accelerationRatio: number;
  noveltyScore: number;
  persistenceScore: number;
  currentEvidenceCount: number;
  baselineEvidenceCount: number;
  independentSourceCount: number;
  activeWeekCount: number;
  baselineSpanDays: number;
  confirmationConditions: string[];
  invalidationConditions: string[];
  beneficiaries: EarlySignalBeneficiary[];
  evidence: EarlySignalEvidence[];
}

export interface EarlySignalsDashboard {
  generatedAt: string;
  methodologyVersion: 1;
  signals: EarlySignal[];
  stats: {
    evidenceCount: number;
    independentSourceCount: number;
    candidateCount: number;
    suppressedCandidateCount: number;
    historySpanDays: number;
  };
  baseline: {
    status: 'warming' | 'partial' | 'established';
    oldestEvidenceAt: number | null;
    retainedEvidenceCount: number;
    requiredDays: number;
  };
}

type CompanyRule = {
  symbol: string;
  name: string;
  aliases: string[];
};

type BeneficiaryRoleRule = {
  role: string;
  rationale: string;
  companies: CompanyRule[];
};

type EarlySignalTopicRule = {
  id: string;
  label: string;
  query: string;
  horizon: EarlySignal['horizon'];
  requiredTermGroups: string[][];
  indicatorTerms: string[];
  whyEmerging: string;
  longRunImplication: string;
  confirmationConditions: string[];
  invalidationConditions: string[];
  beneficiaries: BeneficiaryRoleRule[];
};

const TOPIC_RULES: EarlySignalTopicRule[] = [
  {
    id: 'data-center-power-constraints',
    label: 'Data-center power constraints',
    query: 'data center power grid capacity electricity demand',
    horizon: '6–18 months',
    requiredTermGroups: [
      ['data center', 'data centers', 'datacenter', 'hyperscale'],
      ['power demand', 'electricity demand', 'grid capacity', 'power constraint', 'power constraints', 'power shortage', 'interconnection', 'substation'],
    ],
    indicatorTerms: ['interconnection queue', 'grid capacity', 'power constraint', 'power shortage', 'substation', 'behind the meter', 'onsite generation'],
    whyEmerging: 'Mentions of physical power availability, interconnection delays, and dedicated generation are accelerating alongside data-center expansion.',
    longRunImplication: 'Compute growth may become constrained by power procurement and grid access, shifting value toward electrical equipment, cooling, generation, and efficiency providers.',
    confirmationConditions: [
      'More operators disclose power availability or interconnection timing as a capacity constraint.',
      'Utilities and equipment suppliers raise multi-year grid or substation investment plans.',
      'Dedicated generation, storage, or long-duration power contracts move from pilots into repeated deployments.',
    ],
    invalidationConditions: [
      'Interconnection queues shorten without slowing data-center commissioning.',
      'Power-equipment lead times and utility capex normalize while planned capacity still comes online.',
      'Compute-efficiency gains materially reduce projected electricity demand per deployed workload.',
    ],
    beneficiaries: [
      {
        role: 'Power distribution and electrical equipment',
        rationale: 'Higher substation and power-management intensity increases demand for grid and facility electrical hardware.',
        companies: [
          { symbol: 'ETN', name: 'Eaton', aliases: ['eaton', ' etn '] },
          { symbol: 'VRT', name: 'Vertiv', aliases: ['vertiv', ' vrt '] },
          { symbol: 'GEV', name: 'GE Vernova', aliases: ['ge vernova', ' gev '] },
        ],
      },
      {
        role: 'Thermal management and efficient infrastructure',
        rationale: 'Power scarcity increases the economic value of cooling efficiency and higher-density infrastructure.',
        companies: [
          { symbol: 'VRT', name: 'Vertiv', aliases: ['vertiv', ' vrt '] },
          { symbol: 'NVT', name: 'nVent', aliases: ['nvent', ' nvt '] },
        ],
      },
    ],
  },
  {
    id: 'grid-modernization-bottlenecks',
    label: 'Grid modernization bottlenecks',
    query: 'grid modernization transformer shortage transmission interconnection',
    horizon: '12–36 months',
    requiredTermGroups: [
      ['grid', 'transmission', 'transformer', 'substation', 'interconnection'],
      ['upgrade', 'modernization', 'shortage', 'backlog', 'bottleneck', 'lead time', 'investment'],
    ],
    indicatorTerms: ['transformer shortage', 'lead time', 'transmission backlog', 'interconnection queue', 'grid upgrade', 'substation backlog'],
    whyEmerging: 'Repeated transformer, transmission, and interconnection bottlenecks suggest that grid hardware and permitting are becoming binding constraints on electrification.',
    longRunImplication: 'Multi-year grid replacement and expansion could sustain demand for equipment, engineering, and transmission build-out even if individual generation cycles slow.',
    confirmationConditions: [
      'Transformer and switchgear backlogs remain elevated across multiple reporting periods.',
      'Approved transmission and distribution spending rises across independent utilities or regions.',
      'Permitting reforms translate into measurable project starts rather than announcements alone.',
    ],
    invalidationConditions: [
      'Equipment lead times normalize and backlogs fall without delaying grid projects.',
      'Utility capital plans are repeatedly reduced or deferred.',
      'Distributed flexibility materially offsets planned transmission and substation investment.',
    ],
    beneficiaries: [
      {
        role: 'Grid equipment manufacturers',
        rationale: 'Replacement and expansion require transformers, switchgear, breakers, and power-management systems.',
        companies: [
          { symbol: 'ETN', name: 'Eaton', aliases: ['eaton', ' etn '] },
          { symbol: 'GEV', name: 'GE Vernova', aliases: ['ge vernova', ' gev '] },
          { symbol: 'HUBB', name: 'Hubbell', aliases: ['hubbell', ' hubb '] },
        ],
      },
      {
        role: 'Transmission engineering and construction',
        rationale: 'Physical build-out creates demand for specialized grid engineering, construction, and maintenance capacity.',
        companies: [
          { symbol: 'PWR', name: 'Quanta Services', aliases: ['quanta services', ' pwr '] },
          { symbol: 'MYRG', name: 'MYR Group', aliases: ['myr group', ' myrg '] },
        ],
      },
    ],
  },
  {
    id: 'industrial-automation-reshoring',
    label: 'Automation-led manufacturing reshoring',
    query: 'manufacturing reshoring factory automation industrial robots',
    horizon: '12–36 months',
    requiredTermGroups: [
      ['reshoring', 'onshoring', 'nearshoring', 'domestic manufacturing', 'factory investment'],
      ['automation', 'industrial robot', 'robotics', 'machine vision', 'factory software'],
    ],
    indicatorTerms: ['factory automation', 'industrial robot', 'machine vision', 'lights out', 'domestic manufacturing', 'reshoring investment'],
    whyEmerging: 'New domestic manufacturing projects are increasingly paired with automation, suggesting that labor constraints and resilience goals may change factory capital intensity.',
    longRunImplication: 'If sustained, manufacturing localization may benefit automation, controls, sensing, and factory-software roles more consistently than undifferentiated domestic producers.',
    confirmationConditions: [
      'Factory announcements convert into equipment orders and commissioning milestones.',
      'Automation suppliers report broad-based order growth tied to new domestic capacity.',
      'Manufacturing productivity rises in regions receiving reshoring investment.',
    ],
    invalidationConditions: [
      'Announced factories are cancelled or delayed without equipment orders.',
      'Automation order growth remains confined to one end market or customer.',
      'Cost gaps widen enough to reverse localization plans despite policy support.',
    ],
    beneficiaries: [
      {
        role: 'Factory automation and controls',
        rationale: 'Higher-cost domestic production raises the value of controls, robotics, and machine-vision systems.',
        companies: [
          { symbol: 'ROK', name: 'Rockwell Automation', aliases: ['rockwell automation', ' rok '] },
          { symbol: 'EMR', name: 'Emerson', aliases: ['emerson electric', 'emerson', ' emr '] },
          { symbol: 'CGNX', name: 'Cognex', aliases: ['cognex', ' cgnx '] },
        ],
      },
    ],
  },
  {
    id: 'critical-minerals-localization',
    label: 'Critical-minerals supply localization',
    query: 'critical minerals processing rare earth supply chain',
    horizon: '18–36 months',
    requiredTermGroups: [
      ['critical mineral', 'critical minerals', 'rare earth', 'lithium', 'copper', 'graphite'],
      ['processing', 'refining', 'supply chain', 'domestic supply', 'localization', 'export restriction', 'offtake'],
    ],
    indicatorTerms: ['processing capacity', 'refining capacity', 'export restriction', 'domestic supply', 'offtake agreement', 'rare earth separation'],
    whyEmerging: 'Policy support, export controls, and new offtake structures are increasingly focused on processing and refining rather than mine supply alone.',
    longRunImplication: 'The strategic bottleneck may migrate toward midstream processing, recycling, and specialized materials, where capacity is slower to qualify and replicate.',
    confirmationConditions: [
      'Financed processing projects reach construction and commissioning milestones.',
      'Long-term offtake agreements expand across more than one mineral and buyer.',
      'Customers qualify non-incumbent refining or recycling supply at commercial scale.',
    ],
    invalidationConditions: [
      'Projects remain subsidy-dependent without financing or binding customers.',
      'Commodity oversupply causes repeated cancellations across processing projects.',
      'Trade restrictions ease without durable diversification by downstream buyers.',
    ],
    beneficiaries: [
      {
        role: 'Processing, separation, and recycling capacity',
        rationale: 'Localization depends on qualified midstream capacity, not only additional mined volume.',
        companies: [
          { symbol: 'MP', name: 'MP Materials', aliases: ['mp materials', ' mp '] },
          { symbol: 'ALB', name: 'Albemarle', aliases: ['albemarle', ' alb '] },
          { symbol: 'LAC', name: 'Lithium Americas', aliases: ['lithium americas', ' lac '] },
        ],
      },
    ],
  },
  {
    id: 'autonomous-defense-systems',
    label: 'Autonomous defense systems',
    query: 'autonomous defense drones counter drone procurement',
    horizon: '6–18 months',
    requiredTermGroups: [
      ['drone', 'drones', 'unmanned', 'autonomous system', 'autonomous systems', 'counter drone'],
      ['defense', 'military', 'procurement', 'contract', 'deployment', 'battlefield'],
    ],
    indicatorTerms: ['counter drone', 'autonomous system', 'loitering munition', 'drone swarm', 'attritable', 'mass production'],
    whyEmerging: 'Procurement language is shifting from demonstrations toward deployable, lower-cost autonomous and counter-drone systems.',
    longRunImplication: 'Defense value pools may broaden from a few exquisite platforms toward sensors, autonomy software, low-cost production, and counter-system layers.',
    confirmationConditions: [
      'Programs move into recurring production orders rather than prototype awards.',
      'Multiple armed forces adopt common autonomous or counter-drone operating concepts.',
      'Suppliers demonstrate scalable production and field reliability.',
    ],
    invalidationConditions: [
      'Programs remain fragmented pilots with no follow-on procurement.',
      'Operational restrictions prevent autonomous systems from scaling beyond narrow missions.',
      'Countermeasures materially erode system effectiveness faster than costs decline.',
    ],
    beneficiaries: [
      {
        role: 'Autonomy, sensing, and counter-system providers',
        rationale: 'Scaled deployment requires integrated sensing, autonomy software, communications, and effectors.',
        companies: [
          { symbol: 'AVAV', name: 'AeroVironment', aliases: ['aerovironment', ' avav '] },
          { symbol: 'KTOS', name: 'Kratos Defense', aliases: ['kratos defense', 'kratos', ' ktos '] },
          { symbol: 'PLTR', name: 'Palantir', aliases: ['palantir', ' pltr '] },
        ],
      },
    ],
  },
  {
    id: 'glp1-care-ecosystem',
    label: 'GLP-1 care ecosystem expansion',
    query: 'GLP-1 obesity treatment supply manufacturing care',
    horizon: '12–36 months',
    requiredTermGroups: [
      ['glp 1', 'glp-1', 'obesity drug', 'weight loss drug'],
      ['capacity', 'manufacturing', 'supply', 'coverage', 'care model', 'compounding', 'oral'],
    ],
    indicatorTerms: ['manufacturing capacity', 'insurance coverage', 'oral glp 1', 'care model', 'supply constraint', 'compounding'],
    whyEmerging: 'The signal is expanding from drug efficacy toward manufacturing capacity, coverage, delivery formats, and longitudinal care infrastructure.',
    longRunImplication: 'Sustained adoption could reshape pharmaceutical manufacturing, benefits design, diagnostics, and chronic-care delivery beyond the leading drug franchises.',
    confirmationConditions: [
      'Supply expansion is matched by broader reimbursed demand rather than short-lived channel inventory.',
      'Oral or next-generation formats retain meaningful efficacy and adherence.',
      'Care providers demonstrate durable outcomes and economics beyond prescription acquisition.',
    ],
    invalidationConditions: [
      'Coverage restrictions materially cap treated populations.',
      'Discontinuation or safety issues offset new patient starts.',
      'Manufacturing expansion creates persistent oversupply without broader access.',
    ],
    beneficiaries: [
      {
        role: 'Scaled incretin manufacturing and delivery',
        rationale: 'Demand growth requires qualified active-ingredient, fill-finish, device, and distribution capacity.',
        companies: [
          { symbol: 'LLY', name: 'Eli Lilly', aliases: ['eli lilly', 'lilly', ' lly '] },
          { symbol: 'NVO', name: 'Novo Nordisk', aliases: ['novo nordisk', ' nvo '] },
        ],
      },
    ],
  },
];

const LOW_INFORMATION_TERMS = new Set([
  'about', 'after', 'again', 'amid', 'and', 'are', 'business', 'company', 'could', 'daily', 'first',
  'for', 'from', 'global', 'has', 'have', 'into', 'latest', 'market', 'markets', 'more', 'new', 'news',
  'now', 'report', 'reports', 'said', 'says', 'stock', 'stocks', 'than', 'that', 'the', 'their', 'this',
  'today', 'update', 'will', 'with', 'world', 'year',
]);

export const EARLY_SIGNAL_QUERIES = TOPIC_RULES.map(({ id, query }) => ({ id, query }));

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesTerm(text: string, term: string): boolean {
  const normalizedText = ` ${normalizeText(text)} `;
  const normalizedTerm = normalizeText(term);
  return Boolean(normalizedTerm) && normalizedText.includes(` ${normalizedTerm} `);
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|guccounter|guce_referrer|ocid|ncid|cmpid)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

function sourceKey(item: NewsItem): string {
  const publisher = normalizeText(item.publisher);
  if (publisher) return publisher;
  try {
    return new URL(item.link).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'unknown source';
  }
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function evidenceIdentity(item: Pick<EarlySignalEvidence, 'url' | 'title' | 'publishedAt'>): string {
  const day = Math.floor(item.publishedAt / DAY_MS);
  return canonicalUrl(item.url) || `${normalizeText(item.title)}|${day}`;
}

function matchTopic(item: NewsItem, topic: EarlySignalTopicRule): { score: number; terms: string[] } | null {
  const text = `${item.title} ${item.snippet ?? ''}`;
  const matchedGroups = topic.requiredTermGroups.flatMap((group) => {
    const matched = group.filter((term) => includesTerm(text, term));
    return matched.length > 0 ? [matched] : [];
  });
  if (matchedGroups.length < topic.requiredTermGroups.length) return null;

  const matchedTerms = Array.from(new Set([
    ...matchedGroups.flat(),
    ...topic.indicatorTerms.filter((term) => includesTerm(text, term)),
  ]));
  const indicatorMatches = topic.indicatorTerms.filter((term) => includesTerm(text, term)).length;
  return {
    score: matchedGroups.length * 4 + indicatorMatches * 2 + Math.min(item.snippet?.length ?? 0, 240) / 240,
    terms: matchedTerms,
  };
}

export function canonicalizeEarlySignalEvidence(
  items: NewsItem[],
  observedAt = Date.now(),
): EarlySignalEvidence[] {
  const validItems = items.filter((item) => (
    Boolean(item.title.trim()) &&
    Boolean(item.link.trim()) &&
    Number.isFinite(item.publishedAt) &&
    item.publishedAt > observedAt - HISTORY_WINDOW_DAYS * DAY_MS &&
    item.publishedAt < observedAt + 2 * DAY_MS
  ));
  const globallyDeduped = new Map<string, NewsItem>();

  for (const item of validItems) {
    const identity = evidenceIdentity({
      url: item.link,
      title: item.title,
      publishedAt: item.publishedAt,
    });
    const existing = globallyDeduped.get(identity);
    if (!existing || (item.snippet?.length ?? 0) > (existing.snippet?.length ?? 0)) {
      globallyDeduped.set(identity, item);
    }
  }

  const evidence: EarlySignalEvidence[] = [];
  for (const item of globallyDeduped.values()) {
    const rankedMatches = TOPIC_RULES
      .flatMap((topic) => {
        const match = matchTopic(item, topic);
        return match ? [{ topic, ...match }] : [];
      })
      .sort((left, right) => right.score - left.score);
    const best = rankedMatches[0];
    if (!best) continue;

    const url = canonicalUrl(item.link);
    const identity = evidenceIdentity({ url, title: item.title, publishedAt: item.publishedAt });
    evidence.push({
      id: `${best.topic.id}-${stableHash(identity)}`,
      topicId: best.topic.id,
      title: item.title.trim(),
      summary: item.snippet?.trim() ?? '',
      url,
      publisher: item.publisher.trim() || sourceKey(item),
      sourceKey: sourceKey(item),
      publishedAt: item.publishedAt,
      observedAt,
      matchedTerms: best.terms,
      explicitTickers: Array.from(new Set((item.tickers ?? []).map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))),
    });
  }

  return dedupeIndependentEvidence(evidence);
}

function dedupeIndependentEvidence(evidence: EarlySignalEvidence[]): EarlySignalEvidence[] {
  const exact = new Map<string, EarlySignalEvidence>();
  for (const item of evidence) {
    const key = `${item.topicId}|${evidenceIdentity(item)}`;
    const existing = exact.get(key);
    if (!existing || item.observedAt > existing.observedAt) exact.set(key, item);
  }

  const sourceDayTitle = new Map<string, EarlySignalEvidence>();
  for (const item of exact.values()) {
    const normalizedTitle = normalizeText(item.title)
      .split(' ')
      .filter((token) => token.length >= 4 && !LOW_INFORMATION_TERMS.has(token))
      .slice(0, 10)
      .join(' ');
    const day = Math.floor(item.publishedAt / DAY_MS);
    const key = `${item.topicId}|${item.sourceKey}|${day}|${normalizedTitle}`;
    const existing = sourceDayTitle.get(key);
    if (!existing || item.summary.length > existing.summary.length) sourceDayTitle.set(key, item);
  }

  return [...sourceDayTitle.values()].sort((left, right) => right.publishedAt - left.publishedAt);
}

export function mergeEarlySignalEvidence(
  existing: EarlySignalEvidence[],
  incoming: EarlySignalEvidence[],
  asOf = Date.now(),
): EarlySignalEvidence[] {
  const cutoff = asOf - HISTORY_WINDOW_DAYS * DAY_MS;
  return dedupeIndependentEvidence([...incoming, ...existing])
    .filter((item) => item.publishedAt >= cutoff && item.publishedAt <= asOf + 2 * DAY_MS)
    .slice(0, 1_200);
}

function weekBucket(timestamp: number): number {
  return Math.floor(timestamp / (7 * DAY_MS));
}

function evidenceGrade(args: {
  currentCount: number;
  sourceCount: number;
  activeWeeks: number;
  baselineSpanDays: number;
}): EarlySignalEvidenceGrade {
  if (args.currentCount >= 8 && args.sourceCount >= 5 && args.activeWeeks >= 4 && args.baselineSpanDays >= 90) {
    return 'supported';
  }
  if (args.currentCount >= 5 && args.sourceCount >= 3 && args.activeWeeks >= 2) {
    return 'developing';
  }
  return 'thin';
}

function topicCompanies(
  topic: EarlySignalTopicRule,
  currentEvidence: EarlySignalEvidence[],
): EarlySignalBeneficiary[] {
  return topic.beneficiaries.map((role) => ({
    role: role.role,
    rationale: role.rationale,
    companies: role.companies.flatMap((company) => {
      const matchingEvidence = currentEvidence.filter((item) => {
        const text = ` ${normalizeText(`${item.title} ${item.summary}`)} `;
        return item.explicitTickers.includes(company.symbol) ||
          company.aliases.some((alias) => text.includes(alias.startsWith(' ') ? alias : ` ${normalizeText(alias)} `));
      });
      const independentSources = new Set(matchingEvidence.map((item) => item.sourceKey));
      if (matchingEvidence.length < 2 || independentSources.size < 2) return [];
      return [{
        symbol: company.symbol,
        name: company.name,
        evidenceCount: matchingEvidence.length,
        independentSourceCount: independentSources.size,
      }];
    }),
  }));
}

function buildTopicSignal(
  topic: EarlySignalTopicRule,
  evidence: EarlySignalEvidence[],
  asOf: number,
): EarlySignal | null {
  const currentStart = asOf - CURRENT_WINDOW_DAYS * DAY_MS;
  const baselineStart = currentStart - BASELINE_WINDOW_DAYS * DAY_MS;
  const topicEvidence = evidence.filter((item) => item.topicId === topic.id);
  const current = topicEvidence.filter((item) => item.publishedAt >= currentStart && item.publishedAt <= asOf + DAY_MS);
  const baseline = topicEvidence.filter((item) => item.publishedAt >= baselineStart && item.publishedAt < currentStart);
  const sourceCount = new Set(current.map((item) => item.sourceKey)).size;
  const activeWeeks = new Set(current.map((item) => weekBucket(item.publishedAt))).size;
  const activeDays = new Set(current.map((item) => Math.floor(item.publishedAt / DAY_MS))).size;
  const oldestBaselineAt = baseline.reduce((oldest, item) => Math.min(oldest, item.publishedAt), currentStart);
  const baselineSpanDays = baseline.length > 0
    ? Math.min(BASELINE_WINDOW_DAYS, Math.max(1, Math.round((currentStart - oldestBaselineAt) / DAY_MS)))
    : 0;
  const recentRate = current.length / CURRENT_WINDOW_DAYS;
  const baselineDenominator = Math.max(baselineSpanDays, MINIMUM_BASELINE_DAYS);
  const baselineRate = baseline.length / baselineDenominator;
  const accelerationRatio = clamp((recentRate + 0.015) / (baselineRate + 0.015), 0, 6);

  const currentTerms = new Set(current.flatMap((item) => item.matchedTerms));
  const baselineTerms = new Set(baseline.flatMap((item) => item.matchedTerms));
  const novelTermShare = currentTerms.size > 0
    ? [...currentTerms].filter((term) => !baselineTerms.has(term)).length / currentTerms.size
    : 0;
  const priorScarcity = 1 - Math.min(1, baselineRate / Math.max(recentRate, 0.01));
  const noveltyScore = Math.round(clamp(novelTermShare * 55 + priorScarcity * 45));
  const availableWeeks = Math.max(1, Math.min(8, Math.ceil(CURRENT_WINDOW_DAYS / 7)));
  const persistenceScore = Math.round(clamp((activeWeeks / availableWeeks) * 100));
  const sourceBreadthScore = Math.round(clamp((sourceCount / 6) * 100));
  const baselineQualityScore = Math.round(clamp((baselineSpanDays / 90) * 100));

  const hasUsableBaseline = baselineSpanDays >= MINIMUM_BASELINE_DAYS && baseline.length >= 2;
  const hasStrongColdStartEvidence = current.length >= 6 && sourceCount >= 4 && activeDays >= 3 && activeWeeks >= 2;
  const eligible = current.length >= 3 &&
    sourceCount >= 2 &&
    activeDays >= 2 &&
    activeWeeks >= 2 &&
    ((hasUsableBaseline && accelerationRatio >= 1.25) || (!hasUsableBaseline && hasStrongColdStartEvidence));
  if (!eligible) return null;

  const grade = evidenceGrade({
    currentCount: current.length,
    sourceCount,
    activeWeeks,
    baselineSpanDays,
  });
  const uncertainty: EarlySignalUncertainty = grade === 'thin' || !hasUsableBaseline
    ? 'high'
    : grade === 'developing'
      ? 'medium'
      : 'guarded';
  const rankingScore = Math.round(clamp(
    Math.min(accelerationRatio / 4, 1) * 30 +
    noveltyScore * 0.22 +
    persistenceScore * 0.2 +
    sourceBreadthScore * 0.18 +
    baselineQualityScore * 0.1 -
    (!hasUsableBaseline ? 8 : 0),
  ));

  return {
    id: topic.id,
    label: topic.label,
    horizon: topic.horizon,
    whyEmerging: topic.whyEmerging,
    longRunImplication: topic.longRunImplication,
    evidenceGrade: grade,
    uncertainty,
    rankingScore,
    accelerationRatio: Number(accelerationRatio.toFixed(1)),
    noveltyScore,
    persistenceScore,
    currentEvidenceCount: current.length,
    baselineEvidenceCount: baseline.length,
    independentSourceCount: sourceCount,
    activeWeekCount: activeWeeks,
    baselineSpanDays,
    confirmationConditions: topic.confirmationConditions,
    invalidationConditions: topic.invalidationConditions,
    beneficiaries: topicCompanies(topic, current),
    evidence: current.slice(0, 8),
  };
}

export function buildEarlySignalsDashboard(
  evidence: EarlySignalEvidence[],
  asOf = Date.now(),
): EarlySignalsDashboard {
  const retained = mergeEarlySignalEvidence([], evidence, asOf);
  const oldestEvidenceAt = retained.length > 0
    ? retained.reduce((oldest, item) => Math.min(oldest, item.publishedAt), retained[0].publishedAt)
    : null;
  const historySpanDays = oldestEvidenceAt == null
    ? 0
    : Math.max(0, Math.round((asOf - oldestEvidenceAt) / DAY_MS));
  const signals = TOPIC_RULES
    .flatMap((topic) => {
      const signal = buildTopicSignal(topic, retained, asOf);
      return signal ? [signal] : [];
    })
    .sort((left, right) => right.rankingScore - left.rankingScore);

  return {
    generatedAt: new Date(asOf).toISOString(),
    methodologyVersion: 1,
    signals,
    stats: {
      evidenceCount: retained.length,
      independentSourceCount: new Set(retained.map((item) => item.sourceKey)).size,
      candidateCount: TOPIC_RULES.length,
      suppressedCandidateCount: TOPIC_RULES.length - signals.length,
      historySpanDays,
    },
    baseline: {
      status: historySpanDays >= 90 ? 'established' : historySpanDays >= MINIMUM_BASELINE_DAYS ? 'partial' : 'warming',
      oldestEvidenceAt,
      retainedEvidenceCount: retained.length,
      requiredDays: 90,
    },
  };
}
