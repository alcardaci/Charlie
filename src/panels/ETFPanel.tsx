import { useQuery } from '@tanstack/react-query';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { fetchQuotes } from '../api/finance';
import { useTerminalStore } from '../store/useTerminalStore';
import { fmt, changeColor } from '../utils/formatters';

const ETF_GROUPS = [
  {
    label: 'BROAD MARKET',
    etfs: [
      { symbol: 'SPY',  name: 'S&P 500 ETF' },
      { symbol: 'QQQ',  name: 'Nasdaq 100 ETF' },
      { symbol: 'IWM',  name: 'Russell 2000 ETF' },
      { symbol: 'DIA',  name: 'Dow Jones ETF' },
      { symbol: 'VTI',  name: 'Total US Market' },
    ],
  },
  {
    label: 'SECTOR',
    etfs: [
      { symbol: 'XLK',  name: 'Technology' },
      { symbol: 'XLF',  name: 'Financials' },
      { symbol: 'XLE',  name: 'Energy' },
      { symbol: 'XLV',  name: 'Health Care' },
      { symbol: 'XLC',  name: 'Communication' },
      { symbol: 'XLI',  name: 'Industrials' },
      { symbol: 'XLY',  name: 'Consumer Disc.' },
      { symbol: 'XLP',  name: 'Consumer Staples' },
      { symbol: 'XLRE', name: 'Real Estate' },
      { symbol: 'XLB',  name: 'Materials' },
      { symbol: 'XLU',  name: 'Utilities' },
    ],
  },
  {
    label: 'FIXED INCOME',
    etfs: [
      { symbol: 'TLT',  name: '20+ Yr Treasury' },
      { symbol: 'IEF',  name: '7-10 Yr Treasury' },
      { symbol: 'SHY',  name: '1-3 Yr Treasury' },
      { symbol: 'HYG',  name: 'High Yield Corp' },
      { symbol: 'LQD',  name: 'Inv. Grade Corp' },
      { symbol: 'BND',  name: 'Total Bond Market' },
    ],
  },
  {
    label: 'COMMODITIES',
    etfs: [
      { symbol: 'GLD',  name: 'Gold' },
      { symbol: 'SLV',  name: 'Silver' },
      { symbol: 'USO',  name: 'Crude Oil' },
      { symbol: 'UNG',  name: 'Natural Gas' },
      { symbol: 'DJP',  name: 'Commodity ETN' },
    ],
  },
  {
    label: 'INTERNATIONAL',
    etfs: [
      { symbol: 'EFA',  name: 'MSCI EAFE' },
      { symbol: 'EEM',  name: 'Emerging Markets' },
      { symbol: 'FXI',  name: 'China Large Cap' },
      { symbol: 'EWJ',  name: 'Japan' },
      { symbol: 'EWG',  name: 'Germany' },
    ],
  },
];

const ALL_SYMBOLS = ETF_GROUPS.flatMap((g) => g.etfs.map((e) => e.symbol));

export function ETFPanel() {
  const { setActivePanel } = useTerminalStore();

  const { data: quotes = [], isLoading, isError, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['etf-quotes', ALL_SYMBOLS.join(',')],
    queryFn: async () => {
      const result = await fetchQuotes(ALL_SYMBOLS);
      if (!result.length) throw new Error('No ETF quotes available');
      return result;
    },
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WorkspaceHeader title="ETF MONITOR">
        <button type="button" onClick={() => void refetch()} disabled={isFetching} className="text-terminal-muted text-xs hover:text-terminal-text disabled:opacity-50">{isFetching ? 'Refreshing…' : 'Refresh'}</button>
      </WorkspaceHeader>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div className="text-xs text-terminal-faint">{quotes.length}/{ALL_SYMBOLS.length} quotes available · prices in USD · regular-session change versus previous close. Public quotes may be delayed. {dataUpdatedAt ? `Checked ${new Date(dataUpdatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.` : ''}</div>
        {isError && <div role="status" className="instrument-section rounded border border-terminal-border p-3 text-xs text-terminal-muted">{quotes.length ? 'Refresh failed; last received quotes remain visible.' : 'ETF quotes are unavailable right now. Use Refresh to try again.'}</div>}
        {ETF_GROUPS.map((group) => (
          <div key={group.label}>
            {/* Group header */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-terminal-accent text-xs font-bold tracking-wider">{group.label}</span>
              <div className="section-rule-line flex-1 h-px bg-terminal-border/50" />
            </div>

            {/* ETF rows */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-1">
              {group.etfs.map(({ symbol, name }) => {
                const q = quoteMap.get(symbol);
                const chgColor = changeColor(q?.regularMarketChangePercent);
                return (
                  <button
                    key={symbol}
                    onClick={() => setActivePanel('equity', symbol)}
                    className="instrument-card flex items-center justify-between px-3 py-2 bg-terminal-elevated border border-terminal-border rounded hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-terminal-accent font-bold text-xs">{symbol}</span>
                        <span className="text-terminal-faint text-xs truncate hidden sm:block">{name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {q ? (
                        <>
                          <span className="text-terminal-text tabular-nums text-xs font-bold">
                            {fmt.price(q.regularMarketPrice)}
                          </span>
                          <span className={`tabular-nums text-xs ${chgColor} w-16 text-right`}>
                            {fmt.pct(q.regularMarketChangePercent)}
                          </span>
                        </>
                      ) : (
                        <span className="text-terminal-faint text-xs">{isLoading ? 'Loading…' : 'Unavailable'}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
