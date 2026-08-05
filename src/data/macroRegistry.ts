import { MacroCountryCode, MacroMetricKey } from '../types';

export interface MacroCountryDefinition {
  code: MacroCountryCode;
  label: string;
  shortLabel: string;
}

export interface MacroMetricDefinition {
  key: MacroMetricKey;
  label: string;
  shortLabel: string;
  unit: string;
}

export type MacroFrequency = 'daily' | 'monthly' | 'quarterly' | 'annual';

export interface MacroSeriesContract {
  country: MacroCountryCode;
  metric: MacroMetricKey;
  source: 'FRED';
  seriesId: string;
  sourceTitle: string;
  sourceUrl: string;
  displayLabel: string;
  shortLabel: string;
  unit: '%';
  frequency: MacroFrequency;
  areaScope: string;
  fredUnits?: 'pc1';
  maxAbsValue: number;
}

export const MACRO_COUNTRIES: MacroCountryDefinition[] = [
  { code: 'US', label: 'United States', shortLabel: 'US' },
  { code: 'EA', label: 'Euro Area', shortLabel: 'EA' },
  { code: 'GB', label: 'United Kingdom', shortLabel: 'UK' },
  { code: 'CA', label: 'Canada', shortLabel: 'CA' },
  { code: 'JP', label: 'Japan', shortLabel: 'JP' },
  { code: 'CH', label: 'Switzerland', shortLabel: 'CH' },
  { code: 'SE', label: 'Sweden', shortLabel: 'SE' },
  { code: 'NO', label: 'Norway', shortLabel: 'NO' },
  { code: 'AU', label: 'Australia', shortLabel: 'AU' },
  { code: 'NZ', label: 'New Zealand', shortLabel: 'NZ' },
];

export const MACRO_METRICS: Record<MacroMetricKey, MacroMetricDefinition> = {
  policyRate: { key: 'policyRate', label: 'Policy / Short Rate', shortLabel: 'Rate', unit: '%' },
  inflation: { key: 'inflation', label: 'CPI YoY', shortLabel: 'CPI', unit: '%' },
  unemployment: { key: 'unemployment', label: 'Unemployment', shortLabel: 'Unemp', unit: '%' },
  gdpGrowth: { key: 'gdpGrowth', label: 'GDP Growth', shortLabel: 'GDP', unit: '%' },
  yield10y: { key: 'yield10y', label: '10Y Yield', shortLabel: '10Y', unit: '%' },
};

export const FRED_SERIES_REGISTRY: Record<MacroCountryCode, Record<MacroMetricKey, MacroSeriesContract>> = {
  US: {
    policyRate: {
      country: 'US', metric: 'policyRate', source: 'FRED', seriesId: 'FEDFUNDS',
      sourceTitle: 'Federal Funds Effective Rate', sourceUrl: 'https://fred.stlouisfed.org/series/FEDFUNDS',
      displayLabel: 'Policy Rate', shortLabel: 'Policy', unit: '%', frequency: 'monthly', areaScope: 'United States', maxAbsValue: 30,
    },
    inflation: {
      country: 'US', metric: 'inflation', source: 'FRED', seriesId: 'CPIAUCSL',
      sourceTitle: 'Consumer Price Index for All Urban Consumers', sourceUrl: 'https://fred.stlouisfed.org/series/CPIAUCSL',
      displayLabel: 'CPI YoY', shortLabel: 'CPI', unit: '%', frequency: 'monthly', areaScope: 'United States', fredUnits: 'pc1', maxAbsValue: 50,
    },
    unemployment: {
      country: 'US', metric: 'unemployment', source: 'FRED', seriesId: 'UNRATE',
      sourceTitle: 'Unemployment Rate', sourceUrl: 'https://fred.stlouisfed.org/series/UNRATE',
      displayLabel: 'Unemployment', shortLabel: 'Unemp', unit: '%', frequency: 'monthly', areaScope: 'United States', maxAbsValue: 50,
    },
    gdpGrowth: {
      country: 'US', metric: 'gdpGrowth', source: 'FRED', seriesId: 'A191RL1Q225SBEA',
      sourceTitle: 'Real Gross Domestic Product', sourceUrl: 'https://fred.stlouisfed.org/series/A191RL1Q225SBEA',
      displayLabel: 'Real GDP Growth (annualized)', shortLabel: 'GDP', unit: '%', frequency: 'quarterly', areaScope: 'United States', maxAbsValue: 50,
    },
    yield10y: {
      country: 'US', metric: 'yield10y', source: 'FRED', seriesId: 'DGS10',
      sourceTitle: '10-Year Treasury Constant Maturity Rate', sourceUrl: 'https://fred.stlouisfed.org/series/DGS10',
      displayLabel: '10Y Yield', shortLabel: '10Y', unit: '%', frequency: 'daily', areaScope: 'United States', maxAbsValue: 30,
    },
  },
  EA: {
    policyRate: {
      country: 'EA', metric: 'policyRate', source: 'FRED', seriesId: 'ECBMRRFR',
      sourceTitle: 'ECB Main Refinancing Operations Rate', sourceUrl: 'https://fred.stlouisfed.org/series/ECBMRRFR',
      displayLabel: 'ECB Policy Rate', shortLabel: 'Policy', unit: '%', frequency: 'daily', areaScope: 'Euro Area', maxAbsValue: 30,
    },
    inflation: {
      country: 'EA', metric: 'inflation', source: 'FRED', seriesId: 'CP0000EZ19M086NEST',
      sourceTitle: 'Harmonized Index of Consumer Prices: Total for Euro Area (19 Countries)', sourceUrl: 'https://fred.stlouisfed.org/series/CP0000EZ19M086NEST',
      displayLabel: 'HICP YoY', shortLabel: 'HICP', unit: '%', frequency: 'monthly', areaScope: 'Euro Area 19', fredUnits: 'pc1', maxAbsValue: 50,
    },
    unemployment: {
      country: 'EA', metric: 'unemployment', source: 'FRED', seriesId: 'LRHUTTTTEZM156S',
      sourceTitle: 'Harmonised Unemployment Rate for Euro Area (19 Countries)', sourceUrl: 'https://fred.stlouisfed.org/series/LRHUTTTTEZM156S',
      displayLabel: 'Unemployment', shortLabel: 'Unemp', unit: '%', frequency: 'monthly', areaScope: 'Euro Area 19', maxAbsValue: 50,
    },
    gdpGrowth: {
      country: 'EA', metric: 'gdpGrowth', source: 'FRED', seriesId: 'NAEXKP01EZQ657S',
      sourceTitle: 'Real GDP Growth for Euro Area (19 Countries)', sourceUrl: 'https://fred.stlouisfed.org/series/NAEXKP01EZQ657S',
      displayLabel: 'Real GDP Growth QoQ', shortLabel: 'GDP', unit: '%', frequency: 'quarterly', areaScope: 'Euro Area 19', maxAbsValue: 50,
    },
    yield10y: {
      country: 'EA', metric: 'yield10y', source: 'FRED', seriesId: 'IRLTLT01EZM156N',
      sourceTitle: '10-Year Government Bond Yield for Euro Area (19 Countries)', sourceUrl: 'https://fred.stlouisfed.org/series/IRLTLT01EZM156N',
      displayLabel: '10Y Government Yield', shortLabel: '10Y', unit: '%', frequency: 'monthly', areaScope: 'Euro Area 19', maxAbsValue: 30,
    },
  },
  GB: {
    policyRate: {
      country: 'GB', metric: 'policyRate', source: 'FRED', seriesId: 'IRSTCI01GBM156N',
      sourceTitle: 'Overnight Call Money/Interbank Rate for United Kingdom', sourceUrl: 'https://fred.stlouisfed.org/series/IRSTCI01GBM156N',
      displayLabel: 'Overnight Rate', shortLabel: 'O/N Rate', unit: '%', frequency: 'monthly', areaScope: 'United Kingdom', maxAbsValue: 30,
    },
    inflation: {
      country: 'GB', metric: 'inflation', source: 'FRED', seriesId: 'FPCPITOTLZGGBR',
      sourceTitle: 'Inflation, Consumer Prices for United Kingdom', sourceUrl: 'https://fred.stlouisfed.org/series/FPCPITOTLZGGBR',
      displayLabel: 'CPI YoY', shortLabel: 'CPI', unit: '%', frequency: 'annual', areaScope: 'United Kingdom', maxAbsValue: 50,
    },
    unemployment: {
      country: 'GB', metric: 'unemployment', source: 'FRED', seriesId: 'LRHUTTTTGBM156S',
      sourceTitle: 'Monthly Unemployment Rate for United Kingdom', sourceUrl: 'https://fred.stlouisfed.org/series/LRHUTTTTGBM156S',
      displayLabel: 'Unemployment', shortLabel: 'Unemp', unit: '%', frequency: 'monthly', areaScope: 'United Kingdom', maxAbsValue: 50,
    },
    gdpGrowth: {
      country: 'GB', metric: 'gdpGrowth', source: 'FRED', seriesId: 'NAEXKP01GBQ657S',
      sourceTitle: 'Real GDP Growth for United Kingdom', sourceUrl: 'https://fred.stlouisfed.org/series/NAEXKP01GBQ657S',
      displayLabel: 'Real GDP Growth QoQ', shortLabel: 'GDP', unit: '%', frequency: 'quarterly', areaScope: 'United Kingdom', maxAbsValue: 50,
    },
    yield10y: {
      country: 'GB', metric: 'yield10y', source: 'FRED', seriesId: 'IRLTLT01GBM156N',
      sourceTitle: '10-Year Government Bond Yield for United Kingdom', sourceUrl: 'https://fred.stlouisfed.org/series/IRLTLT01GBM156N',
      displayLabel: '10Y Government Yield', shortLabel: '10Y', unit: '%', frequency: 'monthly', areaScope: 'United Kingdom', maxAbsValue: 30,
    },
  },
  CA: {
    policyRate: {
      country: 'CA', metric: 'policyRate', source: 'FRED', seriesId: 'IRSTCI01CAM156N',
      sourceTitle: 'Overnight Call Money/Interbank Rate for Canada', sourceUrl: 'https://fred.stlouisfed.org/series/IRSTCI01CAM156N',
      displayLabel: 'Overnight Rate', shortLabel: 'O/N Rate', unit: '%', frequency: 'monthly', areaScope: 'Canada', maxAbsValue: 30,
    },
    inflation: {
      country: 'CA', metric: 'inflation', source: 'FRED', seriesId: 'FPCPITOTLZGCAN',
      sourceTitle: 'Inflation, Consumer Prices for Canada', sourceUrl: 'https://fred.stlouisfed.org/series/FPCPITOTLZGCAN',
      displayLabel: 'CPI YoY', shortLabel: 'CPI', unit: '%', frequency: 'annual', areaScope: 'Canada', maxAbsValue: 50,
    },
    unemployment: {
      country: 'CA', metric: 'unemployment', source: 'FRED', seriesId: 'LRHUTTTTCAM156S',
      sourceTitle: 'Monthly Unemployment Rate for Canada', sourceUrl: 'https://fred.stlouisfed.org/series/LRHUTTTTCAM156S',
      displayLabel: 'Unemployment', shortLabel: 'Unemp', unit: '%', frequency: 'monthly', areaScope: 'Canada', maxAbsValue: 50,
    },
    gdpGrowth: {
      country: 'CA', metric: 'gdpGrowth', source: 'FRED', seriesId: 'NAEXKP01CAQ657S',
      sourceTitle: 'Real GDP Growth for Canada', sourceUrl: 'https://fred.stlouisfed.org/series/NAEXKP01CAQ657S',
      displayLabel: 'Real GDP Growth QoQ', shortLabel: 'GDP', unit: '%', frequency: 'quarterly', areaScope: 'Canada', maxAbsValue: 50,
    },
    yield10y: {
      country: 'CA', metric: 'yield10y', source: 'FRED', seriesId: 'IRLTLT01CAM156N',
      sourceTitle: '10-Year Government Bond Yield for Canada', sourceUrl: 'https://fred.stlouisfed.org/series/IRLTLT01CAM156N',
      displayLabel: '10Y Government Yield', shortLabel: '10Y', unit: '%', frequency: 'monthly', areaScope: 'Canada', maxAbsValue: 30,
    },
  },
  JP: {
    policyRate: {
      country: 'JP', metric: 'policyRate', source: 'FRED', seriesId: 'IRSTCI01JPM156N',
      sourceTitle: 'Overnight Call Money/Interbank Rate for Japan', sourceUrl: 'https://fred.stlouisfed.org/series/IRSTCI01JPM156N',
      displayLabel: 'Overnight Rate', shortLabel: 'O/N Rate', unit: '%', frequency: 'monthly', areaScope: 'Japan', maxAbsValue: 30,
    },
    inflation: {
      country: 'JP', metric: 'inflation', source: 'FRED', seriesId: 'FPCPITOTLZGJPN',
      sourceTitle: 'Inflation, Consumer Prices for Japan', sourceUrl: 'https://fred.stlouisfed.org/series/FPCPITOTLZGJPN',
      displayLabel: 'CPI YoY', shortLabel: 'CPI', unit: '%', frequency: 'annual', areaScope: 'Japan', maxAbsValue: 50,
    },
    unemployment: {
      country: 'JP', metric: 'unemployment', source: 'FRED', seriesId: 'LRHUTTTTJPM156S',
      sourceTitle: 'Monthly Unemployment Rate for Japan', sourceUrl: 'https://fred.stlouisfed.org/series/LRHUTTTTJPM156S',
      displayLabel: 'Unemployment', shortLabel: 'Unemp', unit: '%', frequency: 'monthly', areaScope: 'Japan', maxAbsValue: 50,
    },
    gdpGrowth: {
      country: 'JP', metric: 'gdpGrowth', source: 'FRED', seriesId: 'NAEXKP01JPQ657S',
      sourceTitle: 'Real GDP Growth for Japan', sourceUrl: 'https://fred.stlouisfed.org/series/NAEXKP01JPQ657S',
      displayLabel: 'Real GDP Growth QoQ', shortLabel: 'GDP', unit: '%', frequency: 'quarterly', areaScope: 'Japan', maxAbsValue: 50,
    },
    yield10y: {
      country: 'JP', metric: 'yield10y', source: 'FRED', seriesId: 'IRLTLT01JPM156N',
      sourceTitle: '10-Year Government Bond Yield for Japan', sourceUrl: 'https://fred.stlouisfed.org/series/IRLTLT01JPM156N',
      displayLabel: '10Y Government Yield', shortLabel: '10Y', unit: '%', frequency: 'monthly', areaScope: 'Japan', maxAbsValue: 30,
    },
  },
  CH: {
    policyRate: {
      country: 'CH', metric: 'policyRate', source: 'FRED', seriesId: 'IR3TIB01CHM156N',
      sourceTitle: '3-Month Interbank Rate for Switzerland', sourceUrl: 'https://fred.stlouisfed.org/series/IR3TIB01CHM156N',
      displayLabel: '3M Interbank Rate', shortLabel: '3M Rate', unit: '%', frequency: 'monthly', areaScope: 'Switzerland', maxAbsValue: 30,
    },
    inflation: {
      country: 'CH', metric: 'inflation', source: 'FRED', seriesId: 'CP0000CHM086NEST',
      sourceTitle: 'Harmonized Index of Consumer Prices: Total for Switzerland', sourceUrl: 'https://fred.stlouisfed.org/series/CP0000CHM086NEST',
      displayLabel: 'HICP YoY', shortLabel: 'HICP', unit: '%', frequency: 'monthly', areaScope: 'Switzerland', fredUnits: 'pc1', maxAbsValue: 50,
    },
    unemployment: {
      country: 'CH', metric: 'unemployment', source: 'FRED', seriesId: 'LRHUTTTTCHQ156S',
      sourceTitle: 'Quarterly Unemployment Rate for Switzerland', sourceUrl: 'https://fred.stlouisfed.org/series/LRHUTTTTCHQ156S',
      displayLabel: 'Unemployment', shortLabel: 'Unemp', unit: '%', frequency: 'quarterly', areaScope: 'Switzerland', maxAbsValue: 50,
    },
    gdpGrowth: {
      country: 'CH', metric: 'gdpGrowth', source: 'FRED', seriesId: 'NAEXKP01CHQ657S',
      sourceTitle: 'Real GDP Growth for Switzerland', sourceUrl: 'https://fred.stlouisfed.org/series/NAEXKP01CHQ657S',
      displayLabel: 'Real GDP Growth QoQ', shortLabel: 'GDP', unit: '%', frequency: 'quarterly', areaScope: 'Switzerland', maxAbsValue: 50,
    },
    yield10y: {
      country: 'CH', metric: 'yield10y', source: 'FRED', seriesId: 'IRLTLT01CHM156N',
      sourceTitle: '10-Year Government Bond Yield for Switzerland', sourceUrl: 'https://fred.stlouisfed.org/series/IRLTLT01CHM156N',
      displayLabel: '10Y Government Yield', shortLabel: '10Y', unit: '%', frequency: 'monthly', areaScope: 'Switzerland', maxAbsValue: 30,
    },
  },
  SE: {
    policyRate: {
      country: 'SE', metric: 'policyRate', source: 'FRED', seriesId: 'IR3TIB01SEM156N',
      sourceTitle: '3-Month Interbank Rate for Sweden', sourceUrl: 'https://fred.stlouisfed.org/series/IR3TIB01SEM156N',
      displayLabel: '3M Interbank Rate', shortLabel: '3M Rate', unit: '%', frequency: 'monthly', areaScope: 'Sweden', maxAbsValue: 30,
    },
    inflation: {
      country: 'SE', metric: 'inflation', source: 'FRED', seriesId: 'CP0000SEM086NEST',
      sourceTitle: 'Harmonized Index of Consumer Prices: Total for Sweden', sourceUrl: 'https://fred.stlouisfed.org/series/CP0000SEM086NEST',
      displayLabel: 'HICP YoY', shortLabel: 'HICP', unit: '%', frequency: 'monthly', areaScope: 'Sweden', fredUnits: 'pc1', maxAbsValue: 50,
    },
    unemployment: {
      country: 'SE', metric: 'unemployment', source: 'FRED', seriesId: 'LRHUTTTTSEM156S',
      sourceTitle: 'Monthly Unemployment Rate for Sweden', sourceUrl: 'https://fred.stlouisfed.org/series/LRHUTTTTSEM156S',
      displayLabel: 'Unemployment', shortLabel: 'Unemp', unit: '%', frequency: 'monthly', areaScope: 'Sweden', maxAbsValue: 50,
    },
    gdpGrowth: {
      country: 'SE', metric: 'gdpGrowth', source: 'FRED', seriesId: 'NAEXKP01SEQ657S',
      sourceTitle: 'Real GDP Growth for Sweden', sourceUrl: 'https://fred.stlouisfed.org/series/NAEXKP01SEQ657S',
      displayLabel: 'Real GDP Growth QoQ', shortLabel: 'GDP', unit: '%', frequency: 'quarterly', areaScope: 'Sweden', maxAbsValue: 50,
    },
    yield10y: {
      country: 'SE', metric: 'yield10y', source: 'FRED', seriesId: 'IRLTLT01SEM156N',
      sourceTitle: '10-Year Government Bond Yield for Sweden', sourceUrl: 'https://fred.stlouisfed.org/series/IRLTLT01SEM156N',
      displayLabel: '10Y Government Yield', shortLabel: '10Y', unit: '%', frequency: 'monthly', areaScope: 'Sweden', maxAbsValue: 30,
    },
  },
  NO: {
    policyRate: {
      country: 'NO', metric: 'policyRate', source: 'FRED', seriesId: 'IRSTCI01NOM156N',
      sourceTitle: 'Overnight Call Money/Interbank Rate for Norway', sourceUrl: 'https://fred.stlouisfed.org/series/IRSTCI01NOM156N',
      displayLabel: 'Overnight Rate', shortLabel: 'O/N Rate', unit: '%', frequency: 'monthly', areaScope: 'Norway', maxAbsValue: 30,
    },
    inflation: {
      country: 'NO', metric: 'inflation', source: 'FRED', seriesId: 'CP0000NOM086NEST',
      sourceTitle: 'Harmonized Index of Consumer Prices: Total for Norway', sourceUrl: 'https://fred.stlouisfed.org/series/CP0000NOM086NEST',
      displayLabel: 'HICP YoY', shortLabel: 'HICP', unit: '%', frequency: 'monthly', areaScope: 'Norway', fredUnits: 'pc1', maxAbsValue: 50,
    },
    unemployment: {
      country: 'NO', metric: 'unemployment', source: 'FRED', seriesId: 'LRHUTTTTNOM156S',
      sourceTitle: 'Monthly Unemployment Rate for Norway', sourceUrl: 'https://fred.stlouisfed.org/series/LRHUTTTTNOM156S',
      displayLabel: 'Unemployment', shortLabel: 'Unemp', unit: '%', frequency: 'monthly', areaScope: 'Norway', maxAbsValue: 50,
    },
    gdpGrowth: {
      country: 'NO', metric: 'gdpGrowth', source: 'FRED', seriesId: 'NAEXKP01NOQ657S',
      sourceTitle: 'Real GDP Growth for Norway', sourceUrl: 'https://fred.stlouisfed.org/series/NAEXKP01NOQ657S',
      displayLabel: 'Real GDP Growth QoQ', shortLabel: 'GDP', unit: '%', frequency: 'quarterly', areaScope: 'Norway', maxAbsValue: 50,
    },
    yield10y: {
      country: 'NO', metric: 'yield10y', source: 'FRED', seriesId: 'IRLTLT01NOM156N',
      sourceTitle: '10-Year Government Bond Yield for Norway', sourceUrl: 'https://fred.stlouisfed.org/series/IRLTLT01NOM156N',
      displayLabel: '10Y Government Yield', shortLabel: '10Y', unit: '%', frequency: 'monthly', areaScope: 'Norway', maxAbsValue: 30,
    },
  },
  AU: {
    policyRate: {
      country: 'AU', metric: 'policyRate', source: 'FRED', seriesId: 'IRSTCI01AUM156N',
      sourceTitle: 'Overnight Call Money/Interbank Rate for Australia', sourceUrl: 'https://fred.stlouisfed.org/series/IRSTCI01AUM156N',
      displayLabel: 'Overnight Rate', shortLabel: 'O/N Rate', unit: '%', frequency: 'monthly', areaScope: 'Australia', maxAbsValue: 30,
    },
    inflation: {
      country: 'AU', metric: 'inflation', source: 'FRED', seriesId: 'FPCPITOTLZGAUS',
      sourceTitle: 'Inflation, Consumer Prices for Australia', sourceUrl: 'https://fred.stlouisfed.org/series/FPCPITOTLZGAUS',
      displayLabel: 'CPI YoY', shortLabel: 'CPI', unit: '%', frequency: 'annual', areaScope: 'Australia', maxAbsValue: 50,
    },
    unemployment: {
      country: 'AU', metric: 'unemployment', source: 'FRED', seriesId: 'LRHUTTTTAUM156S',
      sourceTitle: 'Monthly Unemployment Rate for Australia', sourceUrl: 'https://fred.stlouisfed.org/series/LRHUTTTTAUM156S',
      displayLabel: 'Unemployment', shortLabel: 'Unemp', unit: '%', frequency: 'monthly', areaScope: 'Australia', maxAbsValue: 50,
    },
    gdpGrowth: {
      country: 'AU', metric: 'gdpGrowth', source: 'FRED', seriesId: 'NAEXKP01AUQ657S',
      sourceTitle: 'Real GDP Growth for Australia', sourceUrl: 'https://fred.stlouisfed.org/series/NAEXKP01AUQ657S',
      displayLabel: 'Real GDP Growth QoQ', shortLabel: 'GDP', unit: '%', frequency: 'quarterly', areaScope: 'Australia', maxAbsValue: 50,
    },
    yield10y: {
      country: 'AU', metric: 'yield10y', source: 'FRED', seriesId: 'IRLTLT01AUM156N',
      sourceTitle: '10-Year Government Bond Yield for Australia', sourceUrl: 'https://fred.stlouisfed.org/series/IRLTLT01AUM156N',
      displayLabel: '10Y Government Yield', shortLabel: '10Y', unit: '%', frequency: 'monthly', areaScope: 'Australia', maxAbsValue: 30,
    },
  },
  NZ: {
    policyRate: {
      country: 'NZ', metric: 'policyRate', source: 'FRED', seriesId: 'IR3TIB01NZM156N',
      sourceTitle: '3-Month Interbank Rate for New Zealand', sourceUrl: 'https://fred.stlouisfed.org/series/IR3TIB01NZM156N',
      displayLabel: '3M Interbank Rate', shortLabel: '3M Rate', unit: '%', frequency: 'monthly', areaScope: 'New Zealand', maxAbsValue: 30,
    },
    inflation: {
      country: 'NZ', metric: 'inflation', source: 'FRED', seriesId: 'FPCPITOTLZGNZL',
      sourceTitle: 'Inflation, Consumer Prices for New Zealand', sourceUrl: 'https://fred.stlouisfed.org/series/FPCPITOTLZGNZL',
      displayLabel: 'CPI YoY', shortLabel: 'CPI', unit: '%', frequency: 'annual', areaScope: 'New Zealand', maxAbsValue: 50,
    },
    unemployment: {
      country: 'NZ', metric: 'unemployment', source: 'FRED', seriesId: 'LRHUTTTTNZQ156S',
      sourceTitle: 'Quarterly Unemployment Rate for New Zealand', sourceUrl: 'https://fred.stlouisfed.org/series/LRHUTTTTNZQ156S',
      displayLabel: 'Unemployment', shortLabel: 'Unemp', unit: '%', frequency: 'quarterly', areaScope: 'New Zealand', maxAbsValue: 50,
    },
    gdpGrowth: {
      country: 'NZ', metric: 'gdpGrowth', source: 'FRED', seriesId: 'NAEXKP01NZQ657S',
      sourceTitle: 'Real GDP Growth for New Zealand', sourceUrl: 'https://fred.stlouisfed.org/series/NAEXKP01NZQ657S',
      displayLabel: 'Real GDP Growth QoQ', shortLabel: 'GDP', unit: '%', frequency: 'quarterly', areaScope: 'New Zealand', maxAbsValue: 50,
    },
    yield10y: {
      country: 'NZ', metric: 'yield10y', source: 'FRED', seriesId: 'IRLTLT01NZM156N',
      sourceTitle: '10-Year Government Bond Yield for New Zealand', sourceUrl: 'https://fred.stlouisfed.org/series/IRLTLT01NZM156N',
      displayLabel: '10Y Government Yield', shortLabel: '10Y', unit: '%', frequency: 'monthly', areaScope: 'New Zealand', maxAbsValue: 30,
    },
  },
};

export function getMacroSeriesContract(country: MacroCountryCode, metric: MacroMetricKey): MacroSeriesContract {
  const contract = FRED_SERIES_REGISTRY[country]?.[metric];
  if (!contract || contract.country !== country || contract.metric !== metric) {
    throw new Error(`Invalid macro series contract for ${country}/${metric}`);
  }
  return contract;
}

export function isValidMacroMagnitude(contract: MacroSeriesContract, value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= contract.maxAbsValue;
}

export const US_RELEASE_TARGETS = [
  {
    key: 'cpi',
    label: 'US CPI',
    matchers: [/consumer price index/i],
  },
  {
    key: 'jobs',
    label: 'US Jobs Report',
    matchers: [/employment situation/i],
  },
  {
    key: 'retail',
    label: 'US Retail Sales',
    matchers: [/retail/i, /food services/i],
  },
  {
    key: 'gdp',
    label: 'US GDP',
    matchers: [/gross domestic product/i],
  },
] as const;
