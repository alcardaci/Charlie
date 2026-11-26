export const overviewPrompts = [
  'What stands out in this market overview?',
  'What moved markets in the last hour?',
] as const;

export function CompanionSuggestions({ prompts, onSelect, compact = false }: {
  prompts: readonly string[];
  onSelect: (prompt: string) => void;
  compact?: boolean;
}) {
  return (
    <div role="group" aria-label="Suggested prompts">
      {!compact && <h3 className="text-[10px] font-bold tracking-[0.18em] text-terminal-faint">SUGGESTED PROMPTS</h3>}
      <div className={compact ? 'flex flex-wrap gap-1.5' : 'mt-2 grid gap-1.5'}>
        {prompts.map(prompt => (
          <button key={prompt} type="button" onClick={() => onSelect(prompt)}
            className={`rounded border border-terminal-border bg-terminal-elevated px-2.5 text-left text-[11px] leading-relaxed text-terminal-muted hover:border-terminal-accent/35 hover:text-terminal-text focus-visible:outline-terminal-accent ${compact ? 'py-1' : 'py-2'}`}>
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
