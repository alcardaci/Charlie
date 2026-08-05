import type { MacroCountryCode } from '../types';

export const OECD_CLI_COUNTRIES = [
  { code: 'USA', label: 'United States' },
  { code: 'DEU', label: 'Germany' },
  { code: 'FRA', label: 'France' },
  { code: 'ITA', label: 'Italy' },
  { code: 'GBR', label: 'United Kingdom' },
] as const;

export const OECD_CLI_SOURCE_URL = 'https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_CLI,4.1/USA+DEU+FRA+ITA+GBR.M.LI...AA...H';

export type OecdComparableMetricKey = 'employmentGrowth' | 'industrialProduction';
export type OecdComparableFrequency = 'monthly' | 'quarterly';
export type OecdComparableTransformation = 'level' | 'derived-qoq-percent';

export interface OecdComparableSeriesContract {
  key: OecdComparableMetricKey;
  label: string;
  shortLabel: string;
  dataset: 'OECD.SDD.STES,DSD_KEI@DF_KEI,4.0';
  frequencyCode: 'M' | 'Q';
  frequency: OecdComparableFrequency;
  measure: 'EMP' | 'PRVM';
  unitMeasure: 'PS' | 'IX';
  activity: '_T' | 'BTE';
  adjustment: 'Y';
  transformationCode: '_Z';
  transformation: OecdComparableTransformation;
  unit: '%' | 'index';
  unitLabel: string;
  maxAbsValue: number;
  basePeriod?: '2015';
}

export const OECD_COMPARABLE_SERIES: Record<OecdComparableMetricKey, OecdComparableSeriesContract> = {
  employmentGrowth: {
    key: 'employmentGrowth',
    label: 'Employment growth QoQ',
    shortLabel: 'Employment',
    dataset: 'OECD.SDD.STES,DSD_KEI@DF_KEI,4.0',
    frequencyCode: 'Q',
    frequency: 'quarterly',
    measure: 'EMP',
    unitMeasure: 'PS',
    activity: '_T',
    adjustment: 'Y',
    transformationCode: '_Z',
    transformation: 'derived-qoq-percent',
    unit: '%',
    unitLabel: '% QoQ',
    maxAbsValue: 10,
  },
  industrialProduction: {
    key: 'industrialProduction',
    label: 'Industrial production',
    shortLabel: 'Industry',
    dataset: 'OECD.SDD.STES,DSD_KEI@DF_KEI,4.0',
    frequencyCode: 'M',
    frequency: 'monthly',
    measure: 'PRVM',
    unitMeasure: 'IX',
    activity: 'BTE',
    adjustment: 'Y',
    transformationCode: '_Z',
    transformation: 'level',
    unit: 'index',
    unitLabel: 'Index 2015=100',
    maxAbsValue: 500,
    basePeriod: '2015',
  },
};

export interface OecdCountryContract {
  country: MacroCountryCode;
  oecdCode: 'USA' | 'EA20' | 'GBR' | 'CAN' | 'JPN' | 'CHE' | 'SWE' | 'NOR' | 'AUS' | 'NZL';
  label: string;
  coverage: Record<OecdComparableMetricKey, true | string>;
}

const INDUSTRIAL_COVERAGE_GAP = 'OECD does not publish this comparable industrial-production series for this country.';

export const OECD_COUNTRY_REGISTRY: Record<MacroCountryCode, OecdCountryContract> = {
  US: { country: 'US', oecdCode: 'USA', label: 'United States', coverage: { employmentGrowth: true, industrialProduction: true } },
  EA: { country: 'EA', oecdCode: 'EA20', label: 'Euro Area', coverage: { employmentGrowth: true, industrialProduction: true } },
  GB: { country: 'GB', oecdCode: 'GBR', label: 'United Kingdom', coverage: { employmentGrowth: true, industrialProduction: true } },
  CA: { country: 'CA', oecdCode: 'CAN', label: 'Canada', coverage: { employmentGrowth: true, industrialProduction: true } },
  JP: { country: 'JP', oecdCode: 'JPN', label: 'Japan', coverage: { employmentGrowth: true, industrialProduction: true } },
  CH: { country: 'CH', oecdCode: 'CHE', label: 'Switzerland', coverage: { employmentGrowth: true, industrialProduction: true } },
  SE: { country: 'SE', oecdCode: 'SWE', label: 'Sweden', coverage: { employmentGrowth: true, industrialProduction: true } },
  NO: { country: 'NO', oecdCode: 'NOR', label: 'Norway', coverage: { employmentGrowth: true, industrialProduction: true } },
  AU: { country: 'AU', oecdCode: 'AUS', label: 'Australia', coverage: { employmentGrowth: true, industrialProduction: INDUSTRIAL_COVERAGE_GAP } },
  NZ: { country: 'NZ', oecdCode: 'NZL', label: 'New Zealand', coverage: { employmentGrowth: true, industrialProduction: INDUSTRIAL_COVERAGE_GAP } },
};

export function getOecdCountryContract(country: MacroCountryCode): OecdCountryContract {
  const contract = OECD_COUNTRY_REGISTRY[country];
  if (!contract || contract.country !== country) throw new Error(`Invalid OECD country contract for ${country}`);
  return contract;
}

export function getOecdComparableSeriesContract(metric: OecdComparableMetricKey): OecdComparableSeriesContract {
  const contract = OECD_COMPARABLE_SERIES[metric];
  if (!contract || contract.key !== metric) throw new Error(`Invalid OECD comparable series contract for ${metric}`);
  return contract;
}

export function buildOecdKeiSeriesKey(country: MacroCountryCode, metric: OecdComparableMetricKey): string | null {
  const countryContract = getOecdCountryContract(country);
  const coverage = countryContract.coverage[metric];
  if (coverage !== true) return null;
  const series = getOecdComparableSeriesContract(metric);
  return [countryContract.oecdCode, series.frequencyCode, series.measure, series.unitMeasure, series.activity, series.adjustment, series.transformationCode].join('.');
}

export function buildOecdKeiSourceUrl(country: MacroCountryCode, metric: OecdComparableMetricKey): string {
  const seriesKey = buildOecdKeiSeriesKey(country, metric);
  if (!seriesKey) return 'https://data-explorer.oecd.org/';
  return `https://data-explorer.oecd.org/vis?df%5Bag%5D=OECD.SDD.STES&df%5Bid%5D=DSD_KEI%40DF_KEI&df%5Bvs%5D=4.0&dq=${encodeURIComponent(seriesKey)}`;
}
