import { BLS_SERIES } from '../../src/data/blsRegistry';
import { normalizeBlsPoint } from '../../src/api/finance';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(BLS_SERIES.length === 2, 'BLS additive set should remain bounded to two labor indicators');
assert(BLS_SERIES.some((series) => series.id === 'CES0000000001'), 'BLS set should include nonfarm payroll employment');
assert(BLS_SERIES.some((series) => series.id === 'CES0500000003'), 'BLS set should include average hourly earnings');
assert(!BLS_SERIES.some((series) => series.id === 'LNS14000000' || series.id === 'WPSFD4'), 'BLS should not duplicate core unemployment or inflation charts');
const point = normalizeBlsPoint({ year: '2026', period: 'M06', value: '4.2', footnotes: [{ text: 'preliminary' }] });
assert(point?.date === '2026-06-01' && point.value === 4.2 && point.preliminary, 'BLS monthly values should normalize with dates and preliminary state');
assert(normalizeBlsPoint({ year: '2026', period: 'M13', value: '4.2' }) === null, 'Annual aggregate rows should not enter the monthly chart');
assert(normalizeBlsPoint({ year: 'bad', period: 'M01', value: '4.2' }) === null, 'Malformed BLS rows should be discarded');
console.log('BLS fixture checks passed');
