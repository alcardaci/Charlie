import { BLS_SERIES } from '../../src/data/blsRegistry';
import { normalizeBlsPoint, normalizeBlsSeries } from '../../src/api/finance';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(BLS_SERIES.length === 15, 'BLS local detail should remain bounded below the public v1 25-series limit');
for (const id of [
  'CES0000000001', 'CES0500000003', 'CES0500000002',
  'JTS000000000000000JOR', 'JTS000000000000000QUR', 'JTS000000000000000LDR',
  'CIS1010000000000Q', 'PRS85006092', 'PRS85006112', 'EIUIR', 'EIUIQ',
  'CES2000000001', 'CES3000000001', 'CES5000000001', 'CES5500000001',
]) assert(BLS_SERIES.some((series) => series.id === id), `BLS exact contract ${id} should exist`);
assert(!BLS_SERIES.some((series) => series.id === 'LNS14000000' || series.id === 'WPSFD4'), 'BLS should not duplicate core unemployment or inflation charts');
assert(new Set(BLS_SERIES.map((series) => series.id)).size === BLS_SERIES.length, 'BLS contracts should not duplicate series IDs');
assert(new Set(BLS_SERIES.map((series) => series.family)).size === 6, 'BLS contracts should retain six compact display families');

const point = normalizeBlsPoint({ year: '2026', period: 'M06', value: '4.2', footnotes: [{ text: 'preliminary, revised' }] });
assert(point?.date === '2026-06-01' && point.value === 4.2 && point.preliminary && point.revised, 'BLS monthly values should retain date and revision state');
const quarter = normalizeBlsPoint({ year: '2026', period: 'Q02', value: '0.9' }, 'quarterly');
assert(quarter?.date === '2026-04-01' && quarter.value === 0.9, 'BLS quarterly values should map to the first month of the quarter');
assert(normalizeBlsPoint({ year: '2026', period: 'M13', value: '4.2' }) === null, 'Annual aggregate rows should not enter monthly charts');
assert(normalizeBlsPoint({ year: 'bad', period: 'M01', value: '4.2' }) === null, 'Malformed BLS rows should be discarded');

const importPrices = BLS_SERIES.find((series) => series.id === 'EIUIR');
assert(importPrices, 'Import-price contract should exist');
const importSeries = normalizeBlsSeries(importPrices, Array.from({ length: 14 }, (_, index) => ({
  year: index < 12 ? '2025' : '2026',
  period: `M${String((index % 12) + 1).padStart(2, '0')}`,
  value: String(index < 12 ? 100 : index === 12 ? 105 : 110),
})));
assert(importSeries.length === 2 && Math.abs(importSeries[0].value - 5) < 0.0001 && Math.abs(importSeries[1].value - 10) < 0.0001, 'Import/export index levels should derive validated YoY percentages');
const gappedImportSeries = normalizeBlsSeries(importPrices, [
  { year: '2025', period: 'M01', value: '100' }, { year: '2025', period: 'M02', value: '100' }, { year: '2025', period: 'M04', value: '100' },
  { year: '2026', period: 'M01', value: '101' }, { year: '2026', period: 'M02', value: '102' }, { year: '2026', period: 'M04', value: '103' },
]);
assert(gappedImportSeries.length === 3 && gappedImportSeries[2].date === '2026-04-01' && Math.abs(gappedImportSeries[2].value - 3) < 0.0001, 'YoY price transforms should match the exact prior-year month even when source history has a gap');
assert(normalizeBlsSeries(importPrices, [{ year: '2026', period: 'M01', value: '100' }]).length === 0, 'YoY price transforms should not invent a value without a 12-month comparison');

const productivity = BLS_SERIES.find((series) => series.id === 'PRS85006092');
assert(productivity, 'Productivity contract should exist');
assert(normalizeBlsSeries(productivity, [{ year: '2026', period: 'Q01', value: '500' }]).length === 0, 'BLS values outside the explicit family magnitude must be rejected');
console.log('BLS fixture checks passed');

const { buildBlsIndicator } = await import('../../src/api/finance');
const payroll = BLS_SERIES.find(s => s.id === 'CES0000000001')!;
const fullCounts = buildBlsIndicator(payroll, normalizeBlsSeries(payroll, [
  {year:'2026',period:'M02',value:'159293'}, {year:'2026',period:'M01',value:'159128'},
]));
assert(fullCounts.unit === 'jobs' && fullCounts.value === 159293000 && fullCounts.change === 165000 &&
  fullCounts.series[0].value === 159128000, 'Headlines, deltas and plotted payrolls must agree in individual jobs');
