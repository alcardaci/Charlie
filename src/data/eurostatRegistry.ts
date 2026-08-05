import type { MacroMetricKey } from '../types';

export interface EurostatSeriesDefinition {
  id: string;
  label: string;
  dataset: string;
  sourceUrl: string;
  params: Record<string, string>;
  unit: 'index' | '%';
  frequency: 'monthly' | 'quarterly';
  placement: 'core' | 'detail';
  metricKey?: MacroMetricKey;
  areaScope: 'Euro Area 21';
}

export const EUROSTAT_SERIES: readonly EurostatSeriesDefinition[] = [
  {
    id: 'unemployment',
    label: 'Unemployment',
    dataset: 'une_rt_m',
    sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/une_rt_m/default/table',
    params: { freq: 'M', s_adj: 'SA', age: 'TOTAL', unit: 'PC_ACT', sex: 'T' },
    unit: '%', frequency: 'monthly', placement: 'core', metricKey: 'unemployment', areaScope: 'Euro Area 21',
  },
  {
    id: 'gdpGrowth',
    label: 'Real GDP Growth QoQ',
    dataset: 'namq_10_gdp',
    sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/namq_10_gdp/default/table',
    params: { freq: 'Q', na_item: 'B1GQ', s_adj: 'SCA', unit: 'CLV_PCH_PRE' },
    unit: '%', frequency: 'quarterly', placement: 'core', metricKey: 'gdpGrowth', areaScope: 'Euro Area 21',
  },
  {
    id: 'retailVolume',
    label: 'Retail sales volume',
    dataset: 'sts_trtu_m',
    sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/sts_trtu_m/default/table',
    params: { freq: 'M', indic_bt: 'VOL_SLS', nace_r2: 'G47', s_adj: 'SCA', unit: 'I21' },
    unit: 'index', frequency: 'monthly', placement: 'detail', areaScope: 'Euro Area 21',
  },
] as const;

export const EUROSTAT_DETAIL_SERIES = EUROSTAT_SERIES.filter((definition) => definition.placement === 'detail');
