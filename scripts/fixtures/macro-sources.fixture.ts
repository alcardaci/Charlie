import { normalizeEurostatSeries } from '../../src/data/eurostat';
import { EUROSTAT_SERIES } from '../../src/data/eurostatRegistry';
import { BLS_SERIES } from '../../src/data/blsRegistry';
import { FRED_SERIES_REGISTRY, MACRO_COUNTRIES, MACRO_METRICS, getMacroSeriesContract, isValidMacroMagnitude } from '../../src/data/macroRegistry';
import { getMacroSourcePlacement } from '../../src/data/macroSourcePlacement';
import { normalizeOecdCli, normalizeOecdCountryData } from '../../src/data/oecd';
import { OECD_COMPARABLE_SERIES, OECD_COUNTRY_REGISTRY, buildOecdKeiSeriesKey } from '../../src/data/oecdRegistry';
import { buildEurostatMacroSnapshot } from '../../src/api/finance';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const oecd = normalizeOecdCli({
  data: {
    structures: [{ dimensions: { observation: [
      { id: 'REF_AREA', values: [{ id: 'USA', name: 'United States' }, { id: 'DEU', name: 'Germany' }] },
      { id: 'TIME_PERIOD', values: [{ id: '2026-01' }, { id: '2026-02' }] },
    ] } }],
    dataSets: [{ observations: {
      '0:0:0:0:0:0:0:0:0:0': [100, 0],
      '0:0:0:0:0:0:0:0:0:1': [101, 0],
      '1:0:0:0:0:0:0:0:0:0': [99, 0],
    } }],
  },
}, 'https://example.test/oecd');
assert(oecd[0].value === 101 && oecd[0].change === 1, 'OECD SDMX observations should map country/time indexes and change');
assert(oecd.find((item) => item.countryCode === 'DEU')?.value === 99, 'OECD country labels should remain explicit');

const retailDefinition = EUROSTAT_SERIES.find((definition) => definition.id === 'retailVolume');
assert(retailDefinition, 'Eurostat retail-volume local-detail contract should exist');
const eurostat = normalizeEurostatSeries(buildEurostatPayload(retailDefinition, [['2026-01', 100], ['2026-02', 101.5]]), retailDefinition);
assert(eurostat.value === 101.5 && eurostat.change === 1.5, 'Eurostat JSON-stat values should map sparse time indexes');
assert(eurostat.series.length === 2 && eurostat.unit === 'index', 'Eurostat normalized series should retain bounded history and unit');
assert(!EUROSTAT_SERIES.some((definition) => definition.id === 'industrialProduction'), 'Eurostat industrial production should not duplicate the shared OECD activity series');

const gdpDefinition = EUROSTAT_SERIES.find((definition) => definition.id === 'gdpGrowth');
assert(gdpDefinition, 'Eurostat GDP contract should exist');
const euroAreaGdp = normalizeEurostatSeries(buildEurostatPayload(gdpDefinition, [['2026-Q1', 0], ['2026-Q2', 0.4], ['2026-Q3', 50_000]]), gdpDefinition);
const euroAreaGdpSnapshot = buildEurostatMacroSnapshot(euroAreaGdp);
assert(euroAreaGdpSnapshot.value === 0.4 && euroAreaGdpSnapshot.unit === '%', 'Euro Area GDP should retain QoQ percent scale without index or level inflation');
assert(euroAreaGdp.series.length === 2 && euroAreaGdp.date === '2026-04-01', 'Impossible Euro Area GDP magnitudes should be rejected');

for (const country of MACRO_COUNTRIES) {
  for (const metric of Object.keys(MACRO_METRICS) as Array<keyof typeof MACRO_METRICS>) {
    const contract = FRED_SERIES_REGISTRY[country.code][metric];
    assert(contract.country === country.code && contract.metric === metric, `Registry identity should bind ${country.code}/${metric}`);
    assert(contract.sourceUrl.endsWith(`/series/${contract.seriesId}`), `Registry source URL should match ${contract.seriesId}`);
    assert(contract.displayLabel.length > 0 && contract.areaScope.length > 0 && contract.frequency.length > 0, `Registry metadata should be complete for ${country.code}/${metric}`);
  }
}

const ukRate = getMacroSeriesContract('GB', 'policyRate');
const ukGdp = getMacroSeriesContract('GB', 'gdpGrowth');
assert(ukRate.seriesId === 'IRSTCI01GBM156N' && ukRate.displayLabel === 'Overnight Rate', 'UK rate should map to the overnight interbank series and label');
assert(ukGdp.seriesId === 'NAEXKP01GBQ657S' && /GDP Growth/.test(ukGdp.displayLabel), 'UK GDP should map to the quarterly growth series');
assert(ukRate.seriesId !== ukGdp.seriesId && !/domestic product/i.test(ukRate.sourceTitle), 'UK rate and GDP identities must remain distinct');
assert(!isValidMacroMagnitude(getMacroSeriesContract('EA', 'gdpGrowth'), 50_000), 'Absurd GDP magnitudes should fail contract validation');

const employmentPayload = buildOecdKeiPayload('GBR', 'Q', 'EMP', 'PS', '_T', 'Y', '_Z', [
  ['2025-Q3', 34_000],
  ['2025-Q4', 34_340],
  ['2026-Q1', 34_683.4],
]);
const industryPayload = buildOecdKeiPayload('GBR', 'M', 'PRVM', 'IX', 'BTE', 'Y', '_Z', [
  ['2026-01', 98],
  ['2026-02', 99.5],
]);
const businessConfidencePayload = buildOecdCliCountryPayload('GBR', 'BCICP', [
  ['2026-01', 99.4],
  ['2026-02', 99.8],
]);
const ukComparable = normalizeOecdCountryData('GB', { series: { employmentGrowth: employmentPayload, industrialProduction: industryPayload, businessConfidence: businessConfidencePayload } });
const ukEmployment = ukComparable.indicators.find((indicator) => indicator.key === 'employmentGrowth');
const ukIndustry = ukComparable.indicators.find((indicator) => indicator.key === 'industrialProduction');
const ukConfidence = ukComparable.indicators.find((indicator) => indicator.key === 'businessConfidence');
assert(ukComparable.status === 'ready' && ukComparable.indicators.length === 3, 'Every covered country panel should retain the same three comparable indicator slots');
assert(ukEmployment?.value != null && Math.abs(ukEmployment.value - 1) < 0.0001 && ukEmployment.unitLabel === '% QoQ', 'Employment levels should derive a validated quarterly growth rate');
assert(ukIndustry?.value === 99.5 && ukIndustry.unitLabel === 'Index 2015=100', 'Industrial production should retain its common OECD index base');
assert(ukConfidence?.value === 99.8 && ukConfidence.unitLabel.includes('long-term average 100'), 'Business confidence should retain the amplitude-adjusted LTA=100 contract');

const australiaComparable = normalizeOecdCountryData('AU', { series: { employmentGrowth: buildOecdKeiPayload('AUS', 'Q', 'EMP', 'PS', '_T', 'Y', '_Z', [
  ['2025-Q4', 14_500],
  ['2026-Q1', 14_572.5],
]), businessConfidence: buildOecdCliCountryPayload('AUS', 'BCICP', [['2026-01', 100.2]]) } });
assert(australiaComparable.indicators.length === 3, 'Missing coverage should not change the homogeneous panel structure');
assert(australiaComparable.indicators.find((indicator) => indicator.key === 'industrialProduction')?.status === 'unavailable', 'Australia should show an explicit OECD industrial-production coverage gap');
assert(australiaComparable.indicators.find((indicator) => indicator.key === 'employmentGrowth')?.status === 'ready', 'Australia should retain covered comparable employment growth');

const wrongCountryComparable = normalizeOecdCountryData('CA', { series: { employmentGrowth: employmentPayload } });
assert(wrongCountryComparable.indicators.find((indicator) => indicator.key === 'employmentGrowth')?.status === 'unavailable', 'A payload for another OECD country must not populate the selected panel');

for (const country of MACRO_COUNTRIES) {
  const oecdContract = OECD_COUNTRY_REGISTRY[country.code];
  assert(oecdContract.country === country.code && (oecdContract.oecdCode.length === 3 || oecdContract.oecdCode === 'EA20'), `OECD country mapping should be explicit for ${country.code}`);
  assert(buildOecdKeiSeriesKey(country.code, 'employmentGrowth')?.includes('.Q.EMP.PS._T.Y._Z') === true, `Employment contract should be homogeneous for ${country.code}`);
  assert(buildOecdKeiSeriesKey(country.code, 'businessConfidence')?.endsWith('.M.BCICP.IX._Z.AA.IX._Z.H') === true, `Business-confidence contract should be homogeneous for ${country.code}`);
}
assert(Object.keys(OECD_COMPARABLE_SERIES).join(',') === 'employmentGrowth,industrialProduction,businessConfidence', 'The shared country-panel contract should stay bounded and homogeneous');
assert(buildOecdKeiSeriesKey('AU', 'industrialProduction') === null && buildOecdKeiSeriesKey('NZ', 'industrialProduction') === null, 'Unsupported activity coverage must not substitute another series');
const sharedLabels = new Set(Object.values(OECD_COMPARABLE_SERIES).map((definition) => definition.label));
const localLabels = [
  ...BLS_SERIES.map((definition) => definition.label),
  ...EUROSTAT_SERIES.filter((definition) => definition.placement === 'detail').map((definition) => definition.label),
];
assert(localLabels.every((label) => !sharedLabels.has(label)), 'Local-detail contracts must not duplicate the shared OECD series');

for (const id of ['labourCostGrowth', 'jobVacancyRate', 'producerPriceInflation', 'constructionOutput', 'servicesProduction', 'retailVolume']) {
  const definition = EUROSTAT_SERIES.find((candidate) => candidate.id === id);
  assert(definition && definition.publicApi && definition.placement === 'detail', `Eurostat exact public local-detail contract ${id} should exist`);
  const period = definition.frequency === 'quarterly' ? '2026-Q1' : '2026-01';
  const value = definition.unit === 'index' ? 105 : 3.2;
  const normalized = normalizeEurostatSeries(buildEurostatPayload(definition, [[period, value]]), definition);
  assert(normalized.value === value && normalized.frequency === definition.frequency && normalized.unitLabel === definition.unitLabel, `Eurostat ${id} should preserve unit, cadence and scale`);
}
const ppiDefinition = EUROSTAT_SERIES.find((definition) => definition.id === 'producerPriceInflation');
assert(ppiDefinition, 'Eurostat PPI contract should exist');
assert(normalizeEurostatSeries(buildEurostatPayload(ppiDefinition, [['2026-01', 500]]), ppiDefinition).value === null, 'Invalid Eurostat PPI magnitudes should be rejected');
assert(normalizeEurostatSeries({ dimension: { time: { category: { index: { '2026-01': 0 } } } }, value: { '0': 3.2 } }, ppiDefinition).value === null, 'A Eurostat payload without exact source dimensions must not populate a contract');
const tradeDefinition = EUROSTAT_SERIES.find((definition) => definition.id === 'goodsTradeBalance');
assert(tradeDefinition && !tradeDefinition.publicApi, 'Euro Area goods trade should retain an explicit unavailable standard-API contract');
const tradeUnavailable = normalizeEurostatSeries({}, tradeDefinition);
assert(tradeUnavailable.value === null && Boolean(tradeUnavailable.coverageNote), 'Unavailable trade coverage should remain explicit instead of being inferred');

assert(JSON.stringify(getMacroSourcePlacement(['US'])) === JSON.stringify({ bls: true, oecdCli: false, oecdCountry: true, eurostat: false }), 'US should load shared OECD data and local BLS detail');
assert(JSON.stringify(getMacroSourcePlacement(['EA'])) === JSON.stringify({ bls: false, oecdCli: false, oecdCountry: true, eurostat: true }), 'EA should load shared OECD data and EA-only Eurostat detail');
assert(JSON.stringify(getMacroSourcePlacement(['GB'])) === JSON.stringify({ bls: false, oecdCli: false, oecdCountry: true, eurostat: false }), 'Other country tabs should load only shared OECD supplements');
assert(JSON.stringify(getMacroSourcePlacement()) === JSON.stringify({ bls: false, oecdCli: true, oecdCountry: false, eurostat: false }), 'OECD CLI should remain restricted to Compare');
console.log('Macro source fixture checks passed');

function buildOecdKeiPayload(
  country: string,
  frequency: string,
  measure: string,
  unitMeasure: string,
  activity: string,
  adjustment: string,
  transformation: string,
  points: Array<[string, number]>,
) {
  const dimensions = [
    ['REF_AREA', [country]],
    ['FREQ', [frequency]],
    ['MEASURE', [measure]],
    ['UNIT_MEASURE', [unitMeasure]],
    ['ACTIVITY', [activity]],
    ['ADJUSTMENT', [adjustment]],
    ['TRANSFORMATION', [transformation]],
    ['TIME_PERIOD', points.map(([period]) => period)],
  ].map(([id, values]) => ({ id, values: (values as string[]).map((value) => ({ id: value })) }));
  return {
    data: {
      structure: { dimensions: { observation: dimensions } },
      dataSets: [{ observations: Object.fromEntries(points.map(([, value], index) => [`0:0:0:0:0:0:0:${index}`, [value]])) }],
    },
  };
}

function buildOecdCliCountryPayload(country: string, measure: 'BCICP', points: Array<[string, number]>) {
  const dimensions = [
    ['REF_AREA', [country]],
    ['FREQ', ['M']],
    ['MEASURE', [measure]],
    ['UNIT_MEASURE', ['IX']],
    ['ACTIVITY', ['_Z']],
    ['ADJUSTMENT', ['AA']],
    ['TRANSFORMATION', ['IX']],
    ['TIME_HORIZ', ['_Z']],
    ['METHODOLOGY', ['H']],
    ['TIME_PERIOD', points.map(([period]) => period)],
  ].map(([id, values]) => ({ id, values: (values as string[]).map((value) => ({ id: value })) }));
  return {
    data: {
      structure: { dimensions: { observation: dimensions } },
      dataSets: [{ observations: Object.fromEntries(points.map(([, value], index) => [`0:0:0:0:0:0:0:0:0:${index}`, [value]])) }],
    },
  };
}

function buildEurostatPayload(definition: typeof EUROSTAT_SERIES[number], points: Array<[string, number]>) {
  return {
    dimension: Object.fromEntries([
      ...Object.entries({ ...definition.params, geo: 'EA21' }).map(([dimension, code]) => [dimension, { category: { index: { [code]: 0 } } }]),
      ['time', { category: { index: Object.fromEntries(points.map(([period], index) => [period, index])) } }],
    ]),
    value: Object.fromEntries(points.map(([, value], index) => [String(index), value])),
  };
}
