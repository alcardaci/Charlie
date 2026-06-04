import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, X, RefreshCw } from 'lucide-react';
import { fetchQuotes, searchSymbols } from '../api/finance';
import { useTerminalStore } from '../store/useTerminalStore';
import { fmt, changeColor } from '../utils/formatters';

interface WatchlistSidebarProps {
  className?: string;
  mobile?: boolean;
  onClose?: () => void;
}

export function WatchlistSidebar({ className = '', mobile = false, onClose }: WatchlistSidebarProps) {
  const { watchlist, addToWatchlist, removeFromWatchlist, setActivePanel, activeSymbol } =
    useTerminalStore();
  const [adding, setAdding] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: quotes = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['watchlist', watchlist],
    queryFn: () => fetchQuotes(watchlist),
    refetchInterval: 30000,
    staleTime: 15000,
    enabled: watchlist.length > 0,
  });

  // Live search suggestions while typing
  const { data: suggestions = [] } = useQuery({
    queryKey: ['wl-search', newSymbol],
    queryFn: () => searchSymbols(newSymbol),
    enabled: newSymbol.length >= 1,
    staleTime: 10000,
  });

  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  const handleAdd = (sym?: string) => {
    const s = (sym ?? newSymbol).trim().toUpperCase();
    if (s) {
      addToWatchlist(s);
      setNewSymbol('');
      setAdding(false);
      setShowSuggestions(false);
    }
  };

  const handleClose = () => {
    setAdding(false);
    setNewSymbol('');
    setShowSuggestions(false);
  };

  return (
    <div className={`${mobile ? 'w-full' : 'w-44 flex-shrink-0 panel-border-r'} flex flex-col bg-terminal-panel ${className}`}>
      {/* Header */}
      <div className={`flex items-center justify-between panel-border-b ${mobile ? 'px-3 py-2' : 'px-2 py-1.5'}`}>
        <span className="text-terminal-accent text-xs font-bold tracking-wider">WATCHLIST</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refetch()}
            className="text-terminal-faint hover:text-terminal-muted p-0.5 rounded"
            title="Refresh"
          >
            <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => { setAdding(!adding); if (adding) handleClose(); }}
            className="text-terminal-faint hover:text-terminal-accent p-0.5 rounded"
            title="Add symbol"
          >
            <Plus size={11} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-terminal-faint hover:text-terminal-accent p-0.5 rounded"
              title="Close watchlist"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Add input + autocomplete */}
      {adding && (
        <div className={`${mobile ? 'px-3 py-2' : 'px-2 py-1.5'} panel-border-b relative`}>
          <input
            ref={inputRef}
            autoFocus
            value={newSymbol}
            onChange={(e) => {
              setNewSymbol(e.target.value.toUpperCase());
              setShowSuggestions(e.target.value.length >= 1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') handleClose();
            }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="SYMBOL or name"
            className="w-full bg-terminal-elevated border border-terminal-border rounded px-2 py-1 text-xs text-terminal-text placeholder-terminal-faint focus:outline-none focus:border-terminal-accent/50"
          />
          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-2 right-2 top-full z-50 bg-terminal-elevated border border-terminal-border rounded shadow-xl mt-0.5 max-h-48 overflow-y-auto">
              {suggestions.map((r) => (
                <button
                  key={r.symbol}
                  onMouseDown={() => handleAdd(r.symbol)}
                  className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-terminal-hover text-left border-b border-terminal-border/40 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="text-terminal-accent font-bold text-xs">{r.symbol}</div>
                    <div className="text-terminal-faint text-xs truncate">{r.shortname ?? r.longname}</div>
                  </div>
                  <span className="text-terminal-faint text-xs flex-shrink-0 ml-1">{r.typeDisp}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Column headers */}
      <div className={`flex items-center justify-between panel-border-b ${mobile ? 'px-3 py-1.5' : 'px-2 py-1'}`}>
        <span className="text-terminal-faint text-xs">SYM</span>
        <div className="flex items-center gap-3">
          <span className="text-terminal-faint text-xs w-14 text-right">PRICE</span>
          <span className="text-terminal-faint text-xs w-10 text-right">CHG%</span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {watchlist.map((symbol) => {
          const q = quoteMap.get(symbol);
          const isActive = symbol === activeSymbol;
          const chgColor = changeColor(q?.regularMarketChangePercent);

          return (
            <div
              key={symbol}
              onClick={() => setActivePanel('equity', symbol)}
              className={`group flex items-center justify-between cursor-pointer border-l-2 transition-colors ${
                isActive
                  ? 'border-l-terminal-accent bg-terminal-hover'
                  : 'border-l-transparent hover:bg-terminal-hover hover:border-l-terminal-border'
              } ${mobile ? 'px-3 py-2.5' : 'px-2 py-1.5'}`}
            >
              <div className="flex items-center gap-1 min-w-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromWatchlist(symbol);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-terminal-faint hover:text-terminal-negative flex-shrink-0"
                >
                  <X size={9} />
                </button>
                <span className={`text-xs font-bold truncate ${isActive ? 'text-terminal-accent' : 'text-terminal-text'}`}>
                  {symbol}
                </span>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                {q ? (
                  <>
                    <span className="text-terminal-text text-xs tabular-nums w-14 text-right">
                      {fmt.price(q.regularMarketPrice)}
                    </span>
                    <span className={`text-xs tabular-nums w-10 text-right ${chgColor}`}>
                      {fmt.pct(q.regularMarketChangePercent)}
                    </span>
                  </>
                ) : (
                  <span className="text-terminal-faint text-xs">...</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {dataUpdatedAt > 0 && (
        <div className="px-2 py-1 panel-border-t">
          {mobile ? (
            <span className="text-terminal-faint text-xs px-1">
              UPD {new Date(dataUpdatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </span>
          ) : (
          <span className="text-terminal-faint text-xs">
            UPD {new Date(dataUpdatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </span>
          )}
        </div>
      )}
    </div>
  );
}
