import { strict as assert } from 'node:assert';
import { selectPolymarketForecasts, type PolymarketEvent } from '../../src/data/polymarket';
import { predictionRowsFromPages } from '../../src/utils/marketPanelDisplay';

const now = Date.parse('2026-01-15T00:00:00Z');
type Contract = NonNullable<PolymarketEvent['markets']>[number];

function contract(id: string, yes: number, fields: Partial<Contract> = {}): Contract {
  return { id, question: id, outcomes: '["Yes","No"]', outcomePrices: [yes, 1 - yes], volume24hr: 1500, liquidity: 12000, ...fields };
}
function event(slug: string, markets: Contract[], fields: Partial<PolymarketEvent> = {}): PolymarketEvent {
  return { slug, title: slug, endDate: '2027-01-01', markets, ...fields };
}
const choose = (events: PolymarketEvent[], limit = 12) => selectPolymarketForecasts(events, limit, now);

const ignored = contract('Long shot', 0.0005, { volume24hr: undefined, volume: '50000000', liquidity: null });
const useful = contract('Open question', 0.6, { oneDayPriceChange: 0.025 });
const open = event('Bitcoin prices', [ignored, useful], { volume24hr: 19000000, liquidity: 5000000 });
assert.equal(choose([open])[0].id, useful.id);
assert.equal(choose([open])[0].yesChange24hr, 0.025);
assert.deepEqual(choose([event('No activity', [ignored], { volume24hr: 2000000, liquidity: 1900000 })]), []);
for (const missing of [undefined, null, '', '  ']) {
  const [quoted] = choose([event('Quoted', [contract('Quoted contract', 0.42, { volume24hr: missing })], { volume24hr: 19000000 })]);
  assert.equal(quoted.volume24hr, null);
}
assert.equal(choose([event('Quiet', [contract('Quiet', 0.4, { volume24hr: 0 })])])[0].volume24hr, 0);

const certain = event('Fed rates', [contract('Fed hike', 0.9995, { volume24hr: 6000000 })]);
assert.equal(choose([certain, open], 1)[0].id, useful.id, 'Topic coverage must not promote a near-settled question over a contested one');
assert.equal(choose([certain])[0].yesPrice, 0.9995, 'Genuine extremes remain available when the pool warrants them');
const runner = contract('Runner', 0.38, { groupItemTitle: 'Jordan', volume24hr: 22000, oneDayPriceChange: -0.024 });
const leader = contract('Leader', 0.42, { groupItemTitle: 'Morgan', volume24hr: null, liquidity: 14000, oneDayPriceChange: null });
const longshot = contract('Longshot', 0.003, { groupItemTitle: 'Taylor', volume24hr: 2000000 });
const placeholder = contract('Hidden placeholder', 0.98, { groupItemTitle: 'Person AB' });
const race = event('Election', [longshot, runner, leader, placeholder], { negRisk: true, volume24hr: 8000000, liquidity: 8800000 });
const [winnerCard] = choose([race]);
assert.equal(winnerCard.question, 'Leader');
assert.deepEqual(winnerCard.outcomeGroup?.outcomes.map(row => [row.label, row.yesPrice, row.yesChange24hr]), [
  ['Morgan', 0.42, null], ['Jordan', 0.38, -0.024], ['Taylor', 0.003, null],
]);
assert.equal(winnerCard.volume24hr, null);
assert.equal(winnerCard.outcomeGroup?.volume24hr, 8000000);
assert.equal(winnerCard.outcomeGroup?.count, 3);
assert.equal(choose([{ ...race, volume24hr: undefined, liquidity: undefined }])[0].outcomeGroup?.volume24hr, null,
  'Reported activity on other choices can qualify an event without inventing an event total');
const thresholdEvent = { ...race, negRisk: false };
assert.equal(choose([thresholdEvent])[0].outcomeGroup, undefined, 'Overlapping price thresholds must remain individual questions');
const groupExtreme = event('Election runaway', [contract('Leading', 0.98, { groupItemTitle: 'Morgan' }), runner], { negRisk: true, volume24hr: 9000000 });
assert.equal(choose([groupExtreme, open], 1)[0].id, useful.id);

const reversed = contract('Reversed', 0.7, { outcomes: ['No', 'Yes'], outcomePrices: '["0.30","0.70"]', oneDayPriceChange: 0.05 });
const [reverseQuote] = choose([event('Reversed', [reversed])]);
assert.equal(reverseQuote.yesPrice, 0.7);
assert.equal(reverseQuote.noPrice, 0.3);
assert.equal(reverseQuote.yesChange24hr, null, 'Do not assign a first-outcome move to YES when the source has reversed the outcomes');
for (const fields of [
  { closed: true }, { archived: 'true' }, { active: 'false' }, { acceptingOrders: false }, { endDate: '2026-01-01' },
  { outcomePrices: [null, 1] }, { outcomePrices: ['', '1'] }, { outcomePrices: [1.01, 0] },
  { outcomes: ['Win', 'Lose'] }, { outcomePrices: [0, 0] },
]) {
  assert.deepEqual(choose([event('Unusable', [contract('Unusable', 0.5, fields)])]), []);
}
const dates = ['First', 'Second', 'Third'].map((title, index) => event('Bitcoin ' + title, [contract(title, 0.46 + index / 100)], { seriesSlug: 'monthly' }));
const independent = event('Bitcoin independent', [contract('Independent', 0.32)]);
const spread = choose([...dates, independent, independent], 4);
assert.equal(spread.length, 4);
assert.ok(spread.slice(0, 2).some(row => row.id === 'Independent'), 'A recurring series gets one slot before unrelated events in the same tier');
assert.equal(choose([event('Whether stocks will rise', [useful])])[0].theme, 'Business', 'ETH must not match the middle of whether');
assert.deepEqual(choose([event('Premier League', [useful])]), []);
const many = Array.from({ length: 31 }, (_, i) => event('Event ' + i, [contract('Choice ' + i, 0.4)]));
const all = choose(many, many.length);
assert.equal(all.length, 31);
assert.deepEqual(choose(many), all.slice(0, 12), 'Overview and the featured cards should be a prefix of wider coverage');
const snapshot = (forecasts: typeof all) => ({ forecasts, updatedAt: '2026-01-15', source: 'Polymarket' });
assert.deepEqual(predictionRowsFromPages([snapshot(all.slice(0, 20)), snapshot([]), snapshot(all.slice(18))]), all,
  'Empty and overlapping provider pages must keep prior positions and add only distinct events');
console.log('Prediction selection, grouping, activity attribution, price and sparse-feed checks passed');
