import { useMemo, useState } from 'react';
import { BarChart2, Briefcase, Globe2, Grip, Home, Newspaper, Settings2, Wallet, X } from 'lucide-react';
import { useTerminalStore } from '../store/useTerminalStore';
import type { PanelType } from '../types';

type MobileNavigationProps = {
  onOpenWatchlist: () => void;
};

const MORE_PANELS: Array<{ panel: PanelType; label: string; icon: typeof Globe2 }> = [
  { panel: 'opportunities', label: 'Opportunities', icon: Briefcase },
  { panel: 'predictions', label: 'Predictions', icon: BarChart2 },
  { panel: 'macro', label: 'Macro+Yield', icon: BarChart2 },
  { panel: 'heatmap', label: 'Heatmap', icon: BarChart2 },
  { panel: 'forex', label: 'Forex', icon: BarChart2 },
  { panel: 'crypto', label: 'Crypto', icon: BarChart2 },
  { panel: 'etf', label: 'ETF', icon: BarChart2 },
  { panel: 'settings', label: 'Settings', icon: Settings2 },
  { panel: 'help', label: 'Help', icon: Settings2 },
];

export function MobileNavigation({ onOpenWatchlist }: MobileNavigationProps) {
  const { activePanel, setActivePanel } = useTerminalStore();
  const [showMore, setShowMore] = useState(false);
  const morePanels = useMemo(() => MORE_PANELS, []);

  const primaryItems = useMemo(
    () => [
      { key: 'overview', label: 'Home', icon: Home, active: activePanel === 'overview', onClick: () => setActivePanel('overview') },
      { key: 'watchlist', label: 'Watch', icon: Wallet, active: false, onClick: onOpenWatchlist },
      { key: 'news', label: 'News+Geo', icon: Newspaper, active: activePanel === 'news' || activePanel === 'geopolitics', onClick: () => setActivePanel('news') },
      { key: 'portfolio', label: 'Port', icon: Briefcase, active: activePanel === 'portfolio', onClick: () => setActivePanel('portfolio') },
      { key: 'more', label: 'More', icon: Grip, active: false, onClick: () => setShowMore(true) },
    ],
    [activePanel, onOpenWatchlist, setActivePanel]
  );

  return (
    <>
      <div className="flex items-center justify-between gap-1 border-t border-terminal-border bg-terminal-panel px-2 py-1.5 md:hidden">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={item.onClick}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded px-1 py-1.5 text-[10px] transition-colors ${
                item.active
                  ? 'bg-terminal-accent/12 text-terminal-accent'
                  : 'text-terminal-muted hover:bg-terminal-hover hover:text-terminal-text'
              }`}
            >
              <Icon size={14} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {showMore && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/55 md:hidden">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close menu"
            onClick={() => setShowMore(false)}
          />
          <div className="relative z-10 w-full rounded-t-2xl border border-terminal-border bg-terminal-panel p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-terminal-accent text-xs font-bold tracking-[0.18em]">WORKSPACES</div>
                <div className="mt-1 text-xs text-terminal-faint">Jump to any monitor from mobile.</div>
              </div>
              <button
                onClick={() => setShowMore(false)}
                className="rounded border border-terminal-border p-2 text-terminal-faint hover:border-terminal-accent/40 hover:text-terminal-accent"
                aria-label="Close menu"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {morePanels.map((item) => {
                const Icon = item.icon;
                const isActive = activePanel === item.panel;

                return (
                  <button
                    key={item.panel}
                    onClick={() => {
                      setActivePanel(item.panel);
                      setShowMore(false);
                    }}
                    className={`flex items-center gap-2 rounded border px-3 py-3 text-left text-xs transition-colors ${
                      isActive
                        ? 'border-terminal-accent/40 bg-terminal-accent/10 text-terminal-accent'
                        : 'border-terminal-border bg-terminal-elevated text-terminal-text hover:border-terminal-accent/30 hover:bg-terminal-hover'
                    }`}
                  >
                    <Icon size={14} className={isActive ? 'text-terminal-accent' : 'text-terminal-muted'} />
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
