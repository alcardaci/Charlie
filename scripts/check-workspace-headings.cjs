const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, net } = require('electron');

const origin = 'https://charlie.test';
const dist = path.resolve(__dirname, '../dist');
const profile = mkdtempSync(path.join(tmpdir(), 'charlie-headings-'));
const day = 86_400_000;
let sp500HistoryRequests = 0;
const companionRequests = [];
const companionQuestions = ['What stands out today?', 'What are the predictions for MSFT next quarter?'];
const companionModels = ['gpt-6.2-sol', 'gpt-6.2-astra'];
const overviewCardIds = ['summary', 'sentiment', 'indices', 'portfolio', 'watchlist', 'sectors', 'gainers', 'losers', 'commodities', 'fx', 'predictions', 'calendar'];
const connections = { openai: true, fred: false, finnhub: false };
let failFirstFredSave = true;
let savedState = JSON.stringify({ version: 0, state: {
  watchlist: ['^GSPC', 'FLAT', 'NOHIST'],
  marketOverviewSummary: { summary: Array(24).fill('Saved market summary.').join('\n'), generatedAt: '2025-01-02T12:00:00Z', model: 'fixture' },
  marketOverviewSummaryCollapsed: true,
  portfolio: [{ id: 'lot', symbol: 'AAPL', shares: 900, avgCost: 80, currency: 'USD', purchaseDate: '2025-01-02', addedAt: '2025-01-02' }],
} });
app.setPath('userData', profile);
app.disableHardwareAcceleration();
app.once('quit', () => rmSync(profile, { recursive: true, force: true }));

// Serve the production bundle and sample market data entirely inside the test session.
async function localResponse(request) {
  const url = new URL(request.url);
  if (url.origin !== origin) return new Response(null, { status: 404 });
  if (url.pathname === '/api/connections/status') return Response.json(connections);
  if (url.pathname === '/api/openai/panel-chat' && request.method === 'POST') {
    const body = await request.json();
    companionRequests.push(body);
    return Response.json({
      answer: 'Fixture companion reply ' + companionRequests.length + '.',
      panels: body.panels, model: body.model, generatedAt: '2025-01-02T12:00:00Z',
    });
  }
  if (url.pathname === '/api/connections/fred') {
    if (request.method === 'PUT') {
      assert.equal((await request.json()).secret, 'fixture-only');
      if (failFirstFredSave) {
        failFirstFredSave = false;
        return new Response(null, { status: 503 });
      }
      connections.fred = true;
    } else if (request.method === 'DELETE') {
      connections.fred = false;
    } else return new Response(null, { status: 405 });
    return Response.json({ configured: connections.fred });
  }
  if (url.pathname === '/api/yf/quotes') {
    const symbols = (url.searchParams.get('symbols') || '').split(',');
    return Response.json(symbols.map(symbol => ({
      symbol, currency: 'USD', exchangeTimezoneName: 'America/New_York', shortName: symbol, quoteType: 'EQUITY', regularMarketPrice: 100,
    })));
  }
  if (url.pathname.startsWith('/api/yf/chart/') && url.searchParams.has('period1') && url.searchParams.get('interval') === '1d') {
    const start = Date.parse(url.searchParams.get('period1'));
    const end = Date.parse(url.searchParams.get('period2'));
    if (end - start >= 30 * day && end - start <= 34 * day) {
      const symbol = decodeURIComponent(url.pathname.split('/').pop());
      if (symbol === '^GSPC') sp500HistoryRequests++;
      const quotes = symbol === 'NOHIST' ? [] : [15, -3, 5, 37, 8].map(offset => ({
        date: new Date(start + offset * day + 15 * 3_600_000).toISOString(),
        close: symbol === 'FLAT' ? 100 : 100 + offset,
      }));
      return Response.json({ meta: { currency: 'USD' }, quotes });
    }
  }
  if (url.pathname === '/api/local-state/charlie-v1') {
    if (request.method === 'PUT') savedState = (await request.json()).value;
    return Response.json({ value: savedState });
  }
  if (url.pathname.startsWith('/api/local-state/')) return Response.json({ value: null });
  if (url.pathname.startsWith('/api/yf/summary/') || url.pathname.startsWith('/api/yf/insights/')) return Response.json({});
  if (url.pathname.startsWith('/api/')) return new Response(null, { status: 503 });
  const asset = path.resolve(dist, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (!asset.startsWith(dist + path.sep)) return new Response(null, { status: 404 });
  return net.fetch(pathToFileURL(asset).href);
}

// This function runs in the renderer so measurements include actual layout and font metrics.
async function measureHeadings({ theme, width, question, replyNumber, companionModels, overviewCardIds }) {
  async function until(read, description) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const result = read();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error('Timed out waiting for ' + description);
  }
  await until(() => innerWidth === width, width + 'px viewport');
  const workspace = await until(() => document.querySelector('.instrument-workspace'), 'workspace');
  if (document.documentElement.dataset.theme !== theme) {
    document.querySelector('button[aria-label="Switch to ' + theme + ' mode"]').click();
    await until(() => document.documentElement.dataset.theme === theme, theme);
  }
  const press = key => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  const setValue = (el, value, event) => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, value);
    el.dispatchEvent(new Event(event, { bubbles: true }));
  };
  const button = label => Array.from(workspace.querySelectorAll('button')).find(el => el.innerText.trim() === label && el.getClientRects().length);
  const headers = () => Array.from(workspace.querySelectorAll('h1')).filter(el => el.getClientRects().length);
  const readings = [];
  async function checkNavigation(menu, labels) {
    const buttons = await until(() => {
      const nav = document.querySelector('[aria-label="' + menu + '"]');
      return nav?.getClientRects().length && Array.from(nav.querySelectorAll('button'));
    }, menu);
    const text = buttons.map(button => button.textContent.trim().replace(/\s+/g, ''));
    if (text.join('|') !== labels.join('|')) throw new Error(menu + ' order: ' + text.join(', '));
    return buttons;
  }
  if (width >= 768) {
    const labels = ['OVERVIEW', 'NEWS', 'PORT', 'EQUITY', 'HEAT', 'MACRO', 'FX', 'ETF', 'CRYPTO', 'PRED', 'HELP', 'SETTINGS'];
    await checkNavigation('Workspace shortcuts', labels.map((label, index) => 'F' + (index + 1) + label));
  } else {
    const primary = await checkNavigation('Mobile workspaces', ['Home', 'News+Geo', 'Port', 'Equity', 'More']);
    primary.at(-1).click();
    const more = await checkNavigation('More workspaces', ['Heatmap', 'Macro+Yield', 'Forex', 'ETF', 'Crypto', 'Predictions', 'Help', 'Settings', 'Watch']);
    more[0].click();
    await until(() => headers().some(el => el.textContent === 'Sector Heatmap'), 'mobile Heatmap selection');
    primary.at(-1).click();
    const watch = await until(() => Array.from(document.querySelectorAll('[aria-label="More workspaces"] button'))
      .find(el => el.textContent === 'Watch'), 'mobile watchlist shortcut');
    watch.click();
    await until(() => document.activeElement?.id === 'overview-watchlist', 'watchlist focused inside Overview');
  }
  async function checkOverviewSections() {
    const tile = id => workspace.querySelector('[data-card-id="' + id + '"]');
    let firstTitle;
    for (const id of overviewCardIds) {
      const card = tile(id);
      const titles = card?.querySelectorAll('.overview-section-title');
      if (titles?.length !== 1) throw new Error(id + ' must have one Overview section title');
      const title = titles[0];
      const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !node.textContent.trim()) node = walker.nextNode();
      if (!node) throw new Error(id + ' has an empty Overview section title');
      // Measure the first line of text, independently of wrapped actions or the rest of the heading.
      const range = document.createRange();
      const start = node.textContent.search(/\S/);
      range.setStart(node, start);
      range.setEnd(node, start + 1);
      const glyph = range.getBoundingClientRect();
      const box = card.getBoundingClientRect();
      const style = getComputedStyle(title);
      const inset = glyph.left - box.left;
      const firstLineBottom = glyph.bottom - box.top;
      const font = [style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight, style.letterSpacing].join('|');
      if (!glyph.width || !glyph.height) throw new Error(id + ' section title is invisible');
      firstTitle ??= { inset, firstLineBottom, font };
      if (Math.abs(inset - firstTitle.inset) > 0.75 || Math.abs(firstLineBottom - firstTitle.firstLineBottom) > 0.75 || font !== firstTitle.font) {
        throw new Error(width + 'px ' + theme + ' ' + id + ' title alignment ' + JSON.stringify({
          actual: { inset, firstLineBottom, font }, expected: firstTitle,
        }));
      }
    }
    const insights = tile('summary');
    const summary = insights?.querySelector('[aria-label="AI Market Summary"]');
    const companion = insights?.querySelector('form[aria-label="AI Companion"]');
    if (!summary || !companion?.querySelector('textarea')) throw new Error('Overview AI Insights is missing its summary or prompt');
    if (insights.previousElementSibling) throw new Error('AI Insights should lead the default Overview layout');
    const summaryBox = summary.getBoundingClientRect();
    const companionBox = companion.getBoundingClientRect();
    const paired = companionBox.left >= summaryBox.right && Math.abs(summaryBox.top - companionBox.top) < 1;
    if (width >= 1440 ? !paired : companionBox.top < summaryBox.bottom) throw new Error(width + 'px AI Insights placement');
    if (companion.scrollWidth > companion.clientWidth + 1) throw new Error(width + 'px Companion form overflows');
    const model = surface => surface.querySelector('select[aria-label="Companion model"]');
    const availableModels = Array.from(model(companion).options, option => option.value);
    if (availableModels.join('|') !== ['gpt-6-luna', ...companionModels].join('|')) throw new Error('Expected three Companion reasoning models');
    const web = surface => surface.querySelector('button[aria-label^="Web search mode:"]');
    for (const control of [model(companion), web(companion)]) {
      const box = control?.getBoundingClientRect();
      if (!box?.width || !box.height || box.left < companionBox.left || box.right > companionBox.right + 1) {
        throw new Error(width + 'px Overview Companion control is missing or clipped');
      }
    }
    const rules = Array.from(workspace.querySelectorAll('.overview-layout-board .tile-section-rule'))
      .filter(el => el.checkVisibility() && getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)')
      .map(el => el.getBoundingClientRect());
    if (!rules.some(rect => rect.height === 1 && rect.width > 1) || rules.some(rect => rect.height > rect.width)) {
      throw new Error(width + 'px Overview should have horizontal section rules only');
    }
    if (document.querySelector('.command-bar button[aria-label="Open AI companion"]')) throw new Error('Overview shows a duplicate Companion launcher');
    const sections = [tile('sentiment'), tile('indices')];
    if (sections[0]?.querySelector('h2')?.textContent !== 'MARKET SENTIMENT'
      || sections[1]?.querySelector('h2')?.textContent !== 'MAJOR INDICES') {
      throw new Error(theme + ' Overview is missing its paired section headings');
    }
    const [sentiment, indices] = Array.from(sections, section => section.getBoundingClientRect());
    const stacked = indices.top >= sentiment.bottom;
    const sideBySide = indices.left >= sentiment.right && Math.abs(indices.top - sentiment.top) < 1;
    if (width >= 1440 ? !sideBySide : !stacked) throw new Error(width + 'px ' + theme + ' Overview section placement ' + JSON.stringify({
      sentiment: sentiment.toJSON(), indices: indices.toJSON(), board: tile('indices').parentElement.getBoundingClientRect().toJSON(),
    }));
    if (sections[1].querySelectorAll('tbody tr').length !== 5) throw new Error(theme + ' Overview index table');
    const watchlist = workspace.querySelector('#overview-watchlist');
    const snapshot = workspace.querySelector('[aria-label="Your portfolio snapshot"]');
    if (!snapshot || !watchlist || tile('portfolio').nextElementSibling !== tile('watchlist')) {
      throw new Error('Overview watchlist should follow the portfolio snapshot');
    }
    const left = snapshot.getBoundingClientRect();
    const right = watchlist.getBoundingClientRect();
    const alongside = right.left >= left.right && Math.abs(right.top - left.top) < 1;
    if (width >= 1440 ? !alongside : right.top < left.bottom) throw new Error(width + 'px watchlist placement');
    if ([watchlist, snapshot].some(section => section.scrollWidth > section.clientWidth + 1)) {
      throw new Error(width + 'px account sections overflow');
    }

    const row = symbol => watchlist.querySelector('[aria-label="Open ' + symbol + ' in Equity"]')?.closest('tr');
    const trace = await until(() => row('^GSPC')?.querySelector('polyline'), 'watchlist price history');
    const indexTrace = await until(() => sections[1].querySelector('tbody tr:first-child polyline'), 'S&P 500 history');
    if (trace.getAttribute('points') !== indexTrace.getAttribute('points')) throw new Error('Same ticker has different sparklines');
    const [first, middle, last] = Array.from(trace.points);
    if (trace.points.length !== 3 || !(first.x < middle.x && middle.x < last.x && first.y > middle.y && middle.y > last.y)) {
      throw new Error('Sparkline did not plot the three closing prices chronologically');
    }
    const flat = await until(() => row('FLAT')?.querySelector('polyline'), 'flat watchlist price history');
    if (!Array.from(flat.points).every(point => point.y === flat.points[0].y)) throw new Error('Flat prices should form a horizontal line');
    const unavailable = await until(() => row('NOHIST')?.querySelector('[aria-label^="Insufficient daily closes"]'), 'missing watchlist history');
    if (row('NOHIST').querySelector('polyline') || unavailable.textContent !== '—') {
      throw new Error('Missing watchlist history should display a dash');
    }
    if (question) {
      const drawerSelector = 'section[aria-label="Charlie Companion"]';
      const unsentDraft = 'Keep this draft in the side panel.';
      async function checkEmptyCompanion(drawer) {
        const suggestions = await until(() => drawer.querySelector('[role="group"][aria-label="Suggested prompts"]'), 'new-chat suggestions');
        if (/Ask me anything/i.test(drawer.innerText) || !suggestions.checkVisibility()) throw new Error('Empty Companion should show suggestions without a starter message');
        const suggestion = suggestions.querySelector('button');
        const draft = drawer.querySelector('textarea[aria-label="Message to Companion"]');
        if (!suggestion?.innerText.trim() || !draft || draft.value) throw new Error('New chat should have a blank composer and a usable suggestion');
        suggestion.click();
        await until(() => draft.value === suggestion.innerText.trim(), 'selected suggestion fills the draft');
      }
      if (replyNumber === 1) {
        setValue(model(companion), companionModels[0], 'change');
        web(companion).click();
        companion.querySelector('button[aria-label="Open conversation"]').click();
        const drawer = await until(() => document.querySelector(drawerSelector), 'opened existing Companion');
        await checkEmptyCompanion(drawer);
        const guidance = drawer.querySelector('aside[aria-label="Companion guidance"]');
        if (!guidance?.checkVisibility() || !/Overview/i.test(guidance.innerText) || !guidance.innerText.includes('@') || !/web/i.test(guidance.innerText)) {
          throw new Error('Companion should show help for the current workspace, panel mentions and web mode');
        }
        const modelNames = surface => Array.from(model(surface).options, option => option.value).join('|');
        if (modelNames(companion) !== modelNames(drawer) || model(drawer).value !== companionModels[0] || web(drawer).getAttribute('aria-pressed') !== 'true') {
          throw new Error('Overview Companion settings did not carry over to the side panel');
        }
        web(drawer).click();
        await until(() => web(companion).getAttribute('aria-pressed') === 'false', 'side panel web toggle updates Overview');
        setValue(drawer.querySelector('textarea'), unsentDraft, 'input');
        drawer.querySelector('button[aria-label="Close companion"]').click();
        await until(() => !drawer.isConnected, 'closed existing Companion');
        web(companion).click();
      }
      const prompt = companion.querySelector('textarea');
      const send = companion.querySelector('button[type="submit"]');
      if (!send?.disabled) throw new Error('Blank Overview prompt should not submit');
      setValue(prompt, question, 'input');
      await until(() => !send.disabled, 'Overview prompt ready to send');
      if (width === 1440) {
        send.click();
        send.click(); // A quick double click must still submit a single prompt.
      } else {
        prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      }
      const drawer = await until(() => document.querySelector(drawerSelector), 'Companion side panel opened by Overview');
      await until(() => drawer.innerText.includes('Fixture companion reply ' + replyNumber + '.'), 'Companion answer');
      if (model(drawer).value !== companionModels[replyNumber - 1] || web(companion).getAttribute('aria-pressed') !== 'false' || web(drawer).getAttribute('aria-pressed') !== 'false') {
        throw new Error('The model should be kept and web search should return to automatic after the reply');
      }
      if (!drawer.innerText.includes(question) || (replyNumber > 1 && !drawer.innerText.includes('Fixture companion reply 1.'))) {
        throw new Error('Companion did not continue the current conversation');
      }
      if (drawer.querySelector('textarea').value !== unsentDraft) throw new Error('Sending from Overview overwrote the side panel draft');
      if (replyNumber === 1) {
        setValue(model(drawer), companionModels[1], 'change');
        await until(() => model(companion).value === companionModels[1], 'side panel model updates Overview');
      } else {
        drawer.querySelector('button[aria-label="Start a new companion chat"]').click();
        await checkEmptyCompanion(drawer);
        if (drawer.innerText.includes(question) || drawer.innerText.includes('Fixture companion reply')) throw new Error('Prior conversation leaked into new chat');
      }
      drawer.querySelector('button[aria-label="Close companion"]').click();
      await until(() => !drawer.isConnected && prompt.value === '', 'closed Companion and cleared Overview prompt');
    }
  }
  async function measure(label) {
    const title = await until(() => headers().find(el => el.innerText.trim().toUpperCase() === label), label);
    if (headers().length !== 1) throw new Error('Multiple visible page headings in ' + label);
    const panel = workspace.getBoundingClientRect();
    const box = title.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(title);
    const text = range.getBoundingClientRect();
    const css = getComputedStyle(title);
    const header = getComputedStyle(title.closest('.workspace-header'));
    readings.push({
      label, left: text.left - panel.left, top: box.top - panel.top, screenX: text.left, screenY: text.top,
      typography: [css.fontFamily, css.fontSize, css.lineHeight, css.fontWeight, css.letterSpacing, css.textTransform, css.color],
      background: header.backgroundColor, backgroundImage: header.backgroundImage, divider: header.borderBottomWidth,
    });
  }

  async function checkNewsTiles() {
    const ids = ['map', 'headlines', 'player', 'risk'];
    const cards = ids.map(id => workspace.querySelector('[data-card-id="' + id + '"]'));
    const land = await until(() => cards[0]?.querySelector('.rsm-geographies:has(.rsm-geography)'), 'rendered News world geography');
    const svg = land.ownerSVGElement;
    await until(() => svg.getBoundingClientRect().width > 0 && land.getBoundingClientRect().height > 0, 'measured event map');
    const boxes = cards.map(card => card.getBoundingClientRect());
    const [map, feed, player, risk] = boxes;
    const equal = (a, b) => Math.abs(a - b) <= 1;
    if (width >= 1440) {
      const rightRegion = player.right - feed.left;
      const expectedFeed = Math.max(280, (feed.width + player.width) / 4);
      const widthsMatch = equal(map.width, rightRegion) && equal(feed.width, expectedFeed);
      const columnsMatch = map.right <= feed.left && feed.right <= player.left && equal(player.left, risk.left) && equal(player.right, risk.right);
      const rowsMatch = equal(map.top, feed.top) && equal(feed.top, player.top) && player.bottom <= risk.top
        && equal(map.bottom, feed.bottom) && equal(feed.bottom, risk.bottom) && equal(player.height, risk.height);
      if (!widthsMatch || !columnsMatch || !rowsMatch) throw new Error(width + 'px ' + theme + ' default News desktop geometry: ' + JSON.stringify(boxes));
    } else if (!boxes.every((box, i) => equal(box.left, map.left) && equal(box.width, map.width) && equal(box.height, map.height) && (!i || box.top >= boxes[i - 1].bottom))) {
      throw new Error(width + 'px ' + theme + ' default News stack geometry: ' + JSON.stringify(boxes));
    }
    const frame = svg.getBoundingClientRect();
    const home = land.getBoundingClientRect();
    if (home.left < frame.left - 1 || home.top < frame.top - 1 || home.right > frame.right + 1
      || home.bottom > frame.bottom + 1 || Math.max(home.width / frame.width, home.height / frame.height) < 0.8) {
      throw new Error(width + 'px News map should frame the whole world: ' + JSON.stringify({ frame, home }));
    }
    if (width !== 320 && theme === 'dark') {
      cards[0].querySelector('button[aria-label="Zoom in event map"]').click();
      await until(() => land.getBoundingClientRect().width > home.width * 1.1, 'event map zooms in');
      cards[0].querySelector('button[aria-label="Reset event map zoom"]').click();
      await until(() => {
        const restored = land.getBoundingClientRect();
        return equal(restored.width, home.width) && equal(restored.top, home.top) && equal(restored.left, home.left);
      }, 'event map resets to its full-world frame');
    }
    return {
      tiles: Object.fromEntries(ids.map((id, i) => [id, [boxes[i].width, boxes[i].height]])),
      land: [Math.round(home.width), Math.round(home.height)],
      frame: [Math.round(frame.width), Math.round(frame.height)],
    };
  }

  function checkPanelWidth(label) {
    const body = headers()[0].closest('.workspace-header').nextElementSibling;
    if (body.scrollWidth > body.clientWidth + 1) throw new Error(width + 'px ' + label + ' overflows');
  }

  async function checkHelpAndSettings() {
    const directory = workspace.querySelector('nav[aria-label="Workspaces"]');
    if (directory?.querySelectorAll('button').length !== 12) throw new Error('Help directory is incomplete');
    const reference = Array.from(workspace.querySelectorAll('details')).find(el => el.querySelector('summary')?.textContent.includes('Data sources'));
    if (!reference || reference.open) throw new Error('Help source reference should start collapsed');
    reference.querySelector('summary').click();
    if (!reference.innerText.includes('Yahoo Finance')) throw new Error('Help source reference missing');
    checkPanelWidth('expanded Help');
    button('WL').click();
    await until(() => document.activeElement?.id === 'overview-watchlist', 'Help watchlist shortcut');
    press('F11');
    const openSettings = await until(() => workspace.querySelector('nav [aria-label="Open Settings"]'), 'Help Settings shortcut');
    openSettings.click();
    await until(() => headers().some(el => el.textContent === 'SETTINGS'), 'Help opens Settings');

    const manager = workspace.querySelector('summary[aria-label="Manage FRED connection"]');
    manager.click();
    const row = manager.closest('details');
    const action = name => row.querySelector('button[aria-label="' + name + ' FRED key"]');
    const field = row.querySelector('input[aria-label="FRED API key"]');
    await until(() => /No key/i.test(row.innerText), 'FRED no-key status');
    if (field.type !== 'password' || !action('Save').disabled) throw new Error('Initial key field state');
    setValue(field, 'fixture-only', 'input');
    action('Show').click();
    await until(() => field.type === 'text' && !action('Save').disabled, 'FRED draft revealed');
    action('Save').click();
    await until(() => /try again/i.test(row.innerText) && !action('Save').disabled, 'failed key save can retry');
    if (field.value !== 'fixture-only' || action('Remove')) throw new Error('Failed save changed the key state');
    action('Save').click();
    await until(() => !!action('Remove') && !action('Remove').disabled && /Key saved/i.test(manager.textContent) && field.type === 'password' && field.value === '', 'saved and remasked key');
    action('Remove').click();
    await until(() => /No key/i.test(manager.textContent) && !action('Remove'), 'removed key');
    const advanced = Array.from(workspace.querySelectorAll('summary')).find(el => el.textContent.includes('Summary instructions'));
    if (!advanced || advanced.parentElement.open) throw new Error('Advanced prompt should start collapsed');
    advanced.click();
    const prompt = workspace.querySelector('textarea');
    const model = Array.from(workspace.querySelectorAll('select')).find(el => Array.from(el.options).some(option => option.value === 'gpt-4.1'));
    setValue(prompt, 'Fixture market summary preference.', 'input');
    setValue(model, 'gpt-4.1', 'change');
    checkPanelWidth('expanded Settings');
    await until(() => !button('Save preferences').disabled, 'edited preferences can save');
    button('Save preferences').click();
    press('F11');
    await until(() => headers().some(el => el.textContent === 'HELP'), 'Help reopened');
    press('F12');
    await until(() => headers().some(el => el.textContent === 'SETTINGS'), 'Settings reopened');
    Array.from(workspace.querySelectorAll('summary')).find(el => el.textContent.includes('Summary instructions')).click();
    if (workspace.querySelector('textarea')?.value !== 'Fixture market summary preference.'
      || workspace.querySelector('select')?.value !== 'gpt-4.1') throw new Error('Saved AI preferences lost when reopening Settings');
  }

  for (const [key, label] of [
    ['F1', 'MARKET OVERVIEW'], ['F2', 'NEWS'], ['F3', 'PORTFOLIO TRACKER'], ['F5', 'SECTOR HEATMAP'],
    ['F6', 'MACRO MONITOR'], ['F7', 'FOREX'], ['F8', 'ETF MONITOR'], ['F9', 'CRYPTO MARKETS'],
    ['F10', 'PREDICTION MARKETS'], ['F11', 'HELP'], ['F12', 'SETTINGS'],
  ]) {
    press(key);
    await measure(label);
    if (key === 'F1') await checkOverviewSections();
    if (key === 'F11' || key === 'F12') checkPanelWidth(label);
    if (key === 'F11' && width === 320 && theme === 'light') await checkHelpAndSettings();
    if (key === 'F2') {
      readings.at(-1).newsLayout = await checkNewsTiles();
      if (!document.querySelector('.command-bar button[aria-label="Open AI companion"]')) throw new Error('News lost access to the Companion');
      button('Edit layout').click();
      await until(() => button('Save layout'), 'News layout editing');
      await measure(label);
      button('Cancel').click();
    }
  }

  press('F4');
  const chart = await until(() => button('CHART'), 'Equity research');
  if (workspace.querySelector('.workspace-header')) throw new Error('Unexpected Equity research header');
  chart.click();
  const parallel = await until(() => button('AAPL') && button('PARALLEL'), 'Equity chart');
  if (workspace.querySelector('.workspace-header')) throw new Error('Unexpected Equity chart header');
  parallel.click();
  await measure('MULTI-ASSET WORKSPACE');
  return readings;
}

async function checkOverviewEditor(win) {
  const contents = win.webContents;
  const inPage = (fn, ...args) => contents.executeJavaScript('(' + fn + ')(...' + JSON.stringify(args) + ')');
  async function waitFor(read, description) {
    const deadline = Date.now() + 5000;
    do {
      const result = await read();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 30));
    } while (Date.now() < deadline);
    throw new Error('Timed out waiting for ' + description);
  }
  const defaultOrder = overviewCardIds;
  const readCards = () => inPage(() => Array.from(document.querySelectorAll('.overview-layout-board [data-card-id]'), el => el.dataset.cardId));
  const cardSize = id => inPage(id => {
    const { width, height } = document.querySelector('[data-card-id="' + id + '"]').getBoundingClientRect();
    return { width, height };
  }, id);
  const expectOrder = (order, description) => waitFor(async () =>
    (await readCards()).join(',') === order.join(','), description);
  const navigate = key => inPage(key => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })), key);
  const clickText = label => waitFor(() => inPage(label => {
    const button = Array.from(document.querySelectorAll('.instrument-workspace button'))
      .find(el => el.textContent.trim() === label && el.getClientRects().length && !el.disabled);
    if (!button) return false;
    button.click();
    return true;
  }, label), label);
  const cardAction = (id, verb) => '[data-card-id="' + id + '"] > button[aria-label^="' + verb + ' "]';
  const activate = (selector, key) => waitFor(() => inPage((selector, key) => {
    const el = document.querySelector(selector);
    if (!el || el.disabled) return false;
    if (key) el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    else el.click();
    return true;
  }, selector, key), selector);
  async function point(selector, scroll, x = 0.5, y = 0.5) {
    return waitFor(() => inPage(async (selector, scroll, x, y) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      if (scroll) el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const before = el.getBoundingClientRect();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || ['x', 'y', 'width', 'height'].some(k => box[k] !== before[k])) return null;
      return { x: Math.round(box.left + box.width * x), y: Math.round(box.top + box.height * y) };
    }, selector, scroll, x, y), selector);
  }
  async function drag(from, to) {
    const mouse = (type, x, y, down) => contents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: down ? 1 : 0, clickCount: 1,
    });
    await mouse('mousePressed', from.x, from.y, true);
    for (let step = 1; step <= 6; step++) {
      await mouse('mouseMoved', from.x + (to.x - from.x) * step / 6, from.y + (to.y - from.y) * step / 6, true);
    }
    await mouse('mouseReleased', to.x, to.y, false);
  }

  win.setContentSize(1440, 900);
  await waitFor(() => inPage(() => innerWidth === 1440), 'desktop editing viewport');
  await navigate('F1');
  await expectOrder(defaultOrder, 'default Overview cards');
  const collapsedHeight = await waitFor(() => inPage(() => {
    const tile = document.querySelector('[data-card-id="summary"]');
    const natural = tile.querySelector('.tile-layout-natural').getBoundingClientRect();
    const box = tile.getBoundingClientRect();
    const split = tile.querySelector('[aria-label="AI Companion"]').getBoundingClientRect().left >
      tile.querySelector('[aria-label="AI Market Summary"]').getBoundingClientRect().left;
    return split && box.width > 640 && Math.abs(box.height - natural.height) < 1 && box.height;
  }), 'measured desktop AI Insights row');
  await clickText('EXPAND SUMMARY');
  await waitFor(async () => (await cardSize('summary')).height > collapsedHeight + 150, 'automatic row height when the summary expands from ' + collapsedHeight);
  await clickText('MINIMIZE SUMMARY');
  await waitFor(async () => (await cardSize('summary')).height < collapsedHeight + 100, 'automatic row height when the summary closes');
  await clickText('Edit layout');
  contents.debugger.attach('1.3');
  try {
    const from = await point(cardAction('sentiment', 'Move'), true);
    const to = await point(cardAction('indices', 'Move'), false);
    await drag(from, to);
    const reordered = [...defaultOrder];
    [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
    await expectOrder(reordered, 'pointer reorder');
    const before = await cardSize('indices');
    const neighbour = await cardSize('sentiment');
    const corner = await point(cardAction('indices', 'Resize'), true);
    await drag(corner, { x: corner.x + 52, y: corner.y + 48 });
    await waitFor(async () => {
      const current = await cardSize('indices');
      const other = await cardSize('sentiment');
      return current.width > before.width + 20 && current.height > before.height + 20 && other.width < neighbour.width - 20;
    }, 'corner resized the tile and its neighbour');

    const columnHandle = '.overview-layout-board button[aria-label="Resize columns between cards"]';
    const divider = await point(columnHandle, true);
    const columnWidth = (await cardSize('indices')).width;
    await drag(divider, { x: divider.x - 24, y: divider.y });
    await waitFor(async () => (await cardSize('indices')).width < columnWidth - 10, 'continuous column divider resize');

    // Put the summary beside an index by dropping near the left edge, inside the board boundary.
    const source = await point(cardAction('summary', 'Move'), true);
    const edge = await point(cardAction('indices', 'Move'), false, 0.12, 0.5);
    await drag(source, edge);
    await waitFor(() => inPage(() => {
      const box = id => document.querySelector('[data-card-id="' + id + '"]').getBoundingClientRect();
      const left = box('summary'), right = box('indices');
      return Math.abs(left.top - right.top) < 1 && left.right <= right.left;
    }), 'left edge drop created a new column');
  } finally {
    contents.debugger.detach();
  }
  await activate(cardAction('watchlist', 'Remove'));
  const custom = await waitFor(async () => {
    const cards = await readCards();
    return cards.length === defaultOrder.length - 1 && cards;
  }, 'watchlist removed from draft');
  await clickText('Save layout');
  await waitFor(() => JSON.parse(savedState).state.overviewLayout?.tree && !JSON.stringify(JSON.parse(savedState).state.overviewLayout.tree).includes('watchlist'), 'saved layout on disk');
  const savedIndexSize = await cardSize('indices');
  await navigate('F2');
  await clickText('Edit layout');
  await point(cardAction('map', 'Resize'), false);
  const mapWidth = (await cardSize('map')).width;
  await activate(cardAction('map', 'Resize'), 'ArrowRight');
  await waitFor(async () => (await cardSize('map')).width > mapWidth + 5, 'News still resizes adjoining cards');
  await clickText('Cancel');
  await waitFor(async () => Math.abs((await cardSize('map')).width - mapWidth) <= 1, 'cancel restores the News layout');
  const savedNews = JSON.stringify(JSON.parse(savedState).state.newsLayout);
  await clickText('Edit layout');
  await activate(cardAction('map', 'Resize'), 'ArrowRight');
  await waitFor(async () => (await cardSize('map')).width > mapWidth + 5, 'custom News map width');
  await clickText('Save layout');
  await waitFor(() => JSON.stringify(JSON.parse(savedState).state.newsLayout) !== savedNews, 'saved custom News layout');
  const savedMapWidth = (await cardSize('map')).width;
  await navigate('F1');
  await win.loadURL(origin);
  await expectOrder(custom, 'restored card order after reopening');
  await waitFor(async () => {
    const size = await cardSize('indices');
    return Math.abs(size.width - savedIndexSize.width) <= 1 && Math.abs(size.height - savedIndexSize.height) <= 1;
  }, 'restored tile dimensions');
  await navigate('F2');
  await waitFor(() => inPage(savedWidth => {
    const map = document.querySelector('[data-card-id="map"]');
    return map && Math.abs(map.getBoundingClientRect().width - savedWidth) <= 1;
  }, savedMapWidth), 'restored custom News layout after reopening');
  await clickText('Edit layout');
  await clickText('Reset to default');
  await clickText('Save layout');
  await waitFor(async () => Math.abs((await cardSize('map')).width - mapWidth) <= 1, 'reset restores the full-height map column');
  await navigate('F1');
  await clickText('Edit layout');
  await activate(cardAction('summary', 'Move'), 'ArrowDown');
  await waitFor(async () => (await readCards()).indexOf('summary') !== custom.indexOf('summary'), 'keyboard reorder');
  await activate('button[aria-label="Add Watchlist"]');
  await waitFor(async () => (await readCards()).includes('watchlist'), 'add card');
  await clickText('Cancel');
  await expectOrder(custom, 'cancel restores saved cards and order');

  win.setContentSize(390, 900);
  await activate('button[aria-label="Open watchlist"]');
  await waitFor(() => inPage(() => document.activeElement?.id === 'overview-watchlist'), 'hidden watchlist shortcut');
  await navigate('F6');
  await waitFor(() => inPage(() => document.querySelector('.workspace-title')?.textContent === 'MACRO MONITOR'), 'Macro navigation');
  await navigate('F1');
  await expectOrder(custom, 'shortcut preserves saved watchlist visibility');
  await clickText('Edit layout');
  for (const card of custom) await activate(cardAction(card, 'Remove'));
  await expectOrder([], 'empty draft');
  await clickText('Save layout');
  await waitFor(() => JSON.parse(savedState).state.overviewLayout?.tree === null, 'saved empty layout');
  await activate('.command-bar button[aria-label="Open AI companion"]');
  await activate('section[aria-label="Charlie Companion"] button[aria-label="Close companion"]');
  await win.loadURL(origin);
  await clickText('Edit layout');
  assert.deepEqual(await readCards(), [], 'An intentionally empty layout survives reopening');
  await clickText('Reset to default');
  await expectOrder(defaultOrder, 'restore all default cards');
  contents.debugger.attach('1.3');
  try {
    // Keep both cards on screen, even when the two Insights boxes stack on a phone.
    await point(cardAction('sentiment', 'Move'), false);
    await inPage(() => {
      const viewport = document.querySelector('.overview-layout-board').parentElement;
      const sentiment = viewport.querySelector('[data-card-id="sentiment"]').getBoundingClientRect();
      viewport.scrollTop += sentiment.top - viewport.getBoundingClientRect().top - viewport.clientHeight / 2;
    });
    const from = await point(cardAction('summary', 'Move'), false, 0.5, 0.85);
    const touch = (type, touchPoints) => contents.debugger.sendCommand('Input.dispatchTouchEvent', { type, touchPoints });
    await touch('touchStart', [from]);
    const to = await point(cardAction('sentiment', 'Move'), false, 0.5, 0.32);
    for (let step = 1; step <= 6; step++) {
      await touch('touchMove', [{ x: from.x + (to.x - from.x) * step / 6, y: from.y + (to.y - from.y) * step / 6 }]);
    }
    await touch('touchEnd', []);
    await expectOrder(['sentiment', 'summary', ...defaultOrder.slice(2)], 'touch reorder on mobile');
  } finally {
    contents.debugger.detach();
  }
  await clickText('Reset to default');
  await clickText('Save layout');
}

async function run() {
  const win = new BrowserWindow({ show: false, webPreferences: { partition: 'heading-check', backgroundThrottling: false } });
  const { session } = win.webContents;
  session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (request, done) => {
    done({ cancel: new URL(request.url).origin !== origin });
  });
  session.protocol.handle('https', localResponse);
  await win.loadURL(origin);
  for (const width of [1440, 2560, 390, 320]) {
    win.setContentSize(width, 900);
    for (const theme of ['dark', 'light']) {
      const replyNumber = theme === 'dark' && [1440, 390].includes(width) ? (width === 1440 ? 1 : 2) : 0;
      const question = companionQuestions[replyNumber - 1];
      const result = await win.webContents.executeJavaScript('(' + measureHeadings.toString() + ')(' + JSON.stringify({ width, theme, question, replyNumber, companionModels, overviewCardIds }) + ')');
      for (const row of result) {
        if (row.newsLayout && theme === 'dark') console.log(width + 'px News layout', row.newsLayout);
        const description = width + 'px ' + theme + ' ' + row.label;
        assert.ok(Math.abs(row.left - 16) < 0.5 && Math.abs(row.top - 12) < 0.5, description + ': title at ' + [row.left, row.top]);
        assert.equal(row.screenX, result[0].screenX, description + ': screen position');
        assert.equal(row.screenY, result[0].screenY, description + ': text baseline');
        assert.deepEqual(row.typography, result[0].typography, description + ': font');
        assert.equal(row.background, 'rgba(0, 0, 0, 0)', description + ': header background');
        assert.equal(row.backgroundImage, 'none', description + ': header background image');
        assert.equal(row.divider, '0px', description + ': header divider');
      }
    }
  }
  assert.equal(sp500HistoryRequests, 1, 'Expected one shared 30-day history request for the index and watchlist');
  assert.equal(companionRequests.length, companionQuestions.length, 'One Companion request per submitted Overview prompt');
  companionRequests.forEach((request, index) => {
    assert.equal(request.activePanel, 'overview');
    assert.equal(request.model, companionModels[index], 'Selected Companion model reaches the request');
    assert.equal(request.webSearch, true, 'Both modes allow web search');
    assert.equal(request.forceWebSearch, index === 0, 'Forced web search applies to one request');
    assert.ok(request.contexts.some(context => context.panel === 'overview'), 'Overview context sent to Companion');
    assert.ok(!request.messages.some(message => /^Ask me anything\./i.test(message.content)), 'Starter copy must never be sent as conversation history');
    assert.deepEqual(request.messages.filter(message => message.role === 'user').map(message => message.content), companionQuestions.slice(0, index + 1));
  });
  assert.deepEqual(companionRequests[1].panels, ['overview'], 'A ticker forecast should not implicitly attach the Predictions panel');
  assert.ok(companionRequests[1].messages.some(message => message.role === 'assistant' && message.content === 'Fixture companion reply 1.'), 'Follow-up includes the earlier reply');
  assert.ok(!savedState.includes('fixture-only'), 'Provider keys must stay separate from general app preferences');
  await checkOverviewEditor(win);
  win.destroy();
  console.log('Workspace navigation, headings, Help, Settings, Overview layout editing and persistence, AI Insights conversations, and 30-day sparklines passed.');
}

app.whenReady().then(run).then(() => app.quit()).catch(error => {
  console.error(error);
  app.exit(1);
});
