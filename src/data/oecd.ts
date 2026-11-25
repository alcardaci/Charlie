import type { MacroCountryCode, OecdComparableIndicator, OecdCountryMacroData, OecdIndicator } from '../types';
import {
  OECD_CLI_COUNTRIES,
  OECD_COMPARABLE_SERIES,
  buildOecdKeiSeriesKey,
  buildOecdKeiSourceUrl,
  getOecdCountryContract,
  type OecdComparableMetricKey,
  type OecdComparableSeriesContract,
} from './oecdRegistry';

type OecdPayload = {
  data?: {
    structure?: {
      dimensions?: {
        observation?: Array<{ id?: string; values?: Array<{ id?: string; name?: string }> }>;
      };
    };
    structures?: Array<{
      dimensions?: {
        observation?: Array<{ id?: string; values?: Array<{ id?: string; name?: string }> }>;
      };
    }>;
    dataSets?: Array<{ observations?: Record<string, Array<number | null>> }>;
  };
};

type OecdCountryProxyPayload = {
  series?: Partial<Record<OecdComparableMetricKey, OecdPayload>>;
  errors?: string[];
};

const OECD_COMPARABLE_METRICS = Object.keys(OECD_COMPARABLE_SERIES) as OecdComparableMetricKey[];

export function normalizeOecdCli(payload: OecdPayload, sourceUrl: string): OecdIndicator[] {
  const structure = payload.data?.structure ?? payload.data?.structures?.[0];
  const observations = payload.data?.dataSets?.[0]?.observations ?? {};
  const dimensions = structure?.dimensions?.observation ?? [];
  const countryDimension = dimensions.find((dimension) => dimension.id === 'REF_AREA');
  const timeDimension = dimensions.find((dimension) => dimension.id === 'TIME_PERIOD');
  if (!countryDimension || !timeDimension) return [];

  const countryValues = countryDimension.values ?? [];
  const timeValues = timeDimension.values ?? [];
  const seriesByCountry = new Map<string, Array<{ date: string; value: number }>>();
  for (const [key, row] of Object.entries(observations)) {
    const indexes = key.split(':').map((value) => Number(value));
    const country = countryValues[indexes[0] ?? -1];
    const time = timeValues[indexes[indexes.length - 1] ?? -1];
    const value = Number(row?.[0]);
    if (!country?.id || !time?.id || !Number.isFinite(value) || !/^\d{4}-\d{2}$/.test(time.id)) continue;
    const series = seriesByCountry.get(country.id) ?? [];
    series.push({ date: `${time.id}-01`, value });
    seriesByCountry.set(country.id, series);
  }

  return OECD_CLI_COUNTRIES.flatMap((definition) => {
    const series = (seriesByCountry.get(definition.code) ?? []).sort((left, right) => left.date.localeCompare(right.date));
    const latest = series[series.length - 1];
    const previous = series[series.length - 2];
    return [{
      countryCode: definition.code,
      countryLabel: definition.label,
      value: latest?.value ?? null,
      previous: previous?.value ?? null,
      change: latest && previous ? latest.value - previous.value : null,
      date: latest?.date,
      series,
      unit: 'index' as const,
      sourceUrl,
    }];
  });
}

export function normalizeOecdCountryData(
  country: MacroCountryCode,
  payload: OecdCountryProxyPayload | null,
  cache: OecdCountryMacroData['cache'] = 'fresh',
): OecdCountryMacroData {
  const countryContract = getOecdCountryContract(country);
  const indicators = OECD_COMPARABLE_METRICS.map((metric) => {
    const coverage = countryContract.coverage[metric];
    if (coverage !== true) return unavailableComparableIndicator(country, metric, coverage);
    const normalized = normalizeOecdComparableSeries(country, metric, payload?.series?.[metric]);
    return normalized ?? unavailableComparableIndicator(country, metric, 'OECD has no current observations for this comparable series.');
  });
  const readyCount = indicators.filter((indicator) => indicator.status === 'ready').length;
  const baseStatus = readyCount === indicators.length ? 'ready' : readyCount > 0 ? 'partial' : 'unavailable';
  return {
    status: cache === 'stale' && readyCount > 0 ? 'stale' : baseStatus,
    source: 'OECD economic indicators',
    accessedAt: new Date().toISOString(),
    country,
    oecdCountryCode: countryContract.oecdCode,
    indicators,
    warning: payload?.errors?.length ? payload.errors.join('; ') : undefined,
    cache,
  };
}

export function normalizeOecdComparableSeries(
  country: MacroCountryCode,
  metric: OecdComparableMetricKey,
  payload: OecdPayload | undefined,
): OecdComparableIndicator | null {
  if (!payload) return null;
  const countryContract = getOecdCountryContract(country);
  const contract = OECD_COMPARABLE_SERIES[metric];
  const dimensions = (payload.data?.structure ?? payload.data?.structures?.[0])?.dimensions?.observation ?? [];
  const observations = payload.data?.dataSets?.[0]?.observations ?? {};
  if (!dimensions.length) return null;

  const expectedDimensions: Record<string, string> = {
    REF_AREA: countryContract.oecdCode,
    FREQ: contract.frequencyCode,
    MEASURE: contract.measure,
    UNIT_MEASURE: contract.unitMeasure,
    ACTIVITY: contract.activity,
    ADJUSTMENT: contract.adjustment,
    TRANSFORMATION: contract.transformationCode,
    ...(contract.timeHoriz ? { TIME_HORIZ: contract.timeHoriz } : {}),
    ...(contract.methodology ? { METHODOLOGY: contract.methodology } : {}),
  };
  const timeIndex = dimensions.findIndex((dimension) => dimension.id === 'TIME_PERIOD');
  if (timeIndex < 0) return null;

  const rawSeries = Object.entries(observations).flatMap(([key, row]) => {
    const indexes = key.split(':').map(Number);
    const matchesContract = dimensions.every((dimension, index) => {
      const expected = dimension.id ? expectedDimensions[dimension.id] : undefined;
      if (!expected) return true;
      return dimension.values?.[indexes[index]]?.id === expected;
    });
    const period = dimensions[timeIndex]?.values?.[indexes[timeIndex]]?.id;
    const date = period ? normalizeOecdPeriod(period, contract.frequency) : null;
    const value = Number(row?.[0]);
    if (!matchesContract || !date || !Number.isFinite(value) || value <= 0) return [];
    if (contract.transformation === 'level' && Math.abs(value) > contract.maxAbsValue) return [];
    return [{ date, value }];
  }).sort((left, right) => left.date.localeCompare(right.date));

  const series = contract.transformation === 'derived-qoq-percent'
    ? deriveComparableGrowth(rawSeries, contract)
    : rawSeries;
  if (!series.length) return null;
  const latest = series[series.length - 1];
  const previous = series[series.length - 2];
  return {
    key: metric,
    label: contract.label,
    shortLabel: contract.shortLabel,
    status: 'ready',
    value: latest?.value ?? null,
    previous: previous?.value ?? null,
    change: latest && previous ? latest.value - previous.value : null,
    date: latest?.date,
    unit: contract.unit,
    unitLabel: contract.unitLabel,
    frequency: contract.frequency,
    transformation: contract.transformation,
    areaScope: countryContract.label,
    seriesId: `OECD:${buildOecdKeiSeriesKey(country, metric)}`,
    series,
    sourceUrl: buildOecdKeiSourceUrl(country, metric),
  };
}

function unavailableComparableIndicator(
  country: MacroCountryCode,
  metric: OecdComparableMetricKey,
  coverageNote: string,
): OecdComparableIndicator {
  const contract = OECD_COMPARABLE_SERIES[metric];
  const countryContract = getOecdCountryContract(country);
  return {
    key: metric,
    label: contract.label,
    shortLabel: contract.shortLabel,
    status: 'unavailable',
    value: null,
    previous: null,
    change: null,
    unit: contract.unit,
    unitLabel: contract.unitLabel,
    frequency: contract.frequency,
    transformation: contract.transformation,
    areaScope: countryContract.label,
    seriesId: `OECD:${countryContract.oecdCode}:${metric}:unavailable`,
    series: [],
    sourceUrl: buildOecdKeiSourceUrl(country, metric),
    coverageNote,
  };
}

function normalizeOecdPeriod(period: string, frequency: OecdComparableSeriesContract['frequency']): string | null {
  if (frequency === 'monthly' && /^\d{4}-\d{2}$/.test(period)) return `${period}-01`;
  const quarter = period.match(/^(\d{4})-Q([1-4])$/);
  if (frequency === 'quarterly' && quarter) {
    const month = String((Number(quarter[2]) - 1) * 3 + 1).padStart(2, '0');
    return `${quarter[1]}-${month}-01`;
  }
  return null;
}

function deriveComparableGrowth(
  rawSeries: Array<{ date: string; value: number }>,
  contract: OecdComparableSeriesContract,
): Array<{ date: string; value: number }> {
  return rawSeries.slice(1).flatMap((point, index) => {
    const previous = rawSeries[index];
    if (!previous || !areConsecutiveQuarters(previous.date, point.date)) return [];
    const value = ((point.value / previous.value) - 1) * 100;
    if (!Number.isFinite(value) || Math.abs(value) > contract.maxAbsValue) return [];
    return [{ date: point.date, value }];
  });
}

function areConsecutiveQuarters(previous: string, current: string): boolean {
  const toQuarter = (date: string) => {
    const [year, month] = date.split('-').map(Number);
    return year * 4 + Math.floor((month - 1) / 3);
  };
  return toQuarter(current) - toQuarter(previous) === 1;
}
