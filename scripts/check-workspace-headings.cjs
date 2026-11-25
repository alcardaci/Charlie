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
app.setPath('userData', profile);
app.disableHardwareAcceleration();
app.once('quit', () => rmSync(profile, { recursive: true, force: true }));

// Serve the production bundle and sample market data entirely inside the test session.
function localResponse(request) {
  const url = new URL(request.url);
  if (url.origin !== origin) return new Response(null, { status: 404 });
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
  if (url.pathname === '/api/local-state/charlie-v1' && request.method === 'GET') {
    const state = {
      watchlist: ['^GSPC', 'FLAT', 'NOHIST'],
      portfolio: [{ id: 'lot', symbol: 'AAPL', shares: 900, avgCost: 80, currency: 'USD', purchaseDate: '2025-01-02', addedAt: '2025-01-02' }],
    };
    return Response.json({ value: JSON.stringify({ state, version: 0 }) });
  }
  if (url.pathname.startsWith('/api/local-state/')) return Response.json({ value: null });
  if (url.pathname.startsWith('/api/yf/summary/') || url.pathname.startsWith('/api/yf/insights/')) return Response.json({});
  if (url.pathname.startsWith('/api/')) return new Response(null, { status: 503 });
  const asset = path.resolve(dist, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (!asset.startsWith(dist + path.sep)) return new Response(null, { status: 404 });
  return net.fetch(pathToFileURL(asset).href);
}

// This function runs in the renderer so measurements include actual layout and font metrics.
async function measureHeadings({ theme, width }) {
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
    const pair = workspace.querySelector('.overview-primary-pair');
    const sections = pair?.querySelectorAll(':scope > section');
    if (sections?.length !== 2 || sections[0].querySelector('h2')?.textContent !== 'MARKET SENTIMENT'
      || sections[1].querySelector('h2')?.textContent !== 'MAJOR INDICES') {
      throw new Error(theme + ' Overview is missing its paired section headings');
    }
    const [sentiment, indices] = Array.from(sections, section => section.getBoundingClientRect());
    const stacked = indices.top >= sentiment.bottom;
    const sideBySide = indices.left >= sentiment.right && Math.abs(indices.top - sentiment.top) < 1;
    if (width === 1440 ? !sideBySide : !stacked) throw new Error(width + 'px ' + theme + ' Overview section placement');
    if (sections[1].querySelectorAll('tbody tr').length !== 5) throw new Error(theme + ' Overview index table');
    const watchlist = workspace.querySelector('#overview-watchlist');
    const snapshot = workspace.querySelector('[aria-label="Your portfolio snapshot"]');
    if (!snapshot || snapshot.nextElementSibling !== watchlist) {
      throw new Error('Overview watchlist should follow the portfolio snapshot');
    }
    const left = snapshot.getBoundingClientRect();
    const right = watchlist.getBoundingClientRect();
    const alongside = right.left >= left.right && Math.abs(right.top - left.top) < 1;
    if (width === 1440 ? !alongside : right.top < left.bottom) throw new Error(width + 'px watchlist placement');
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

  for (const [key, label] of [
    ['F1', 'MARKET OVERVIEW'], ['F2', 'NEWS'], ['F3', 'PORTFOLIO TRACKER'], ['F5', 'SECTOR HEATMAP'],
    ['F6', 'MACRO MONITOR'], ['F7', 'FOREX'], ['F8', 'ETF MONITOR'], ['F9', 'CRYPTO MARKETS'],
    ['F10', 'PREDICTION MARKETS'], ['F11', 'HELP'], ['F12', 'CONNECTIONS & AI SETTINGS'],
  ]) {
    press(key);
    await measure(label);
    if (key === 'F1') await checkOverviewSections();
    if (key === 'F2') {
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

async function run() {
  const win = new BrowserWindow({ show: false, webPreferences: { partition: 'heading-check', backgroundThrottling: false } });
  const { session } = win.webContents;
  session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (request, done) => {
    done({ cancel: new URL(request.url).origin !== origin });
  });
  session.protocol.handle('https', localResponse);
  await win.loadURL(origin);
  for (const width of [1440, 390, 320]) {
    win.setContentSize(width, 900);
    for (const theme of ['dark', 'light']) {
      const result = await win.webContents.executeJavaScript('(' + measureHeadings.toString() + ')(' + JSON.stringify({ width, theme }) + ')');
      for (const row of result) {
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
  win.destroy();
  console.log('Workspace navigation, headings, Overview layout and 30-day sparklines passed in both themes at desktop and mobile widths.');
}

app.whenReady().then(run).then(() => app.quit()).catch(error => {
  console.error(error);
  app.exit(1);
});
