import { useTerminalStore } from '../../src/store/useTerminalStore';
import { hydrateTerminalState } from '../../src/utils/bootstrapState';
import { fetchPublicJson } from '../../src/utils/publicRequests';
import { fetchChartWindow, fetchCompanyWorkbench, fetchGeopoliticalHeadlineCandidates, fetchMacroDashboard, fetchMacroReleaseCalendar } from '../../src/api/finance';
import { getScreenCommandPanel, shouldUseSearch } from '../../src/utils/commandParsing';
import { fmt } from '../../src/utils/formatters';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
try {
  let count = 0;
  globalThis.fetch = async () => { count++; await new Promise(resolve => setTimeout(resolve, 5)); return new Response('{"value":42}'); };
  const values = await Promise.all([fetchPublicJson<{value:number}>('/coalesce', {cacheMs:1000}), fetchPublicJson<{value:number}>('/coalesce', {cacheMs:1000})]);
  assert(count === 1 && values.every(value => value.value === 42), 'Concurrent reads should coalesce');
  await fetchPublicJson('/coalesce');
  assert(count === 1, 'A fresh cache should avoid repeated reads');
  let releaseOldResponse!: (response: Response) => void;
  globalThis.fetch = () => new Promise(resolve => { releaseOldResponse = resolve; });
  const pendingOld = fetchPublicJson('/refresh-test', { cacheMs: 60_000 });
  globalThis.fetch = async () => Response.json('new');
  await fetchPublicJson('/refresh-test', { cacheMs: 60_000, refresh: true });
  releaseOldResponse(Response.json('old'));
  await pendingOld;
  assert(await fetchPublicJson('/refresh-test') === 'new', 'An older in-flight response must not overwrite refreshed data');

  let newlyPublished = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const symbol = url.searchParams.get('symbols') ?? url.pathname.split('/').pop();
    if (newlyPublished) assert(init?.cache === 'no-store', 'Newly published data should be fetched on manual refresh');
    if (url.pathname.endsWith('/quotes')) return Response.json([{ symbol, quoteType: 'EQUITY', currency: 'USD' }]);
    if (url.pathname.includes('/insights/')) return Response.json({});
    const modules = url.searchParams.get('modules')?.split(',') ?? [];
    if (modules.includes('secFilings') && symbol !== 'AAPL' && !newlyPublished) {
      return Response.json({ error: 'Failed Yahoo Schema validation' }, { status: 500 });
    }
    return Response.json({
      ...(modules.includes('assetProfile') && { assetProfile: { longBusinessSummary: symbol + ' description' },
        summaryProfile: { sector: 'Technology', fullTimeEmployees: newlyPublished ? 150 : undefined } }),
      ...(modules.includes('financialData') && { financialData: { totalCash: 23 } }),
      ...(modules.includes('secFilings') && { secFilings: { filings: [{ type: '10-K', date: '2026-11-25', title: 'Annual report' }] } }),
    });
  };
  for (const ticker of ['BSP', 'ANT', 'AAPL']) {
    const workbench = await fetchCompanyWorkbench(ticker);
    assert(workbench?.profile.longBusinessSummary === ticker + ' description' && workbench.profile.sector === 'Technology' &&
      workbench.analysis.totalCash === 23 && workbench.filings.length === (ticker === 'AAPL' ? 1 : 0),
    'Isolate profile and analysis data from filing validation failures for ' + ticker);
  }
  newlyPublished = true;
  const refreshed = await fetchCompanyWorkbench('BSP', { refresh: true });
  assert(refreshed?.profile.fullTimeEmployees === 150 && refreshed.filings.length === 1, 'Manual refresh picks up a new profile field and restored filings');
  const reopened = await fetchCompanyWorkbench('BSP');
  assert(reopened?.profile.fullTimeEmployees === 150 && reopened.filings.length === 1, 'Reopening reuses the refreshed workbench data');
  globalThis.fetch = async () => new Response('unavailable', {status:503});
  await fetchPublicJson('/recovery', {cacheMs:1000}).then(() => { throw new Error('Failure incorrectly returned data'); }, () => undefined);
  globalThis.fetch = async () => new Response('{"recovered":true}');
  assert((await fetchPublicJson<{recovered:boolean}>('/recovery')).recovered, 'Failed responses must not poison the cache');
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {once:true}));
  await fetchPublicJson('/timeout', {timeoutMs:5}).then(() => { throw new Error('Unbounded request'); }, error => assert(error.name === 'TimeoutError', 'Timeout should abort upstream'));
  const controller = new AbortController(); controller.abort();
  await fetchPublicJson('/cancelled', {signal:controller.signal}).then(() => { throw new Error('Cancelled request ran'); }, error => assert(error.name === 'AbortError', 'Caller cancellation should be retained'));

  const chartRequests: string[] = [];
  globalThis.fetch = async input => { chartRequests.push(String(input)); return new Response('{"quotes":[]}'); };
  const chart = await fetchChartWindow('AAPL', {period1:'2020-01-01',period2:'2020-02-01'});
  assert(chart.points.length === 0 && chartRequests.length === 1 && !chartRequests[0].includes('range=max'), 'Empty requested history must not become unrelated max history');

  globalThis.fetch = async input => String(input).includes('/quote/')
    ? new Response(JSON.stringify({symbol:'LU1234567890',regularMarketPrice:100,currency:'EUR'}))
    : new Response(JSON.stringify([{date:'2024-01-01',open:100,high:100,low:100,close:100,volume:0}]));
  const fundChart = await fetchChartWindow('LU1234567890', {period1:'2020-01-01',period2:'2020-02-01'});
  assert(fundChart.points.length === 0 && fundChart.actualStart == null, 'Out-of-coverage fund windows must not display unrelated history');
  globalThis.fetch = async input => String(input).includes('/api/gdelt/')
    ? new Response(JSON.stringify([{title:'United States tariff update',link:'https://example.test/tariff',publishedAt:Date.now(),publisher:'Example'}]))
    : new Response('unavailable', {status:503});
  const coverage = await fetchGeopoliticalHeadlineCandidates(24, false, new AbortController().signal);
  assert(coverage.headlines.length === 1 && coverage.failedSources?.includes('Yahoo Finance'), 'One failed news source must preserve the other and disclose the gap');
  globalThis.fetch = async () => new Response('unavailable', {status:503});
  await fetchGeopoliticalHeadlineCandidates(6, false, new AbortController().signal).then(() => {throw new Error('All-source failure became empty coverage');}, () => undefined);

  const macroRequests: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input); macroRequests.push(url);
    return url.includes('/connections/status') ? new Response('{"fred":false,"openai":false,"finnhub":false}') : new Response('{}',{status:503});
  };
  const macro = await fetchMacroDashboard(['US']);
  assert(!macroRequests.some(url => url.includes('/api/fred/')), 'Missing FRED credentials must not queue repeated failing reads');
  assert(macroRequests.some(url => url.includes('/api/bls/')), 'Free supplemental data must still be requested');
  assert(macro.countries.length === 1 && !macro.configured, 'Missing core data should remain explicitly unavailable');
  const releaseReads: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input); releaseReads.push(url);
    return new Response(url.includes('/api/fred/') ? JSON.stringify({release_dates:[{date:'2026-11-25'}]}) : '[]');
  };
  const calendar = await fetchMacroReleaseCalendar('2026-11-01','2026-11-30');
  assert(releaseReads.some(url => url.includes('release_id=53')) && !releaseReads.some(url => url.includes('/releases?')), 'GDP must use official release identity, not a fuzzy catalog match');
  assert(calendar.events.find(event => event.title === 'US GDP')?.description === 'Gross Domestic Product', 'GDP calendar identity must not become a debt/GDP release');
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes('/connections/status')) return new Response('{"fred":true,"openai":false,"finnhub":false}');
    if (url.includes('/api/fred/series/observations')) return new Response(JSON.stringify({observations:[{date:'2026-10-01',value:'2'},{date:'2026-09-01',value:'1'}]}));
    return new Response('{}',{status:503});
  };
  const firstMacro = await fetchMacroDashboard(['US']);
  const repeatMacro = await fetchMacroDashboard(['US']);
  assert(firstMacro.countries[0].values.policyRate?.date === '2026-10-01' && repeatMacro.countries[0].values.policyRate?.date === '2026-10-01', 'Cached FRED reads must not reverse latest/oldest on repeat');
  assert(repeatMacro.countries[0].values.policyRate?.change === 1, 'Repeated FRED reads must preserve delta direction');
  let rateLimit = 0;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes('/connections/status')) return new Response('{"fred":true,"openai":false,"finnhub":false}');
    if (url.includes('series_id=ECBMRRFR')) {
      rateLimit = Number(new URL(url, 'http://local.test').searchParams.get('limit'));
      return Response.json({ observations: [
        { date: '2026-11-23', value: '2.65' },
        { date: '2026-11-22', value: '2.65' },
        { date: '2026-06-17', value: '2.65' },
        { date: '2024-11-24', value: '3.4' },
      ] });
    }
    return new Response('{}', { status: 503 });
  };
  const euroMacro = await fetchMacroDashboard(['EA']);
  const ecbRate = euroMacro.countries[0].values.policyRate;
  assert(rateLimit >= 730 && ecbRate?.chartType === 'step', 'ECB chart should request about two years of daily observations and display steps');
  assert(ecbRate.series[0].date === '2024-11-24' && ecbRate.series[1].date === '2026-06-17' && ecbRate.date === '2026-11-23', 'The chart must keep the change date and history while the headline uses the latest observation');
  let limitedReads = 0;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes('/connections/status')) return new Response('{"fred":true,"openai":false,"finnhub":false}');
    if (url.includes('/api/fred/')) { limitedReads++; return new Response('rate limited',{status:429,headers:{'retry-after':'3600'}}); }
    return new Response('{}',{status:503});
  };
  const limited = await fetchMacroDashboard(['GB']);
  assert(!limited.countries[0].values.policyRate && limitedReads <= 5, 'Long provider cooldown must fail promptly without per-series retry sleeps or fabricated data');
  const browserCache = new Map<string,string>();
  const restoredLot = {id:'test-lot',symbol:'AAPL',shares:1,avgCost:200,currency:'USD',purchaseDate:'2026-01-02',addedAt:'2026-01-02'};
  const saved = JSON.stringify({state:{portfolio:[restoredLot],watchlist:['AAPL'],portfolioDisplayCurrency:'USD'},version:0});
  const persistedWrites: string[] = [];
  Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:{
    localStorage:{getItem:(key:string)=>browserCache.get(key)??null,setItem:(key:string,value:string)=>browserCache.set(key,value),removeItem:(key:string)=>browserCache.delete(key)},
    setTimeout,clearTimeout,
  }});
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PUT') { persistedWrites.push(String(init.body)); return new Response('{}'); }
    return new Response(JSON.stringify({value:saved}));
  };
  assert(useTerminalStore.getState().portfolio.length === 0, 'Startup fixture must begin before saved state is restored');
  await hydrateTerminalState();
  assert(useTerminalStore.getState().portfolio[0]?.purchaseDate === '2026-01-02', 'Disk-cache bootstrap must restore the already-created live store');
  useTerminalStore.getState().setActivePanel('portfolio');
  assert(persistedWrites.every(value => JSON.parse(JSON.parse(value).value).state.portfolio.length === 1), 'First navigation must not overwrite restored holdings with defaults');
  assert(getScreenCommandPanel('OPPS') === 'overview' && !shouldUseSearch('OPPS'), 'Retired Opportunities commands must not search a ticker');
  assert(getScreenCommandPanel('RESEARCH') === 'equity', 'Research shortcut should reach an active workspace');
  assert(fmt.volume(0) === '0' && fmt.price(Number.POSITIVE_INFINITY) === '—', 'Zero and invalid values must remain distinct');
  assert(Number(fmt.price(0.00001234).replaceAll(',', '')) > 0, 'Sub-cent prices must not round to a false zero');
  console.log('Public data reliability checks passed');
} finally { globalThis.fetch = originalFetch; Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:originalWindow}); }
