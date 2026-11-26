import { useState, useRef, useEffect, KeyboardEvent, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, Bug, Moon, Sparkles, Star, Sun } from 'lucide-react';
import { searchSymbols } from '../api/finance';
import { useTerminalStore } from '../store/useTerminalStore';
import { shouldUseSearch } from '../utils/commandParsing';
import { fmt, isMarketOpen } from '../utils/formatters';
import { useAppVersion } from '../utils/appVersion';
import { overviewCardOrder } from '../utils/overviewLayout';
import { useTheme } from '../utils/theme';

interface CommandBarProps {
  onOpenWatchlist?: () => void;
}

export function CommandBar({ onOpenWatchlist }: CommandBarProps) {
  const [input, setInput] = useState('');
  const [histIdx, setHistIdx] = useState(-1);
  const [showSearch, setShowSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    executeCommand,
    commandHistory,
    goBack,
    goHome,
    navHistory,
    setActivePanel,
    debugMode,
    toggleDebugMode,
    activePanel,
    overviewLayout,
    companionOpen,
    toggleCompanionOpen,
  } = useTerminalStore();
  const { mode, toggleTheme } = useTheme();
  const companionInOverview = activePanel === 'overview' && overviewCardOrder(overviewLayout).includes('summary');
  const appVersion = useAppVersion();
  const isElectronDesktop = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');
  const electronDragStyle: CSSProperties | undefined = isElectronDesktop
    ? ({ WebkitAppRegion: 'drag' } as CSSProperties)
    : undefined;
  const electronNoDragStyle: CSSProperties | undefined = isElectronDesktop
    ? ({ WebkitAppRegion: 'no-drag' } as CSSProperties)
    : undefined;

  const [clock, setClock] = useState(fmt.time());
  useEffect(() => {
    const id = setInterval(() => setClock(fmt.time()), 1000);
    return () => clearInterval(id);
  }, []);

  const trimmedInput = input.trim();
  const searchMode = shouldUseSearch(input);
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearchInput(trimmedInput), 200);
    return () => clearTimeout(timer);
  }, [trimmedInput]);

  const { data: matchedResults } = useQuery({
    queryKey: ['search', searchInput],
    queryFn: () => searchSymbols(searchInput),
    enabled: searchMode && searchInput.length >= 2 && searchInput === trimmedInput,
    staleTime: 10000,
  });

  const searchResults = searchInput === trimmedInput ? matchedResults : undefined;

  const openSearchResult = (symbol?: string) => {
    if (!symbol) return;
    setActivePanel('equity', symbol);
    setInput('');
    setHistIdx(-1);
    setShowSearch(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (searchMode && showSearch && searchResults?.length) {
        e.preventDefault();
        openSearchResult(searchResults[0].symbol);
        return;
      }
      executeCommand(input);
      setInput('');
      setHistIdx(-1);
      setShowSearch(false);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(histIdx + 1, commandHistory.length - 1);
      setHistIdx(next);
      setInput(commandHistory[next] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(histIdx - 1, -1);
      setHistIdx(next);
      setInput(next === -1 ? '' : commandHistory[next] ?? '');
    } else if (e.key === 'Escape') {
      setInput('');
      setShowSearch(false);
      inputRef.current?.blur();
    } else if (e.key === 'Tab' && searchMode && searchResults?.length) {
      e.preventDefault();
      openSearchResult(searchResults[0].symbol);
    }
  };

  const open = isMarketOpen();
  const handleDebugToggle = () => {
    toggleDebugMode();
  };

  return (
    <div
      className={`command-bar relative flex flex-wrap items-center gap-2 bg-terminal-panel px-3 py-2 panel-border-b flex-shrink-0 md:h-10 md:flex-nowrap md:gap-0 md:py-0 ${isElectronDesktop ? 'md:pl-24' : ''}`}
      style={electronDragStyle}
    >
      {/* Logo — click to return to Market Overview */}
      <div className="flex items-center gap-2 flex-shrink-0 md:mr-4">
        <button
          onClick={goHome}
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
          title="Market Overview"
          style={electronNoDragStyle}
        >
          <span className="charlie-wordmark">CHARLIE</span>
          {appVersion && (
            <span className="hidden sm:inline text-terminal-faint font-mono text-[10px] tracking-wider">{appVersion}</span>
          )}
        </button>
        <div className="hidden md:block h-4 w-px bg-terminal-border" />
      </div>

      {/* Reserve the Back button's space in the wrapping mobile toolbar. */}
      <button
        onClick={goBack}
        disabled={!navHistory.length}
        aria-hidden={!navHistory.length || undefined}
        className={`flex items-center gap-1 px-2 py-1 text-xs text-terminal-muted hover:text-terminal-accent border border-terminal-border hover:border-terminal-accent/50 rounded transition-colors flex-shrink-0 md:mr-3 ${navHistory.length ? '' : 'invisible md:hidden'}`}
        title="Go back"
        style={electronNoDragStyle}
      >
        ← BACK
      </button>

      {/* Command input */}
      <div className="order-3 w-full relative md:order-none md:flex-1 md:w-auto" style={electronNoDragStyle}>
        <div className="command-field flex items-center bg-terminal-elevated border border-terminal-border rounded px-2 h-7">
          <span className="text-terminal-accent mr-2 text-xs flex-shrink-0">⟩</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              const nextInput = e.target.value;
              setInput(nextInput);
              setShowSearch(shouldUseSearch(nextInput) && nextInput.trim().length >= 2);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowSearch(false), 150)}
            onFocus={() => searchMode && trimmedInput.length >= 2 && setShowSearch(true)}
            placeholder="AAPL or Microsoft  |  NEWS  |  MACRO  |  PORT"
            className="cmd-input flex-1 bg-transparent text-terminal-text text-xs placeholder-terminal-faint min-w-0"
            spellCheck={false}
            autoCapitalize="characters"
            style={electronNoDragStyle ? { ...electronNoDragStyle, fontFamily: 'inherit' } : { fontFamily: 'inherit' }}
          />
          {input && (
            <span className="text-terminal-faint text-xs ml-1 flex-shrink-0">⏎</span>
          )}
        </div>

        {/* Autocomplete dropdown */}
        {showSearch && searchResults && searchResults.length > 0 && (
          <div
            className="absolute top-8 left-0 right-0 bg-terminal-elevated border border-terminal-border rounded shadow-2xl z-50 animate-fade-in"
            style={electronNoDragStyle}
          >
            {searchResults.map((r) => (
              <button
                key={r.symbol}
                onMouseDown={() => {
                  openSearchResult(r.symbol);
                }}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-terminal-hover text-left"
                style={electronNoDragStyle}
              >
                <div className="flex items-center gap-3">
                  <span className="text-terminal-accent font-bold text-xs w-16 truncate">{r.symbol}</span>
                  <span className="text-terminal-muted text-xs truncate">{r.shortname ?? r.longname}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-terminal-faint text-xs">{r.exchDisp}</span>
                  <span className="text-terminal-faint text-xs bg-terminal-panel px-1 rounded">{r.typeDisp}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right side status */}
      <div className="ml-auto flex items-center gap-1.5 flex-shrink-0 md:ml-4 md:gap-4" style={electronNoDragStyle}>
        {onOpenWatchlist && (
          <button
            onClick={onOpenWatchlist}
            className="flex items-center gap-1.5 rounded border border-terminal-border px-2 py-1 text-xs text-terminal-muted transition-colors hover:border-terminal-accent/40 hover:bg-terminal-hover hover:text-terminal-accent md:hidden"
            aria-label="Open watchlist"
            style={electronNoDragStyle}
          >
            <Star size={12} />
          </button>
        )}
        {!companionInOverview && <button
          onClick={toggleCompanionOpen}
          className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-semibold tracking-wide transition-colors md:px-2.5 ${
            companionOpen
              ? 'border-terminal-accent/70 bg-terminal-accent/20 text-terminal-accent'
              : 'border-terminal-accent/50 bg-terminal-accent/10 text-terminal-accent hover:border-terminal-accent/70 hover:bg-terminal-accent/15'
          }`}
          title={companionOpen ? 'Close AI companion' : 'Open AI companion'}
          aria-label={companionOpen ? 'Close AI companion' : 'Open AI companion'}
          style={electronNoDragStyle}
        >
          <Sparkles size={12} className="hidden md:block" />
          <Bot size={12} />
          <span className="hidden lg:inline">AI COMPANION</span>
        </button>}
        <button
          onClick={handleDebugToggle}
          className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors ${
            debugMode
              ? 'border-terminal-accent/50 bg-terminal-accent/12 text-terminal-accent'
              : 'border-terminal-border text-terminal-muted hover:border-terminal-accent/40 hover:bg-terminal-hover hover:text-terminal-accent'
          }`}
          title={debugMode ? 'Disable debug mode' : 'Enable debug mode'}
          aria-label={debugMode ? 'Disable debug mode' : 'Enable debug mode'}
          style={electronNoDragStyle}
        >
          <Bug size={12} />
          <span className="hidden lg:inline">{debugMode ? 'DEBUG ON' : 'DEBUG'}</span>
        </button>
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 rounded border border-terminal-border px-2 py-1 text-xs text-terminal-muted transition-colors hover:border-terminal-accent/40 hover:bg-terminal-hover hover:text-terminal-accent"
          title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
          aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
          style={electronNoDragStyle}
        >
          {mode === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
          <span className="hidden w-[5ch] text-center lg:inline-block">{mode === 'dark' ? 'DARK' : 'LIGHT'}</span>
        </button>
        <div className="hidden sm:flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${open ? 'bg-terminal-positive' : 'bg-terminal-faint'}`} />
          <span className={`text-xs ${open ? 'text-terminal-positive' : 'text-terminal-muted'}`}>
            {open ? 'REGULAR HOURS' : 'OUTSIDE HOURS'}
          </span>
        </div>
        <span className="text-terminal-muted text-xs hidden lg:block">US weekday schedule</span>
        <span className="hidden sm:block text-terminal-text font-mono text-xs tabular-nums">{clock}</span>
      </div>
    </div>
  );
}
