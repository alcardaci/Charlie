import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { HelpContent } from './HelpPanel';
import { deleteConnectionSecret, fetchConnectionStatuses, storeConnectionSecret } from '../api/finance';
import { useTerminalStore } from '../store/useTerminalStore';
import type { ConnectionProvider, ConnectionStatusMap } from '../types';
import { DEFAULT_OVERVIEW_SUMMARY_SYSTEM_PROMPT, OPENAI_MODEL_OPTIONS } from '../utils/openaiConfig';
import { useAppVersion } from '../utils/appVersion';

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', purpose: 'Overview summaries, the AI companion and event map analysis.', url: 'https://platform.openai.com/api-keys' },
  { id: 'fred', name: 'FRED', purpose: 'Economic indicators and release dates.', url: 'https://fredaccount.stlouisfed.org/apikeys' },
  { id: 'finnhub', name: 'Finnhub', purpose: 'Company earnings dates in the calendar.', url: 'https://finnhub.io/dashboard' },
] as const;

const fieldClass = 'min-w-0 rounded border border-terminal-border bg-terminal-elevated px-2.5 py-1.5 text-xs text-terminal-text focus:border-terminal-accent';
const buttonClass = 'rounded border border-terminal-border px-2.5 py-1.5 text-xs text-terminal-muted hover:border-terminal-accent hover:text-terminal-text disabled:opacity-50';
const saveClass = 'rounded border border-terminal-accent/40 bg-terminal-accent/10 px-2.5 py-1.5 text-xs text-terminal-accent hover:bg-terminal-accent/20 disabled:opacity-50';
const rowClass = 'border-b border-[color:var(--section-rule-color)] last:border-b-0';
const tabs = [{ id: 'preferences', label: 'Preferences' }, { id: 'help', label: 'Help & Shortcuts' }] as const;

type KeyChange = { provider: ConnectionProvider; action: 'save'; secret: string } | { provider: ConnectionProvider; action: 'remove' };

function Connections() {
  const queryClient = useQueryClient();
  const hasOpenAIKey = useTerminalStore(state => state.openAISettings.hasStoredApiKey);
  const updateOpenAISettings = useTerminalStore(state => state.updateOpenAISettings);
  const [drafts, setDrafts] = useState<Partial<Record<ConnectionProvider, string>>>({});
  const [visible, setVisible] = useState<Partial<Record<ConnectionProvider, boolean>>>({});
  const statuses = useQuery({ queryKey: ['connection-status'], queryFn: fetchConnectionStatuses, staleTime: 30_000 });

  const openai = statuses.data?.openai;
  useEffect(() => {
    if (!statuses.isError && typeof openai === 'boolean' && openai !== hasOpenAIKey) {
      updateOpenAISettings({ hasStoredApiKey: openai });
    }
  }, [openai, statuses.isError, hasOpenAIKey, updateOpenAISettings]);

  const change = useMutation({
    mutationFn: (request: KeyChange) => request.action === 'save'
      ? storeConnectionSecret(request.provider, request.secret)
      : deleteConnectionSecret(request.provider),
    onSuccess: async ({ configured }, { provider }) => {
      setDrafts(current => ({ ...current, [provider]: '' }));
      setVisible(current => ({ ...current, [provider]: false }));
      queryClient.setQueryData<ConnectionStatusMap>(['connection-status'], current => current && { ...current, [provider]: configured });
      if (provider === 'openai') {
        updateOpenAISettings({ hasStoredApiKey: configured });
        queryClient.setQueryData(['openai-key-status'], { configured });
      }
      await queryClient.invalidateQueries({ queryKey: ['connection-status'] });
    },
  });

  return <section aria-labelledby="connections-title">
    <h2 id="connections-title" className="instrument-heading text-xs font-bold">API CONNECTIONS</h2>
    <p className="my-2 text-xs text-terminal-muted">Optional keys are stored on this device.</p>
    {statuses.isError && <p role="status" className="mb-1 text-xs text-terminal-muted">
      Couldn’t check saved keys.{' '}
      <button type="button" className="text-terminal-accent underline" onClick={() => void statuses.refetch()}>Retry</button>
    </p>}
    {PROVIDERS.map(({ id, name, purpose, url }) => {
      const configured = statuses.isError ? undefined : statuses.data?.[id];
      const status = typeof configured === 'boolean' ? (configured ? 'Key saved' : 'No key') : statuses.isPending ? 'Checking…' : 'Unavailable';
      const draft = drafts[id] ?? '';
      const activeChange = change.variables?.provider === id ? change.variables : undefined;
      const keyInputId = 'settings-key-' + id;

      return <details key={id} className={'group ' + rowClass} onToggle={event => {
        if (!event.currentTarget.open) setVisible(current => ({ ...current, [id]: false }));
      }}>
        <summary aria-label={'Manage ' + name + ' connection'} aria-describedby={keyInputId + '-purpose ' + keyInputId + '-status'}
          className="flex cursor-pointer list-none items-center gap-2 py-3 hover:text-terminal-accent [&::-webkit-details-marker]:hidden">
          <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-terminal-muted group-open:rotate-90" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">{name}</span>
            <span id={keyInputId + '-purpose'} className="block text-xs leading-relaxed text-terminal-muted">{purpose}</span>
          </span>
          <span id={keyInputId + '-status'} className={'shrink-0 text-xs ' + (configured ? 'text-terminal-positive' : 'text-terminal-faint')}>{status}</span>
        </summary>
        <form className="space-y-2 pb-3 pl-5" onSubmit={event => {
          event.preventDefault();
          if (draft.trim() && !change.isPending) change.mutate({ provider: id, action: 'save', secret: draft.trim() });
        }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <label htmlFor={keyInputId} className="text-terminal-muted">{configured ? 'Replace API key' : 'API key'}</label>
            <a href={url} target="_blank" rel="noreferrer" aria-label={'Get ' + name + ' API key'} className="inline-flex items-center gap-1 text-terminal-accent hover:underline">
              Get API key <ExternalLink size={11} aria-hidden="true" />
            </a>
          </div>
          <div className="flex items-center gap-1.5">
            <input id={keyInputId} type={visible[id] ? 'text' : 'password'} aria-label={name + ' API key'} value={draft}
              autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} disabled={change.isPending}
              className={'w-full flex-1 ' + fieldClass} onChange={event => {
                setDrafts(current => ({ ...current, [id]: event.target.value }));
                if (activeChange) change.reset();
              }} />
            <button type="button" aria-label={(visible[id] ? 'Hide ' : 'Show ') + name + ' key'}
              className={buttonClass} onClick={() => setVisible(current => ({ ...current, [id]: !current[id] }))}>{visible[id] ? 'Hide' : 'Show'}</button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={saveClass} aria-label={'Save ' + name + ' key'} disabled={change.isPending || !draft.trim()}>Save key</button>
            {configured && <button type="button" className="text-xs text-terminal-muted hover:text-terminal-negative disabled:opacity-50"
              aria-label={'Remove ' + name + ' key'} onClick={() => change.mutate({ provider: id, action: 'remove' })} disabled={change.isPending}>Remove key</button>}
            {activeChange && <span role="status" className="text-xs text-terminal-muted">
              {change.isPending ? 'Updating…' : change.isError ? 'Couldn’t update the key. Try again.' : change.isSuccess
                ? (activeChange.action === 'save' ? 'Key saved.' : 'Key removed.') : ''}
            </span>}
          </div>
        </form>
      </details>;
    })}
  </section>;
}

function SummaryPreferences() {
  const { model, systemPrompts } = useTerminalStore(state => state.openAISettings);
  const updateOpenAISettings = useTerminalStore(state => state.updateOpenAISettings);
  const [modelEdit, setModelEdit] = useState<string | null>(null);
  const [promptEdit, setPromptEdit] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savedPrompt = systemPrompts.comprehensive || DEFAULT_OVERVIEW_SUMMARY_SYSTEM_PROMPT;
  const draftModel = modelEdit ?? model;
  const draftPrompt = promptEdit ?? savedPrompt;
  const dirty = draftModel !== model || draftPrompt !== savedPrompt;
  const models = Array.from(new Set([model, ...OPENAI_MODEL_OPTIONS]));

  return <form aria-labelledby="summary-preferences-title" className="space-y-4" onSubmit={event => {
    event.preventDefault();
    const prompt = draftPrompt.trim() || DEFAULT_OVERVIEW_SUMMARY_SYSTEM_PROMPT;
    updateOpenAISettings({ model: draftModel, harness: 'comprehensive', systemPrompt: prompt });
    setModelEdit(null);
    setPromptEdit(null);
    setSaved(true);
  }}>
    <h2 id="summary-preferences-title" className="instrument-heading text-xs font-bold">OVERVIEW AI SUMMARY</h2>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label htmlFor="settings-model" className="text-xs text-terminal-muted">Overview model</label>
      <select id="settings-model" className={'max-w-full sm:max-w-[70%] ' + fieldClass} value={draftModel}
        onChange={event => { setModelEdit(event.target.value); setSaved(false); }}>
        {models.map(option => <option value={option} key={option}>{option}</option>)}
      </select>
    </div>
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-terminal-text hover:text-terminal-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} aria-hidden="true" className="group-open:rotate-90" />Summary instructions
      </summary>
      <textarea aria-label="Overview summary instructions" value={draftPrompt} rows={7}
        onChange={event => { setPromptEdit(event.target.value); setSaved(false); }}
        className={'mt-2 w-full resize-y leading-relaxed ' + fieldClass} />
      <button type="button" className="text-xs text-terminal-accent hover:underline" disabled={draftPrompt === DEFAULT_OVERVIEW_SUMMARY_SYSTEM_PROMPT}
        onClick={() => { setPromptEdit(DEFAULT_OVERVIEW_SUMMARY_SYSTEM_PROMPT); setSaved(false); }}>Use default instructions</button>
    </details>
    <div className="flex items-center gap-3">
      <button type="submit" className={saveClass} disabled={!dirty}>Save preferences</button>
      {saved && <span role="status" className="text-xs text-terminal-muted">Preferences saved.</span>}
    </div>
  </form>;
}

export function SettingsPanel() {
  const tab = useTerminalStore(state => state.settingsTab);
  const setActivePanel = useTerminalStore(state => state.setActivePanel);
  const appVersion = useAppVersion();
  return <>
    <WorkspaceHeader title="SETTINGS">
      {appVersion && <span className="text-xs text-terminal-faint">{appVersion}</span>}
    </WorkspaceHeader>
    <div role="tablist" aria-label="Settings views" className="flex shrink-0 gap-1 px-4 py-2">
      {tabs.map(({ id, label }) => <button key={id} type="button" role="tab"
        id={'settings-tab-' + id} aria-controls={'settings-view-' + id} aria-selected={tab === id}
        tabIndex={tab === id ? 0 : -1} onClick={() => setActivePanel('settings', undefined, id)}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const other = id === 'help' ? 'preferences' : 'help';
          const next = event.key === 'Home' ? 'preferences' : event.key === 'End' ? 'help' : other;
          document.getElementById('settings-tab-' + next)?.focus();
          setActivePanel('settings', undefined, next);
        }}
        className={'rounded border px-2.5 py-1 text-xs ' + (tab === id
          ? 'border-terminal-accent/50 bg-terminal-accent/10 text-terminal-accent'
          : 'border-transparent text-terminal-muted hover:bg-terminal-hover hover:text-terminal-text')}>
        {label}
      </button>)}
    </div>
    <div role="tabpanel" id="settings-view-preferences" aria-labelledby="settings-tab-preferences"
      hidden={tab !== 'preferences'} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="max-w-3xl space-y-6">
        <Connections />
        <div className="border-t border-[color:var(--section-rule-color)] pt-5"><SummaryPreferences /></div>
      </div>
    </div>
    <div role="tabpanel" id="settings-view-help" aria-labelledby="settings-tab-help"
      hidden={tab !== 'help'} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto p-4">
      <HelpContent />
    </div>
  </>;
}
