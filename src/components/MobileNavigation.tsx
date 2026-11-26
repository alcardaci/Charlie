import { useState } from 'react';
import { BarChart2, Briefcase, Grip, Landmark, Home, Newspaper, Settings2, Wallet, X } from 'lucide-react';
import { workspaceShortcuts } from '../data/workspaceShortcuts';
import { useTerminalStore } from '../store/useTerminalStore';
import type { PanelType } from '../types';

type MobileNavigationProps = {
  onOpenWatchlist: () => void;
};

const primaryWorkspaces = workspaceShortcuts.slice(0, 4);
const moreWorkspaces = workspaceShortcuts.slice(4);
const icons: Partial<Record<PanelType, typeof BarChart2>> = {
  overview: Home, news: Newspaper, portfolio: Briefcase, congress: Landmark, settings: Settings2,
};

export function MobileNavigation({ onOpenWatchlist }: MobileNavigationProps) {
  const { activePanel, setActivePanel } = useTerminalStore();
  const [showMore, setShowMore] = useState(false);
  const activeWorkspace = activePanel === 'geopolitics' ? 'news'
    : activePanel === 'chart' || activePanel === 'multiAsset' ? 'equity'
    : activePanel === 'yield' ? 'macro' : activePanel;
  const primaryItems = primaryWorkspaces.map(({ panel, mobileLabel }) => ({
    key: panel, label: mobileLabel, icon: icons[panel] ?? BarChart2,
    active: activeWorkspace === panel, onClick: () => setActivePanel(panel),
  }));
  const moreButton = { key: 'more', label: 'More', icon: Grip, active: showMore, onClick: () => setShowMore(true) };

  return (
    <>
      <nav aria-label="Mobile workspaces" className="flex items-center justify-between gap-1 border-t border-terminal-border bg-terminal-panel px-2 py-1.5 md:hidden">
        {[...primaryItems, moreButton].map((item) => {
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
      </nav>

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
              <h2 className="workspace-title">WORKSPACES</h2>
              <button
                onClick={() => setShowMore(false)}
                className="rounded border border-terminal-border p-2 text-terminal-faint hover:border-terminal-accent/40 hover:text-terminal-accent"
                aria-label="Close menu"
              >
                <X size={14} />
              </button>
            </div>

            <nav aria-label="More workspaces" className="grid grid-cols-2 gap-2">
              {moreWorkspaces.map((item) => {
                const Icon = icons[item.panel] ?? BarChart2;
                const isActive = activeWorkspace === item.panel;

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
                    <span className="font-medium">{item.mobileLabel}</span>
                  </button>
                );
              })}
              <button
                onClick={() => { setShowMore(false); onOpenWatchlist(); }}
                className="flex items-center gap-2 rounded border border-terminal-border bg-terminal-elevated px-3 py-3 text-left text-xs text-terminal-text hover:border-terminal-accent/30 hover:bg-terminal-hover"
              >
                <Wallet size={14} className="text-terminal-muted" />
                <span className="font-medium">Watch</span>
              </button>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
