import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, KeyRound, Link2, Palette, Settings2 } from 'lucide-react';
import {
  deleteConnectionSecret,
  fetchConnectionStatuses,
  storeConnectionSecret,
} from '../api/finance';
import { useTerminalStore } from '../store/useTerminalStore';
import type { ConnectionProvider } from '../types';
import {
  buildDefaultOpenAISystemPrompts,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OVERVIEW_SUMMARY_SYSTEM_PROMPT,
  OPENAI_MODEL_OPTIONS,
} from '../utils/openaiConfig';
import { THEME_ACCENT_OPTIONS, useTheme, type ThemeAccent } from '../utils/theme';

type ProviderDraftState = Record<ConnectionProvider, string>;
type ProviderVisibilityState = Record<ConnectionProvider, boolean>;

const PROVIDER_LABELS: Record<ConnectionProvider, string> = {
  openai: 'OpenAI',
  fred: 'FRED',
  finnhub: 'Finnhub',
};

const DEFAULT_PROVIDER_DRAFTS: ProviderDraftState = {
  openai: '',
  fred: '',
  finnhub: '',
};

const DEFAULT_PROVIDER_VISIBILITY: ProviderVisibilityState = {
  openai: false,
  fred: false,
  finnhub: false,
};

const PROVIDER_CARDS: Array<{
  provider: ConnectionProvider;
  title: string;
  placeholder: string;
  description: string;
  coverage: string;
  apiKeyUrl: string;
}> = [
  {
    provider: 'openai',
    title: 'OpenAI',
    placeholder: 'sk-...',
    description: 'Used for overview summaries, the general research companion, geopolitics extraction, and OPPS AI guidance.',
    coverage: 'Optional. Public/no-key sources still work without it.',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    provider: 'fred',
    title: 'FRED',
    placeholder: 'FRED API key',
    description: 'Used for macro dashboard series, release dates, and US macro calendar enrichment.',
    coverage: 'Needed for full macro coverage.',
    apiKeyUrl: 'https://fredaccount.stlouisfed.org/apikeys',
  },
  {
    provider: 'finnhub',
    title: 'Finnhub',
    placeholder: 'Finnhub API key',
    description: 'Used for earnings calendar support inside the macro and overview calendar flows.',
    coverage: 'Optional. Static policy events and any available FRED data can still load without it.',
    apiKeyUrl: 'https://finnhub.io/dashboard',
  },
];

const formatAccentRgb = (rgb: string) => `rgb(${rgb.trim().replace(/\s+/g, ', ')})`;

export function SettingsPanel() {
  const queryClient = useQueryClient();
  const { openAISettings, updateOpenAISettings, setActivePanel } = useTerminalStore();
  const { accent, setAccentPreference } = useTheme();
  const selectedAccent = THEME_ACCENT_OPTIONS.find((option) => option.key === accent) ?? THEME_ACCENT_OPTIONS[0];
  const [draftModel, setDraftModel] = useState(openAISettings.model);
  const [draftSummaryPrompt, setDraftSummaryPrompt] = useState(
    openAISettings.systemPrompts.comprehensive || DEFAULT_OVERVIEW_SUMMARY_SYSTEM_PROMPT
  );
  const [draftSecrets, setDraftSecrets] = useState<ProviderDraftState>(DEFAULT_PROVIDER_DRAFTS);
  const [visibleSecrets, setVisibleSecrets] = useState<ProviderVisibilityState>(DEFAULT_PROVIDER_VISIBILITY);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [connectionsMessage, setConnectionsMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraftModel(openAISettings.model);
    setDraftSummaryPrompt(openAISettings.systemPrompts.comprehensive || DEFAULT_OVERVIEW_SUMMARY_SYSTEM_PROMPT);
  }, [openAISettings]);

  const { data: connectionStatus } = useQuery({
    queryKey: ['connection-status'],
    queryFn: fetchConnectionStatuses,
    staleTime: 30000,
  });

  useEffect(() => {
    if (typeof connectionStatus?.openai === 'boolean' && connectionStatus.openai !== openAISettings.hasStoredApiKey) {
      updateOpenAISettings({ hasStoredApiKey: connectionStatus.openai });
    }
  }, [connectionStatus?.openai, openAISettings.hasStoredApiKey, updateOpenAISettings]);

  const connectionMutation = useMutation({
    mutationFn: async ({
      provider,
      secret,
      action,
    }: {
      provider: ConnectionProvider;
      secret?: string;
      action: 'save' | 'delete';
    }) => {
      if (action === 'save') {
        const nextSecret = secret?.trim() ?? '';
        if (!nextSecret) throw new Error(`${PROVIDER_LABELS[provider]} credential is required.`);
        return storeConnectionSecret(provider, nextSecret);
      }

      return deleteConnectionSecret(provider);
    },
    onSuccess: async (_payload, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['connection-status'] });
      await queryClient.invalidateQueries({ queryKey: ['openai-key-status'] });
      if (variables.provider === 'openai') {
        updateOpenAISettings({ hasStoredApiKey: variables.action === 'save' });
      }
      if (variables.action === 'save') {
        setDraftSecrets((current) => ({ ...current, [variables.provider]: '' }));
      }
      setConnectionsMessage(
        variables.action === 'save'
          ? `${PROVIDER_LABELS[variables.provider]} credential saved locally on this machine.`
          : `${PROVIDER_LABELS[variables.provider]} credential removed from this machine.`
      );
    },
    onError: (error) => {
      setConnectionsMessage(error instanceof Error ? error.message : 'Unable to update the selected connection right now.');
    },
  });

  const providerStatus = useMemo(
    () => ({
      openai: Boolean(connectionStatus?.openai),
      fred: Boolean(connectionStatus?.fred),
      finnhub: Boolean(connectionStatus?.finnhub),
    }),
    [connectionStatus]
  );

  const handleSaveSettings = () => {
    const defaultPrompts = buildDefaultOpenAISystemPrompts();
    const overviewSummaryPrompt = draftSummaryPrompt.trim() || DEFAULT_OVERVIEW_SUMMARY_SYSTEM_PROMPT;
    const nextSystemPrompts = {
      ...defaultPrompts,
      comprehensive: overviewSummaryPrompt,
    };

    updateOpenAISettings({
      model: draftModel.trim() || DEFAULT_OPENAI_MODEL,
      harness: 'comprehensive',
      systemPrompts: nextSystemPrompts,
      systemPrompt: overviewSummaryPrompt,
    });

    setSettingsMessage('AI preferences saved locally. Provider credentials remain stored separately on this machine.');
  };

  const handleAccentChange = (nextAccent: ThemeAccent) => {
    setAccentPreference(nextAccent === 'blue' ? null : nextAccent);
  };

  return (
    <div className="h-full overflow-y-auto p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 size={14} className="text-terminal-accent" />
            <h1 className="text-terminal-accent font-bold text-sm tracking-wider">CONNECTIONS & AI SETTINGS</h1>
          </div>
          <p className="text-terminal-faint text-xs mt-1 leading-relaxed">
            Charlie runs public/no-key sources out of the box. Add your own OpenAI, FRED, and Finnhub
            credentials below to unlock the keyed workflows on this device.
          </p>
        </div>

        <button
          onClick={() => setActivePanel('overview')}
          className="px-3 py-1.5 text-xs rounded border border-terminal-border text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors"
        >
          BACK TO OVERVIEW
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
        <div className="space-y-4">
          <div className="bg-terminal-panel border border-terminal-border rounded p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Link2 size={13} className="text-terminal-accent" />
              <div>
                <div className="text-terminal-muted text-xs font-bold tracking-wider">CONNECTIONS</div>
                <div className="text-terminal-faint text-xs mt-1">Each credential is optional and stored locally per machine.</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {PROVIDER_CARDS.map(({ provider, title, placeholder, description, coverage, apiKeyUrl }) => {
                const isConfigured = providerStatus[provider];
                const isBusy = connectionMutation.isPending;

                return (
                  <section key={provider} className="rounded border border-terminal-border bg-terminal-elevated p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-terminal-text text-sm font-bold">{title}</div>
                        <div className="text-terminal-muted text-xs mt-1 leading-relaxed">{description}</div>
                        <a
                          href={apiKeyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 mt-2 text-[11px] text-terminal-blue hover:underline"
                        >
                          <Link2 size={11} />
                          API key page
                        </a>
                      </div>
                      <span className={isConfigured ? 'text-terminal-positive text-xs' : 'text-terminal-negative text-xs'}>
                        {isConfigured ? 'Configured' : 'Missing'}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type={visibleSecrets[provider] ? 'text' : 'password'}
                        value={draftSecrets[provider]}
                        onChange={(event) => {
                          setDraftSecrets((current) => ({ ...current, [provider]: event.target.value }));
                          setConnectionsMessage(null);
                        }}
                        placeholder={isConfigured ? `${title} credential already stored. Paste a new value to replace it.` : placeholder}
                        className="flex-1 bg-terminal-panel border border-terminal-border rounded px-3 py-2 text-xs text-terminal-text placeholder-terminal-faint focus:outline-none focus:border-terminal-accent/50"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                      />
                      <button
                        onClick={() => setVisibleSecrets((current) => ({ ...current, [provider]: !current[provider] }))}
                        className="px-3 py-2 text-xs rounded border border-terminal-border text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors"
                      >
                        {visibleSecrets[provider] ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>

                    <div className="text-terminal-faint text-[11px] leading-relaxed">{coverage}</div>

                    <div className="flex items-center justify-between gap-3">
                      <button
                        onClick={() => {
                          setConnectionsMessage(null);
                          void connectionMutation.mutateAsync({
                            provider,
                            secret: draftSecrets[provider],
                            action: 'save',
                          });
                        }}
                        disabled={isBusy}
                        className="px-3 py-1.5 rounded border border-terminal-accent/40 bg-terminal-accent/10 text-terminal-accent text-xs hover:bg-terminal-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        SAVE
                      </button>
                      {isConfigured && (
                        <button
                          onClick={() => {
                            setConnectionsMessage(null);
                            void connectionMutation.mutateAsync({ provider, action: 'delete' });
                          }}
                          disabled={isBusy}
                          className="text-xs text-terminal-faint hover:text-terminal-negative transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          REMOVE
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="text-terminal-faint text-xs">
              {connectionsMessage ?? 'Public data sources continue to work without credentials. Keyed sources activate only after you add your own connection.'}
            </div>
          </div>
        </div>

        <div>
          <div className="bg-terminal-panel border border-terminal-border rounded p-4 space-y-4 mb-4">
            <div className="flex items-center gap-2">
              <Palette size={13} className="text-terminal-accent" />
              <div>
                <div className="text-terminal-muted text-xs font-bold tracking-wider">APPEARANCE</div>
                <div className="text-terminal-faint text-xs mt-1">Brand accent color for the shell, charts, controls, and highlights.</div>
              </div>
            </div>

            <div className="rounded border border-terminal-border bg-terminal-elevated px-3 py-3 space-y-3">
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex h-8 w-8 rounded border border-terminal-border"
                  style={{
                    backgroundColor: 'var(--terminal-accent)',
                    boxShadow: '0 0 18px rgb(var(--terminal-accent-rgb) / 0.18)',
                  }}
                  aria-hidden="true"
                />
                <div>
                  <div className="text-terminal-text text-xs font-bold tracking-wider">
                    {selectedAccent.label.toUpperCase()}
                  </div>
                  <div className="text-terminal-faint text-[11px] mt-1">
                    {selectedAccent.description}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {THEME_ACCENT_OPTIONS.map((option) => {
                  const isActive = option.key === accent;
                  return (
                    <button
                      key={option.key}
                      onClick={() => handleAccentChange(option.key)}
                      className={`flex items-center gap-2 rounded border px-2.5 py-2 text-left transition-colors ${
                        isActive
                          ? 'border-terminal-accent/60 bg-terminal-accent/12 text-terminal-accent'
                          : 'border-terminal-border bg-terminal-panel text-terminal-muted hover:border-terminal-accent/40 hover:bg-terminal-hover hover:text-terminal-accent'
                      }`}
                      aria-pressed={isActive}
                    >
                      <span
                        className="inline-flex h-4 w-4 flex-shrink-0 rounded-sm border border-terminal-border"
                        style={{ backgroundColor: formatAccentRgb(option.darkRgb) }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block text-[11px] font-bold tracking-[0.12em]">{option.label.toUpperCase()}</span>
                        <span className="block truncate text-[10px] opacity-70">
                          {option.key === 'blue' ? 'Default' : option.key === 'yellow' ? 'Classic' : 'Accent'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-terminal-panel border border-terminal-border rounded p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Bot size={13} className="text-terminal-accent" />
              <div>
                <div className="text-terminal-muted text-xs font-bold tracking-wider">AI PREFERENCES</div>
                <div className="text-terminal-faint text-xs mt-1">Model and prompt controls for the overview summary flow.</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.3fr] gap-4">
              <div>
                <label className="flex items-center gap-2 text-terminal-muted text-xs font-bold tracking-wider mb-2">
                  <KeyRound size={12} />
                  OVERVIEW MODEL
                </label>
                <select
                  value={OPENAI_MODEL_OPTIONS.includes(draftModel as (typeof OPENAI_MODEL_OPTIONS)[number]) ? draftModel : DEFAULT_OPENAI_MODEL}
                  onChange={(event) => {
                    setDraftModel(event.target.value);
                    setSettingsMessage(null);
                  }}
                  className="w-full bg-terminal-elevated border border-terminal-border rounded px-3 py-2 text-xs text-terminal-text focus:outline-none focus:border-terminal-accent/50"
                >
                  {OPENAI_MODEL_OPTIONS.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-terminal-muted text-xs font-bold tracking-wider mb-2">
                  OVERVIEW SUMMARY SYSTEM PROMPT
                </label>
                <textarea
                  value={draftSummaryPrompt}
                  onChange={(event) => {
                    setDraftSummaryPrompt(event.target.value);
                    setSettingsMessage(null);
                  }}
                  className="min-h-[10rem] w-full resize-y bg-terminal-elevated border border-terminal-border rounded px-3 py-2 text-xs text-terminal-text placeholder-terminal-faint focus:outline-none focus:border-terminal-accent/50"
                  placeholder="Enter the system prompt used to generate the overview AI summary."
                />
                <div className="mt-1 text-[11px] text-terminal-faint">
                  This prompt only affects Overview summary generation.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-terminal-faint text-xs">
                {settingsMessage ?? 'AI preferences are persisted locally.'}
              </div>
              <button
                onClick={handleSaveSettings}
                className="px-3 py-1.5 rounded border border-terminal-accent/40 bg-terminal-accent/10 text-terminal-accent text-xs hover:bg-terminal-accent/20 transition-colors"
              >
                SAVE AI PREFS
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
