import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw, Search, Send, Sparkles, Square, X } from 'lucide-react';
import { askPanelCompanion, streamPanelCompanion } from '../api/finance';
import { useTerminalStore } from '../store/useTerminalStore';
import type { CompanionMessagePayload, CompanionWebCitation, PanelType } from '../types';
import {
  DEFAULT_COMPANION_WEB_SEARCH_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_PANEL_COMPANION_SYSTEM_PROMPT,
} from '../utils/openaiConfig';
import { buildCompanionContexts, getCompanionPanelLabel } from '../utils/panelCompanionContext';

type PanelCompanionProps = {
  mainPanelRef: RefObject<HTMLDivElement | null>;
  sideNewsRef: RefObject<HTMLDivElement | null>;
  sideNewsVisible: boolean;
};

type LocalMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  panels?: PanelType[];
  error?: boolean;
  model?: string;
  webSearch?: boolean;
  webSearchCitations?: CompanionWebCitation[];
  stopped?: boolean;
};

const EXTRA_PANEL_OPTIONS: PanelType[] = [
  'overview',
  'opportunities',
  'news',
  'macro',
  'geopolitics',
  'predictions',
  'portfolio',
  'heatmap',
  'forex',
  'crypto',
  'etf',
];

const PANEL_HINT_PATTERNS: Array<{ panel: PanelType; pattern: RegExp }> = [
  { panel: 'overview', pattern: /\b(home|overview|market overview)\b/i },
  { panel: 'opportunities', pattern: /\b(opps|opportunities|themes|theme discovery)\b/i },
  { panel: 'news', pattern: /\b(news|headlines|headline feed)\b/i },
  { panel: 'macro', pattern: /\b(macro|yield|economic|economy|rates)\b/i },
  { panel: 'geopolitics', pattern: /\b(geo|geopolitics|geopolitical|hotspots)\b/i },
  { panel: 'predictions', pattern: /\b(predictions|prediction markets|polymarket)\b/i },
  { panel: 'portfolio', pattern: /\b(portfolio|holdings|positions|book)\b/i },
  { panel: 'heatmap', pattern: /\b(heatmap|sector map|leadership map)\b/i },
  { panel: 'forex', pattern: /\b(forex|fx|currency|currencies)\b/i },
  { panel: 'crypto', pattern: /\b(crypto|bitcoin|ethereum|altcoins)\b/i },
  { panel: 'etf', pattern: /\b(etf|fund monitor|sector etf)\b/i },
];

const PANEL_SUGGESTIONS: Partial<Record<PanelType, string[]>> = {
  overview: [
    'What changed most across this market snapshot?',
    'What cross-asset pattern might a human miss here?',
    'Summarize the biggest risks and opportunities on this page.',
  ],
  equity: [
    'What stands out in this company setup that is easy to miss?',
    'What is the tension between valuation, growth, and analyst view here?',
    'What follow-up questions should I ask about this symbol?',
  ],
  chart: [
    'What price pattern do you see in this chart context?',
    'Does the recent move look like continuation or exhaustion?',
    'What would confirm or invalidate the current trend?',
  ],
  news: [
    'What theme is emerging from these headlines?',
    'What stories matter most versus what is just noise?',
    'What second-order implication should I pay attention to?',
  ],
  macro: [
    'What macro pattern stands out across these readings?',
    'What is the most important signal here for risk assets?',
    'How would you explain this macro setup simply?',
  ],
  geopolitics: [
    'What geopolitical pattern or escalation risk stands out?',
    'Which hotspot looks most important and why?',
    'What downstream market implications are most plausible here?',
  ],
  predictions: [
    'What consensus is the prediction market expressing here?',
    'Where do you see tension or inconsistency across these forecasts?',
    'What signals are these markets implying that deserve follow-up?',
  ],
  portfolio: [
    'What concentration or hidden portfolio risk stands out?',
    'What pattern do you see in these holdings and exposures?',
    'Where might I be overexposed or under-hedged?',
  ],
  heatmap: [
    'What leadership pattern is visible in this heatmap?',
    'Is breadth improving or narrowing from this snapshot?',
    'What sector rotation story does this suggest?',
  ],
  forex: [
    'What currency pattern stands out here?',
    'What does this FX mix suggest about macro regime?',
    'Which pair deserves a closer look and why?',
  ],
  crypto: [
    'What market structure pattern stands out in crypto here?',
    'Is leadership broadening or concentrating?',
    'What risk signal is easiest to miss in this crypto snapshot?',
  ],
  etf: [
    'What ETF leadership pattern stands out here?',
    'What does this ETF mix suggest about current market positioning?',
    'Which ETF moves deserve follow-up?',
  ],
};

const INITIAL_COMPANION_MESSAGE =
  'Ask for clarifications, comparisons, or hidden patterns in the current panel. Mention another panel like macro, geopolitics, portfolio, or news if you want cross-tab context.';

function createMessage(role: LocalMessage['role'], content: string, extras?: Partial<LocalMessage>): LocalMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    ...extras,
  };
}

function getVisibleText(ref: RefObject<HTMLDivElement | null>): string {
  return String(ref.current?.innerText ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}

function inferMentionedPanels(input: string): PanelType[] {
  const normalized = input.trim();
  if (!normalized) return [];

  return PANEL_HINT_PATTERNS
    .filter(({ pattern }) => pattern.test(normalized))
    .map(({ panel }) => panel);
}

export function PanelCompanion({ mainPanelRef, sideNewsRef, sideNewsVisible }: PanelCompanionProps) {
  const queryClient = useQueryClient();
  const {
    activePanel,
    activeSymbol,
    openAISettings,
    watchlist,
    portfolio,
    forexPairs,
    debugMode,
    companionOpen,
    setCompanionOpen,
  } = useTerminalStore();
  const [draft, setDraft] = useState('');
  const [extraPanels, setExtraPanels] = useState<PanelType[]>([]);
  const [messages, setMessages] = useState<LocalMessage[]>([
    createMessage('assistant', INITIAL_COMPANION_MESSAGE),
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingWebSearch, setPendingWebSearch] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setExtraPanels((current) => current.filter((panel) => panel !== activePanel));
  }, [activePanel]);

  useEffect(() => {
    if (!companionOpen) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading, companionOpen]);

  const mentionedPanels = useMemo(
    () => inferMentionedPanels(draft).filter((panel) => panel !== activePanel),
    [activePanel, draft]
  );

  const selectedPanels = useMemo(
    () => Array.from(new Set([activePanel, ...extraPanels, ...mentionedPanels])),
    [activePanel, extraPanels, mentionedPanels]
  );

  const activePanelLabel = getCompanionPanelLabel(activePanel);
  const suggestions = PANEL_SUGGESTIONS[activePanel] ?? [
    `Help me understand the most important takeaway from ${activePanelLabel.toLowerCase()}.`,
    'What pattern might I be missing here?',
    'What would you investigate next from this panel?',
  ];

  const toggleExtraPanel = (panel: PanelType) => {
    setExtraPanels((current) =>
      current.includes(panel)
        ? current.filter((value) => value !== panel)
        : [...current, panel]
    );
  };

  const startNewChat = () => {
    if (isLoading) return;
    setMessages([createMessage('assistant', INITIAL_COMPANION_MESSAGE)]);
    setDraft('');
    setComposerError(null);
    setExtraPanels([]);
  };

  const stopActiveResponse = () => {
    activeRequestRef.current?.abort();
  };

  const handleSubmit = async (useWebSearch = false) => {
    const content = draft.trim();
    if (!content || isLoading) return;

    const requestModel = useWebSearch
      ? DEFAULT_COMPANION_WEB_SEARCH_MODEL
      : (openAISettings.model?.trim() || DEFAULT_OPENAI_MODEL);
    const userMessage = createMessage('user', content, {
      panels: selectedPanels,
      model: requestModel,
      webSearch: useWebSearch,
    });
    const baseMessages = [...messages, userMessage];
    setMessages(baseMessages);
    setPendingWebSearch(useWebSearch);
    const abortController = new AbortController();
    activeRequestRef.current = abortController;
    let assistantMessageId: string | null = null;

    try {
      const renderedTextByPanel: Partial<Record<PanelType, string>> = {
        [activePanel]: getVisibleText(mainPanelRef),
      };

      if (sideNewsVisible) {
        const sideNewsText = getVisibleText(sideNewsRef);
        if (sideNewsText) renderedTextByPanel.news = sideNewsText;
      }

      const contexts = await buildCompanionContexts({
        panels: selectedPanels,
        queryClient,
        state: {
          activePanel,
          activeSymbol,
          watchlist,
          portfolio,
          forexPairs,
        },
        renderedTextByPanel,
      });

      const assistantMessage = createMessage('assistant', '', {
        panels: selectedPanels,
        model: requestModel,
        webSearch: useWebSearch,
      });
      assistantMessageId = assistantMessage.id;
      const nextMessages = [...baseMessages, assistantMessage];
      setMessages(nextMessages);
      setDraft('');
      setComposerError(null);
      setIsLoading(true);

      const history: CompanionMessagePayload[] = nextMessages
        .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content.trim()))
        .slice(-8)
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

      const result = useWebSearch
        ? await askPanelCompanion({
            model: requestModel,
            activePanel,
            panels: selectedPanels,
            messages: history,
            contexts,
            webSearch: true,
            signal: abortController.signal,
          })
        : await streamPanelCompanion({
            model: requestModel,
            activePanel,
            panels: selectedPanels,
            messages: history,
            contexts,
            signal: abortController.signal,
          }, {
            onChunk: (chunk) => {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantMessage.id
                    ? { ...message, content: `${message.content}${chunk}` }
                    : message
                )
              );
            },
          });

      if (abortController.signal.aborted) return;

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                content: result.answer || message.content,
                panels: result.panels,
                model: result.model,
                webSearch: result.webSearch,
                webSearchCitations: result.webSearchCitations,
              }
            : message
        )
      );
    } catch (error) {
      if (abortController.signal.aborted) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: message.content.trim() || 'Response stopped.',
                  stopped: true,
                }
              : message
          )
        );
        return;
      }

      const message = error instanceof Error ? error.message : 'Unable to reach the companion right now.';
      setComposerError(message);
      setMessages((current) => [
        ...current.filter((entry) => entry.content.trim() || entry.role === 'user'),
        createMessage('assistant', message, {
          panels: selectedPanels,
          error: true,
          model: requestModel,
          webSearch: useWebSearch,
        }),
      ]);
    } finally {
      if (activeRequestRef.current === abortController) {
        activeRequestRef.current = null;
      }
      setIsLoading(false);
      setPendingWebSearch(false);
    }
  };

  return (
    <>
      {companionOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-terminal-bg/55 backdrop-blur-[1px]"
            onClick={() => setCompanionOpen(false)}
            aria-label="Close companion overlay"
          />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[28rem] flex-col border-l border-terminal-border bg-terminal-panel shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-terminal-border px-4 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-terminal-accent" />
                  <span className="text-sm font-bold tracking-wider text-terminal-accent">CHARLIE COMPANION</span>
                </div>
                <div className="mt-1 text-xs leading-relaxed text-terminal-muted">
                  Current focus: <span className="text-terminal-text">{activePanelLabel}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedPanels.map((panel) => (
                    <span
                      key={panel}
                      className="rounded border border-terminal-accent/30 bg-terminal-accent/10 px-2 py-1 text-[11px] text-terminal-accent"
                    >
                      {getCompanionPanelLabel(panel)}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={startNewChat}
                disabled={isLoading}
                className="rounded border border-terminal-border px-2.5 py-2 text-terminal-faint transition-colors hover:border-terminal-accent/40 hover:text-terminal-accent disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Start a new companion chat"
                title="New chat"
              >
                <RotateCcw size={14} />
              </button>
              <button
                type="button"
                onClick={() => setCompanionOpen(false)}
                className="rounded border border-terminal-border p-2 text-terminal-faint transition-colors hover:border-terminal-accent/40 hover:text-terminal-accent"
                aria-label="Close companion"
              >
                <X size={14} />
              </button>
            </div>

            <div className="border-b border-terminal-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold tracking-[0.18em] text-terminal-faint">EXTRA PANELS</div>
                {extraPanels.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExtraPanels([])}
                    className="text-[11px] text-terminal-faint transition-colors hover:text-terminal-accent"
                  >
                    CLEAR
                  </button>
                )}
              </div>
              <div className="mt-2 text-[11px] leading-relaxed text-terminal-faint">
                The active panel is always included. Mention another panel in your question and it will be pulled in automatically.
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {EXTRA_PANEL_OPTIONS
                  .filter((panel) => panel !== activePanel)
                  .map((panel) => {
                    const selected = extraPanels.includes(panel);
                    const autoSelected = !selected && mentionedPanels.includes(panel);
                    return (
                      <button
                        key={panel}
                        type="button"
                        onClick={() => toggleExtraPanel(panel)}
                        className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                          selected
                            ? 'border-terminal-accent/40 bg-terminal-accent/12 text-terminal-accent'
                            : autoSelected
                              ? 'border-terminal-blue/35 bg-terminal-blue/10 text-terminal-blue'
                              : 'border-terminal-border text-terminal-muted hover:border-terminal-accent/35 hover:text-terminal-text'
                        }`}
                      >
                        {getCompanionPanelLabel(panel)}
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="border-b border-terminal-border px-4 py-3">
              <div className="text-[11px] font-bold tracking-[0.18em] text-terminal-faint">SUGGESTED PROMPTS</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setDraft(suggestion)}
                    className="rounded border border-terminal-border bg-terminal-elevated px-2 py-1 text-left text-[11px] text-terminal-muted transition-colors hover:border-terminal-accent/35 hover:text-terminal-text"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            {debugMode && (
              <div className="border-b border-terminal-border px-4 py-3">
                <div className="text-[11px] font-bold tracking-[0.18em] text-terminal-faint">DEBUG · COMPANION SYSTEM PROMPT</div>
                <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded border border-terminal-border bg-terminal-elevated px-3 py-2 text-[11px] leading-relaxed text-terminal-muted">
                  {DEFAULT_PANEL_COMPANION_SYSTEM_PROMPT}
                </pre>
              </div>
            )}

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[92%] rounded-2xl border px-3 py-2.5 text-xs leading-relaxed ${
                      message.role === 'user'
                        ? 'border-terminal-accent/30 bg-terminal-accent/10 text-terminal-text'
                        : message.error
                          ? 'border-terminal-negative/25 bg-terminal-negative/10 text-terminal-text'
                          : 'border-terminal-border bg-terminal-elevated text-terminal-text'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">
                      {message.content || (message.role === 'assistant' && isLoading ? '...' : '')}
                    </div>
                    {message.webSearchCitations && message.webSearchCitations.length > 0 && (
                      <div className="mt-3 space-y-1 border-t border-terminal-border/70 pt-2">
                        <div className="text-[10px] font-bold tracking-[0.16em] text-terminal-faint">SOURCES</div>
                        {message.webSearchCitations.map((citation) => (
                          <a
                            key={`${message.id}-${citation.url}`}
                            href={citation.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-[11px] text-terminal-accent transition-colors hover:text-terminal-text"
                            title={citation.url}
                          >
                            {citation.title}
                          </a>
                        ))}
                      </div>
                    )}
                    {message.panels && message.panels.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {message.webSearch && (
                          <span className="rounded bg-terminal-blue/10 px-1.5 py-0.5 text-[10px] text-terminal-blue">
                            Web Search · {message.model ?? DEFAULT_COMPANION_WEB_SEARCH_MODEL}
                          </span>
                        )}
                        {message.stopped && (
                          <span className="rounded bg-terminal-bg/60 px-1.5 py-0.5 text-[10px] text-terminal-faint">
                            Stopped
                          </span>
                        )}
                        {message.panels.map((panel) => (
                          <span key={`${message.id}-${panel}`} className="rounded bg-terminal-bg/60 px-1.5 py-0.5 text-[10px] text-terminal-faint">
                            {getCompanionPanelLabel(panel)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-terminal-border bg-terminal-elevated px-3 py-2 text-xs text-terminal-muted">
                    <Loader2 size={12} className="animate-spin" />
                    {pendingWebSearch ? 'Searching web and reading panels...' : 'Reading panels and thinking through the answer...'}
                    <button
                      type="button"
                      onClick={stopActiveResponse}
                      className="ml-1 inline-flex items-center gap-1 rounded border border-terminal-negative/35 px-2 py-1 text-[11px] text-terminal-negative transition-colors hover:bg-terminal-negative/10"
                      aria-label="Stop companion response"
                      title="Stop response"
                    >
                      <Square size={10} />
                      Stop
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-terminal-border px-4 py-4">
              {composerError && (
                <div className="mb-2 text-xs text-terminal-negative">
                  {composerError}
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSubmit(false);
                    }
                  }}
                  placeholder="Ask for a clarification, compare panels, or look for hidden patterns."
                  className="min-h-[5.5rem] flex-1 resize-none rounded border border-terminal-border bg-terminal-elevated px-3 py-2 text-xs text-terminal-text placeholder-terminal-faint focus:border-terminal-accent/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    void handleSubmit(true);
                  }}
                  disabled={!draft.trim() || isLoading}
                  className="inline-flex w-11 items-center justify-center rounded border border-terminal-blue/40 bg-terminal-blue/10 text-terminal-blue transition-colors hover:bg-terminal-blue/20 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Search web with companion"
                  title={`Search web with ${DEFAULT_COMPANION_WEB_SEARCH_MODEL}`}
                >
                  {isLoading && pendingWebSearch ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleSubmit(false);
                  }}
                  disabled={!draft.trim() || isLoading}
                  className="inline-flex w-11 items-center justify-center rounded border border-terminal-accent/40 bg-terminal-accent/10 text-terminal-accent transition-colors hover:bg-terminal-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send message to companion"
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
              <div className="mt-2 text-[11px] leading-relaxed text-terminal-faint">
                Send uses the AI Settings model. Search uses <span className="text-terminal-text">{DEFAULT_COMPANION_WEB_SEARCH_MODEL}</span> and only runs when you click the search button.
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
