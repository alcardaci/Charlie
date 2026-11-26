import assert from 'node:assert/strict';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { getPanelReferences } from '../../src/utils/companionPanelReferences';
import { buildCompanionContexts } from '../../src/utils/panelCompanionContext';

const question = 'What are the predictions for MSFT this year?';
const external = getPanelReferences(question, 'overview');
assert.deepEqual(external.panels, ['overview']);
assert.deepEqual(external.detailed, []);
assert.deepEqual(getPanelReferences('Explain the Predictions tab', 'overview').detailed, ['predictions']);
assert.deepEqual(getPanelReferences('Compare @macro with my holdings', 'overview').detailed, ['macro', 'portfolio']);

const state = { activePanel: 'overview' as const, activeSymbol: 'AAPL', portfolio: [], watchlist: [], forexPairs: [], portfolioDisplayCurrency: 'USD' };
const queryClient = new QueryClient();
const [background] = await buildCompanionContexts({
  panels: external.panels, detailedPanels: external.detailed, queryClient, state,
  renderedTextByPanel: { overview: 'Market overview' },
});
assert.equal(background.renderedText, 'Market overview');
assert.equal(queryClient.getQueryCache().getAll().length, 0, 'An unrelated question must not fetch workspace data');

const points = Array.from({ length: 60 }, (_, i) => ({
  timestamp: Date.UTC(2026, 8, 1 + i), close: 100 + i, open: 100 + i, low: 99 + i, high: 101 + i, volume: 500,
}));
const selected = ['chart', 'AAPL', '3mo', '1d', null, null];
queryClient.setQueryData(['chart', 'AAPL', '6mo', '1d', null, null], { points: [] });
queryClient.setQueryData(selected, { points });
const observer = new QueryObserver(queryClient, { queryKey: selected, staleTime: Infinity });
const unsubscribe = observer.subscribe(() => {});
try {
  const [context] = await buildCompanionContexts({
    panels: ['chart'], detailedPanels: ['chart'], queryClient, state: { ...state, activePanel: 'chart' },
  });
  const { charts } = context.data as { charts: Array<{ range: string; observations: number; samples: { close: number }[]; performancePct: number }> };
  assert.equal(charts.length, 1, 'Exclude previously viewed periods');
  assert.equal(charts[0].range, '3mo');
  assert.equal(charts[0].observations, 60);
  assert.equal(charts[0].samples[0].close, 100);
  assert.equal(charts[0].samples.at(-1)?.close, 159);
  assert.equal(charts[0].performancePct, 59);
} finally {
  unsubscribe();
  queryClient.clear();
}
