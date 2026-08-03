import {
  SEC_CACHE_POLICY,
  SEC_REQUEST_POLICY,
  buildSecArchiveUrl,
  buildSecCacheKey,
  buildSecCompanyData,
  buildSecFactsUrl,
  buildSecSubmissionUrl,
  classifySecCacheEntry,
  normalizeSecFacts,
  normalizeSecFilings,
  padSecCik,
  resolveCikFromTicker,
  isSecRetryableStatus,
  mergeCompanyFilings,
} from '../../src/data/sec';
import type { CompanyFiling, SecFiling } from '../../src/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const identity = resolveCikFromTicker('aapl', {
  0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
  1: { cik_str: '789019', ticker: 'MSFT', title: 'Microsoft Corp.' },
});
assert(identity?.cik === '0000320193', 'Ticker mapping must return a zero-padded verified CIK');
assert(identity?.verified === true, 'Ticker resolution must be explicitly verified');
assert(resolveCikFromTicker('UNKNOWN', [{ cik_str: 123, ticker: 'AAPL', title: 'Apple Inc.' }]) === null, 'Unknown tickers must not infer a CIK');
assert(padSecCik('123') === '0000000123', 'CIK padding should preserve numeric identity');
assert(padSecCik('not-a-cik') === null, 'Malformed CIKs must be rejected');

const submission = {
  filings: {
    recent: {
      accessionNumber: ['0000320193-24-000001', '0000320193-24-000002', 'bad'],
      form: ['10-K', '10-K/A', '10-K'],
      filingDate: ['2024-11-01', '2024-11-05', 'not-a-date'],
      reportDate: ['2024-09-28', '2024-09-28', '2024-09-28'],
      primaryDocument: ['annual.htm', 'annual-amend.htm', 'bad.htm'],
    },
  },
};
const filings = normalizeSecFilings(submission, identity!);
assert(filings.length === 2, 'Malformed filing rows must be discarded');
assert(filings[0]?.isAmendment === true && filings[0]?.form === '10-K/A', 'Amendments and forms must be retained');
assert(filings[0]?.filingUrl === 'https://www.sec.gov/Archives/edgar/data/320193/000032019324000002/annual-amend.htm', 'Archive URLs must use CIK and dashless accession');
assert(buildSecArchiveUrl('0000320193', '0000320193-24-000001', 'annual.htm').includes('/320193/000032019324000001/annual.htm'), 'Archive URL helper must normalize CIK/accession');
assert(buildSecSubmissionUrl('320193').endsWith('/CIK0000320193.json'), 'Submission URL must use a padded CIK');
assert(buildSecFactsUrl('320193').endsWith('/CIK0000320193.json'), 'Facts URL must use a padded CIK');

const facts = {
  facts: {
    'us-gaap': {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            { val: 100, start: '2023-01-01', end: '2023-03-31', accn: '0000320193-24-000001', form: '10-Q', filed: '2024-05-01', fp: 'Q1', frame: 'CY2023Q1' },
            { val: 200, start: '2023-04-01', end: '2023-06-30', accn: '0000320193-24-000001', form: '10-Q', filed: '2024-08-01', fp: 'Q2', frame: 'CY2023Q2' },
            { val: 300, start: '2023-07-01', end: '2023-09-30', accn: '0000320193-24-000001', form: '10-Q', filed: '2024-11-01', fp: 'Q3', frame: 'CY2023Q3' },
            { val: 400, start: '2023-10-01', end: '2023-12-31', accn: '0000320193-24-000001', form: '10-K', filed: '2025-02-01', fp: 'FY', frame: 'CY2023Q4' },
            { val: 1000, start: '2023-01-01', end: '2023-12-31', accn: '0000320193-24-000001', form: '10-K', filed: '2025-02-01', fp: 'FY' },
          ],
        },
      },
      CashAndCashEquivalentsAtCarryingValue: {
        units: {
          USD: [
            { val: 0, end: '2024-09-28', accn: '0000320193-24-000002', form: '10-K/A', filed: '2024-11-05' },
          ],
        },
      },
      OperatingIncomeLoss: { units: { USD: [{ val: 55, start: '2023-01-01', end: '2023-12-31', end: '2023-12-31', accn: '0000320193-24-000001', form: '10-K', filed: '2025-02-01', fp: 'FY' }] } },
      NetIncomeLoss: { units: { USD: [{ val: 'malformed', end: '2024-09-28', accn: '0000320193-24-000002', form: '10-K/A', filed: '2024-11-05' }] } },
    },
  },
};
const observations = normalizeSecFacts(facts, identity!, filings);
const revenue = observations.filter((observation) => observation.metric === 'revenue');
assert(revenue.some((observation) => observation.periodType === 'annual'), 'FY facts must be classified as annual');
assert(revenue.some((observation) => observation.periodType === 'quarterly'), 'Quarterly frame facts must be classified as quarterly');
assert(revenue.some((observation) => observation.periodType === 'ttm' && observation.measurement === 'derived' && observation.value === 1000), 'Four quarterly facts must produce a marked derived TTM');
const cash = observations.find((observation) => observation.metric === 'cash');
assert(cash?.value === 0 && cash.availability === 'reported', 'Reported zero must not be treated as missing');
const debt = observations.find((observation) => observation.metric === 'debt');
assert(debt?.availability === 'missing', 'Missing concepts must produce an explicit missing observation');
assert(!observations.some((observation) => observation.metric === 'netIncome' && observation.availability === 'reported'), 'Malformed numeric facts must be discarded');
assert(revenue.every((observation) => observation.unit === 'USD'), 'Fact units must be retained');
assert(revenue.some((observation) => observation.accessionNumber === '0000320193-24-000001'), 'Accession numbers must be retained');
assert(revenue.some((observation) => observation.sourceUrl?.includes('/320193/000032019324000001/')), 'Fact provenance must resolve to the filing URL');

const ready = buildSecCompanyData({
  ticker: 'AAPL',
  identity: identity!,
  submissions: submission,
  facts,
  source: {
    provider: 'SEC EDGAR', source: 'sec-edgar', accessedAt: '2025-01-01T00:00:00.000Z',
    identityUrl: 'https://www.sec.gov/files/company_tickers.json',
    submissionsUrl: buildSecSubmissionUrl(identity!.cik), factsUrl: buildSecFactsUrl(identity!.cik), schemaVersion: 1,
  },
});
assert(ready.metrics.revenue?.periodType === 'ttm', 'Latest metric selection should prefer derived TTM when available');
assert(ready.metrics.cash?.value === 0, 'Metric envelopes must preserve zero values');
assert(ready.metrics.debt?.availability === 'missing', 'Metric envelopes must preserve missing state');

assert(buildSecCacheKey('facts', '0000320193') === 'sec:v1:facts:0000320193', 'Cache keys must include schema version and identity');
assert(classifySecCacheEntry(100, 200, 300) === 'fresh', 'Fresh cache entries should be served directly');
assert(classifySecCacheEntry(250, 200, 300) === 'stale', 'Stale cache entries should support SWR');
assert(classifySecCacheEntry(350, 200, 300) === 'expired', 'Expired cache entries must refresh synchronously');
assert(SEC_CACHE_POLICY.identityTtlMs === 24 * 60 * 60 * 1000 && SEC_CACHE_POLICY.submissionsTtlMs >= 5 * 60 * 1000 && SEC_CACHE_POLICY.submissionsTtlMs <= 10 * 60 * 1000, 'Cache TTLs must match the approved Phase 0-1 bounds');
assert(SEC_CACHE_POLICY.factsTtlMs >= 6 * 60 * 60 * 1000 && SEC_CACHE_POLICY.factsTtlMs <= 24 * 60 * 60 * 1000, 'Facts cache TTL must remain bounded');
assert(SEC_REQUEST_POLICY.maxConcurrentRequests <= 2 && SEC_REQUEST_POLICY.minIntervalMs >= 200, 'SEC request rate must remain well below 10 requests per second');
assert(isSecRetryableStatus(429) && isSecRetryableStatus(503) && !isSecRetryableStatus(404), 'Only selected transient statuses should retry');

const yahooDuplicate: CompanyFiling = {
  type: '10-K', date: '2025-02-01', title: 'Annual report', url: 'https://finance.yahoo.com/sec-filing/AAPL/0000320193-25-000001_320193', exhibitCount: 2,
  reportPeriod: '2024-12-31', accessionNumber: null, primaryDocument: null, isAmendment: false,
};
const secDuplicate: SecFiling = {
  form: '10-K', filedDate: '2025-02-01', reportPeriod: '2024-12-31', accessionNumber: '0000320193-25-000001',
  primaryDocument: 'annual.htm', filingUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000001/annual.htm', isAmendment: false,
};
const yahooOnly: CompanyFiling = { type: '8-K', date: '2025-02-03', title: 'Supplemental update', url: 'https://finance.yahoo.com/8k', exhibitCount: 1 };
const secOnly: SecFiling = { ...secDuplicate, form: '10-Q', filedDate: '2025-01-15', reportPeriod: '2024-12-31', accessionNumber: '0000320193-25-000002', filingUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000002/q.htm' };
const amendment: SecFiling = { ...secDuplicate, form: '10-K/A', accessionNumber: '0000320193-25-000003', filingUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000003/annual-amend.htm', isAmendment: true };
const mergedFilings = mergeCompanyFilings([yahooDuplicate, yahooOnly], [secDuplicate, secOnly, amendment]);
assert(mergedFilings.length === 4, 'Unified filing merge should retain SEC-only and Yahoo-only rows without duplicates');
assert(mergedFilings.filter((filing) => filing.reportPeriod === '2024-12-31' && filing.form === '10-K').length === 1, 'SEC-preferred duplicate should collapse to one row');
assert(mergedFilings.some((filing) => filing.url === secDuplicate.filingUrl && filing.title === 'Annual report'), 'Matched filing should keep the official SEC URL and Yahoo detail');
assert(mergedFilings.some((filing) => filing.url === yahooOnly.url), 'Yahoo-only filing should be retained');
assert(mergedFilings.some((filing) => filing.accessionNumber === secOnly.accessionNumber), 'SEC-only filing should be retained');
assert(mergedFilings.some((filing) => filing.isAmendment && filing.accessionNumber === amendment.accessionNumber), 'Distinct amendments must not be collapsed');

console.log('SEC EDGAR fixture checks passed');
