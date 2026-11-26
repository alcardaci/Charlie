import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Globe2,
  History,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { askPanelCompanion } from '../api/finance';
import { useTerminalStore } from '../store/useTerminalStore';
import type {
  CompanionConversation,
  CompanionConversationMessage,
  CompanionMessagePayload,
  CompanionPanelContext,
  PanelType,
} from '../types';
import {
  COMPANION_MODEL_OPTIONS,
  DEFAULT_PANEL_COMPANION_SYSTEM_PROMPT,
} from '../utils/openaiConfig';
import { getPanelReferences, PANEL_MENTION_OPTIONS, type PanelMentionOption } from '../utils/companionPanelReferences';
import { buildCompanionContexts, getCompanionPanelLabel } from '../utils/panelCompanionContext';
import { CompanionPromptContext } from './CompanionPromptContext';
import { CompanionPromptControls } from './CompanionPromptControls';

type PanelCompanionProps = {
  children: ReactNode;
  mainPanelRef: RefObject<HTMLDivElement | null>;
  sideNewsRef: RefObject<HTMLDivElement | null>;
  sideNewsVisible: boolean;
};

type LocalMessage = CompanionConversationMessage;

type PanelMentionTrigger = {
  start: number;
  end: number;
  query: string;
};

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
  congress: [
    'Summarize the trades shown here.',
    'Which of these disclosures had the longest filing delay?',
    'What do the reported amount ranges tell me?',
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

const GENERAL_SUGGESTIONS = [
  'What are the most important market developments from the last hour?',
  'Research where BTC could trade six months from now and explain the main scenarios.',
  'Explain today’s latest central-bank decisions and why they matter for investors.',
];

const LEGACY_GREETINGS = new Set([
  'Ask me anything. I can explain topics, research the web for current information, follow breaking news, and use Charlie workspace context whenever it is relevant.',
  'Ask for clarifications, comparisons, or hidden patterns in the current panel. Mention another panel like macro, geopolitics, portfolio, or news if you want cross-tab context.',
]);

function conversationTurns(messages: LocalMessage[]): LocalMessage[] {
  const first = messages[0];
  // Older chats stored a UI greeting as the first assistant turn, without response metadata.
  return first?.role === 'assistant' && !first.model && !first.panels?.length && LEGACY_GREETINGS.has(first.content)
    ? messages.slice(1)
    : messages;
}

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

function getPanelMentionTrigger(input: string, caretPosition: number): PanelMentionTrigger | null {
  const safeCaret = Math.max(0, Math.min(caretPosition, input.length));
  const prefix = input.slice(0, safeCaret);
  const match = prefix.match(/(^|\s)@([a-z0-9-]*)$/i);
  if (!match) return null;

  return {
    start: prefix.length - match[2].length - 1,
    end: safeCaret,
    query: match[2].toLowerCase(),
  };
}

function formatConversationTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PanelCompanion({ children, mainPanelRef, sideNewsRef, sideNewsVisible }: PanelCompanionProps) {
  const queryClient = useQueryClient();
  const {
    activePanel,
    activeSymbol,
    openAISettings,
    watchlist,
    portfolio,
    portfolioDisplayCurrency,
    macroCountry,
    forexPairs,
    debugMode,
    companionOpen,
    companionExpanded,
    setCompanionOpen,
    setCompanionExpanded,
    updateOpenAISettings,
    companionConversations,
    activeCompanionConversationId,
    upsertCompanionConversation,
    deleteCompanionConversation,
    setActiveCompanionConversationId,
  } = useTerminalStore();
  const [draft, setDraft] = useState('');
  const [composerCaret, setComposerCaret] = useState(0);
  const [mentionMenuDismissed, setMentionMenuDismissed] = useState(false);
  const [forceWebSearch, setForceWebSearch] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const initialConversation = companionConversations.find(
    (conversation) => conversation.id === activeCompanionConversationId
  );
  const [messages, setMessages] = useState(() => conversationTurns(initialConversation?.messages ?? []));
  const [isLoading, setIsLoading] = useState(false);
  const [pendingForcedWebSearch, setPendingForcedWebSearch] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const drawerHeadingRef = useRef<HTMLHeadingElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const loadedConversationIdRef = useRef<string | null>(initialConversation?.id ?? null);

  useEffect(() => {
    if (!companionOpen) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading, companionOpen]);

  useEffect(() => {
    if (!activeCompanionConversationId) {
      loadedConversationIdRef.current = null;
      return;
    }
    if (loadedConversationIdRef.current === activeCompanionConversationId) return;

    const conversation = companionConversations.find(
      (entry) => entry.id === activeCompanionConversationId
    );
    if (!conversation) return;

    loadedConversationIdRef.current = conversation.id;
    setMessages(conversationTurns(conversation.messages));
    setDraft('');
    setComposerCaret(0);
    setMentionMenuDismissed(false);
    setComposerError(null);
  }, [activeCompanionConversationId, companionConversations]);

  useEffect(() => {
    if (!activeCompanionConversationId) return;
    const firstUserMessage = messages.find((message) => message.role === 'user');
    if (!firstUserMessage) return;

    const timer = window.setTimeout(() => {
      const existingConversation = useTerminalStore.getState().companionConversations.find(
        (conversation) => conversation.id === activeCompanionConversationId
      );
      const now = new Date().toISOString();
      upsertCompanionConversation({
        id: activeCompanionConversationId,
        title: existingConversation?.title ?? firstUserMessage.content.slice(0, 72),
        createdAt: existingConversation?.createdAt ?? firstUserMessage.createdAt,
        updatedAt: now,
        messages,
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [activeCompanionConversationId, messages, upsertCompanionConversation]);

  const draftReferences = useMemo(() => getPanelReferences(draft, activePanel), [draft, activePanel]);
  const panelMentionTrigger = useMemo(
    () => getPanelMentionTrigger(draft, composerCaret),
    [composerCaret, draft]
  );
  const panelMentionOptions = useMemo(
    () => {
      if (!panelMentionTrigger) return [];
      const query = panelMentionTrigger.query;
      return PANEL_MENTION_OPTIONS.filter((option) => {
        if (!query) return true;
        const label = getCompanionPanelLabel(option.panel).toLowerCase();
        return option.token.includes(query)
          || label.includes(query)
          || (option.aliases ?? []).some((alias) => alias.includes(query));
      });
    },
    [panelMentionTrigger]
  );

  const activePanelLabel = getCompanionPanelLabel(activePanel);
  const selectedModelOption = COMPANION_MODEL_OPTIONS.find((option) => option.value === openAISettings.companionModel)
    ?? COMPANION_MODEL_OPTIONS[0];
  const panelSuggestion = PANEL_SUGGESTIONS[activePanel]?.[0]
    ?? `Help me understand the most important takeaway from ${activePanelLabel.toLowerCase()}.`;
  const suggestions = [
    GENERAL_SUGGESTIONS[0],
    GENERAL_SUGGESTIONS[1],
    panelSuggestion,
  ];
  const hasUserMessages = messages.some((message) => message.role === 'user');
  const showPanelMentionMenu = Boolean(
    panelMentionTrigger
    && panelMentionOptions.length
    && !mentionMenuDismissed
    && !isLoading
  );

  const selectPanelMention = (option: PanelMentionOption) => {
    if (!panelMentionTrigger) return;
    const mention = `@${option.token}`;
    const nextDraft = `${draft.slice(0, panelMentionTrigger.start)}${mention} ${draft.slice(panelMentionTrigger.end)}`;
    const nextCaret = panelMentionTrigger.start + mention.length + 1;

    setDraft(nextDraft);
    setComposerCaret(nextCaret);
    setMentionMenuDismissed(false);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const startNewChat = () => {
    if (isLoading) return;
    loadedConversationIdRef.current = null;
    setActiveCompanionConversationId(null);
    setMessages([]);
    setDraft('');
    setComposerCaret(0);
    setMentionMenuDismissed(false);
    setComposerError(null);
    setForceWebSearch(false);
    setHistoryOpen(false);
  };

  const openConversation = (conversation: CompanionConversation) => {
    if (isLoading) return;
    loadedConversationIdRef.current = conversation.id;
    setActiveCompanionConversationId(conversation.id);
    setMessages(conversationTurns(conversation.messages));
    setDraft('');
    setComposerCaret(0);
    setMentionMenuDismissed(false);
    setComposerError(null);
    setHistoryOpen(false);
  };

  const removeConversation = (conversationId: string) => {
    if (isLoading) return;
    const removingActiveConversation = activeCompanionConversationId === conversationId;
    deleteCompanionConversation(conversationId);
    if (removingActiveConversation) {
      loadedConversationIdRef.current = null;
      setMessages([]);
      setDraft('');
      setComposerCaret(0);
      setMentionMenuDismissed(false);
      setComposerError(null);
    }
  };

  const stopActiveResponse = () => {
    activeRequestRef.current?.abort();
  };

  function canSend(content: string) {
    return Boolean(content.trim()) && !isLoading && !activeRequestRef.current;
  }

  const handleSubmit = async (options?: { content?: string; forceWebSearch?: boolean }) => {
    const content = (options?.content ?? draft).trim();
    if (!canSend(content)) return;
    const abortController = new AbortController();
    activeRequestRef.current = abortController;

    const requestModel = selectedModelOption.value;
    const useForcedWebSearch = options?.forceWebSearch ?? forceWebSearch;
    const references = getPanelReferences(content, activePanel);
    const requestPanels = references.panels;
    const conversationId = activeCompanionConversationId
      ?? `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!activeCompanionConversationId) {
      loadedConversationIdRef.current = conversationId;
      setActiveCompanionConversationId(conversationId);
    }
    const userMessage = createMessage('user', content, {
      panels: requestPanels,
      model: requestModel,
      webSearchForced: useForcedWebSearch,
    });
    const baseMessages = [...messages, userMessage];
    setMessages(baseMessages);
    if (options?.content === undefined) {
      setDraft('');
      setComposerCaret(0);
      setMentionMenuDismissed(false);
    }
    setComposerError(null);
    setIsLoading(true);
    setPendingForcedWebSearch(useForcedWebSearch);
    let assistantMessageId: string | null = null;

    try {
      const renderedTextByPanel: Partial<Record<PanelType, string>> = {
        [activePanel]: getVisibleText(mainPanelRef),
      };

      if (sideNewsVisible) {
        const sideNewsText = getVisibleText(sideNewsRef);
        if (sideNewsText) renderedTextByPanel.news = sideNewsText;
      }

      const contexts: CompanionPanelContext[] = await buildCompanionContexts({
        panels: requestPanels,
        detailedPanels: references.detailed,
        queryClient,
        state: {
          activePanel,
          activeSymbol,
          watchlist,
          portfolio,
          portfolioDisplayCurrency,
          macroCountry,
          forexPairs,
        },
        renderedTextByPanel,
      });

      const assistantMessage = createMessage('assistant', '', {
        panels: requestPanels,
        model: requestModel,
        webSearchForced: useForcedWebSearch,
      });
      assistantMessageId = assistantMessage.id;
      const nextMessages = [...baseMessages, assistantMessage];
      setMessages(nextMessages);

      const history: CompanionMessagePayload[] = nextMessages
        .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content.trim()))
        .slice(-8)
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

      const result = await askPanelCompanion({
        model: requestModel,
        activePanel,
        panels: requestPanels,
        messages: history,
        contexts,
        webSearch: true,
        forceWebSearch: useForcedWebSearch,
        signal: abortController.signal,
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
                webSearchForced: result.webSearchForced,
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

      const detail = error instanceof Error ? error.message : 'Unable to reach the companion right now.';
      const message = detail === 'OpenAI API key is not stored locally yet.'
        ? 'Add your OpenAI API key in Settings to use the AI Companion.'
        : detail;
      setComposerError(message);
      setMessages((current) => [
        ...current.filter((entry) => entry.content.trim() || entry.role === 'user'),
        createMessage('assistant', message, {
          panels: requestPanels,
          error: true,
          model: requestModel,
          webSearchForced: useForcedWebSearch,
        }),
      ]);
    } finally {
      if (activeRequestRef.current === abortController) {
        activeRequestRef.current = null;
      }
      setIsLoading(false);
      setPendingForcedWebSearch(false);
      if (useForcedWebSearch) setForceWebSearch(false);
    }
  };

  function sendPrompt(content: string) {
    if (!canSend(content)) return false;
    setHistoryOpen(false);
    setCompanionOpen(true);
    void handleSubmit({ content });
    window.requestAnimationFrame(() => drawerHeadingRef.current?.focus({ preventScroll: true }));
    return true;
  }

  return (
    <CompanionPromptContext.Provider value={{
      sendPrompt, isSending: isLoading, model: selectedModelOption.value,
      setModel: model => updateOpenAISettings({ companionModel: model }), forceWebSearch, setForceWebSearch,
    }}>
      {children}
      {companionOpen && (
        <>
          {!companionExpanded && (
            <button
              type="button"
              className="fixed inset-0 z-40 bg-terminal-bg/55 backdrop-blur-[1px]"
              onClick={() => setCompanionOpen(false)}
              aria-label="Close companion overlay"
            />
          )}
          <section
            className={
              companionExpanded
                ? 'fixed inset-0 z-[60] flex w-full flex-col bg-terminal-bg'
                : 'instrument-section fixed inset-y-0 right-0 z-50 flex w-full max-w-[28rem] flex-col border-l border-terminal-border bg-terminal-panel shadow-2xl'
            }
            aria-label={companionExpanded ? 'Charlie Companion full page' : 'Charlie Companion'}
          >
            <div
              className={
                companionExpanded
                  ? 'instrument-section mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col border-x border-terminal-border bg-terminal-panel shadow-2xl'
                  : 'contents'
              }
            >
            <div className="instrument-section flex items-center justify-between gap-3 border-b border-terminal-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <Sparkles size={14} className="shrink-0 text-terminal-accent" aria-hidden="true" />
                <h2 ref={drawerHeadingRef} tabIndex={-1} className="workspace-title">{historyOpen ? 'CHAT HISTORY' : 'CHARLIE COMPANION'}</h2>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((open) => !open)}
                  disabled={isLoading}
                  aria-pressed={historyOpen}
                  className="relative rounded border border-terminal-border p-2 text-terminal-faint transition-colors hover:border-terminal-accent/40 hover:text-terminal-accent disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={historyOpen ? 'Back to conversation' : 'Conversation history'}
                  title={historyOpen ? 'Back to conversation' : 'Conversation history'}
                >
                  {historyOpen ? <ArrowLeft size={14} /> : <History size={14} />}
                  {!historyOpen && companionConversations.length > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-terminal-accent px-1 text-center text-[9px] font-bold leading-4 text-terminal-on-accent">
                      {companionConversations.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={startNewChat}
                  disabled={isLoading}
                  className="rounded border border-terminal-border p-2 text-terminal-faint transition-colors hover:border-terminal-accent/40 hover:text-terminal-accent disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Start a new companion chat"
                  title="New chat"
                >
                  <MessageSquarePlus size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setCompanionExpanded(!companionExpanded)}
                  className="rounded border border-terminal-border p-2 text-terminal-faint transition-colors hover:border-terminal-accent/40 hover:text-terminal-accent"
                  aria-label={companionExpanded ? 'Collapse companion to side panel' : 'Expand companion to full page'}
                  title={companionExpanded ? 'Collapse to side panel' : 'Expand to full page'}
                >
                  {companionExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
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
            </div>

            {historyOpen ? (
              <div className="flex-1 overflow-y-auto bg-terminal-bg/35 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-bold tracking-[0.18em] text-terminal-faint">RECENT CONVERSATIONS</div>
                  <div className="text-[10px] text-terminal-faint">Stored locally</div>
                </div>
                {companionConversations.length === 0 ? (
                  <div className="instrument-section mt-4 rounded border border-dashed border-terminal-border px-3 py-10 text-center text-[11px] text-terminal-faint">
                    Conversations appear here after your first message.
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {companionConversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        className={`flex items-center gap-3 rounded border p-3 ${
                          conversation.id === activeCompanionConversationId
                            ? 'border-terminal-accent/40 bg-terminal-accent/10'
                            : 'instrument-section border-terminal-border bg-terminal-elevated'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => openConversation(conversation)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-xs text-terminal-text">{conversation.title}</span>
                          <span className="mt-0.5 block text-[10px] text-terminal-faint">
                            {formatConversationTimestamp(conversation.updatedAt)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeConversation(conversation.id)}
                          className="rounded p-1.5 text-terminal-faint transition-colors hover:bg-terminal-negative/10 hover:text-terminal-negative"
                          aria-label={`Delete conversation ${conversation.title}`}
                          title="Delete conversation"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>

            <aside aria-label="Companion guidance" className="shrink-0 px-4 pt-3 text-[11px] leading-relaxed text-terminal-muted">
              Charlie can use {draftReferences.panels.map(getCompanionPanelLabel).join(', ')} when relevant. Type @ to include another panel.{' '}
              {forceWebSearch ? 'Force Web requires a search for your next question.' : 'Forecasts and current events use web search.'}
            </aside>

            {debugMode && (
              <div className="instrument-section border-b border-terminal-border px-4 py-3">
                <div className="text-[11px] font-bold tracking-[0.18em] text-terminal-faint">DEBUG · COMPANION SYSTEM PROMPT</div>
                <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded border border-terminal-border bg-terminal-elevated px-3 py-2 text-[11px] leading-relaxed text-terminal-muted">
                  {DEFAULT_PANEL_COMPANION_SYSTEM_PROMPT}
                </pre>
              </div>
            )}

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((message, messageIndex) => {
                const retryPrompt = messages
                  .slice(0, messageIndex)
                  .reverse()
                  .find((entry) => entry.role === 'user')?.content;

                return (
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
                      {(message.model || message.webSearch || message.webSearchForced || message.stopped || (message.panels && message.panels.length > 0)) && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {message.webSearch && (
                            <span className="rounded bg-terminal-accent/10 px-1.5 py-0.5 text-[10px] text-terminal-accent">
                              Web sources
                            </span>
                          )}
                          {message.webSearchForced && (
                            <span className="rounded bg-terminal-accent/10 px-1.5 py-0.5 text-[10px] text-terminal-accent">
                              Web forced
                            </span>
                          )}
                          {message.model && (
                            <span className="rounded bg-terminal-bg/60 px-1.5 py-0.5 text-[10px] text-terminal-faint">
                              {message.model}
                            </span>
                          )}
                          {message.stopped && (
                            <span className="rounded bg-terminal-bg/60 px-1.5 py-0.5 text-[10px] text-terminal-faint">
                              Stopped
                            </span>
                          )}
                          {(message.panels ?? []).map((panel) => (
                            <span key={`${message.id}-${panel}`} className="rounded bg-terminal-bg/60 px-1.5 py-0.5 text-[10px] text-terminal-faint">
                              {getCompanionPanelLabel(panel)}
                            </span>
                          ))}
                        </div>
                      )}
                      {message.role === 'assistant' && message.model && !message.webSearch && !message.error && !message.stopped && retryPrompt && (
                        <button
                          type="button"
                          onClick={() => {
                            void handleSubmit({ content: retryPrompt, forceWebSearch: true });
                          }}
                          disabled={isLoading}
                          className="mt-2 inline-flex items-center gap-1 rounded border border-terminal-accent/30 px-2 py-1 text-[10px] text-terminal-accent transition-colors hover:bg-terminal-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Globe2 size={10} />
                          Retry with web
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {!hasUserMessages && !isLoading && (
                <div role="group" aria-label="Suggested prompts">
                  <h3 className="text-[10px] font-bold tracking-[0.18em] text-terminal-faint">SUGGESTED PROMPTS</h3>
                  <div className="mt-2 grid gap-1.5">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setDraft(suggestion)}
                        className="rounded border border-terminal-border bg-terminal-elevated px-2.5 py-2 text-left text-[11px] leading-relaxed text-terminal-muted transition-colors hover:border-terminal-accent/35 hover:text-terminal-text"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-terminal-border bg-terminal-elevated px-3 py-2 text-xs text-terminal-muted">
                    <Loader2 size={12} className="animate-spin" />
                    {pendingForcedWebSearch ? 'Searching the web…' : 'Thinking…'}
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
              <div className="relative">
                {showPanelMentionMenu && (
                  <div
                    className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-64 overflow-y-auto rounded border border-terminal-accent/35 bg-terminal-panel p-2 shadow-2xl"
                    role="listbox"
                    aria-label="Panel mentions"
                  >
                    <div className="px-2 pb-1.5 text-[10px] font-bold tracking-[0.16em] text-terminal-faint">
                      FORCE PANEL CONTEXT
                    </div>
                    <div className="grid gap-1">
                      {panelMentionOptions.map((option) => (
                        <button
                          key={option.panel}
                          type="button"
                          role="option"
                          aria-selected={draftReferences.mentions.includes(option.panel)}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectPanelMention(option)}
                          className="flex items-center justify-between gap-3 rounded border border-transparent px-2 py-2 text-left transition-colors hover:border-terminal-accent/30 hover:bg-terminal-accent/10"
                        >
                          <span className="text-xs text-terminal-text">{getCompanionPanelLabel(option.panel)}</span>
                          <span className="text-[10px] text-terminal-accent">@{option.token}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="overflow-hidden rounded border border-terminal-border bg-terminal-elevated focus-within:border-terminal-accent/50">
                  <div className="border-b border-terminal-border p-2">
                    <CompanionPromptControls />
                  </div>
                  <div className="flex items-stretch gap-2">
                    <textarea
                      ref={textareaRef}
                      value={draft}
                      onChange={(event) => {
                        setDraft(event.target.value);
                        setComposerCaret(event.target.selectionStart ?? event.target.value.length);
                        setMentionMenuDismissed(false);
                      }}
                      onSelect={(event) => {
                        setComposerCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape' && showPanelMentionMenu) {
                          event.preventDefault();
                          setMentionMenuDismissed(true);
                          return;
                        }
                        if (event.key === 'Enter' && showPanelMentionMenu && panelMentionOptions[0]) {
                          event.preventDefault();
                          selectPanelMention(panelMentionOptions[0]);
                          return;
                        }
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void handleSubmit();
                        }
                      }}
                      aria-label="Message to Companion"
                      placeholder="Ask a question…"
                      className="min-h-[5.5rem] min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-xs text-terminal-text placeholder-terminal-faint focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void handleSubmit();
                      }}
                      disabled={!draft.trim() || isLoading}
                      className="m-2 ml-0 inline-flex w-11 flex-shrink-0 items-center justify-center rounded border border-terminal-accent/40 bg-terminal-accent/10 text-terminal-accent transition-colors hover:bg-terminal-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Send message to companion"
                    >
                      {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
              </>
            )}
            </div>
          </section>
        </>
      )}
    </CompanionPromptContext.Provider>
  );
}
