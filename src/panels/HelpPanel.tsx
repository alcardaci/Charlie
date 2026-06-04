import type { ReactNode } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';

const WORKSPACES = [
  { title: 'Market Overview', command: 'HOME', summary: 'Cross-asset pulse, movers, sentiment, portfolio snapshot, macro calendar, and prediction-market forecasts.' },
  { title: 'Portfolio', command: 'PORT', summary: 'Lots, cost basis, exposures, and editable portfolio bookkeeping.' },
  { title: 'Opportunities', command: 'OPPS', summary: 'Live theme discovery plus keyword-driven topic cards.' },
  { title: 'Research Workspace', command: 'AAPL', summary: 'Ticker-level company stats, leadership, filings, segment data, and analyst context.' },
  { title: 'Chart View', command: 'MSFT GP', summary: 'Interactive price action with multiple chart styles and timeframes.' },
  { title: 'News + Geopolitics', command: 'NEWS', summary: 'World news, geopolitical risk, and the global event map in one view.' },
  { title: 'Prediction Markets', command: 'PRED', summary: 'Market-implied probabilities, themes, liquidity, and event metadata.' },
  { title: 'Macro + Yield Monitor', command: 'MACRO', summary: 'Macro dashboard, release calendar, and Treasury yield-curve tools.' },
  { title: 'Heatmap', command: 'HEAT', summary: 'Fast sector leadership read for the S&P 500 and related ETFs.' },
  { title: 'Forex', command: 'FX', summary: 'Currency monitor with custom pair selection and quick conversion.' },
  { title: 'Crypto', command: 'CRYPTO', summary: 'Crypto market breadth, leaders, and ranking-driven workflows.' },
  { title: 'ETF Monitor', command: 'ETF', summary: 'Sector, fixed income, commodity, and international ETF lookup.' },
  { title: 'Connections & AI Settings', command: 'SETTINGS', summary: 'Manage local provider credentials and the OpenAI model/prompt used by AI-assisted workflows.' },
] as const;

const KEYBOARD = [
  { key: 'UP / DOWN', desc: 'Navigate command history in the command bar.' },
  { key: 'ENTER', desc: 'Execute the command or open the first search match.' },
  { key: 'TAB', desc: 'Accept the top autocomplete result while typing.' },
  { key: 'ESC', desc: 'Clear the current command or close the dropdown.' },
  { key: 'F1-F12', desc: 'Jump straight to the shortcut workspaces in the bottom bar: `F1` Market Overview, `F2` Portfolio, `F3` Opportunities, `F4` News + Geopolitics, `F5` Macro, `F6` Heat, `F7` FX, `F8` ETF, `F9` Crypto, `F10` Predictions, `F11` Help, and `F12` Settings.' },
] as const;

const DATA_SOURCES = [
  {
    name: 'Yahoo Finance',
    coverage: 'Equities, ETFs, indices, forex, futures, company fundamentals, and headline search/feed data.',
    note: 'yahoo-finance2 package',
  },
  {
    name: 'Teleborsa / FIDA',
    coverage: 'Fallback quote/workbench/search data for select mutual funds not reliably covered by Yahoo.',
    note: 'Public web parsing',
  },
  {
    name: 'CoinGecko',
    coverage: 'Cryptocurrency spot prices, rankings, market cap, and sparkline data.',
    note: 'Public API',
  },
  {
    name: 'Polymarket',
    coverage: 'Prediction market probabilities, liquidity, 24-hour volume, and event metadata.',
    note: 'Public Gamma API',
  },
  {
    name: 'FRED',
    coverage: 'US and G10 macro series plus release date support for the calendar views.',
    note: 'Configured in Settings',
  },
  {
    name: 'Finnhub',
    coverage: 'Earnings calendar data used in macro calendar views.',
    note: 'Configured in Settings',
  },
  {
    name: 'Caldara-Iacoviello GPR',
    coverage: 'Official geopolitical risk time series (daily GPR, acts, threats, and moving averages).',
    note: 'Public dataset',
  },
  {
    name: 'GDELT DOC 2.0',
    coverage: 'Geopolitics headline/event inputs, including country-level clustering and map enrichment.',
    note: 'Public API',
  },
] as const;

const EXCHANGE_NOTES = [
  { suffix: '.L', exchange: 'London Stock Exchange (LSE)' },
  { suffix: '.DE', exchange: 'Deutsche Borse / XETRA (Germany)' },
  { suffix: '.AS', exchange: 'Euronext Amsterdam' },
  { suffix: '.PA', exchange: 'Euronext Paris' },
  { suffix: '.MI', exchange: 'Borsa Italiana (Milan)' },
  { suffix: '.T', exchange: 'Tokyo Stock Exchange' },
  { suffix: '.HK', exchange: 'Hong Kong Stock Exchange' },
  { suffix: '.SS', exchange: 'Shanghai Stock Exchange' },
] as const;

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded border border-terminal-border bg-terminal-panel p-4">
      <div className="mb-3">
        <div className="text-terminal-muted text-xs font-bold tracking-wider">{title}</div>
        {subtitle && <div className="text-terminal-faint text-xs mt-1">{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

export function HelpPanel() {
  const { executeCommand } = useTerminalStore();
  const workspaces = WORKSPACES;

  return (
    <div className="h-full overflow-y-auto p-5 xl:p-6">
      <div className="space-y-4 min-w-0">
        <section className="rounded border border-terminal-border bg-terminal-panel p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-terminal-accent font-bold text-3xl tracking-widest">CHARLIE</span>
            <span className="text-terminal-faint font-mono text-xs tracking-wider">1.0.0</span>
            <span className="text-terminal-muted text-sm">Professional market data workspace</span>
          </div>
          <p className="mt-3 text-terminal-muted text-xs leading-relaxed">
            Charlie brings near-real-time market data, charts, news, analytics, macro monitoring, geopolitics coverage,
            and public prediction-market forecasts into one terminal. Use the command bar for fast jumps, the shortcut
            bar for the core workspaces, and Settings for local provider credentials and AI preferences.
          </p>
        </section>

        <SectionCard title="DEDICATED WORKSPACES">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {workspaces.map(({ title, command, summary }) => (
              <button
                key={title}
                onClick={() => executeCommand(command)}
                className="rounded border border-terminal-border bg-terminal-elevated p-3 text-left hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-terminal-text text-xs font-bold">{title}</span>
                  <span className="text-terminal-blue text-[11px] font-mono">{command}</span>
                </div>
                <div className="mt-2 text-terminal-muted text-xs leading-relaxed">{summary}</div>
              </button>
            ))}
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SectionCard title="KEYBOARD SHORTCUTS" subtitle="Fastest ways to move without touching the mouse">
            <div className="space-y-2">
              {KEYBOARD.map(({ key, desc }) => (
                <div key={key} className="flex items-start gap-3 rounded border border-terminal-border bg-terminal-elevated px-3 py-2">
                  <span className="min-w-20 rounded border border-terminal-border bg-terminal-panel px-2 py-1 text-[11px] font-mono text-terminal-text text-center">
                    {key}
                  </span>
                  <span className="text-terminal-muted text-xs leading-relaxed">{desc}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="DATA SOURCES" subtitle="What powers the different workspaces">
            <div className="space-y-2">
              {DATA_SOURCES.map(({ name, coverage, note }) => (
                <div key={name} className="rounded border border-terminal-border bg-terminal-elevated px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-terminal-text text-xs font-bold">{name}</span>
                    <span className="text-terminal-faint text-[11px]">{note}</span>
                  </div>
                  <div className="mt-1 text-terminal-muted text-xs leading-relaxed">{coverage}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="INTERNATIONAL TICKERS" subtitle="Examples for non-US symbols and ETFs">
            <div className="rounded border border-terminal-border bg-terminal-elevated px-3 py-2 text-terminal-faint text-xs leading-relaxed">
              Non-US listings usually need an exchange suffix. Examples:
              {' '}<span className="text-terminal-blue font-mono">VWCE.DE</span>,
              {' '}<span className="text-terminal-blue font-mono">BP.L</span>,
              {' '}<span className="text-terminal-blue font-mono">7203.T</span>
            </div>
            <div className="mt-2 space-y-2">
              {EXCHANGE_NOTES.map(({ suffix, exchange }) => (
                <div key={suffix} className="flex items-center gap-3 rounded border border-terminal-border bg-terminal-elevated px-3 py-2">
                  <span className="w-12 flex-shrink-0 text-terminal-accent font-mono text-xs">{suffix}</span>
                  <span className="text-terminal-muted text-xs">{exchange}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <section className="rounded border border-terminal-border bg-terminal-panel px-4 py-3">
          <div className="text-terminal-faint text-xs leading-relaxed">
            Charlie is an open-source market terminal built with React, Vite, and Tailwind CSS.
            Market data and event intelligence flow through Yahoo Finance, Teleborsa/FIDA, CoinGecko, Polymarket, FRED, Finnhub,
            Caldara-Iacoviello GPR, and GDELT.
            External keys stay server-side behind local proxy routes where required. Quote updates are near-real-time
            (provider and polling dependent), not guaranteed tick-level streaming.
          </div>
        </section>
      </div>
    </div>
  );
}
