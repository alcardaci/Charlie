import { Loader2 } from 'lucide-react';
import { EarningsCallsRequestError } from '../api/earningsCalls';
import { useTerminalStore } from '../store/useTerminalStore';

const buttonClass = 'rounded border border-terminal-border bg-terminal-elevated px-2.5 py-1 text-xs text-terminal-text hover:border-terminal-accent disabled:opacity-60';

export function ReadError({ error, retry }: { error: Error; retry: () => void }) {
  const setActivePanel = useTerminalStore(state => state.setActivePanel);
  const keyError = error instanceof EarningsCallsRequestError && (error.status === 401 || error.status === 403);
  return <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-terminal-muted">
    <span>{error instanceof EarningsCallsRequestError ? error.message : 'Could not reach the earnings calls service.'}</span>
    {keyError
      ? <button type="button" className={buttonClass} onClick={() => setActivePanel('settings')}>Open Settings</button>
      : <button type="button" className={buttonClass} onClick={retry}>Retry</button>}
  </div>;
}

export function Loading({ children }: { children: string }) {
  return <p role="status" className="flex items-center gap-2 text-xs text-terminal-muted"><Loader2 size={13} className="animate-spin" aria-hidden="true" />{children}</p>;
}

export function timestamp(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) return '';
  const seconds = Math.floor(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return (hours ? hours + ':' + String(minutes).padStart(2, '0') : String(minutes)) + ':' + String(seconds % 60).padStart(2, '0');
}
