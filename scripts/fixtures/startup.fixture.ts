import { deepStrictEqual } from 'node:assert';
import { workspaceShortcuts } from '../../src/data/workspaceShortcuts';
import { shouldUseSearch } from '../../src/utils/commandParsing';
import {
  addOverviewCard, DEFAULT_OVERVIEW_LAYOUT, normalizeOverviewLayout, overviewCardOrder, removeOverviewCard,
  type OverviewLayout,
} from '../../src/utils/overviewLayout';

// Import the real store only after a browser-like environment is present: this
// catches startup callbacks persisting empty defaults before the disk GET.
const cache = new Map<string, string>();
const sample = { id:'fixture',symbol:'AAPL',shares:1,avgCost:200,currency:'USD',purchaseDate:'2026-01-02',addedAt:'2026-01-02' };
let disk = JSON.stringify({state:{portfolio:[sample],watchlist:['AAPL'],portfolioDisplayCurrency:'USD'},version:0});
const writes: string[] = [];
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:{
  localStorage:{getItem:(key:string)=>cache.get(key)??null,setItem:(key:string,value:string)=>cache.set(key,value),removeItem:(key:string)=>cache.delete(key)},
  setTimeout,clearTimeout,
}});
globalThis.fetch = async (_input, init) => {
  if (init?.method === 'PUT') { disk = JSON.parse(String(init.body)).value; writes.push(disk); return new Response('{}'); }
  if (init?.method === 'DELETE') throw new Error('Browser cache cleanup must not delete the disk mirror');
  return new Response(JSON.stringify({value:disk}));
};
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
try {
  const {useTerminalStore} = await import('../../src/store/useTerminalStore');
  const {hydrateTerminalState} = await import('../../src/utils/bootstrapState');
  assert(writes.length === 0, 'Import must not overwrite saved holdings with default empty state');
  await hydrateTerminalState();
  assert(useTerminalStore.getState().portfolio[0]?.purchaseDate === '2026-01-02', 'Startup must restore saved portfolio into the live store');
  deepStrictEqual(useTerminalStore.getState().overviewLayout, DEFAULT_OVERVIEW_LAYOUT, 'Existing profiles start with the full Overview');
  for (const [saved, expected] of [
    ['gpt-5.4-nano', 'gpt-6-luna'], ['gpt-5.4-mini', 'gpt-6-luna'],
    ['gpt-5.6-luna', 'gpt-6.2-sol'], ['gpt-5.4', 'gpt-6.2-sol'], ['gpt-5.6-terra', 'gpt-6.2-sol'],
    ['gpt-5.5', 'gpt-6.2-astra'], ['gpt-5.6-sol', 'gpt-6.2-astra'],
  ]) {
    const state = JSON.parse(disk).state;
    disk = JSON.stringify({ state: { ...state, openAISettings: { ...state.openAISettings, companionModel: saved } }, version: 0 });
    await hydrateTerminalState();
    assert(useTerminalStore.getState().openAISettings.companionModel === expected, 'Migrate saved Companion tier for ' + saved);
    assert(JSON.parse(disk).state.openAISettings.companionModel === expected, 'Persist the migrated Companion model');
  }
  for (const [saved, expected] of [['line', 'area'], ['area', 'area'], ['ohlc', 'ohlc'], ['candlestick', 'candlestick']]) {
    disk = JSON.stringify({ state: { ...JSON.parse(disk).state, chartStyle: saved }, version: 0 });
    await hydrateTerminalState();
    assert(useTerminalStore.getState().chartStyle === expected, 'Restore the correct Equity chart style for ' + saved);
    assert(JSON.parse(disk).state.chartStyle === expected, 'Persist the restored Equity chart style');
  }
  const legacyGrid = [{ id: 'fx', span: 3, height: 245 }, { id: 'watchlist', span: 1 }];
  const custom: OverviewLayout = { tree: { axis: 'x', ratio: 0.75, first: 'fx', second: 'watchlist' }, height: 245, stackedHeights: { fx: 245 } };
  disk = JSON.stringify({ state: { ...JSON.parse(disk).state, overviewLayout: legacyGrid }, version: 0 });
  await hydrateTerminalState();
  deepStrictEqual(useTerminalStore.getState().overviewLayout, custom, 'Previous grid restores its selected cards, widths and explicit heights');
  const empty: OverviewLayout = { tree: null, height: 0, stackedHeights: {} };
  for (const layout of [custom, empty]) {
    useTerminalStore.getState().setOverviewLayout(layout);
    await hydrateTerminalState();
    deepStrictEqual(JSON.parse(disk).state.overviewLayout, layout, 'Saving mirrors the Overview layout to disk');
    deepStrictEqual(useTerminalStore.getState().overviewLayout, layout, 'Hydration preserves order, sizing and hidden cards');
  }
  deepStrictEqual(normalizeOverviewLayout([null, { id: 'retired' }]), DEFAULT_OVERVIEW_LAYOUT);
  deepStrictEqual(normalizeOverviewLayout([]), empty);
  deepStrictEqual(normalizeOverviewLayout([
    { id: 'indices', span: 30, height: 10_000 }, { id: 'indices', span: 1 },
    { id: 'retired' }, { id: 'fx', span: 1, height: 'invalid' },
  ]), { tree: { axis: 'x', first: 'indices', second: 'fx', ratio: 2 / 3 }, height: 1600, stackedHeights: { indices: 1600 } });
  deepStrictEqual(normalizeOverviewLayout({
    tree: { axis: 'x', ratio: 0.1, first: 'fx', second: { axis: 'y', first: 'fx', second: 'retired' } },
    stackedHeights: { fx: 244, retired: 999 },
  }), { tree: 'fx', height: 0, stackedHeights: { fx: 244 } });
  const row = removeOverviewCard(custom, 'fx');
  deepStrictEqual(row, { tree: 'watchlist', height: 245, stackedHeights: {} });
  deepStrictEqual(removeOverviewCard(row, 'watchlist'), empty);
  const restored = addOverviewCard(row, 'fx');
  deepStrictEqual(overviewCardOrder(restored), ['watchlist', 'fx']);
  deepStrictEqual(addOverviewCard(restored, 'fx'), restored, 'Adding a visible card is idempotent');
  useTerminalStore.getState().setActivePanel('portfolio');
  assert(new Set(workspaceShortcuts.map(entry => entry.panel)).size === 12 && workspaceShortcuts.length === 12, 'Exactly twelve main workspaces');
  deepStrictEqual(workspaceShortcuts.slice(-3).map(({ key, command }) => [key, command]), [
    ['F10', 'PRED'], ['F11', 'CONGRESS'], ['F12', 'SETTINGS'],
  ]);
  for (const command of ['CONGRESS', 'HELP', 'SETTINGS']) assert(!shouldUseSearch(command), command + ' must bypass ticker search');
  const navigate = useTerminalStore.getState().executeCommand;
  navigate('congress');
  assert(useTerminalStore.getState().activePanel === 'congress', 'Congress command opens Congressional Trades');
  navigate('Help');
  assert(useTerminalStore.getState().activePanel === 'settings' && useTerminalStore.getState().settingsTab === 'help', 'Help opens Help & Shortcuts in Settings');
  navigate('SETTINGS');
  assert(useTerminalStore.getState().settingsTab === 'preferences', 'Settings opens the existing controls even from Help');
  useTerminalStore.getState().goBack();
  assert(useTerminalStore.getState().settingsTab === 'help', 'Back restores the selected Settings tab');
  useTerminalStore.getState().goBack();
  assert(useTerminalStore.getState().activePanel === 'congress', 'Back from the Help tab returns to Congress');
  assert(writes.every(value => JSON.parse(value).state.portfolio.length === 1), 'Hydration callbacks and navigation must preserve restored holdings');
  const { terminalStateStorage, hydrateLocalStateCache } = await import('../../src/utils/localStateStorage');
  const pending = JSON.stringify({ state: { newsLayout: [{ id: 'risk', width: 'full', height: 'tall' }], portfolio: [sample] }, version: 0 });
  cache.set('charlie-v1', pending);
  cache.set('charlie-v1:pending-write', '1');
  await hydrateLocalStateCache();
  assert(cache.get('charlie-v1') === pending && disk === pending, 'Restart after an interrupted save must preserve the newer local layout and retry its disk mirror');
  let done: (() => void) | undefined;
  const order: string[] = [];
  globalThis.fetch = async (_url, init) => {
    order.push(JSON.parse(String(init?.body)).value);
    if (order.length === 1) await new Promise<void>(resolve => { done = resolve; });
    return new Response('{}');
  };
  terminalStateStorage.setItem('test-layout', 'first');
  terminalStateStorage.setItem('test-layout', 'second');
  terminalStateStorage.setItem('test-layout', 'last');
  assert(order.join(',') === 'first', 'Overlapping writes should be serialized');
  done?.();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(order.join(',') === 'first,last', 'After an outstanding write the mirror must receive the latest layout');
  const operations: string[] = [];
  globalThis.fetch = async (_url, init) => {
    operations.push(init?.method ?? 'GET');
    return new Response('{}');
  };
  terminalStateStorage.removeItem('test-layout');
  terminalStateStorage.setItem('test-layout', 'replacement');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(operations.join(',') === 'PUT', 'A queued clear must not delete subsequently saved settings');
  console.log('Startup persistence regression passed');
} finally {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:originalWindow});
}
