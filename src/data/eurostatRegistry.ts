import type { MacroMetricKey } from '../types';

export type EurostatDetailGroup = 'labour' | 'activity' | 'prices-trade';

export interface EurostatSeriesDefinition {
  id: string;
  label: string;
  shortLabel: string;
  dataset: string;
  sourceUrl: string;
  params: Record<string, string>;
  unit: 'index' | '%' | 'billion EUR';
  unitLabel: string;
  frequency: 'monthly' | 'quarterly';
  seasonalAdjustment: 'seasonally adjusted' | 'calendar adjusted' | 'seasonally and calendar adjusted' | 'not seasonally adjusted';
  transformation: 'level' | 'year-over-year percent' | 'quarter-over-quarter percent';
  maxAbsValue: number;
  placement: 'core' | 'detail';
  group?: EurostatDetailGroup;
  metricKey?: MacroMetricKey;
  areaScope: 'Euro Area 21';
  publicApi: boolean;
  coverageNote?: string;
}

export const EUROSTAT_SERIES: readonly EurostatSeriesDefinition[] = [
  {
    id: 'unemployment', label: 'Unemployment', shortLabel: 'Unemployment', dataset: 'une_rt_m',
    sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/une_rt_m/default/table',
    params: { freq: 'M', s_adj: 'SA', age: 'TOTAL', unit: 'PC_ACT', sex: 'T' }, unit: '%', unitLabel: '%',
    frequency: 'monthly', seasonalAdjustment: 'seasonally adjusted', transformation: 'level', maxAbsValue: 40,
    placement: 'core', metricKey: 'unemployment', areaScope: 'Euro Area 21', publicApi: true,
  },
  {
    id: 'gdpGrowth', label: 'Real GDP Growth QoQ', shortLabel: 'GDP growth', dataset: 'namq_10_gdp',
    sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/namq_10_gdp/default/table',
    params: { freq: 'Q', na_item: 'B1GQ', s_adj: 'SCA', unit: 'CLV_PCH_PRE' }, unit: '%', unitLabel: '% QoQ',
    frequency: 'quarterly', seasonalAdjustment: 'seasonally and calendar adjusted', transformation: 'quarter-over-quarter percent', maxAbsValue: 50,
    placement: 'core', metricKey: 'gdpGrowth', areaScope: 'Euro Area 21', publicApi: true,
  },
  {
    id: 'labourCostGrowth', label: 'Hourly labour-cost growth', shortLabel: 'Labour costs', dataset: 'lc_lci_r2_q',
    sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/lc_lci_r2_q/default/table',
    params: { freq: 'Q', s_adj: 'CA', unit: 'PCH_SM', nace_r2: 'B-S', lcstruct: 'D1_D4_MD5' }, unit: '%', unitLabel: '% YoY',
    frequency: 'quarterly', seasonalAdjustment: 'calendar adjusted', transformation: 'year-over-year percent', maxAbsValue: 25,
    placement: 'detail', group: 'labour', areaScope: 'Euro Area 21', publicApi: true,
  },
  {
    id: 'jobVacancyRate', label: 'Job vacancy rate', shortLabel: 'Vacancies', dataset: 'jvs_q_nace2',
    sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/jvs_q_nace2/default/table',
    params: { freq: 'Q', s_adj: 'NSA', nace_r2: 'B-S', sizeclas: 'TOTAL', indic_em: 'JVR' }, unit: '%', unitLabel: '% of posts',
    frequency: 'quarterly', seasonalAdjustment: 'not seasonally adjusted', transformation: 'level', maxAbsValue: 20,
    placement: 'detail', group: 'labour', areaScope: 'Euro Area 21', publicApi: true,
  },
  {
    id: 'retailVolume', label: 'Retail sales volume', shortLabel: 'Retail', dataset: 'sts_trtu_m',
    sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/sts_trtu_m/default/table',
    params: { freq: 'M', indic_bt: 'VOL_SLS', nace_r2: 'G47', s_adj: 'SCA', unit: 'I21' }, unit: 'index', unitLabel: 'Index 2021=100',
    frequency: 'monthly', seasonalAdjustment: 'seasonally and calendar adjusted', transformation: 'level', maxAbsValue: 300,
    placement: 'detail', group: 'activity', areaScope: 'Euro Area 21', publicApi: true,
  },
  {
    id: 'constructionOutput', label: 'Construction output', shortLabel: 'Construction', dataset: 'sts_copr_m',
    sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/sts_copr_m/default/table',
    params: { freq: 'M', indic_bt: 'PRD', nace_r2: 'F', s_adj: 'SCA', unit: 'I21' }, unit: 'index', unitLabel: 'Index 2021=100',
    frequency: 'monthly', seasonalAdjustment: 'seasonally and calendar adjusted', transformation: 'level', maxAbsValue: 300,
    placement: 'detail', group: 'activity', areaScope: 'Euro Area 21', publicApi: true,
  },
  {
    id: 'servicesProduction', label: 'Services production', shortLabel: 'Services', dataset: 'sts_sepr_m',
    sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/sts_sepr_m/default/table',
    params: { freq: 'M', indic_bt: 'PRD', nace_r2: 'H-N_X_K', s_adj: 'SCA', unit: 'I21' }, unit: 'index', unitLabel: 'Index 2021=100',
    frequency: 'monthly', seasonalAdjustment: 'seasonally and calendar adjusted', transformation: 'level', maxAbsValue: 300,
    placement: 'detail', group: 'activity', areaScope: 'Euro Area 21', publicApi: true,
  },
  {
    id: 'producerPriceInflation', label: 'Industrial producer prices', shortLabel: 'Producer prices', dataset: 'sts_inpp_m',
    sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/sts_inpp_m/default/table',
    params: { freq: 'M', indic_bt: 'PRC_PRR', nace_r2: 'B-E36', s_adj: 'NSA', unit: 'PCH_SM' }, unit: '%', unitLabel: '% YoY',
    frequency: 'monthly', seasonalAdjustment: 'not seasonally adjusted', transformation: 'year-over-year percent', maxAbsValue: 50,
    placement: 'detail', group: 'prices-trade', areaScope: 'Euro Area 21', publicApi: true,
  },
  {
    id: 'goodsTradeBalance', label: 'Goods trade balance', shortLabel: 'Goods balance', dataset: 'ext_st_ea_sitc',
    sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/ext_st_ea_sitc/default/table',
    params: {}, unit: 'billion EUR', unitLabel: '€bn', frequency: 'monthly', seasonalAdjustment: 'seasonally adjusted',
    transformation: 'level', maxAbsValue: 500, placement: 'detail', group: 'prices-trade', areaScope: 'Euro Area 21', publicApi: false,
    coverageNote: 'The current Euro Area release table is not exposed through Eurostat’s standard statistics endpoint.',
  },
] as const;

export const EUROSTAT_DETAIL_SERIES = EUROSTAT_SERIES.filter((definition) => definition.placement === 'detail');
export const EUROSTAT_PUBLIC_SERIES = EUROSTAT_SERIES.filter((definition) => definition.publicApi);
export const EUROSTAT_SCHEMA_VERSION = 4;
