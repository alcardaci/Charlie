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
  useTerminalStore.getState().setActivePanel('portfolio');
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
