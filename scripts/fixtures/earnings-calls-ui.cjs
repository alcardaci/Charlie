const assert = require('node:assert/strict');

// A date in last month's calendar also works on the first day of a new month or year.
const now = new Date();
const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 12)).toISOString().slice(0, 10);
const eventId = '11111111-1111-4111-8111-111111111111';
const olderId = '22222222-2222-4222-8222-222222222222';
const call = {
  id: eventId, ticker: 'AAPL', title: 'Fixture earnings call', fiscalYear: 2026, fiscalQuarter: 3,
  callDate: date + 'T20:00:00Z', callDateIsPeriodEnd: false, status: 'Concluded', statusName: 'Concluded',
  hasTranscript: true, hasAudio: true, hasSlides: false, presentationOnly: false, partialRecording: false,
  webcastUrl: 'https://example.com/company-webcast', replayUrl: 'https://equibles.com/stocks/aapl/calls/2026-q3',
  materials: { audio: null, slides: null, transcript: null },
};
const older = {
  ...call, id: olderId, title: 'Older quarterly call', fiscalQuarter: 2, hasAudio: false, hasTranscript: false,
  webcastUrl: null, replayUrl: null, materials: { ...call.materials, transcript: { status: 'pending', reason: 'Transcript is being processed.' } },
};
const turns = [
  { turnIndex: 0, speakerIndex: 0, speakerName: 'Fixture Executive', speakerRole: 'CEO', text: 'Demand improved this quarter.', startSeconds: 0, endSeconds: 60 },
  { turnIndex: 199, speakerIndex: 1, speakerName: 'Fixture Analyst', speakerRole: 'Analyst', text: 'How much was deferred?', startSeconds: 75, endSeconds: 81 },
  { turnIndex: 200, speakerIndex: 0, speakerName: 'Fixture Executive', speakerRole: 'CEO', text: 'Renewal revenue was $80 million.', startSeconds: 90, endSeconds: 95 },
];
const correction = { metricLabel: 'Renewal revenue', transcriptQuote: turns[2].text, transcriptValue: '$80 million', filingValue: '$82 million', filingForm: '10-Q', filingFiledDate: date, note: null };
const period = { fiscalYear: 2026, fiscalQuarter: 3 };
const prior = { fiscalYear: 2026, fiscalQuarter: 2 };
const brief = {
  ...period, tldr: 'Orders rose during the quarter.', bullish: ['Stronger renewals'], bearish: ['Delivery delays'],
  quotes: [{ text: 'Service orders increased.', speakerName: 'Fixture Executive', speakerRole: 'CEO', startSeconds: 37 }],
  narrativeShift: { priorFiscalYear: 2026, priorFiscalQuarter: 2, newBullish: ['Higher bookings'], newBearish: [], noLongerRaised: ['Inventory shortages'] },
  guidanceComparison: {
    issuedAtCall: [{ filedDate: date, form: '8-K', filingUrl: null, items: [{
      metric: 'Revenue', period: 'Fourth quarter', low: 180, high: 190, midpoint: null, unit: 'USD million', actual: null,
    }] }], reportedVsCompanyGuidance: [],
  },
};
const analyticsRequests = [];
let active = false;
const page = data => ({ data, meta: { offset: 0, count: data.length, limit: 100, hasMore: false } });

async function earningsFixture(request, url, connections) {
  if (!active) return;
  if (url.pathname === '/api/connections/equibles') {
    if (request.method === 'PUT') {
      assert.equal((await request.json()).secret, 'example-only');
      connections.equibles = true;
    } else if (request.method === 'DELETE') connections.equibles = false;
    else return new Response(null, { status: 405 });
    return Response.json({ configured: connections.equibles });
  }
  if (url.pathname === '/api/finnhub/calendar/earnings') {
    const inMonth = url.searchParams.get('from') <= date && url.searchParams.get('to') >= date;
    return Response.json({ earningsCalendar: inMonth ? [{ symbol: 'AAPL', date, year: 2026, quarter: 3, hour: 'amc' }] : [] });
  }
  if (!url.pathname.startsWith('/api/equibles/')) return;
  if (!connections.equibles) return Response.json({ error: 'Add your Equibles key in Settings.' }, { status: 401 });
  if (url.pathname.endsWith('/recent')) return Response.json(page([call]));
  if (url.pathname.endsWith('/calls')) {
    assert.equal(url.searchParams.get('symbol'), 'AAPL');
    return Response.json(page([call, older]));
  }
  const route = url.pathname.split('/').pop();
  analyticsRequests.push(route === 'transcript' ? route + ':' + url.searchParams.get('offset') : route);
  if (route === 'brief' || route === 'insights') {
    assert.equal(url.searchParams.get('symbol'), 'AAPL');
    assert.equal(url.searchParams.get('fiscalYear'), '2026');
    if (route === 'brief' && url.searchParams.get('fiscalQuarter') === '2') return Response.json({ data: null });
    assert.equal(url.searchParams.get('fiscalQuarter'), '3');
    return Response.json({ data: route === 'brief' ? brief : { ...period, themes: [{ name: 'Product demand', tone: 'positive', mentionCount: 5, keywords: ['pricing power'] }] } });
  }
  if (route === 'guidance') {
    assert.equal(url.searchParams.get('eventId'), olderId);
    assert.equal(url.searchParams.get('fiscalQuarter'), '2');
    return Response.json({ guidanceStatus: 'approved', guidance: brief.guidanceComparison.issuedAtCall[0].items,
      corrections: [{ ...correction, transcriptValue: '$50 million', filingValue: '$52 million' }] });
  }
  if (route === 'questions') {
    assert.equal(url.searchParams.get('eventId'), eventId);
    return Response.json({ eventId, totalTurnCount: 201, isFiledRecord: false, note: null, data: [{
      number: 1, analyst: { name: 'Fixture Analyst', role: 'Analyst' }, firm: { name: 'Fixture Research', source: 'transcript' },
      question: turns[1].text, answerers: [{ name: 'Fixture Executive', role: 'CEO' }],
      startTurnIndex: 199, endTurnIndex: 201, startSeconds: 75, endSeconds: 95,
    }] });
  }
  if (route === 'theme-history') {
    assert.equal(url.searchParams.get('symbol'), 'AAPL');
    const topics = [['Product demand', 'new', null, 5], ['Pricing', 'recurring', 2, 3], ['Inventory', 'dropped', 4, null]];
    return Response.json({ ticker: 'AAPL', calls: [prior, period], note: null, hasMoreCalls: false,
      themes: topics.map(([name, status, previous, current]) => ({ name, status, entries: [
        { ...prior, mentionCount: previous }, { ...period, mentionCount: current },
      ] })),
    });
  }
  if (route === 'phrase-trend') {
    assert.equal(url.searchParams.get('symbol'), 'AAPL');
    assert.equal(url.searchParams.get('phrase'), 'renewal revenue');
    assert.equal(url.searchParams.get('calls'), '4');
    return Response.json({ ticker: 'AAPL', phrase: 'renewal revenue', note: null, hasMoreCalls: false, calls: [
      { fiscalYear: 2026, fiscalQuarter: 1, mentions: null, ratePer10kWords: null, textSource: 'none', quotes: [] },
      { ...prior, mentions: 0, ratePer10kWords: 0, textSource: 'speakerTurns', quotes: [] },
      { ...period, mentions: 3, ratePer10kWords: 1.7, textSource: 'speakerTurns', quotes: [{ text: turns[2].text, section: 'qa' }] },
    ] });
  }
  if (route === 'transcript') {
    assert.equal(url.searchParams.get('eventId'), eventId, 'Only the available call has a transcript');
    const offset = Number(url.searchParams.get('offset'));
    assert.ok(offset === 0 || offset === 200);
    return Response.json({
      eventId, ticker: call.ticker, eventTitle: call.title, callDate: call.callDate,
      fiscalYear: call.fiscalYear, fiscalQuarter: call.fiscalQuarter,
      offset, turnCount: offset === 0 ? 200 : 1, totalTurnCount: 201, hasMore: offset === 0, hasSpeakerLabels: true,
      // The source page includes unpublished turns. Absolute source offsets identify the exchange.
      isFiledRecord: false, data: offset === 0 ? turns.slice(0, 2) : turns.slice(2), corrections: [correction],
    });
  }
  return new Response(null, { status: 404 });
}

async function exerciseInRenderer({ date, olderId }) {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(read, description) {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const result = read();
      if (result) return result;
      await delay(40);
    }
    throw new Error('Missing ' + description);
  }
  const workspace = await until(() => document.querySelector('.instrument-workspace'), 'workspace');
  const button = label => [...workspace.querySelectorAll('button')].find(el => el.textContent.trim().toLowerCase() === label.toLowerCase() && el.getClientRects().length);
  const byLabel = label => document.querySelector('[aria-label="' + label + '"]');
  function setValue(el, value, eventType = 'input') {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, value);
    el.dispatchEvent(new Event(eventType, { bubbles: true }));
  }
  async function command(value) {
    const input = document.querySelector('.command-bar .cmd-input');
    setValue(input, value);
    await delay(0);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }
  async function equityCalls() {
    await command('AAPL EQ');
    (await until(() => button('Earnings calls'), 'Equity earnings calls tab')).click();
  }
  async function manageKey() {
    await command('SETTINGS');
    const manager = await until(() => byLabel('Manage Equibles connection'), 'Equibles in Settings');
    if (!manager.parentElement.open) manager.click();
    return manager;
  }

  await equityCalls();
  await until(() => /Equibles/i.test(workspace.innerText) && /key/i.test(workspace.innerText), 'key setup in Equity');
  const manager = await manageKey();
  setValue(byLabel('Equibles API key'), 'example-only');
  (await until(() => !byLabel('Save Equibles key').disabled && byLabel('Save Equibles key'), 'saveable key')).click();
  await until(() => manager.textContent.includes('Key saved'), 'saved key status');

  await equityCalls();
  const view = () => workspace.querySelector('[role="tabpanel"]:not([hidden])');
  const viewIncludes = (...terms) => terms.every(term => view()?.innerText.includes(term));
  const showTab = async label => (await until(() => button(label), label + ' tab')).click();
  const expand = async prefix => (await until(() => [...view().querySelectorAll('summary')].find(el => el.textContent.startsWith(prefix)), prefix)).click();

  await until(() => viewIncludes('Orders rose during the quarter.', 'Stronger renewals', 'Delivery delays', '180–190 USD million', 'Higher bookings', 'Inventory shortages', 'Service orders increased.', '0:37'), 'complete quarter brief');
  const tabs = [...workspace.querySelectorAll('[aria-label="Earnings call views"] [role="tab"]')];
  if (tabs.map(el => el.textContent).join(', ') !== 'Call Brief, Transcript, Analyst Q&A, Trends' || tabs[0].getAttribute('aria-selected') !== 'true') throw new Error('Unexpected earnings call tabs');
  if (!workspace.querySelector('a[href="https://example.com/company-webcast"]')) throw new Error('Missing webcast');

  await showTab('Analyst Q&A');
  await until(() => viewIncludes('How much was deferred?', 'Fixture Research', 'Fixture Analyst', 'Fixture Executive', '1:15'), 'structured question, firm and respondent');
  if (viewIncludes('Renewal revenue was $80 million.')) throw new Error('Answer loaded before it was requested');
  (await until(() => button('Read answer'), 'expandable answer')).click();
  await until(() => viewIncludes('Renewal revenue was $80 million.', '1:30'), 'answer across a transcript page boundary');
  if (viewIncludes('Demand improved this quarter.')) throw new Error('Answer includes unrelated remarks');
  (await until(() => button('Open in transcript'), 'source exchange link')).click();
  await until(() => tabs[1].getAttribute('aria-selected') === 'true' && document.activeElement?.dataset.turnIndex === '199' && viewIncludes('Renewal revenue was $80 million.'), 'linked transcript section and keyboard focus');
  (await until(() => button('Read full transcript'), 'full-transcript navigation')).click();

  const search = await until(() => byLabel('Search transcript'), 'transcript search');
  setValue(search, 'renewal revenue');
  (await until(() => button('Search full transcript'), 'full-transcript search')).click();
  await until(() => view().querySelector('mark')?.textContent.toLowerCase() === 'renewal revenue', 'highlighted result on the next page');
  if (!viewIncludes('Fixture Executive', '1:30')) throw new Error('Missing speaker or timestamp on next page');
  await expand('Filing corrections (1)');
  await until(() => viewIncludes('$80 million', '$82 million', '10-Q'), 'deduplicated spoken and filed figures');

  await showTab('Trends');
  await until(() => viewIncludes('Product demand', '5 keyword mentions', 'pricing power'), 'theme keywords and counts');
  await expand('Compare topics across calls');
  await until(() => viewIncludes('New', 'Recurring', 'No longer raised'), 'quarter-to-quarter topic status');
  const phrase = view().querySelector('input[type=search]');
  setValue(phrase, 'unused draft');
  setValue(view().querySelector('select'), '4', 'change');
  setValue(phrase, 'Renewal Revenue');
  (await until(() => button('Track phrase') && !button('Track phrase').disabled && button('Track phrase'), 'submitted phrase search')).click();
  await until(() => view().querySelector('table[aria-label="Phrase frequency across fiscal quarters"]') && viewIncludes('1.7', 'Speaker transcript'), 'cross-quarter phrase frequency');
  const frequencies = [...view().querySelectorAll('table[aria-label="Phrase frequency across fiscal quarters"] tbody tr')];
  if (frequencies[0].cells[1].textContent !== '—' || frequencies[1].cells[1].textContent !== '0') throw new Error('Missing phrase evidence displayed as a zero');
  await expand('Passages from Q3 FY2026');
  await until(() => viewIncludes('Renewal revenue was $80 million.'), 'source passages from phrase search');
  await showTab('Transcript');
  const quarter = await until(() => [...workspace.querySelectorAll('select')].find(el => [...el.options].some(opt => opt.value === olderId)), 'quarter selector');
  setValue(quarter, olderId, 'change');
  await until(() => /being processed|no transcript|transcript unavailable/i.test(workspace.innerText) && !workspace.innerText.includes('Fixture Analyst'), 'older call without a transcript');
  (await until(() => button('Check filing corrections'), 'filing lookup without a transcript')).click();
  await until(() => viewIncludes('$50 million', '$52 million'), 'filing-only correction');
  await showTab('Call Brief');
  await until(() => viewIncludes('no verified brief'), 'missing brief for the older quarter');
  (await until(() => button('Check earnings release for guidance'), 'guidance lookup')).click();
  await until(() => viewIncludes('180–190 USD million'), 'previously loaded earnings release');

  await command('MACRO');
  (await until(() => button('CALENDAR'), 'Macro calendar tab')).click();
  (await until(() => byLabel('Previous month'), 'calendar month controls')).click();
  const link = await until(() => byLabel('Open transcript for AAPL earnings on ' + date), 'available calendar transcript');
  link.focus();
  link.click();
  const dialog = await until(() => document.querySelector('dialog[open]'), 'calendar dialog');
  await until(() => dialog.innerText.includes('Fixture Analyst'), 'exact calendar call');
  byLabel('Close earnings call').click();
  await until(() => !document.querySelector('dialog[open]') && document.activeElement === link, 'calendar focus restored');

  await command('SPY EQ');
  await until(() => workspace.querySelector('.workspace-title')?.textContent === 'SPY' && button('CHART'), 'ETF research');
  if (button('Earnings calls')) throw new Error('ETF exposes company earnings calls');
  await manageKey();
  byLabel('Remove Equibles key').click();
  await until(() => !byLabel('Remove Equibles key'), 'removed key');
  await equityCalls();
  await until(() => /key/i.test(workspace.innerText) && !workspace.innerText.includes('Fixture Executive'), 'cached transcript cleared after key removal');
}

async function exerciseEarningsCalls(win) {
  active = true;
  try {
    win.setContentSize(1150, 800);
    await win.webContents.executeJavaScript('(' + exerciseInRenderer.toString() + ')(' + JSON.stringify({ date, olderId }) + ')');
    assert.deepEqual(analyticsRequests, ['brief', 'questions', 'transcript:0', 'transcript:200', 'insights', 'theme-history', 'phrase-trend', 'guidance', 'brief'],
      'Analytics load on demand and transcript pages are shared across Q&A, Equity and Calendar');
    console.log('Earnings Calls passed for four lazy-loaded views, multi-page Q&A, corrections, trends, key setup/removal and shared calendar cache.');
  } finally {
    active = false;
  }
}

module.exports = { earningsFixture, exerciseEarningsCalls };
