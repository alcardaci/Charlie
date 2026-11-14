export type BlsSeriesFamily = 'headline' | 'jolts' | 'work-cost' | 'productivity' | 'trade-prices' | 'sector-payrolls';
export type BlsSeriesFrequency = 'monthly' | 'quarterly';
export type BlsSeriesTransformation = 'level' | 'derived-yoy-percent';

export interface BlsSeriesDefinition {
  id: string;
  label: string;
  shortLabel: string;
  family: BlsSeriesFamily;
  frequency: BlsSeriesFrequency;
  unit: string;
  seasonalAdjustment: 'seasonally adjusted' | 'not seasonally adjusted' | 'unknown';
  transformation: BlsSeriesTransformation;
  maxAbsValue: number;
  sourceUrl: string;
}

const series = (
  id: string,
  label: string,
  shortLabel: string,
  family: BlsSeriesFamily,
  frequency: BlsSeriesFrequency,
  unit: string,
  seasonalAdjustment: BlsSeriesDefinition['seasonalAdjustment'],
  maxAbsValue: number,
  transformation: BlsSeriesTransformation = 'level',
): BlsSeriesDefinition => ({
  id, label, shortLabel, family, frequency, unit, seasonalAdjustment, transformation, maxAbsValue,
  sourceUrl: `https://data.bls.gov/timeseries/${id}`,
});

export const BLS_SERIES: readonly BlsSeriesDefinition[] = [
  series('CES0000000001', 'Nonfarm employment', 'Payrolls', 'headline', 'monthly', 'thousand jobs', 'seasonally adjusted', 250_000),
  series('CES0500000003', 'Average hourly earnings', 'Hourly earnings', 'headline', 'monthly', 'USD/hour', 'seasonally adjusted', 200),
  series('JTS000000000000000JOR', 'Job openings rate', 'Openings', 'jolts', 'monthly', '%', 'seasonally adjusted', 25),
  series('JTS000000000000000QUR', 'Quits rate', 'Quits', 'jolts', 'monthly', '%', 'seasonally adjusted', 15),
  series('JTS000000000000000LDR', 'Layoffs and discharges rate', 'Layoffs', 'jolts', 'monthly', '%', 'seasonally adjusted', 15),
  series('CES0500000002', 'Average weekly hours', 'Weekly hours', 'work-cost', 'monthly', 'hours/week', 'seasonally adjusted', 80),
  series('CIS1010000000000Q', 'Employment Cost Index', 'ECI', 'work-cost', 'quarterly', '% QoQ', 'seasonally adjusted', 15),
  series('PRS85006092', 'Labour productivity', 'Productivity', 'productivity', 'quarterly', '% annualised', 'seasonally adjusted', 40),
  series('PRS85006112', 'Unit labour costs', 'Unit labour costs', 'productivity', 'quarterly', '% annualised', 'seasonally adjusted', 40),
  series('EIUIR', 'Import prices', 'Imports', 'trade-prices', 'monthly', '% YoY', 'not seasonally adjusted', 50, 'derived-yoy-percent'),
  series('EIUIQ', 'Export prices', 'Exports', 'trade-prices', 'monthly', '% YoY', 'not seasonally adjusted', 50, 'derived-yoy-percent'),
  series('CES2000000001', 'Construction payrolls', 'Construction', 'sector-payrolls', 'monthly', 'thousand jobs', 'seasonally adjusted', 25_000),
  series('CES3000000001', 'Manufacturing payrolls', 'Manufacturing', 'sector-payrolls', 'monthly', 'thousand jobs', 'seasonally adjusted', 30_000),
  series('CES5000000001', 'Information payrolls', 'Information', 'sector-payrolls', 'monthly', 'thousand jobs', 'seasonally adjusted', 10_000),
  series('CES5500000001', 'Financial activities payrolls', 'Financials', 'sector-payrolls', 'monthly', 'thousand jobs', 'seasonally adjusted', 20_000),
] as const;

export const BLS_SERIES_SCHEMA_VERSION = 2;
