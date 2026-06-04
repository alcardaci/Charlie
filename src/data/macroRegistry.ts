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

export interface FredSeriesCandidate {
  ids?: string[];
  searchText: string;
  preferredTitleIncludes?: string[];
  units?: string;
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
  policyRate: { key: 'policyRate', label: 'Policy Rate', shortLabel: 'Policy', unit: '%' },
  inflation: { key: 'inflation', label: 'CPI YoY', shortLabel: 'CPI', unit: '%' },
  unemployment: { key: 'unemployment', label: 'Unemployment', shortLabel: 'Unemp', unit: '%' },
  gdpGrowth: { key: 'gdpGrowth', label: 'GDP Growth', shortLabel: 'GDP', unit: '%' },
  yield10y: { key: 'yield10y', label: '10Y Yield', shortLabel: '10Y', unit: '%' },
};

export const FRED_SERIES_REGISTRY: Record<MacroCountryCode, Record<MacroMetricKey, FredSeriesCandidate>> = {
  US: {
    policyRate: {
      ids: ['FEDFUNDS'],
      searchText: 'effective federal funds rate',
      preferredTitleIncludes: ['Effective Federal Funds Rate'],
    },
    inflation: {
      ids: ['CPIAUCSL'],
      searchText: 'consumer price index all items united states',
      preferredTitleIncludes: ['Consumer Price Index for All Urban Consumers'],
      units: 'pc1',
    },
    unemployment: {
      ids: ['UNRATE'],
      searchText: 'unemployment rate united states',
      preferredTitleIncludes: ['Unemployment Rate'],
    },
    gdpGrowth: {
      ids: ['A191RL1Q225SBEA'],
      searchText: 'real gross domestic product percent change annual rate united states',
      preferredTitleIncludes: ['Real Gross Domestic Product'],
    },
    yield10y: {
      ids: ['DGS10'],
      searchText: '10-year treasury constant maturity rate',
      preferredTitleIncludes: ['10-Year Treasury Constant Maturity Rate'],
    },
  },
  EA: {
    policyRate: {
      searchText: 'ecb main refinancing operations fixed rate euro area',
      preferredTitleIncludes: ['main refinancing'],
    },
    inflation: {
      searchText: 'consumer price inflation euro area annual',
      preferredTitleIncludes: ['Consumer Price Inflation', 'Euro Area'],
    },
    unemployment: {
      searchText: 'harmonised unemployment rate euro area',
      preferredTitleIncludes: ['Harmonised Unemployment Rate', 'Euro Area'],
    },
    gdpGrowth: {
      searchText: 'real gross domestic product euro area growth rate',
      preferredTitleIncludes: ['Real Gross Domestic Product', 'Euro Area'],
    },
    yield10y: {
      searchText: '10-year government bond yield euro area',
      preferredTitleIncludes: ['Long-Term Government Bond Yields', 'Euro Area'],
    },
  },
  GB: {
    policyRate: {
      searchText: 'bank rate united kingdom',
      preferredTitleIncludes: ['Bank Rate', 'United Kingdom'],
    },
    inflation: {
      searchText: 'consumer price inflation united kingdom annual',
      preferredTitleIncludes: ['Consumer Price Inflation', 'United Kingdom'],
    },
    unemployment: {
      searchText: 'harmonised unemployment rate united kingdom',
      preferredTitleIncludes: ['Harmonised Unemployment Rate', 'United Kingdom'],
    },
    gdpGrowth: {
      searchText: 'real gross domestic product united kingdom growth rate',
      preferredTitleIncludes: ['Real Gross Domestic Product', 'United Kingdom'],
    },
    yield10y: {
      searchText: '10-year government bond yield united kingdom',
      preferredTitleIncludes: ['Long-Term Government Bond Yields', 'United Kingdom'],
    },
  },
  CA: {
    policyRate: {
      searchText: 'bank rate canada',
      preferredTitleIncludes: ['Bank Rate', 'Canada'],
    },
    inflation: {
      searchText: 'consumer price inflation canada annual',
      preferredTitleIncludes: ['Consumer Price Inflation', 'Canada'],
    },
    unemployment: {
      searchText: 'harmonised unemployment rate canada',
      preferredTitleIncludes: ['Harmonised Unemployment Rate', 'Canada'],
    },
    gdpGrowth: {
      searchText: 'real gross domestic product canada growth rate',
      preferredTitleIncludes: ['Real Gross Domestic Product', 'Canada'],
    },
    yield10y: {
      searchText: '10-year government bond yield canada',
      preferredTitleIncludes: ['Long-Term Government Bond Yields', 'Canada'],
    },
  },
  JP: {
    policyRate: {
      searchText: 'policy rate japan',
      preferredTitleIncludes: ['Policy Rate', 'Japan'],
    },
    inflation: {
      searchText: 'consumer price inflation japan annual',
      preferredTitleIncludes: ['Consumer Price Inflation', 'Japan'],
    },
    unemployment: {
      searchText: 'harmonised unemployment rate japan',
      preferredTitleIncludes: ['Harmonised Unemployment Rate', 'Japan'],
    },
    gdpGrowth: {
      searchText: 'real gross domestic product japan growth rate',
      preferredTitleIncludes: ['Real Gross Domestic Product', 'Japan'],
    },
    yield10y: {
      searchText: '10-year government bond yield japan',
      preferredTitleIncludes: ['Long-Term Government Bond Yields', 'Japan'],
    },
  },
  CH: {
    policyRate: {
      searchText: 'policy rate switzerland',
      preferredTitleIncludes: ['Policy Rate', 'Switzerland'],
    },
    inflation: {
      searchText: 'consumer price inflation switzerland annual',
      preferredTitleIncludes: ['Consumer Price Inflation', 'Switzerland'],
    },
    unemployment: {
      searchText: 'harmonised unemployment rate switzerland',
      preferredTitleIncludes: ['Harmonised Unemployment Rate', 'Switzerland'],
    },
    gdpGrowth: {
      searchText: 'real gross domestic product switzerland growth rate',
      preferredTitleIncludes: ['Real Gross Domestic Product', 'Switzerland'],
    },
    yield10y: {
      searchText: '10-year government bond yield switzerland',
      preferredTitleIncludes: ['Long-Term Government Bond Yields', 'Switzerland'],
    },
  },
  SE: {
    policyRate: {
      searchText: 'policy rate sweden',
      preferredTitleIncludes: ['Policy Rate', 'Sweden'],
    },
    inflation: {
      searchText: 'consumer price inflation sweden annual',
      preferredTitleIncludes: ['Consumer Price Inflation', 'Sweden'],
    },
    unemployment: {
      searchText: 'harmonised unemployment rate sweden',
      preferredTitleIncludes: ['Harmonised Unemployment Rate', 'Sweden'],
    },
    gdpGrowth: {
      searchText: 'real gross domestic product sweden growth rate',
      preferredTitleIncludes: ['Real Gross Domestic Product', 'Sweden'],
    },
    yield10y: {
      searchText: '10-year government bond yield sweden',
      preferredTitleIncludes: ['Long-Term Government Bond Yields', 'Sweden'],
    },
  },
  NO: {
    policyRate: {
      searchText: 'policy rate norway',
      preferredTitleIncludes: ['Policy Rate', 'Norway'],
    },
    inflation: {
      searchText: 'consumer price inflation norway annual',
      preferredTitleIncludes: ['Consumer Price Inflation', 'Norway'],
    },
    unemployment: {
      searchText: 'harmonised unemployment rate norway',
      preferredTitleIncludes: ['Harmonised Unemployment Rate', 'Norway'],
    },
    gdpGrowth: {
      searchText: 'real gross domestic product norway growth rate',
      preferredTitleIncludes: ['Real Gross Domestic Product', 'Norway'],
    },
    yield10y: {
      searchText: '10-year government bond yield norway',
      preferredTitleIncludes: ['Long-Term Government Bond Yields', 'Norway'],
    },
  },
  AU: {
    policyRate: {
      searchText: 'cash rate australia',
      preferredTitleIncludes: ['Cash Rate', 'Australia'],
    },
    inflation: {
      searchText: 'consumer price inflation australia annual',
      preferredTitleIncludes: ['Consumer Price Inflation', 'Australia'],
    },
    unemployment: {
      searchText: 'harmonised unemployment rate australia',
      preferredTitleIncludes: ['Harmonised Unemployment Rate', 'Australia'],
    },
    gdpGrowth: {
      searchText: 'real gross domestic product australia growth rate',
      preferredTitleIncludes: ['Real Gross Domestic Product', 'Australia'],
    },
    yield10y: {
      searchText: '10-year government bond yield australia',
      preferredTitleIncludes: ['Long-Term Government Bond Yields', 'Australia'],
    },
  },
  NZ: {
    policyRate: {
      searchText: 'official cash rate new zealand',
      preferredTitleIncludes: ['Official Cash Rate', 'New Zealand'],
    },
    inflation: {
      searchText: 'consumer price inflation new zealand annual',
      preferredTitleIncludes: ['Consumer Price Inflation', 'New Zealand'],
    },
    unemployment: {
      searchText: 'harmonised unemployment rate new zealand',
      preferredTitleIncludes: ['Harmonised Unemployment Rate', 'New Zealand'],
    },
    gdpGrowth: {
      searchText: 'real gross domestic product new zealand growth rate',
      preferredTitleIncludes: ['Real Gross Domestic Product', 'New Zealand'],
    },
    yield10y: {
      searchText: '10-year government bond yield new zealand',
      preferredTitleIncludes: ['Long-Term Government Bond Yields', 'New Zealand'],
    },
  },
};

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
