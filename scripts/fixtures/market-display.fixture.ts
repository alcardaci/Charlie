import type { Quote } from '../../src/types';
import { buildHeatmapEntries, heatmapNodeEntry, heatmapQuoteChange, positiveMarketCap, weightedHeatmapChange } from '../../src/utils/heatmapData';
import { buildMacroTrendRows, collapseRateHistory, formatMacroNumber, getMacroSeriesStyle, macroDeltaUnit, macroObservationAge } from '../../src/utils/macroDisplay';
import { cryptoChartSymbol, finiteMarketValue, formatPredictionMove, formatPredictionProbability, parseCurrencyAmount, yieldSpreadBasisPoints } from '../../src/utils/marketPanelDisplay';
import './prediction-selection.fixture';
import './companion-context.fixture';
import './companion-search.fixture';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const palette = { accent: 'blue', blue: 'blue', purple: 'purple', positive: 'green', negative: 'red' };
const styles = Array.from({ length: 10 }, (_, index) => getMacroSeriesStyle(index, palette));
assert(new Set(styles.map((style) => style.stroke)).size === 10, 'Default blue accent must not make two countries or series visually identical');
assert(new Set(styles.map((style) => style.strokeDasharray)).size === 10, 'Line patterns must distinguish the ten-country comparison without relying on color alone');
const rows = buildMacroTrendRows([
  { id: 'monthly', series: [{ date: '2026-02-01', value: 2 }, { date: '2026-01-01', value: 1 }] },
  { id: 'quarterly', series: [{ date: '2026-01-01', value: 3 }, { date: '2026-02-01', value: Number.NaN }] },
]);
assert(rows[0].date === '2026-01-01' && rows[1].date === '2026-02-01', 'Display rows must be chronological even when source order differs');
assert(rows[1].quarterly === null, 'An absent or invalid observation must remain a visible gap, not a zero or carried value');
assert(macroDeltaUnit('% YoY') === 'pp' && macroDeltaUnit('USD/hour') === 'USD/hour', 'Differences in rates must use percentage points while level units remain intact');
assert(formatMacroNumber(159293.4, 1) === '159,293.4', 'Payroll levels must retain thousands separators and their reported precision');
assert(formatMacroNumber(-1120) === '-1,120' && formatMacroNumber(2.65) === '2.65', 'Large changes need grouping and policy rates need decimal precision');
const rateHistory = [
  { date: '2025-01-01', value: 3 },
  { date: '2025-01-02', value: 3 },
  { date: '2025-02-05', value: 2.75 },
  { date: '2025-03-01', value: 2.75 },
];
const rateSteps = collapseRateHistory(rateHistory);
assert(rateSteps.length === 3 && rateSteps[1].date === '2025-02-05' && rateSteps[2].date === '2025-03-01', 'Policy history must keep the effective change date and the latest observation');
assert(collapseRateHistory(rateHistory.slice(0, 2)).length === 2, 'A flat rate still needs both endpoints to show its duration');

const quote = (fields: Partial<Quote> & Pick<Quote, 'symbol'>) => fields as Quote;
const quotes = new Map([
  ['A', quote({ symbol: 'A', marketCap: 100, regularMarketChangePercent: 2 })],
  ['B', quote({ symbol: 'B', marketCap: 300, regularMarketChangePercent: 0 })],
  ['NO_CAP', quote({ symbol: 'NO_CAP', regularMarketPrice: 10000, regularMarketChangePercent: -4 })],
  ['NO_CHANGE', quote({ symbol: 'NO_CHANGE', marketCap: 200 })],
  ['INVALID', quote({ symbol: 'INVALID', marketCap: Number.POSITIVE_INFINITY, regularMarketChangePercent: Number.NaN })],
]);
const groups = [{ label: 'Fixture', stocks: ['A', 'B', 'NO_CAP', 'NO_CHANGE', 'INVALID', 'ABSENT'] }];
const weighted = buildHeatmapEntries(groups, quotes, 'market-cap');
assert(heatmapNodeEntry({ ...weighted[0], depth: 1, x: 0, y: 0, width: 100, height: 80 })?.symbol === weighted[0].symbol, 'Treemap content must read flattened node data, not require a Tooltip-style payload');
assert(heatmapNodeEntry({ payload: weighted[0], depth: 1 })?.symbol === weighted[0].symbol, 'Wrapped entries should remain supported');
assert(heatmapNodeEntry({ children: weighted, depth: 0 }) === null, 'The treemap root is not a company tile');
assert(weighted.length === 3 && !weighted.some((entry) => entry.symbol === 'NO_CAP'), 'Missing market cap must not be replaced with a fabricated price-derived weight');
assert(weightedHeatmapChange(weighted) === 0.5, 'Unknown changes must be excluded from the return denominator, while actual zero changes count');
assert(weighted.find((entry) => entry.symbol === 'NO_CHANGE')?.changePct === null, 'Unknown performance must not be displayed as flat');
const equal = buildHeatmapEntries(groups, quotes, 'equal');
assert(equal.length === 5 && equal.every((entry) => entry.value === 1), 'Equal-size mode should include quoted companies lacking market cap without using synthetic weights');
assert(!equal.some((entry) => entry.symbol === 'ABSENT'), 'Missing quotes must not become dummy tiles');
assert(heatmapQuoteChange(quotes.get('B')) === 0 && heatmapQuoteChange(undefined) === null, 'True zero and missing performance must stay distinct');
assert(positiveMarketCap(-10) === null && positiveMarketCap(0) === null && positiveMarketCap(Number.NaN) === null, 'Only finite positive reported market caps may size tiles');
assert(weightedHeatmapChange(equal.filter((entry) => entry.changePct == null)) === null, 'A sample with no returns must be unavailable rather than zero');

const referenceTime = Date.parse('2026-11-14T12:00:00Z');
assert(macroObservationAge('2023-01-01', 'quarterly', referenceTime)?.startsWith('Older observation'), 'Old observations must be disclosed even after a successful API refresh');
assert(macroObservationAge('2026-10-01', 'monthly', referenceTime) === null, 'Normal publication lag must not be presented as stale');
assert(macroObservationAge('2025-01-01', 'annual', referenceTime) === null, 'Annual data must use a cadence-aware threshold');
assert(macroObservationAge('2026-10-01', 'daily', referenceTime)?.startsWith('Older observation'), 'Daily data must not inherit an annual threshold');
assert(cryptoChartSymbol({ id: 'bitcoin', symbol: 'btc' }) === 'BTC-USD', 'Known crypto identity may resolve to its matching chart');
assert(cryptoChartSymbol({ id: 'unrelated-bitcoin-token', symbol: 'btc' }) === null, 'A shared ticker must not send an unrelated coin to the Bitcoin chart');
assert(cryptoChartSymbol({ id: 'ethereum', symbol: 'etc' }) === null, 'The identity mapping must require the expected symbol as well as provider ID');
assert(parseCurrencyAmount('1,234.50') === 1234.5 && parseCurrencyAmount('0') === 0, 'Valid currency amounts and zero must remain usable');
assert(parseCurrencyAmount('12abc') === null && parseCurrencyAmount('1,2') === null && parseCurrencyAmount('') === null, 'Invalid currency input must not be silently partially parsed or converted as zero');
assert(finiteMarketValue(Number.POSITIVE_INFINITY) === null, 'Non-finite public quote values must remain unavailable');
assert(formatPredictionProbability(0.0005) === '0.05%' && formatPredictionProbability(0.9995) === '99.95%' && formatPredictionProbability(0.9975) === '99.75%', 'Distinct tail prices must remain visible');
assert(formatPredictionProbability(0.000001) === '<0.01%' && formatPredictionProbability(0.999999) === '>99.99%', 'Non-endpoint prices must not round to impossible or certain');
assert(formatPredictionMove(-0.027) === '−2.7 pp' && formatPredictionMove(0.0005) === '+0.05 pp' && formatPredictionMove(0) === '0 pp' && formatPredictionMove(null) === '—', 'Daily moves must distinguish signed percentage points, zeroes and missing data');
assert(formatPredictionProbability(0) === '0%' && formatPredictionProbability(1) === '100%' && formatPredictionProbability(1.2) === '—', 'Exact endpoint prices and invalid probabilities must remain distinct');
assert(yieldSpreadBasisPoints(0, 1) === 100 && yieldSpreadBasisPoints(5, 4) === -100, 'Yield spread must handle zero yields and calculate basis points correctly');
assert(yieldSpreadBasisPoints(null, 4) === null && yieldSpreadBasisPoints(3, Number.NaN) === null, 'A missing yield must not imply a normal or inverted curve');
console.log('Market display regression checks passed');

const { availableMacroWindows, sliceMacroHistory, windowStart } = await import('../../src/utils/macroHistory');
const months = Array.from({ length: 14 }, (_, i) => ({ date: new Date(Date.UTC(2025, i, 1)).toISOString().slice(0, 10), value: 100 + i }));
const monthly = availableMacroWindows([{ series: months }]);
assert(monthly.includes('1Y') && !monthly.includes('2Y'), 'Offer only periods covered by the returned observations');
assert(!availableMacroWindows([{ series: [months[0], months[12]] }]).includes('3M'), 'Annual releases cannot offer a three-month comparison');
const rate = { series: [{date:'2025-01-01',value:3},{date:'2026-03-20',value:2.5},{date:'2026-04-30',value:2.5}], step: true };
const cutoff = windowStart('3M', [Date.parse(rate.series[0].date), Date.parse(rate.series[2].date)]);
const rateWindow = sliceMacroHistory(rate, cutoff);
assert(rateWindow[0].date === '2026-01-30' && rateWindow[0].value === 3 && rateWindow[1].date === '2026-03-20', 'Step charts keep the rate in force on the first visible date');
assert(sliceMacroHistory({ series: rate.series }, cutoff)[0].date === '2026-03-20', 'Do not invent a boundary value for measured series');
assert(new Date(windowStart('1M', [0, Date.UTC(2024, 2, 31)])).toISOString().startsWith('2024-02-29'), 'Calendar months must clamp at leap-year month end');
const { fmt } = await import('../../src/utils/formatters');
const { trackedMarketCap } = await import('../../src/utils/marketPanelDisplay');
assert(fmt.change(1250, 0) === '+1,250' && fmt.number(1250) === '1,250.00', 'Signed and unsigned changes must group across panels');
assert(fmt.usdPrice(null) === '—' && trackedMarketCap([{market_cap:null}]) === null, 'Missing data must not render a currency symbol or zero market cap');

const { buildMarketSentimentSnapshot } = await import('../../src/api/finance');
const { formatSentimentScore } = await import('../../src/utils/marketPanelDisplay');
const quoteAt = '2026-11-25T16:25:00Z';
const dayQuote = (symbol: string, change: number, fields: Partial<Quote> = {}) =>
  quote({ symbol, regularMarketChangePercent: change, regularMarketTime: quoteAt, ...fields });
const sentimentQuotes = [
  dayQuote('^VIX', 28.046932, { regularMarketPrice: 33.77, regularMarketTime: Date.parse(quoteAt) / 1000 - 900 }),
  dayQuote('SPY', -2.4600043), dayQuote('QQQ', -4.015044), dayQuote('GLD', -2.5533867),
  ...['IWM', 'RSP', 'HYG', 'LQD', 'TLT'].map(symbol => dayQuote(symbol, 0)),
];
const scoreFor = (snapshot: ReturnType<typeof buildMarketSentimentSnapshot>, key: string) =>
  snapshot.pillars.find(p => p.key === key)!;
const intraday = buildMarketSentimentSnapshot(sentimentQuotes);
assert(scoreFor(intraday, 'volatility').score === 0 && formatSentimentScore(scoreFor(intraday, 'leadership').score) === '3.4', 'A floor in the VIX need not put leadership at zero');
assert(scoreFor(intraday, 'volatility').quoteTime === Date.parse(quoteAt) - 900000 && scoreFor(intraday, 'leadership').quoteTime === Date.parse(quoteAt), 'Use the actual timestamps from each set of quotes');
const incomplete = buildMarketSentimentSnapshot(sentimentQuotes.filter(q => q.symbol !== 'QQQ'));
assert(scoreFor(incomplete, 'leadership').score === null && scoreFor(incomplete, 'leadership').signal === 'unavailable' && incomplete.summary.includes('3 of 4'), 'Do not score an absent return as a flat market move');
const blank = buildMarketSentimentSnapshot([]);
assert(blank.pillars.every(p => p.score === null) && blank.score === null && blank.regime === 'UNAVAILABLE', 'No quotes must never produce a market regime');
const incompleteVix = buildMarketSentimentSnapshot([quote({ symbol:'^VIX', regularMarketPrice:35 })]);
assert(scoreFor(incompleteVix, 'volatility').score === null, 'A high VIX with an unknown daily move is not enough for a zero score');
const flat = buildMarketSentimentSnapshot([dayQuote('QQQ', 0), dayQuote('SPY', 0), dayQuote('GLD', 0)]);
assert(scoreFor(flat, 'leadership').score === 50, 'A genuine reported zero return must count as a flat session');
const fromCloses = buildMarketSentimentSnapshot([quote({symbol:'QQQ', regularMarketPrice:101, regularMarketPreviousClose:100}), dayQuote('SPY', 0), dayQuote('GLD', 0)]);
assert(scoreFor(fromCloses, 'leadership').score === 74 && scoreFor(fromCloses,'leadership').quoteTime === null, 'A missing return may be recovered from valid prices without inventing a quote time');
const divergent = buildMarketSentimentSnapshot([dayQuote('QQQ', -5), dayQuote('SPY', 0), dayQuote('GLD', 1)]);
assert(scoreFor(divergent, 'leadership').score === 0, 'Severe underperformance can legitimately floor leadership');
assert(formatSentimentScore(0.01) === '<0.1' && formatSentimentScore(0.36) === '0.4' && formatSentimentScore(0) === '0.0' && formatSentimentScore(null) === 'Unavailable', 'Rounding must distinguish a small score from a floor or missing data');
console.log('Market sentiment floor, precision, missing-input and quote-time checks passed');
