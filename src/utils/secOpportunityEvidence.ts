import type { DiscoveredTheme } from './themeDiscoveryEngine';
import type { SecCompanyData, SecMetricObservation, SecOpportunityEvidence } from '../types';

const SEC_EVIDENCE_FORMS = new Set(['10-K', '10-K/A', '10-Q', '10-Q/A', '8-K', '8-K/A', '20-F', '20-F/A']);
const MAX_SYMBOLS = 8;
const MAX_FILINGS_PER_SYMBOL = 3;
const MAX_METRICS_PER_SYMBOL = 5;
const RECENT_FILING_WINDOW_MS = 370 * 24 * 60 * 60 * 1000;

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function isRecent(date: string): boolean {
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= RECENT_FILING_WINDOW_MS;
}

function metricRows(data: SecCompanyData): SecOpportunityEvidence['metrics'] {
  return (Object.entries(data.metrics) as Array<[SecOpportunityEvidence['metrics'][number]['key'], SecMetricObservation | null]>)
    .flatMap(([key, observation]) => {
      if (!observation || observation.availability !== 'reported' || observation.value == null || !observation.unit) return [];
      return [{
        key,
        label: observation.label,
        value: observation.value,
        unit: observation.unit,
        periodType: observation.periodType,
        reportPeriod: observation.reportPeriodEnd,
      }];
    })
    .slice(0, MAX_METRICS_PER_SYMBOL);
}

export function selectSecOpportunityEvidence(
  relevantSymbols: string[],
  dataBySymbol: Record<string, SecCompanyData | undefined>,
): SecOpportunityEvidence[] {
  const symbols = Array.from(new Set(relevantSymbols.map(normalizeSymbol).filter(Boolean))).slice(0, MAX_SYMBOLS);
  return symbols.flatMap((symbol) => {
    const data = dataBySymbol[symbol];
    if (!data || !data.identity || data.status === 'unsupported' || data.status === 'error' || data.status === 'rate-limit') return [];
    const metrics = metricRows(data);
    return data.filings
      .filter((filing) => SEC_EVIDENCE_FORMS.has(filing.form) && isRecent(filing.filedDate))
      .slice(0, MAX_FILINGS_PER_SYMBOL)
      .map((filing) => ({
        id: `sec:${symbol}:${filing.accessionNumber}`,
        symbol,
        form: filing.form,
        filedDate: filing.filedDate,
        reportPeriod: filing.reportPeriod,
        accessionNumber: filing.accessionNumber,
        url: filing.filingUrl,
        metrics,
      }));
  });
}

export function attachSecEvidenceToExistingThemes(
  themes: DiscoveredTheme[],
  evidence: SecOpportunityEvidence[],
): DiscoveredTheme[] {
  return themes.map((theme) => {
    const symbols = new Set(theme.linkedAssets.map((asset) => normalizeSymbol(asset.symbol)));
    const filingEvidence = evidence.filter((item) => symbols.has(item.symbol));
    return filingEvidence.length > 0 ? { ...theme, filingEvidence } : theme;
  });
}

// Only the existing guidance pass receives SEC context, after discovery has fixed the themes/assets.
export function selectSecEvidenceForTheme(evidence: unknown, linkedAssets: string[]): SecOpportunityEvidence[] {
  if (!Array.isArray(evidence)) return [];
  const symbols = new Set(linkedAssets.map(normalizeSymbol));
  return evidence.slice(0, MAX_SYMBOLS * MAX_FILINGS_PER_SYMBOL).flatMap((item) => {
    if (!item || typeof item !== 'object' || typeof item.symbol !== 'string') return [];
    const symbol = normalizeSymbol(item.symbol);
    if (!symbols.has(symbol) || !SEC_EVIDENCE_FORMS.has(item.form)
      || !/^\d{10}-\d{2}-\d{6}$/.test(item.accessionNumber ?? '')
      || !/^\d{4}-\d{2}-\d{2}$/.test(item.filedDate ?? '')
      || !/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d{18}\//.test(item.url ?? '')) return [];
    const metrics = Array.isArray(item.metrics) ? item.metrics.flatMap((metric: SecOpportunityEvidence['metrics'][number]) => {
      if (!metric || !['revenue', 'operatingIncome', 'netIncome', 'cash', 'debt'].includes(metric.key)
        || typeof metric.value !== 'number' || !Number.isFinite(metric.value)
        || typeof metric.label !== 'string' || typeof metric.unit !== 'string'
        || !['annual', 'quarterly', 'ttm', 'instant', 'unknown'].includes(metric.periodType)) return [];
      return [{ key: metric.key, label: metric.label.slice(0, 80), value: metric.value, unit: metric.unit.slice(0, 20),
        periodType: metric.periodType, reportPeriod: /^\d{4}-\d{2}-\d{2}$/.test(metric.reportPeriod ?? '') ? metric.reportPeriod : null }];
    }).slice(0, MAX_METRICS_PER_SYMBOL) : [];
    return [{ id: `sec:${symbol}:${item.accessionNumber}`, symbol, form: item.form, filedDate: item.filedDate,
      reportPeriod: /^\d{4}-\d{2}-\d{2}$/.test(item.reportPeriod ?? '') ? item.reportPeriod : null,
      accessionNumber: item.accessionNumber, url: item.url, metrics }];
  });
}
