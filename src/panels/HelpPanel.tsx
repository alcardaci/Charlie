import { workspaceShortcuts } from '../data/workspaceShortcuts';
import { useTerminalStore } from '../store/useTerminalStore';

const COMMAND_EXAMPLES = [
  { command: 'AAPL', description: 'Open Apple in Equity Research. You can also search by company name.' },
  { command: 'MSFT GP', description: 'Open Microsoft’s price chart. Use GP after any ticker.' },
  { command: 'WL', description: 'Open your watchlist. To add a ticker, type AAPL WL in the command bar.' },
  { command: 'HOME', description: 'Customize Overview. Choose Edit layout to move, resize, add, or remove cards, then Save layout.' },
  { command: 'CONGRESS', description: 'Explore House and Senate transactions by member, ticker, or chamber.' },
  { command: 'HELP', description: 'Open this Help & Shortcuts tab in Settings.' },
] as const;

const KEYS = [
  ['Enter', 'Run a command or open the first search result.'],
  ['Tab', 'Open the first suggestion when matches are visible.'],
  ['↑ / ↓', 'Recall earlier commands.'],
  ['Esc', 'Clear the input and leave the command bar.'],
] as const;

const SOURCES = [
  ['Yahoo Finance', 'Market quotes, charts, fundamentals, and headlines.'],
  ['SEC EDGAR', 'Company filings and reported financials.'],
  ['Teleborsa / FIDA', 'Fallback quotes and search for selected funds.'],
  ['BLS, OECD, Eurostat', 'U.S., European, and cross-country economic indicators.'],
  ['FRED', 'Economic series and release dates.'],
  ['Finnhub', 'Earnings calendars.'],
  ['CoinGecko', 'Crypto prices and market-cap rankings.'],
  ['Polymarket', 'Market-implied probabilities and trading activity.'],
  ['House Clerk and NexusTrade', 'U.S. House and Senate financial disclosures and links to the original filings.'],
  ['congress-legislators', 'Member names, party affiliations, and constituencies.'],
  ['GDELT', 'Global coverage from article search and news archives.'],
  ['Caldara–Iacoviello', 'The Geopolitical Risk Index.'],
] as const;

const EXCHANGES = [
  ['.L', 'London'], ['.DE', 'Xetra'], ['.AS', 'Amsterdam'], ['.PA', 'Paris'],
  ['.MI', 'Milan'], ['.T', 'Tokyo'], ['.HK', 'Hong Kong'], ['.SS', 'Shanghai'],
] as const;

const heading = 'instrument-heading mb-2 text-xs font-bold tracking-wider';
const focus = 'focus-visible:outline focus-visible:outline-1 focus-visible:outline-terminal-accent';
const disclosure = 'cursor-pointer py-3 font-semibold text-terminal-text marker:text-terminal-accent hover:text-terminal-accent ' + focus;

export function HelpContent() {
  const executeCommand = useTerminalStore(state => state.executeCommand);

  return (
      <div className="text-xs text-terminal-muted">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))] items-start gap-x-8 gap-y-6">
          <section aria-labelledby="help-commands">
            <h2 className={heading} id="help-commands">COMMAND BAR</h2>
            <p className="mb-1 leading-relaxed">Type a command in the top bar, or try an example here.</p>
            <dl className="divide-y divide-[var(--section-rule-color)]">
              {COMMAND_EXAMPLES.map(({ command, description }) => (
                <div key={command} className="grid grid-cols-[5.5rem_1fr] items-baseline gap-2 py-2">
                  <dt>
                    <button type="button" onClick={() => executeCommand(command)}
                      className={'rounded border border-terminal-border px-2 py-1 text-terminal-accent hover:bg-terminal-hover ' + focus}>
                      {command}
                    </button>
                  </dt>
                  <dd className="leading-relaxed">{description}</dd>
                </div>
              ))}
            </dl>
            <h3 className="mb-1 mt-4 font-semibold text-terminal-text">Keyboard</h3>
            <dl>
              {KEYS.map(([key, description]) => (
                <div key={key} className="grid grid-cols-[5.5rem_1fr] gap-2 py-1">
                  <dt><kbd className="font-mono text-terminal-text">{key}</kbd></dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
          </section>

          <nav aria-label="Workspaces">
            <h2 className={heading}>WORKSPACES</h2>
            <ul className="divide-y divide-[var(--section-rule-color)]">
              {workspaceShortcuts.map(({ key, name, command, panel }) => (
                <li key={panel}>
                  <button type="button" aria-label={'Open ' + name} aria-keyshortcuts={key} aria-describedby={'help-command-' + panel}
                    aria-current={panel === 'settings' ? 'page' : undefined}
                    onClick={() => executeCommand(command)}
                    className={'grid min-h-8 w-full grid-cols-[2rem_1fr_auto] items-center gap-2 px-1 text-left hover:bg-terminal-hover ' + focus}>
                    <kbd className="font-mono text-terminal-accent">{key}</kbd>
                    <span className="text-terminal-text">{name}</span>
                    <code id={'help-command-' + panel} className="text-[11px] text-terminal-faint">{command}</code>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 leading-relaxed">Settings holds optional keys for OpenAI analysis, FRED economic data, and Finnhub earnings dates.</p>
          </nav>
        </div>

        <div className="mt-5 divide-y divide-[var(--section-rule-color)] border-y border-[var(--section-rule-color)]">
          <details>
            <summary className={disclosure}>Data sources</summary>
            <p className="mb-2">Quotes may be delayed. Coverage and refresh times vary by source.</p>
            <dl className="grid gap-x-6 gap-y-1.5 pb-3 sm:grid-cols-2">
              {SOURCES.map(([source, coverage]) => (
                <div key={source}>
                  <dt className="font-semibold text-terminal-text">{source}</dt>
                  <dd>{coverage}</dd>
                </div>
              ))}
            </dl>
          </details>
          <details>
            <summary className={disclosure}>International tickers</summary>
            <p className="mb-2 leading-relaxed">Include the exchange suffix when searching for a specific listing, such as VWCE.DE, BP.L, or 7203.T.</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 pb-3 sm:grid-cols-4">
              {EXCHANGES.map(([suffix, exchange]) => (
                <div key={suffix} className="flex items-baseline gap-2">
                  <dt><code className="text-terminal-accent">{suffix}</code></dt>
                  <dd>{exchange}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </div>
  );
}
