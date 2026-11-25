import { useEffect } from 'react';
import { workspaceShortcuts } from '../data/workspaceShortcuts';
import { useTerminalStore } from '../store/useTerminalStore';
import { isMarketOpen } from '../utils/formatters';

export function StatusBar() {
  const { executeCommand, activePanel, activeSymbol, navHistory, commandHistory, debugMode } = useTerminalStore();
  const open = isMarketOpen();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const shortcut = workspaceShortcuts.find(({ key }) => key === event.key);
      if (!shortcut) return;

      event.preventDefault();
      executeCommand(shortcut.command);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [executeCommand]);

  return (
    <div className="flex items-center panel-border-t bg-terminal-panel h-6 flex-shrink-0 text-xs">
      {/* Function keys */}
      <nav aria-label="Workspace shortcuts" className="flex items-center flex-1 overflow-x-auto">
        {workspaceShortcuts.map(({ key, label, command }) => (
          <button
            key={key}
            onClick={() => executeCommand(command)}
            className="flex items-center gap-0 px-2 h-full hover:bg-terminal-hover transition-colors border-r border-terminal-border/40 flex-shrink-0"
          >
            <span className="text-terminal-on-accent bg-terminal-accent px-1 rounded-sm text-xs font-bold mr-1">{key}</span>
            <span className="text-terminal-muted">{label}</span>
          </button>
        ))}
      </nav>

      {/* Right info */}
      <div className="flex items-center gap-3 px-3 flex-shrink-0 border-l border-terminal-border">
        <span className="text-terminal-faint">USD</span>
        <div className="flex items-center gap-1">
          <div className={`w-1.5 h-1.5 rounded-full ${open ? 'bg-terminal-positive animate-pulse' : 'bg-terminal-faint'}`} />
          <span title="Weekday New York schedule; holidays and early closes are not included." className={open ? 'text-terminal-positive' : 'text-terminal-faint'}>
            {open ? 'US · SCHEDULED HOURS' : 'US · OUTSIDE HOURS'}
          </span>
        </div>
        <span className="text-terminal-faint">
          {activePanel.toUpperCase()}
        </span>
        {debugMode && (
          <>
            <span className="rounded border border-terminal-accent/40 px-1 text-[10px] text-terminal-accent">DEBUG</span>
            <span className="text-terminal-faint">SYM {activeSymbol}</span>
            <span className="text-terminal-faint">NAV {navHistory.length}</span>
            <span className="text-terminal-faint">CMD {commandHistory.length}</span>
          </>
        )}
      </div>

    </div>
  );
}
