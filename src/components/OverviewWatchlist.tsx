import { useEffect, useRef, useState, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, RefreshCw, X } from 'lucide-react';
import { fetchQuotes, searchSymbols } from '../api/finance';
import { useTerminalStore } from '../store/useTerminalStore';
import { changeColor, fmt } from '../utils/formatters';
import { DailyCloseSparkline } from './DailyCloseSparkline';
import { OverviewSectionHeader } from './OverviewSectionHeader';

export function OverviewWatchlist({ sectionRef }: { sectionRef?: Ref<HTMLElement> }) {
  const { watchlist, addToWatchlist, removeFromWatchlist, setActivePanel, activeSymbol } = useTerminalStore();
  const [adding, setAdding] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);

  const { data: quotes = [], isFetching, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['watchlist', watchlist],
    queryFn: () => fetchQuotes(watchlist),
    refetchInterval: 30000,
    staleTime: 15000,
    enabled: watchlist.length > 0,
  });
  const quoteMap = new Map(quotes.map(quote => [quote.symbol.toUpperCase(), quote]));

  const input = newSymbol.trim();
  useEffect(() => {
    const timer = setTimeout(() => setSearchInput(input), 200);
    return () => clearTimeout(timer);
  }, [input]);

  const searchReady = adding && input.length >= 2 && searchInput === input;
  const { data: matches = [] } = useQuery({
    queryKey: ['search', searchInput],
    queryFn: () => searchSymbols(searchInput),
    enabled: searchReady,
    staleTime: 10000,
  });

  function closeForm() {
    setAdding(false);
    setNewSymbol('');
    addButton.current?.focus();
  }

  function addSymbol(symbol: string) {
    if (!symbol.trim()) return;
    addToWatchlist(symbol.trim().toUpperCase());
    closeForm();
  }

  return (
    <section id="overview-watchlist" aria-label="Watchlist" ref={sectionRef} tabIndex={-1}
      className="min-w-0 scroll-mt-3 [container-type:inline-size] focus-visible:outline focus-visible:outline-1 focus-visible:outline-terminal-accent">
      <OverviewSectionHeader title="WATCHLIST">
        <div className="flex items-center gap-2">
          {dataUpdatedAt > 0 && (
            <time dateTime={new Date(dataUpdatedAt).toISOString()} className="text-[11px] text-terminal-faint">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </time>
          )}
          <button type="button" onClick={() => void refetch()} disabled={!watchlist.length || isFetching}
            aria-label="Refresh watchlist quotes" title="Refresh watchlist quotes"
            className="rounded border border-terminal-border p-1.5 text-terminal-faint hover:text-terminal-accent disabled:opacity-50">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <button type="button" ref={addButton} onClick={() => adding ? closeForm() : setAdding(true)}
            aria-expanded={adding} aria-label="Add symbol"
            className="flex items-center gap-1 rounded border border-terminal-border px-2.5 py-1 text-[11px] text-terminal-muted hover:border-terminal-accent/40 hover:bg-terminal-hover hover:text-terminal-accent">
            <Plus size={12} />ADD SYMBOL
          </button>
        </div>
      </OverviewSectionHeader>

      {adding && (
        <form onSubmit={event => { event.preventDefault(); addSymbol(input); }}
          onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeForm(); } }}
          className="mb-2 max-w-md">
          <div className="flex items-center gap-2">
            <input autoFocus aria-label="Symbol or company name" placeholder="Symbol or company name"
              value={newSymbol} onChange={event => setNewSymbol(event.target.value)} autoComplete="off" spellCheck={false}
              className="min-w-0 flex-1 rounded border border-terminal-border bg-terminal-elevated px-2 py-1.5 text-xs text-terminal-text placeholder-terminal-faint focus:border-terminal-accent" />
            <button type="submit" disabled={!input}
              className="rounded border border-terminal-border px-3 py-1.5 text-xs text-terminal-accent hover:bg-terminal-hover disabled:opacity-50">Add</button>
            <button type="button" onClick={closeForm} aria-label="Cancel adding symbol" title="Cancel"
              className="rounded p-2 text-terminal-faint hover:bg-terminal-hover hover:text-terminal-text"><X size={14} /></button>
          </div>
          {searchReady && matches.length > 0 && (
            <ul aria-label="Matching symbols" className="mt-1 max-h-48 overflow-y-auto rounded border border-terminal-border bg-terminal-panel">
              {matches.map(result => (
                <li key={result.symbol}>
                  <button type="button" onClick={() => addSymbol(result.symbol)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-terminal-hover focus-visible:bg-terminal-hover">
                    <span className="font-bold text-terminal-accent">{result.symbol}</span>
                    <span className="min-w-0 flex-1 truncate text-terminal-muted">{result.shortname ?? result.longname}</span>
                    <span className="text-terminal-faint">{result.typeDisp}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}

      {isError && <p role="status" className="mb-2 text-xs text-terminal-faint">Watchlist quotes could not be refreshed.</p>}
      {watchlist.length === 0 ? (
        <p className="py-2 text-xs text-terminal-faint">Your watchlist is empty.</p>
      ) : (
        <div className="watchlist-table-scroll">
          <table className="watchlist-quotes text-right text-xs" aria-label="Watchlist quotes and 30-day history">
            <thead><tr>
              <th scope="col" className="text-left">Symbol</th>
              <th scope="col" className="watchlist-price-column">Last / 1D</th>
              <th scope="col" className="watchlist-history-column" title="Reported daily closes over the last 30 complete calendar days">30D</th>
              <th scope="col" className="watchlist-action-column"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>{watchlist.map((symbol, index) => {
              const quote = quoteMap.get(symbol);
              const name = quote?.shortName || quote?.longName;
              return (
                <tr key={symbol} className="cursor-pointer" onClick={() => setActivePanel('equity', symbol)}>
                  <th scope="row" className="text-left font-normal">
                    <button type="button" aria-label={`Open ${symbol} in Equity`} aria-describedby={`watchlist-quote-${index}`}
                      title={name || symbol} className="block w-full text-left hover:text-terminal-accent">
                      <span className={`block truncate font-bold ${symbol === activeSymbol ? 'text-terminal-accent' : ''}`}>{symbol}</span>
                      {name && name !== symbol && <span className="block truncate text-[11px] text-terminal-faint">{name}</span>}
                    </button>
                  </th>
                  <td id={`watchlist-quote-${index}`}>
                    <span className="block">{fmt.price(quote?.regularMarketPrice)} <span className="text-[10px] text-terminal-faint">{quote?.currency}</span></span>
                    <span className={changeColor(quote?.regularMarketChangePercent)}>{fmt.pct(quote?.regularMarketChangePercent)}</span>
                  </td>
                  <td><DailyCloseSparkline symbol={symbol} name={name || symbol} timeZone={quote?.exchangeTimezoneName} /></td>
                  <td>
                    <button type="button" onClick={event => { event.stopPropagation(); removeFromWatchlist(symbol); }}
                      aria-label={`Remove ${symbol} from watchlist`} title={`Remove ${symbol} from watchlist`}
                      className="rounded p-1.5 text-terminal-faint hover:text-terminal-negative">
                      <X size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
