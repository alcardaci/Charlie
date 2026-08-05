export interface BlsSeriesDefinition {
  id: string;
  label: string;
  shortLabel: string;
  unit: string;
  seasonalAdjustment: 'seasonally adjusted' | 'not seasonally adjusted' | 'unknown';
  valueScale?: number;
  sourceUrl: string;
}

export const BLS_SERIES: readonly BlsSeriesDefinition[] = [
  {
    id: 'CES0000000001',
    label: 'Nonfarm employment',
    shortLabel: 'Payrolls',
    unit: 'thousand jobs',
    seasonalAdjustment: 'seasonally adjusted',
    sourceUrl: 'https://data.bls.gov/timeseries/CES0000000001',
  },
  {
    id: 'CES0500000003',
    label: 'Average hourly earnings',
    shortLabel: 'Hourly earnings',
    unit: 'USD/hour',
    seasonalAdjustment: 'seasonally adjusted',
    sourceUrl: 'https://data.bls.gov/timeseries/CES0500000003',
  },
] as const;
