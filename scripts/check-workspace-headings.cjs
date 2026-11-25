const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, net } = require('electron');

const origin = 'https://charlie.test';
const dist = path.resolve(__dirname, '../dist');
const profile = mkdtempSync(path.join(tmpdir(), 'charlie-headings-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
app.once('quit', () => rmSync(profile, { recursive: true, force: true }));

// Serve the production bundle and a sample quote entirely inside the test session.
function localResponse(request) {
  const url = new URL(request.url);
  if (url.origin !== origin) return new Response(null, { status: 404 });
  if (url.pathname === '/api/yf/quotes') {
    const symbols = (url.searchParams.get('symbols') || '').split(',');
    return Response.json(symbols.map(symbol => ({
      symbol, currency: 'USD', shortName: symbol, quoteType: 'EQUITY', regularMarketPrice: 100,
    })));
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
  function checkOverviewSections() {
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
    ['F1', 'MARKET OVERVIEW'], ['F2', 'PORTFOLIO TRACKER'], ['F4', 'NEWS'], ['F5', 'MACRO MONITOR'],
    ['F6', 'SECTOR HEATMAP'], ['F7', 'FOREX'], ['F8', 'ETF MONITOR'], ['F9', 'CRYPTO MARKETS'],
    ['F10', 'PREDICTION MARKETS'], ['F11', 'HELP'], ['F12', 'CONNECTIONS & AI SETTINGS'],
  ]) {
    press(key);
    await measure(label);
    if (key === 'F1') checkOverviewSections();
    if (key === 'F4') {
      button('Edit layout').click();
      await until(() => button('Save layout'), 'News layout editing');
      await measure(label);
      button('Cancel').click();
    }
  }

  press('F3');
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
  win.destroy();
  console.log('Workspace heading positions, typography, backgrounds and dividers passed in both themes at desktop and mobile widths.');
}

app.whenReady().then(run).then(() => app.quit()).catch(error => {
  console.error(error);
  app.exit(1);
});
