import { Globe2 } from 'lucide-react';
import { COMPANION_MODEL_OPTIONS } from '../utils/openaiConfig';
import { useCompanionPrompt } from './CompanionPromptContext';

export function CompanionPromptControls() {
  const { model, setModel, forceWebSearch, setForceWebSearch, isSending } = useCompanionPrompt();

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <select aria-label="Companion model" value={model}
        onChange={event => setModel(event.target.value)} disabled={isSending}
        className="min-w-0 max-w-full flex-[1_1_10rem] rounded bg-transparent px-1 py-1 text-[11px] font-bold text-terminal-text focus-visible:outline-terminal-accent disabled:opacity-60">
        {COMPANION_MODEL_OPTIONS.map(option => (
          <option key={option.value} value={option.value} title={option.description}>{option.label} · {option.value}</option>
        ))}
      </select>
      <button type="button" onClick={() => setForceWebSearch(!forceWebSearch)} disabled={isSending}
        aria-pressed={forceWebSearch} aria-label={`Web search mode: ${forceWebSearch ? 'Required' : 'Automatic'}`}
        title={forceWebSearch ? 'Web search is required for the next request' : 'Charlie decides whether to search the web'}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-bold tracking-[0.1em] disabled:opacity-60 ${
          forceWebSearch ? 'border-terminal-accent/50 bg-terminal-accent/15 text-terminal-accent'
            : 'border-terminal-border text-terminal-faint hover:border-terminal-accent/35 hover:text-terminal-accent'
        }`}>
        <Globe2 size={11} aria-hidden="true" />{forceWebSearch ? 'FORCE WEB' : 'WEB AUTO'}
      </button>
    </div>
  );
}
