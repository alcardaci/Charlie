import type {
  SEC_SCHEMA_VERSION,
  SecCompanyData,
  CompanyFiling,
  SecFiling,
  SecIdentity,
  SecMetricKey,
  SecMetricObservation,
  SecPeriodType,
  SecSourceEnvelope,
  UnifiedCompanyFiling,
} from '../types';

export const SEC_IDENTITY_URL = 'https://www.sec.gov/files/company_tickers.json';
export const SEC_DATA_BASE_URL = 'https://data.sec.gov';
export const SEC_ARCHIVE_BASE_URL = 'https://www.sec.gov/Archives/edgar/data';
export const SEC_REQUEST_POLICY = {
  maxConcurrentRequests: 2,
  minIntervalMs: 300,
  timeoutMs: 2500,
  maxRetries: 3,
  retryableStatusCodes: [408, 425, 429, 500, 502, 503, 504] as const,
} as const;
export const SEC_CACHE_POLICY = {
  identityTtlMs: 24 * 60 * 60 * 1000,
  identityStaleMs: 7 * 24 * 60 * 60 * 1000,
  submissionsTtlMs: 8 * 60 * 1000,
  submissionsStaleMs: 30 * 60 * 1000,
  factsTtlMs: 12 * 60 * 60 * 1000,
  factsStaleMs: 24 * 60 * 60 * 1000,
} as const;

export const SEC_METRIC_LABELS: Record<SecMetricKey, string> = {
  revenue: 'Revenue',
  operatingIncome: 'Operating Income',
  netIncome: 'Net Income',
  cash: 'Cash',
  debt: 'Debt',
};

const SEC_FORMS = new Set(['10-K', '10-K/A', '10-Q', '10-Q/A', '8-K', '8-K/A', '20-F', '20-F/A', '40-F', '40-F/A']);
const FLOW_METRICS = new Set<SecMetricKey>(['revenue', 'operatingIncome', 'netIncome']);
const METRIC_CONCEPTS: Record<SecMetricKey, string[]> = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'],
  operatingIncome: ['OperatingIncomeLoss'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  debt: [], // Only matched current/noncurrent pairs are eligible; never label one component as total debt.
};
const DEBT_CONCEPT_PAIRS = [
  ['LongTermDebtAndFinanceLeaseObligationsCurrent', 'LongTermDebtAndFinanceLeaseObligationsNoncurrent'],
  ['LongTermDebtCurrent', 'LongTermDebtNoncurrent'],
] as const;

type SecTickerRow = { cik_str?: number | string; ticker?: string; title?: string };
export type SecTickerMapping = Record<string, SecTickerRow> | SecTickerRow[];

type RawSubmission = {
  accessionNumber?: unknown;
  form?: unknown;
  filingDate?: unknown;
  reportDate?: unknown;
  primaryDocument?: unknown;
};

type RawFact = {
  val?: unknown;
  accn?: unknown;
  fy?: unknown;
  fp?: unknown;
  form?: unknown;
  filed?: unknown;
  frame?: unknown;
  start?: unknown;
  end?: unknown;
};

type NormalizedRawFact = RawFact & {
  value: number;
  unit: string;
  taxonomy: string;
  concept: string;
};

function asDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase();
}

export function padSecCik(value: unknown): string | null {
  const digits = String(value ?? '').trim();
  if (!/^\d{1,10}$/.test(digits)) return null;
  return digits.padStart(10, '0');
}

export function buildSecCacheKey(kind: 'identity-map' | 'submissions' | 'facts', identity = ''): string {
  return `sec:v${1}:${kind}${identity ? `:${identity}` : ''}`;
}

export function classifySecCacheEntry(now: number, expiresAt: number, staleUntil: number): 'fresh' | 'stale' | 'expired' {
  if (expiresAt > now) return 'fresh';
  if (staleUntil > now) return 'stale';
  return 'expired';
}

export function isSecRetryableStatus(status: number): boolean {
  return (SEC_REQUEST_POLICY.retryableStatusCodes as readonly number[]).includes(status);
}

export function resolveCikFromTicker(ticker: string, mapping: SecTickerMapping): SecIdentity | null {
  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker) return null;
  const rows = Array.isArray(mapping) ? mapping : Object.values(mapping);
  const match = rows.find((row) => normalizeTicker(String(row.ticker ?? '')) === normalizedTicker);
  const cik = padSecCik(match?.cik_str);
  if (!match || !cik) return null;

  return {
    ticker: normalizedTicker,
    title: String(match.title ?? normalizedTicker).trim() || normalizedTicker,
    cik,
    verified: true,
    sourceUrl: SEC_IDENTITY_URL,
  };
}

export function buildSecSubmissionUrl(cik: string): string {
  return `${SEC_DATA_BASE_URL}/submissions/CIK${padSecCik(cik) ?? cik}.json`;
}

export function buildSecFactsUrl(cik: string): string {
  return `${SEC_DATA_BASE_URL}/api/xbrl/companyfacts/CIK${padSecCik(cik) ?? cik}.json`;
}

export function buildSecArchiveUrl(cik: string, accessionNumber: string, primaryDocument?: string | null): string {
  const normalizedCik = String(Number(padSecCik(cik) ?? cik));
  const accession = accessionNumber.trim();
  const archiveAccession = accession.replace(/-/g, '');
  const document = primaryDocument?.trim();
  return document
    ? `${SEC_ARCHIVE_BASE_URL}/${normalizedCik}/${archiveAccession}/${encodeURIComponent(document)}`
    : `${SEC_ARCHIVE_BASE_URL}/${normalizedCik}/${archiveAccession}/index.json`;
}

export function normalizeSecFilings(raw: unknown, identity: SecIdentity): SecFiling[] {
  const recent = (raw as { filings?: { recent?: unknown } } | null)?.filings?.recent;
  if (!recent || typeof recent !== 'object') return [];

  const rows = recent as Record<string, unknown>;
  const accessionNumbers = Array.isArray(rows.accessionNumber) ? rows.accessionNumber : [];
  const length = accessionNumbers.length;
  const filings: SecFiling[] = [];
  for (let index = 0; index < length; index += 1) {
    const accessionNumber = String(accessionNumbers[index] ?? '').trim();
    const form = String((Array.isArray(rows.form) ? rows.form[index] : '') ?? '').trim();
    const filedDate = asDate(Array.isArray(rows.filingDate) ? rows.filingDate[index] : null);
    if (!accessionNumber || !SEC_FORMS.has(form) || !filedDate) continue;
    const reportPeriod = asDate(Array.isArray(rows.reportDate) ? rows.reportDate[index] : null);
    const primaryDocument = String((Array.isArray(rows.primaryDocument) ? rows.primaryDocument[index] : '') ?? '').trim() || null;
    filings.push({
      accessionNumber,
      form,
      filedDate,
      reportPeriod,
      primaryDocument,
      filingUrl: buildSecArchiveUrl(identity.cik, accessionNumber, primaryDocument),
      isAmendment: form.endsWith('/A'),
    });
  }

  return filings
    .sort((left, right) => `${right.filedDate}-${right.accessionNumber}`.localeCompare(`${left.filedDate}-${left.accessionNumber}`))
    .slice(0, 12);
}

type FilingInput = CompanyFiling | SecFiling | UnifiedCompanyFiling;

function filingForm(filing: FilingInput): string {
  return ('form' in filing ? filing.form : filing.type).trim().toUpperCase().replace(/\s+/g, ' ');
}

function filingDate(filing: FilingInput): string {
  return ('filedDate' in filing ? filing.filedDate : filing.date).trim();
}

function filingReportPeriod(filing: FilingInput): string | null {
  return 'reportPeriod' in filing ? filing.reportPeriod ?? null : null;
}

function filingUrl(filing: FilingInput): string {
  return ('filingUrl' in filing ? filing.filingUrl : filing.url).trim();
}

function filingAccession(filing: FilingInput): string | null {
  const explicit = 'accessionNumber' in filing ? filing.accessionNumber : null;
  if (explicit?.trim()) return explicit.trim();

  const direct = filingUrl(filing).match(/(?:^|[^0-9])(\d{10}-\d{2}-\d{6})(?=[^0-9]|$)/);
  if (direct) return direct[1];

  const archivePath = filingUrl(filing).match(/\/(\d{10})\/(\d{18})(?:\/|$)/);
  if (archivePath) {
    const compact = archivePath[2];
    return `${compact.slice(0, 10)}-${compact.slice(10, 12)}-${compact.slice(12)}`;
  }

  const compact = filingUrl(filing).match(/\b\d{18}\b/);
  return compact ? `${compact[0].slice(0, 10)}-${compact[0].slice(10, 12)}-${compact[0].slice(12)}` : null;
}

function normalizedFilingUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.search = '';
    parsed.hash = '';
    return decodeURIComponent(parsed.toString()).replace(/\/$/, '').toLowerCase();
  } catch {
    return value.trim().replace(/\/$/, '').toLowerCase();
  }
}

function filingDocumentName(filing: FilingInput): string | null {
  const explicit = 'primaryDocument' in filing ? filing.primaryDocument : null;
  if (explicit?.trim()) return explicit.trim().toLowerCase();
  const normalized = normalizedFilingUrl(filingUrl(filing));
  const path = normalized.split('?')[0]?.split('/') ?? [];
  const last = path[path.length - 1] ?? '';
  return last && !last.includes('sec-filing') && !/^\d{18}$/.test(last) ? last : null;
}

function filingsRepresentSameDocument(left: FilingInput, right: FilingInput): boolean {
  const leftAccession = filingAccession(left);
  const rightAccession = filingAccession(right);
  if (leftAccession && rightAccession) return leftAccession === rightAccession;

  const leftUrl = normalizedFilingUrl(filingUrl(left));
  const rightUrl = normalizedFilingUrl(filingUrl(right));
  if (leftUrl && rightUrl && leftUrl === rightUrl) return true;

  const leftDocument = filingDocumentName(left);
  const rightDocument = filingDocumentName(right);
  if (leftDocument && rightDocument && leftDocument === rightDocument && filingForm(left) === filingForm(right)) return true;

  const leftReportPeriod = filingReportPeriod(left);
  const rightReportPeriod = filingReportPeriod(right);
  return filingForm(left) === filingForm(right)
    && filingDate(left) === filingDate(right)
    && Boolean(leftReportPeriod && rightReportPeriod && leftReportPeriod === rightReportPeriod);
}

function toUnifiedSecFiling(filing: SecFiling, yahooMatch?: CompanyFiling): UnifiedCompanyFiling {
  return {
    date: filing.filedDate,
    form: filing.form,
    title: yahooMatch?.title?.trim() || null,
    url: filing.filingUrl,
    exhibitCount: yahooMatch?.exhibitCount ?? 0,
    reportPeriod: filing.reportPeriod,
    accessionNumber: filing.accessionNumber,
    primaryDocument: filing.primaryDocument,
    isAmendment: filing.isAmendment,
  };
}

function toUnifiedYahooFiling(filing: CompanyFiling): UnifiedCompanyFiling {
  const form = filingForm(filing);
  return {
    date: filing.date,
    form,
    title: filing.title?.trim() || null,
    url: filing.url,
    exhibitCount: filing.exhibitCount ?? 0,
    reportPeriod: filing.reportPeriod ?? null,
    accessionNumber: filingAccession(filing),
    primaryDocument: filing.primaryDocument ?? filingDocumentName(filing),
    isAmendment: filing.isAmendment ?? form.endsWith('/A'),
  };
}

export function mergeCompanyFilings(yahooFilings: CompanyFiling[], secFilings: SecFiling[]): UnifiedCompanyFiling[] {
  const merged: UnifiedCompanyFiling[] = [];
  const matchedYahooIndexes = new Set<number>();
  const seenSec = new Set<string>();

  for (const secFiling of secFilings) {
    const secKey = filingAccession(secFiling) ?? normalizedFilingUrl(secFiling.filingUrl);
    if (seenSec.has(secKey)) continue;
    seenSec.add(secKey);

    const yahooIndex = yahooFilings.findIndex((yahooFiling, index) => (
      !matchedYahooIndexes.has(index) && filingsRepresentSameDocument(secFiling, yahooFiling)
    ));
    const yahooMatch = yahooIndex >= 0 ? yahooFilings[yahooIndex] : undefined;
    if (yahooIndex >= 0) matchedYahooIndexes.add(yahooIndex);
    merged.push(toUnifiedSecFiling(secFiling, yahooMatch));
  }

  const unmatchedYahoo: UnifiedCompanyFiling[] = [];
  yahooFilings.forEach((yahooFiling, index) => {
    if (matchedYahooIndexes.has(index)) return;
    const unified = toUnifiedYahooFiling(yahooFiling);
    if (unmatchedYahoo.some((existing) => filingsRepresentSameDocument(existing, unified))) return;
    unmatchedYahoo.push(unified);
  });

  const all = [...merged, ...unmatchedYahoo];
  return all.sort((left, right) => {
    const dateOrder = right.date.localeCompare(left.date);
    if (dateOrder !== 0) return dateOrder;
    const formOrder = left.form.localeCompare(right.form);
    if (formOrder !== 0) return formOrder;
    return (left.accessionNumber ?? left.url).localeCompare(right.accessionNumber ?? right.url);
  });
}

function periodTypeForFact(fact: NormalizedRawFact): SecPeriodType {
  if (!fact.start) return 'instant';
  const frame = String(fact.frame ?? '');
  if (/^CY\d{4}Q[1-4]$/.test(frame)) return 'quarterly';
  if (fact.start && fact.end) {
    const durationDays = (Date.parse(`${fact.end}T00:00:00Z`) - Date.parse(`${fact.start}T00:00:00Z`)) / 86400000;
    if (durationDays >= 300 && durationDays <= 400) return 'annual';
    if (durationDays >= 70 && durationDays <= 110) return 'quarterly';
  }
  return 'unknown'; // Fiscal-period labels can describe YTD facts, not just standalone quarters.
}

function normalizeFactRows(raw: unknown, taxonomy: string, concept: string): NormalizedRawFact[] {
  const units = (raw as { units?: unknown } | null)?.units;
  if (!units || typeof units !== 'object') return [];
  const rows: NormalizedRawFact[] = [];
  for (const [unit, facts] of Object.entries(units as Record<string, unknown>)) {
    if (!Array.isArray(facts)) continue;
    for (const fact of facts) {
      if (!fact || typeof fact !== 'object') continue;
      const value = asNumber((fact as RawFact).val);
      const end = asDate((fact as RawFact).end);
      const filed = asDate((fact as RawFact).filed);
      if (value == null || !end || !filed) continue;
      rows.push({
        ...(fact as RawFact),
        value,
        unit,
        taxonomy,
        concept,
        start: asDate((fact as RawFact).start) ?? undefined,
        end,
        filed,
      });
    }
  }
  return rows;
}

function factSourceUrl(fact: NormalizedRawFact, identity: SecIdentity, filingByAccession: Map<string, SecFiling>): string | null {
  const accession = String(fact.accn ?? '').trim();
  if (!accession) return null;
  return filingByAccession.get(accession)?.filingUrl
    ?? buildSecArchiveUrl(identity.cik, accession, null);
}

function toObservation(
  metric: SecMetricKey,
  fact: NormalizedRawFact,
  identity: SecIdentity,
  filingByAccession: Map<string, SecFiling>,
  overrides: Partial<SecMetricObservation> = {}
): SecMetricObservation {
  return {
    metric,
    label: SEC_METRIC_LABELS[metric],
    value: fact.value,
    availability: 'reported',
    unit: fact.unit,
    periodType: periodTypeForFact(fact),
    reportPeriodStart: typeof fact.start === 'string' ? fact.start : null,
    reportPeriodEnd: typeof fact.end === 'string' ? fact.end : null,
    filedDate: typeof fact.filed === 'string' ? fact.filed : null,
    form: typeof fact.form === 'string' ? fact.form : null,
    accessionNumber: typeof fact.accn === 'string' ? fact.accn : null,
    taxonomy: fact.taxonomy,
    concept: fact.concept,
    frame: typeof fact.frame === 'string' ? fact.frame : null,
    measurement: 'reported',
    sourceUrl: factSourceUrl(fact, identity, filingByAccession),
    ...overrides,
  };
}

function missingObservation(metric: SecMetricKey): SecMetricObservation {
  return {
    metric,
    label: SEC_METRIC_LABELS[metric],
    value: null,
    availability: 'missing',
    unit: null,
    periodType: 'unknown',
    reportPeriodStart: null,
    reportPeriodEnd: null,
    filedDate: null,
    form: null,
    accessionNumber: null,
    taxonomy: null,
    concept: null,
    frame: null,
    measurement: 'reported',
    sourceUrl: null,
  };
}

function deriveDebtObservations(
  current: NormalizedRawFact[],
  noncurrent: NormalizedRawFact[],
  identity: SecIdentity,
  filingByAccession: Map<string, SecFiling>
): SecMetricObservation[] {
  const key = (fact: NormalizedRawFact) => `${fact.end}|${fact.filed}|${fact.unit}|${fact.accn}`;
  const noncurrentByEnd = new Map(noncurrent.map((fact) => [key(fact), fact]));
  return current
    .map((fact) => {
      const matching = noncurrentByEnd.get(key(fact));
      if (!fact.accn || !matching || fact.start || matching.start || fact.value < 0 || matching.value < 0) return null;
      return toObservation('debt', {
        ...fact,
        value: fact.value + matching.value,
        concept: `${fact.concept}+${matching.concept}`,
      }, identity, filingByAccession, {
        measurement: 'derived',
        label: fact.concept.includes('FinanceLease') ? 'Long-term Debt & Finance Leases' : 'Long-term Debt',
        sourceAccessionNumbers: Array.from(new Set([String(fact.accn ?? ''), String(matching.accn ?? '')].filter(Boolean))),
        sourceConcepts: [fact.concept, matching.concept],
      });
    })
    .filter((observation): observation is SecMetricObservation => Boolean(observation));
}

function deriveTtmObservation(metric: SecMetricKey, observations: SecMetricObservation[]): SecMetricObservation | null {
  if (!FLOW_METRICS.has(metric)) return null;
  const quarterly = observations
    .filter((observation) => observation.availability === 'reported' && observation.periodType === 'quarterly' && observation.value != null && /^CY\d{4}Q[1-4]$/.test(observation.frame ?? ''))
    .sort((left, right) => `${right.frame}-${right.filedDate}`.localeCompare(`${left.frame}-${left.filedDate}`));
  const byFrame = new Map<string, SecMetricObservation>();
  for (const observation of quarterly) {
    if (!byFrame.has(observation.frame!)) byFrame.set(observation.frame!, observation);
  }
  const unique = Array.from(byFrame.values()).slice(0, 4);
  if (unique.length !== 4 || new Set(unique.map((observation) => observation.unit)).size !== 1) return null;
  const quarters = unique.map((observation) => Number(observation.frame!.slice(2, 6)) * 4 + Number(observation.frame!.slice(-1)));
  if (quarters.some((quarter, index) => index > 0 && quarters[index - 1] - quarter !== 1)) return null;
  const latest = unique[0];
  const earliest = unique[unique.length - 1];
  if (!latest || !earliest || unique.some((observation) => observation.value == null)) return null;
  return {
    ...latest,
    value: unique.reduce((sum, observation) => sum + (observation.value ?? 0), 0),
    periodType: 'ttm',
    reportPeriodStart: earliest.reportPeriodStart,
    measurement: 'derived',
    sourceAccessionNumbers: unique.map((observation) => observation.accessionNumber).filter((value): value is string => Boolean(value)),
    sourceConcepts: unique.map((observation) => observation.concept).filter((value): value is string => Boolean(value)),
  };
}

export function normalizeSecFacts(raw: unknown, identity: SecIdentity, filings: SecFiling[]): SecMetricObservation[] {
  const factsRoot = (raw as { facts?: unknown } | null)?.facts;
  if (!factsRoot || typeof factsRoot !== 'object') return [];
  const filingByAccession = new Map(filings.map((filing) => [filing.accessionNumber, filing]));
  const observations: SecMetricObservation[] = [];

  for (const metric of Object.keys(SEC_METRIC_LABELS) as SecMetricKey[]) {
    const taxonomyRoot = (factsRoot as Record<string, unknown>)['us-gaap'];
    if (!taxonomyRoot || typeof taxonomyRoot !== 'object') {
      observations.push(missingObservation(metric));
      continue;
    }
    if (metric === 'debt') {
      const derivedDebt = DEBT_CONCEPT_PAIRS.flatMap(([current, noncurrent]) => {
        const read = (concept: string) => normalizeFactRows((taxonomyRoot as Record<string, unknown>)[concept], 'us-gaap', concept)
          .filter((fact) => SEC_FORMS.has(String(fact.form ?? '')));
        return deriveDebtObservations(read(current), read(noncurrent), identity, filingByAccession);
      });
      const uniqueDebt = Array.from(new Map(derivedDebt.reverse().map((observation) => [
        `${observation.reportPeriodEnd}-${observation.filedDate}-${observation.accessionNumber}`, observation,
      ])).values()).sort((left, right) => `${right.reportPeriodEnd}-${right.filedDate}`.localeCompare(`${left.reportPeriodEnd}-${left.filedDate}`));
      observations.push(...(uniqueDebt.length ? uniqueDebt.slice(0, 8) : [missingObservation(metric)]));
      continue;
    }
    const concepts = METRIC_CONCEPTS[metric];
    let metricRows: NormalizedRawFact[] = [];
    for (const concept of concepts) {
      const rows = normalizeFactRows((taxonomyRoot as Record<string, unknown>)[concept], 'us-gaap', concept)
        .filter((fact) => SEC_FORMS.has(String(fact.form ?? '')));
      if (rows.length) {
        metricRows = rows;
        break;
      }
    }

    if (!metricRows.length) {
      observations.push(missingObservation(metric));
      continue;
    }

    const reported = metricRows
      .sort((left, right) => `${right.end}-${right.filed}`.localeCompare(`${left.end}-${left.filed}`))
      .map((fact) => toObservation(metric, fact, identity, filingByAccession));
    observations.push(...reported.slice(0, 8));
    const ttm = deriveTtmObservation(metric, reported);
    if (ttm) observations.push(ttm);
  }

  return observations;
}

function observationRank(observation: SecMetricObservation): number {
  const periodRank: Record<SecPeriodType, number> = { ttm: 4, annual: 3, quarterly: 2, instant: 1, unknown: 0 };
  return Date.parse(`${observation.reportPeriodEnd ?? '1900-01-01'}T00:00:00Z`) + periodRank[observation.periodType];
}

export function buildSecCompanyData(args: {
  ticker: string;
  identity: SecIdentity;
  submissions: unknown;
  facts: unknown;
  source: SecSourceEnvelope;
  status?: SecCompanyData['status'];
  cache?: SecCompanyData['cache'];
  warnings?: string[];
  error?: string;
}): SecCompanyData {
  const filings = normalizeSecFilings(args.submissions, args.identity);
  const observations = normalizeSecFacts(args.facts, args.identity, filings);
  const metrics = Object.fromEntries((Object.keys(SEC_METRIC_LABELS) as SecMetricKey[]).map((metric) => {
    const candidates = observations.filter((observation) => observation.metric === metric && observation.availability === 'reported');
    return [metric, candidates.sort((left, right) => observationRank(right) - observationRank(left))[0] ?? observations.find((observation) => observation.metric === metric) ?? null];
  })) as Record<SecMetricKey, SecMetricObservation | null>;
  return {
    status: args.status ?? 'ready',
    ticker: normalizeTicker(args.ticker),
    identity: args.identity,
    filings,
    observations,
    metrics,
    source: args.source,
    cache: args.cache ?? { identity: 'fresh', submissions: 'fresh', facts: 'fresh' },
    warnings: args.warnings ?? [],
    ...(args.error ? { error: args.error } : {}),
  };
}

export function createSecSourceEnvelope(identity: SecIdentity, accessedAt = new Date().toISOString()): SecSourceEnvelope {
  return {
    provider: 'SEC EDGAR',
    source: 'sec-edgar',
    accessedAt,
    identityUrl: SEC_IDENTITY_URL,
    submissionsUrl: buildSecSubmissionUrl(identity.cik),
    factsUrl: buildSecFactsUrl(identity.cik),
    schemaVersion: 1 as typeof SEC_SCHEMA_VERSION,
  };
}
