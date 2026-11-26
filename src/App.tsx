import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRef } from 'react';
import { CommandBar } from './components/CommandBar';
import { MarketTicker } from './components/MarketTicker';
import { NewsTicker } from './components/NewsTicker';
import { NewsPanel } from './components/NewsPanel';
import { StatusBar } from './components/StatusBar';
import { MainPanel } from './components/MainPanel';
import { MobileNavigation } from './components/MobileNavigation';
import { PanelCompanion } from './components/PanelCompanion';
import { useTerminalStore } from './store/useTerminalStore';

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
  const activePanel = useTerminalStore(state => state.activePanel);
  const openWatchlist = useTerminalStore(state => state.openWatchlist);
  const mainPanelRef = useRef<HTMLDivElement | null>(null);
  const sideNewsRef = useRef<HTMLDivElement | null>(null);

  // News panel is shown on the right side unless we're already in the news panel
  const showSideNews = activePanel !== 'news' && activePanel !== 'geopolitics' && activePanel !== 'predictions';

  return (
    <QueryClientProvider client={queryClient}>
      <div className="relative flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-terminal-bg text-terminal-text">
        <PanelCompanion mainPanelRef={mainPanelRef} sideNewsRef={sideNewsRef} sideNewsVisible={showSideNews}>
          <CommandBar onOpenWatchlist={openWatchlist} />
          <MarketTicker />
          <NewsTicker />

          <div className="relative flex min-h-0 flex-1 pb-14 md:pb-0">
            <div ref={mainPanelRef} className="flex-1 min-w-0 overflow-hidden">
              <MainPanel />
            </div>
            {showSideNews && (
              <div ref={sideNewsRef} className="w-64 xl:w-72 flex-shrink-0 hidden lg:flex flex-col">
                <NewsPanel className="h-full w-full flex-col" />
              </div>
            )}
          </div>

          <div className="hidden md:block">
            <StatusBar />
          </div>
          <MobileNavigation onOpenWatchlist={openWatchlist} />
        </PanelCompanion>
      </div>
    </QueryClientProvider>
  );
}
