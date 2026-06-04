import { useQuery } from '@tanstack/react-query';
import { fetchQuotes } from '../api/finance';
import { useTerminalStore } from '../store/useTerminalStore';
import { fmt, changeColor } from '../utils/formatters';

const TICKER_SYMBOLS = [
  '^GSPC', '^DJI', '^IXIC', '^RUT', '^VIX',
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META',
  'EURUSD=X', 'USDJPY=X', 'GBPUSD=X',
  'GC=F', 'CL=F', 'BTC-USD', 'ETH-USD',
];

const LABELS: Record<string, string> = {
  '^GSPC': 'SPX', '^DJI': 'DJIA', '^IXIC': 'NDQ', '^RUT': 'RUT', '^VIX': 'VIX',
  'EURUSD=X': 'EUR/USD', 'USDJPY=X': 'USD/JPY', 'GBPUSD=X': 'GBP/USD',
  'GC=F': 'GOLD', 'CL=F': 'OIL', 'BTC-USD': 'BTC', 'ETH-USD': 'ETH',
};

export function MarketTicker() {
  const { setActivePanel } = useTerminalStore();
  const { data: quotes = [] } = useQuery({
    queryKey: ['ticker', TICKER_SYMBOLS],
    queryFn: () => fetchQuotes(TICKER_SYMBOLS),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  if (!quotes.length) {
    return (
      <div className="h-7 bg-terminal-panel panel-border-b flex items-center px-3 flex-shrink-0">
        <span className="text-terminal-faint text-xs animate-pulse">LOADING MARKET DATA...</span>
      </div>
    );
  }

  const items = quotes.map((q) => {
    const label = LABELS[q.symbol] ?? q.symbol;
    const price = fmt.price(q.regularMarketPrice);
    const pct = fmt.pct(q.regularMarketChangePercent);
    const color = changeColor(q.regularMarketChangePercent);
    return { label, price, pct, color, symbol: q.symbol };
  });

  return (
    <div className="h-7 bg-terminal-panel panel-border-b flex items-center flex-shrink-0 overflow-hidden">
      <div className="ticker-wrap flex-1">
        <div className="ticker-track">
          {[0, 1].map((copyIndex) => (
            <div key={copyIndex} className="ticker-group">
              {items.map((item) => (
                <button
                  key={`${copyIndex}-${item.symbol}`}
                  onClick={() => setActivePanel('equity', item.symbol)}
                  className="ticker-item inline-flex items-center gap-2 px-4 border-r border-terminal-border/40 text-xs"
                  title={`Open ${item.symbol}`}
                >
                  <span className="text-terminal-muted">{item.label}</span>
                  <span className="text-terminal-text tabular-nums">{item.price}</span>
                  <span className={`tabular-nums ${item.color}`}>{item.pct}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
