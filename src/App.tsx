import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { CommandBar } from './components/CommandBar';
import { MarketTicker } from './components/MarketTicker';
import { NewsTicker } from './components/NewsTicker';
import { WatchlistSidebar } from './components/WatchlistSidebar';
import { NewsPanel } from './components/NewsPanel';
import { StatusBar } from './components/StatusBar';
import { MainPanel } from './components/MainPanel';
import { MobileNavigation } from './components/MobileNavigation';
import { PanelCompanion } from './components/PanelCompanion';
import { useTerminalStore } from './store/useTerminalStore';

const WATCHLIST_DESKTOP_WIDTH_REM = 11;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 1000,
      refetchOnWindowFocus: false,
      staleTime: 30000,
      gcTime: 600000,
    },
  },
});

export default function App() {
  const { activePanel, watchlistSidebarVisible, toggleWatchlistSidebar } = useTerminalStore();
  const [mobileWatchlistOpen, setMobileWatchlistOpen] = useState(false);
  const mainPanelRef = useRef<HTMLDivElement | null>(null);
  const sideNewsRef = useRef<HTMLDivElement | null>(null);

  // News panel is shown on the right side unless we're already in the news panel
  const showSideNews = activePanel !== 'news' && activePanel !== 'geopolitics' && activePanel !== 'predictions';

  useEffect(() => {
    setMobileWatchlistOpen(false);
  }, [activePanel]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="relative flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-terminal-bg text-terminal-text">
        {mobileWatchlistOpen && (
          <>
            <button
              className="fixed inset-0 z-40 bg-terminal-bg/70 backdrop-blur-[1px] md:hidden"
              onClick={() => setMobileWatchlistOpen(false)}
              aria-label="Close watchlist"
            />
            <div className="fixed inset-y-0 left-0 z-50 w-[min(88vw,22rem)] border-r border-terminal-border bg-terminal-panel shadow-2xl md:hidden">
              <WatchlistSidebar mobile className="h-full" onClose={() => setMobileWatchlistOpen(false)} />
            </div>
          </>
        )}

        {/* Top bar */}
        <CommandBar onOpenWatchlist={() => setMobileWatchlistOpen(true)} />

        <MarketTicker />
        <NewsTicker />

        {/* Main content area */}
        <div className="relative flex min-h-0 flex-1 pb-14 md:pb-0">
          {/* Watchlist sidebar */}
          {watchlistSidebarVisible && (
            <WatchlistSidebar className="hidden md:flex" />
          )}

          {/* Desktop watchlist edge toggle */}
          <button
            onClick={toggleWatchlistSidebar}
            className="hidden md:flex absolute z-30 -translate-y-1/2 top-1/2 h-8 w-5 items-center justify-center rounded-r border border-terminal-border bg-terminal-panel text-terminal-muted transition-colors hover:border-terminal-accent/40 hover:text-terminal-accent"
            style={{ left: watchlistSidebarVisible ? `${WATCHLIST_DESKTOP_WIDTH_REM}rem` : '0.25rem' }}
            title={watchlistSidebarVisible ? 'Hide watchlist' : 'Show watchlist'}
            aria-label={watchlistSidebarVisible ? 'Hide watchlist' : 'Show watchlist'}
          >
            {watchlistSidebarVisible ? <PanelLeftClose size={11} /> : <PanelLeftOpen size={11} />}
          </button>

          {/* Main panel (grows) */}
          <div ref={mainPanelRef} className="flex-1 min-w-0 overflow-hidden">
            <MainPanel />
          </div>

          {/* News side panel */}
          {showSideNews && (
            <div ref={sideNewsRef} className="w-64 xl:w-72 flex-shrink-0 hidden lg:flex flex-col">
              <NewsPanel className="h-full w-full flex-col" />
            </div>
        )}
        </div>

        {/* Status bar */}
        <div className="hidden md:block">
          <StatusBar />
        </div>

        <MobileNavigation onOpenWatchlist={() => setMobileWatchlistOpen(true)} />
        <PanelCompanion
          mainPanelRef={mainPanelRef}
          sideNewsRef={sideNewsRef}
          sideNewsVisible={showSideNews}
        />
      </div>
    </QueryClientProvider>
  );
}
