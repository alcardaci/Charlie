import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { AIMarketSummary, ChartStyle, OpenAISettings, PanelType, PortfolioPosition } from '../types';
import { TERMINAL_STORAGE_KEY, terminalStateStorage } from '../utils/localStateStorage';
import {
  buildDefaultOpenAISystemPrompts,
  DEFAULT_GEOPOLITICS_EVENT_SYSTEM_PROMPT,
  DEFAULT_GEOPOLITICS_OPENAI_MODEL,
  DEFAULT_OPENAI_MODEL,
  getOpenAISystemPromptForHarness,
  OPENAI_HARNESS_OPTIONS,
} from '../utils/openaiConfig';
import {
  getScreenCommandPanel,
  isSymbolToken,
  normalizeCommandInput,
  parseTickerSubcommand,
  tokenizeCommand,
} from '../utils/commandParsing';

const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'JPM', 'BRK-B', 'V'];
const DEFAULT_FOREX_PAIRS = ['EUR/USD', 'USD/JPY', 'GBP/USD', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'EUR/GBP', 'DKK/EUR'];
const OBSOLETE_OVERVIEW_PROMPT_TEXTS = [
  'Combine market tone, macro interpretation, and risk framing into one concise terminal-style summary.',
  'Combine market tone, macro interpretation, and risk framing into one concise but comprehensive terminal-style summary. Use 5 to 8 bullet points max.',
  'You are writing a live market snapshot for a professional terminal user. The summary must reflect the moment it was requested and only use evidence present in the provided snapshot. Focus on the most decision-useful items across market data, macro, geopolitics, and major news. Keep the response to at most two short paragraphs. Use bullet points only when they clearly improve structure; otherwise use plain prose. Do not add long background context, advice, hype, or speculation beyond the snapshot. If the snapshot does not contain enough meaningful data for a useful summary, return exactly: "Insufficient information to generate a meaningful market snapshot right now."',
  'You are writing a live market snapshot for a professional terminal user. The summary must reflect the moment it was requested and only use evidence present in the provided snapshot. Open by stating the exact generation date and time using the provided requestContext timestamp. If requestContext.usEquitySession.status is "open", explicitly say US equity markets are open and that equity commentary is based on data available up to that time, so conditions may evolve while markets remain open. If requestContext.usEquitySession.status is "closed", explicitly say US equity markets are not open and that any equity commentary is based on the latest available data as of that timestamp. Focus on the most decision-useful items across market data, macro, geopolitics, and major news. Keep the response to at most two short paragraphs. Use bullet points only when they clearly improve structure; otherwise use plain prose. Do not add long background context, advice, hype, or speculation beyond the snapshot. Do not omit the timestamp or the market-session qualifier when discussing equities. If the snapshot does not contain enough meaningful data for a useful summary, return exactly: "Insufficient information to generate a meaningful market snapshot right now."',
] as const;
const DEFAULT_OPENAI_SYSTEM_PROMPTS = buildDefaultOpenAISystemPrompts();
const DEFAULT_OPENAI_SETTINGS: OpenAISettings = {
  model: DEFAULT_OPENAI_MODEL,
  harness: 'comprehensive',
  systemPrompt: DEFAULT_OPENAI_SYSTEM_PROMPTS.comprehensive,
  systemPrompts: DEFAULT_OPENAI_SYSTEM_PROMPTS,
  geopoliticsModel: DEFAULT_GEOPOLITICS_OPENAI_MODEL,
  geopoliticsSystemPrompt: DEFAULT_GEOPOLITICS_EVENT_SYSTEM_PROMPT,
  hasStoredApiKey: false,
};

interface NavEntry { panel: PanelType; symbol: string }

export type MultiAssetView = 'research' | 'chart';

export interface MultiAssetTile {
  id: string;
  symbol: string;
  view: MultiAssetView;
}

interface TerminalState {
  activePanel: PanelType;
  activeSymbol: string;
  debugMode: boolean;
  watchlistSidebarVisible: boolean;
  watchlist: string[];
  portfolio: PortfolioPosition[];
  commandHistory: string[];
  historyIndex: number;
  chartSymbol: string;
  chartStyle: ChartStyle;
  forexPairs: string[];
  openAISettings: OpenAISettings;
  marketOverviewSummary: AIMarketSummary | null;
  marketOverviewSummaryCollapsed: boolean;
  navHistory: NavEntry[];
  companionOpen: boolean;
  multiAssetTiles: MultiAssetTile[];

  setActivePanel: (panel: PanelType, symbol?: string) => void;
  openMultiAssetView: (symbol: string, view?: MultiAssetView) => void;
  addMultiAssetTile: (symbol: string, view?: MultiAssetView) => void;
  removeMultiAssetTile: (id: string) => void;
  setMultiAssetTileView: (id: string, view: MultiAssetView) => void;
  toggleWatchlistSidebar: () => void;
  setWatchlistSidebarVisible: (visible: boolean) => void;
  goHome: () => void;
  setChartStyle: (style: ChartStyle) => void;
  setForexPairs: (pairs: string[]) => void;
  updateOpenAISettings: (updates: Partial<OpenAISettings>) => void;
  setMarketOverviewSummary: (summary: AIMarketSummary | null) => void;
  setMarketOverviewSummaryCollapsed: (collapsed: boolean) => void;
  goBack: () => void;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  addPortfolioPosition: (pos: Omit<PortfolioPosition, 'id'>) => void;
  addPortfolioPositions: (positions: Omit<PortfolioPosition, 'id'>[]) => void;
  updatePortfolioPosition: (id: string, updates: Partial<Omit<PortfolioPosition, 'id' | 'addedAt'>>) => void;
  removePortfolioPosition: (id: string) => void;
  clearPortfolio: () => void;
  executeCommand: (cmd: string) => void;
  toggleDebugMode: () => void;
  setDebugMode: (enabled: boolean) => void;
  setCompanionOpen: (open: boolean) => void;
  toggleCompanionOpen: () => void;
}

type PersistedTerminalState = Pick<
  TerminalState,
  'watchlistSidebarVisible' | 'watchlist' | 'portfolio' | 'commandHistory' | 'activeSymbol' | 'chartStyle' | 'forexPairs' | 'openAISettings'
>;

function isObsoleteOverviewPrompt(prompt: string): boolean {
  return OBSOLETE_OVERVIEW_PROMPT_TEXTS.includes(prompt.trim() as (typeof OBSOLETE_OVERVIEW_PROMPT_TEXTS)[number]);
}

function normalizeOpenAISettings(value?: Partial<OpenAISettings> | null): OpenAISettings {
  const harness = (
    OPENAI_HARNESS_OPTIONS.some((option) => option.value === value?.harness)
      ? value?.harness
      : 'comprehensive'
  ) as OpenAISettings['harness'];
  const systemPrompts = buildDefaultOpenAISystemPrompts();

  for (const key of Object.keys(systemPrompts) as Array<keyof typeof systemPrompts>) {
    const nextValue = value?.systemPrompts?.[key];
    if (typeof nextValue === 'string') {
      const trimmed = nextValue.trim();
      if (key === 'comprehensive' && isObsoleteOverviewPrompt(trimmed)) {
        continue;
      }
      systemPrompts[key] = trimmed;
    }
  }

  if (typeof value?.systemPrompt === 'string' && typeof value?.systemPrompts?.[harness] !== 'string') {
    const trimmed = value.systemPrompt.trim();
    if (!(harness === 'comprehensive' && isObsoleteOverviewPrompt(trimmed))) {
      systemPrompts[harness] = trimmed;
    }
  }

  const rawGeopoliticsPrompt = typeof value?.geopoliticsSystemPrompt === 'string'
    ? value.geopoliticsSystemPrompt.trim()
    : '';
  const isObsoleteGeopoliticsPrompt = rawGeopoliticsPrompt.includes(
    'You classify Yahoo Finance headlines for a geopolitical event map using headline text only.'
  );
  const geopoliticsSystemPrompt = (
    !rawGeopoliticsPrompt ||
    isObsoleteGeopoliticsPrompt
  )
    ? DEFAULT_GEOPOLITICS_EVENT_SYSTEM_PROMPT
    : rawGeopoliticsPrompt;

  const rawModel = typeof value?.model === 'string' ? value.model.trim() : '';
  const hasObsoleteOverviewPrompt =
    isObsoleteOverviewPrompt(value?.systemPrompts?.comprehensive?.trim() ?? '') ||
    (harness === 'comprehensive' && typeof value?.systemPrompt === 'string' && isObsoleteOverviewPrompt(value.systemPrompt));
  const model = rawModel === 'gpt-5-mini' && hasObsoleteOverviewPrompt
    ? DEFAULT_OPENAI_MODEL
    : (rawModel || DEFAULT_OPENAI_MODEL);

  return {
    model,
    harness,
    systemPrompt: getOpenAISystemPromptForHarness(harness, systemPrompts),
    systemPrompts,
    geopoliticsModel: DEFAULT_GEOPOLITICS_OPENAI_MODEL,
    geopoliticsSystemPrompt,
    hasStoredApiKey: Boolean(value?.hasStoredApiKey),
  };
}

function normalizeAIMarketSummary(value?: Partial<AIMarketSummary> | null): AIMarketSummary | null {
  const summary = typeof value?.summary === 'string' ? value.summary.trim() : '';
  const generatedAt = typeof value?.generatedAt === 'string' ? value.generatedAt.trim() : '';
  const model = typeof value?.model === 'string' ? value.model.trim() : '';
  const harness = (
    OPENAI_HARNESS_OPTIONS.some((option) => option.value === value?.harness)
      ? value?.harness
      : 'comprehensive'
  ) as AIMarketSummary['harness'];

  if (!summary || !generatedAt || !model) return null;

  return {
    summary,
    generatedAt,
    model,
    harness,
  };
}

function createPortfolioEntry(position: Omit<PortfolioPosition, 'id'>): PortfolioPosition {
  return {
    ...position,
    id: `${position.symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

export const useTerminalStore = create<TerminalState>()(
  persist<TerminalState, [], [], PersistedTerminalState>(
    (set, get) => ({
      activePanel: 'overview',
      activeSymbol: 'AAPL',
      debugMode: false,
      watchlistSidebarVisible: true,
      chartSymbol: 'AAPL',
      watchlist: DEFAULT_WATCHLIST,
      portfolio: [],
      commandHistory: [],
      historyIndex: -1,
      chartStyle: 'candlestick',
      forexPairs: DEFAULT_FOREX_PAIRS,
      openAISettings: DEFAULT_OPENAI_SETTINGS,
      marketOverviewSummary: null,
      marketOverviewSummaryCollapsed: false,
      navHistory: [],
      companionOpen: false,
      multiAssetTiles: [],

      setActivePanel: (panel, symbol) => {
        const upper = symbol?.toUpperCase();
        const prev: NavEntry = { panel: get().activePanel, symbol: get().activeSymbol };
        set((state) => ({
          activePanel: panel,
          ...(upper ? { activeSymbol: upper, chartSymbol: upper } : {}),
          // Push to nav history (max 30 entries, avoid duplicate consecutive entries)
          navHistory: prev.panel === panel && prev.symbol === (upper ?? get().activeSymbol)
            ? state.navHistory
            : [prev, ...state.navHistory.slice(0, 29)],
        }));
      },

      openMultiAssetView: (symbol, view = 'research') => {
        const upper = symbol.trim().toUpperCase();
        if (!upper) return;
        const prev: NavEntry = { panel: get().activePanel, symbol: get().activeSymbol };
        set((state) => {
          const existingTiles = state.multiAssetTiles.length
            ? state.multiAssetTiles
            : [{ id: `${upper}-${Date.now()}`, symbol: upper, view }];
          const hasSymbol = existingTiles.some((tile) => tile.symbol === upper);
          const nextTiles = hasSymbol
            ? existingTiles.map((tile) => tile.symbol === upper ? { ...tile, view } : tile)
            : [
                ...existingTiles,
                { id: `${upper}-${Date.now()}`, symbol: upper, view },
              ].slice(0, 4);

          return {
            activePanel: 'multiAsset',
            activeSymbol: upper,
            chartSymbol: upper,
            multiAssetTiles: nextTiles,
            navHistory: prev.panel === 'multiAsset'
              ? state.navHistory
              : [prev, ...state.navHistory.slice(0, 29)],
          };
        });
      },

      addMultiAssetTile: (symbol, view = 'research') => {
        const upper = symbol.trim().toUpperCase();
        if (!upper) return;
        set((state) => {
          const existingTile = state.multiAssetTiles.find((tile) => tile.symbol === upper);
          if (existingTile) {
            return {
              activeSymbol: upper,
              chartSymbol: upper,
              multiAssetTiles: state.multiAssetTiles.map((tile) =>
                tile.id === existingTile.id ? { ...tile, view } : tile
              ),
            };
          }
          if (state.multiAssetTiles.length >= 4) return {};

          return {
            activeSymbol: upper,
            chartSymbol: upper,
            multiAssetTiles: [
              ...state.multiAssetTiles,
              { id: `${upper}-${Date.now()}`, symbol: upper, view },
            ],
          };
        });
      },

      removeMultiAssetTile: (id) => {
        set((state) => ({
          multiAssetTiles: state.multiAssetTiles.filter((tile) => tile.id !== id),
        }));
      },

      setMultiAssetTileView: (id, view) => {
        set((state) => ({
          multiAssetTiles: state.multiAssetTiles.map((tile) =>
            tile.id === id ? { ...tile, view } : tile
          ),
        }));
      },

      toggleWatchlistSidebar: () => {
        set((state) => ({ watchlistSidebarVisible: !state.watchlistSidebarVisible }));
      },

      setWatchlistSidebarVisible: (visible) => {
        set({ watchlistSidebarVisible: visible });
      },

      goHome: () => {
        set({
          activePanel: 'overview',
          navHistory: [],
        });
      },

      goBack: () => {
        const [prev, ...rest] = get().navHistory;
        if (!prev) return;
        set({
          activePanel: prev.panel,
          activeSymbol: prev.symbol,
          chartSymbol: prev.symbol,
          navHistory: rest,
        });
      },

      setChartStyle: (style) => {
        set({ chartStyle: style });
      },

      setForexPairs: (pairs) => {
        const normalizedPairs = Array.from(
          new Set(
            pairs
              .map((pair) => pair.trim().toUpperCase())
              .filter((pair) => /^[A-Z]{3}\/[A-Z]{3}$/.test(pair))
          )
        );
        set({ forexPairs: normalizedPairs.length ? normalizedPairs : DEFAULT_FOREX_PAIRS });
      },

      updateOpenAISettings: (updates) => {
        set((state) => ({
          openAISettings: (() => {
            const nextHarness = updates.harness ?? state.openAISettings.harness;
            const nextSystemPrompts = {
              ...state.openAISettings.systemPrompts,
              ...(updates.systemPrompts ?? {}),
            };

            if (typeof updates.systemPrompt === 'string') {
              nextSystemPrompts[nextHarness] = updates.systemPrompt;
            }

            return normalizeOpenAISettings({
              ...state.openAISettings,
              ...updates,
              harness: nextHarness,
              systemPrompts: nextSystemPrompts,
              systemPrompt: getOpenAISystemPromptForHarness(nextHarness, nextSystemPrompts),
            });
          })(),
        }));
      },

      setMarketOverviewSummary: (summary) => {
        const normalizedSummary = normalizeAIMarketSummary(summary);
        set({
          marketOverviewSummary: normalizedSummary,
          marketOverviewSummaryCollapsed: false,
        });
      },

      setMarketOverviewSummaryCollapsed: (collapsed) => {
        set({ marketOverviewSummaryCollapsed: collapsed });
      },

      addToWatchlist: (symbol) => {
        const s = symbol.toUpperCase();
        if (!get().watchlist.includes(s)) {
          set((state) => ({ watchlist: [...state.watchlist, s] }));
        }
      },

      removeFromWatchlist: (symbol) => {
        const s = symbol.toUpperCase();
        set((state) => ({ watchlist: state.watchlist.filter((w) => w !== s) }));
      },

      addPortfolioPosition: (pos) => {
        set((state) => ({ portfolio: [...state.portfolio, createPortfolioEntry(pos)] }));
      },

      addPortfolioPositions: (positions) => {
        if (!positions.length) return;
        set((state) => ({
          portfolio: [...state.portfolio, ...positions.map((position) => createPortfolioEntry(position))],
        }));
      },

      updatePortfolioPosition: (id, updates) => {
        set((state) => ({
          portfolio: state.portfolio.map((position) =>
            position.id === id
              ? {
                  ...position,
                  ...updates,
                }
              : position
          ),
        }));
      },

      removePortfolioPosition: (id) => {
        set((state) => ({ portfolio: state.portfolio.filter((p) => p.id !== id) }));
      },

      clearPortfolio: () => {
        set({ portfolio: [] });
      },

      executeCommand: (raw) => {
        const cmd = normalizeCommandInput(raw);
        if (!cmd) return;

        set((state) => ({
          commandHistory: [cmd, ...state.commandHistory.slice(0, 49)],
          historyIndex: -1,
        }));

        const { setActivePanel } = get();
        const mainPanel = getScreenCommandPanel(cmd);
        if (mainPanel) {
          if (mainPanel === 'overview') {
            get().goHome();
            return;
          }
          setActivePanel(mainPanel);
          return;
        }

        const tickerCommand = parseTickerSubcommand(cmd);
        if (tickerCommand) {
          const { symbol, subcommand } = tickerCommand;
          if (['EQ', 'US', 'EQUITY'].includes(subcommand)) { setActivePanel('equity', symbol); return; }
          if (['GP', 'CHART', 'G'].includes(subcommand)) { setActivePanel('chart', symbol); return; }
          if (['N', 'NEWS'].includes(subcommand)) { setActivePanel('news', symbol); return; }
          if (['WL', 'ADD'].includes(subcommand)) { get().addToWatchlist(symbol); return; }
        }

        // Bare ticker
        const parts = tokenizeCommand(cmd);
        if (parts.length === 1 && isSymbolToken(parts[0])) {
          setActivePanel('equity', parts[0]);
        }
      },

      toggleDebugMode: () => {
        const nextEnabled = !get().debugMode;
        set({ debugMode: nextEnabled });
      },

      setDebugMode: (enabled) => {
        const nextEnabled = Boolean(enabled);
        set({ debugMode: nextEnabled });
      },

      setCompanionOpen: (open) => {
        set({ companionOpen: open });
      },

      toggleCompanionOpen: () => {
        set((state) => ({ companionOpen: !state.companionOpen }));
      },
    }),
    {
      name: TERMINAL_STORAGE_KEY,
      storage: createJSONStorage<PersistedTerminalState>(() => terminalStateStorage),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<PersistedTerminalState>;
        return {
          ...currentState,
          ...persisted,
          debugMode: false,
          openAISettings: normalizeOpenAISettings(persisted.openAISettings),
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.updateOpenAISettings({ hasStoredApiKey: state.openAISettings.hasStoredApiKey });
      },
      partialize: (state): PersistedTerminalState => ({
        watchlistSidebarVisible: state.watchlistSidebarVisible,
        watchlist: state.watchlist,
        portfolio: state.portfolio,
        commandHistory: state.commandHistory,
        activeSymbol: state.activeSymbol,
        chartStyle: state.chartStyle,
        forexPairs: state.forexPairs,
        openAISettings: state.openAISettings,
      }),
    }
  )
);
