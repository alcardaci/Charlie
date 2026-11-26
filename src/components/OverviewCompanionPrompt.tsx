import { useState } from 'react';
import { ArrowUp, MessageSquare, PanelRightOpen } from 'lucide-react';
import { useTerminalStore } from '../store/useTerminalStore';
import { useCompanionPrompt } from './CompanionPromptContext';
import { CompanionPromptControls } from './CompanionPromptControls';

export function OverviewCompanionPrompt() {
  const [prompt, setPrompt] = useState('');
  const { sendPrompt, isSending } = useCompanionPrompt();
  const setCompanionOpen = useTerminalStore(state => state.setCompanionOpen);
  const canSend = Boolean(prompt.trim()) && !isSending;

  return (
    <form aria-label="AI Companion" className="overview-insights-box flex flex-col gap-3"
      onSubmit={event => {
        event.preventDefault();
        if (canSend && sendPrompt(prompt)) setPrompt('');
      }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="instrument-heading flex items-center gap-2 text-xs font-bold leading-6 tracking-wider">
          <MessageSquare size={13} className="text-terminal-accent" aria-hidden="true" />AI COMPANION
        </h3>
        <button type="button" aria-label="Open conversation" title="Open conversation"
          onClick={() => setCompanionOpen(true)}
          className="rounded border border-terminal-border p-1.5 text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent">
          <PanelRightOpen size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="overview-companion-input">
        <div className="border-b border-terminal-border pb-2"><CompanionPromptControls /></div>
        <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={2}
          aria-label="Ask AI Companion" placeholder="Ask about the market…"
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (canSend) event.currentTarget.form?.requestSubmit();
            }
          }} />
        <button type="submit" disabled={!canSend}
          className="inline-flex items-center gap-1 self-end rounded border border-terminal-accent/40 bg-terminal-accent/10 px-2.5 py-1 text-xs text-terminal-accent hover:border-terminal-accent disabled:cursor-not-allowed disabled:opacity-50">
          <ArrowUp size={13} aria-hidden="true" />Send
        </button>
      </div>
    </form>
  );
}
