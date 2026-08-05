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
const eurostat = normalizeEurostatSeries({
  dimension: { time: { category: { index: { '2026-01': 0, '2026-02': 1 } } } },
  value: { '0': 100, '1': 101.5 },
}, retailDefinition);
assert(eurostat.value === 101.5 && eurostat.change === 1.5, 'Eurostat JSON-stat values should map sparse time indexes');
assert(eurostat.series.length === 2 && eurostat.unit === 'index', 'Eurostat normalized series should retain bounded history and unit');
assert(!EUROSTAT_SERIES.some((definition) => definition.id === 'industrialProduction'), 'Eurostat industrial production should not duplicate the shared OECD activity series');

const gdpDefinition = EUROSTAT_SERIES.find((definition) => definition.id === 'gdpGrowth');
assert(gdpDefinition, 'Eurostat GDP contract should exist');
const euroAreaGdp = normalizeEurostatSeries({
  dimension: { time: { category: { index: { '2026-Q1': 0, '2026-Q2': 1, '2026-Q3': 2 } } } },
  value: { '0': 0, '1': 0.4, '2': 50_000 },
}, gdpDefinition);
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
const ukComparable = normalizeOecdCountryData('GB', { series: { employmentGrowth: employmentPayload, industrialProduction: industryPayload } });
const ukEmployment = ukComparable.indicators.find((indicator) => indicator.key === 'employmentGrowth');
const ukIndustry = ukComparable.indicators.find((indicator) => indicator.key === 'industrialProduction');
assert(ukComparable.status === 'ready' && ukComparable.indicators.length === 2, 'Every covered country panel should retain the same two comparable indicator slots');
assert(ukEmployment?.value != null && Math.abs(ukEmployment.value - 1) < 0.0001 && ukEmployment.unitLabel === '% QoQ', 'Employment levels should derive a validated quarterly growth rate');
assert(ukIndustry?.value === 99.5 && ukIndustry.unitLabel === 'Index 2015=100', 'Industrial production should retain its common OECD index base');

const australiaComparable = normalizeOecdCountryData('AU', { series: { employmentGrowth: buildOecdKeiPayload('AUS', 'Q', 'EMP', 'PS', '_T', 'Y', '_Z', [
  ['2025-Q4', 14_500],
  ['2026-Q1', 14_572.5],
]) } });
assert(australiaComparable.indicators.length === 2, 'Missing coverage should not change the homogeneous panel structure');
assert(australiaComparable.indicators.find((indicator) => indicator.key === 'industrialProduction')?.status === 'unavailable', 'Australia should show an explicit OECD industrial-production coverage gap');
assert(australiaComparable.indicators.find((indicator) => indicator.key === 'employmentGrowth')?.status === 'ready', 'Australia should retain covered comparable employment growth');

const wrongCountryComparable = normalizeOecdCountryData('CA', { series: { employmentGrowth: employmentPayload } });
assert(wrongCountryComparable.indicators.find((indicator) => indicator.key === 'employmentGrowth')?.status === 'unavailable', 'A payload for another OECD country must not populate the selected panel');

for (const country of MACRO_COUNTRIES) {
  const oecdContract = OECD_COUNTRY_REGISTRY[country.code];
  assert(oecdContract.country === country.code && (oecdContract.oecdCode.length === 3 || oecdContract.oecdCode === 'EA20'), `OECD country mapping should be explicit for ${country.code}`);
  assert(buildOecdKeiSeriesKey(country.code, 'employmentGrowth')?.includes('.Q.EMP.PS._T.Y._Z') === true, `Employment contract should be homogeneous for ${country.code}`);
}
assert(Object.keys(OECD_COMPARABLE_SERIES).join(',') === 'employmentGrowth,industrialProduction', 'The shared country-panel contract should stay bounded and homogeneous');
assert(buildOecdKeiSeriesKey('AU', 'industrialProduction') === null && buildOecdKeiSeriesKey('NZ', 'industrialProduction') === null, 'Unsupported activity coverage must not substitute another series');
const sharedLabels = new Set(Object.values(OECD_COMPARABLE_SERIES).map((definition) => definition.label));
const localLabels = [
  ...BLS_SERIES.map((definition) => definition.label),
  ...EUROSTAT_SERIES.filter((definition) => definition.placement === 'detail').map((definition) => definition.label),
];
assert(localLabels.every((label) => !sharedLabels.has(label)), 'Local-detail contracts must not duplicate the shared OECD series');

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
