import { useId, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { earningsCallsQuery } from '../api/earningsCalls';
import type { EarningsCallEvent } from '../types/earningsCalls';
import { CallBrief } from './EarningsCallAnalytics';
import { CallTrends } from './EarningsCallTrends';
import { AnalystQuestions } from './EarningsCallQuestions';
import { Transcript, type TranscriptRange } from './EarningsCallTranscript';
import { Loading, ReadError } from './EarningsCallReadState';

const buttonClass = 'rounded border border-terminal-border bg-terminal-elevated px-2.5 py-1 text-xs text-terminal-text hover:border-terminal-accent disabled:opacity-60';
const linkClass = 'inline-flex items-center gap-1 text-terminal-accent underline underline-offset-2';
const callDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const callTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

function formatCallDate(call: EarningsCallEvent) {
  if (!call.callDate) return '';
  const date = new Date(call.callDate);
  if (!Number.isFinite(date.getTime())) return '';
  if (call.callDateIsPeriodEnd) return 'Period ended ' + callDay.format(date);
  if (date.getUTCHours() || date.getUTCMinutes()) return callDay.format(date) + ' · ' + callTime.format(date) + ' UTC';
  return callDay.format(date);
}

function quarter(call: EarningsCallEvent) {
  return call.fiscalQuarter && call.fiscalYear ? 'Q' + call.fiscalQuarter + ' FY' + call.fiscalYear : '';
}

export function EarningsCalls({ symbol, initialCall }: { symbol: string; initialCall?: EarningsCallEvent }) {
  return <section aria-label="Earnings calls" className="space-y-4 p-3 sm:p-4">
    {initialCall
      ? <CallReader key={initialCall.id} call={initialCall} initialTab="transcript" />
      : <CompanyCallHistory key={symbol} symbol={symbol} />}
  </section>;
}

function CompanyCallHistory({ symbol }: { symbol: string }) {
  const [selectedId, setSelectedId] = useState('');
  const history = useInfiniteQuery(earningsCallsQuery(symbol));
  const pages = history.data?.pages ?? [];
  const calls = Array.from(new Map(pages.flatMap(page => page.data).map(call => [call.id, call])).values());
  const selected = calls.find(call => call.id === selectedId) ?? calls.find(call => call.hasTranscript) ?? calls[0];
  const stalePage = pages.find(page => page.stale);

  return <>
    <div className="flex flex-wrap items-center gap-3">
      {calls.length > 0 && <label className="flex min-w-0 max-w-full items-center gap-2 text-xs text-terminal-muted">
        Fiscal quarter
        <select aria-label="Fiscal quarter" className="min-w-0 max-w-full rounded border border-terminal-border bg-terminal-elevated px-2 py-1 text-terminal-text"
          value={selected?.id} onChange={event => setSelectedId(event.target.value)}>
          {calls.map(call => <option key={call.id} value={call.id}>
            {[quarter(call) || call.title || 'Earnings call', formatCallDate(call), !call.hasTranscript && 'No transcript'].filter(Boolean).join(' · ')}
          </option>)}
        </select>
      </label>}
      {history.hasNextPage && !history.isFetchNextPageError && <button type="button" className={buttonClass} disabled={history.isFetching} onClick={() => void history.fetchNextPage()}>
        {history.isFetchingNextPage ? 'Loading earlier calls…' : 'Load earlier calls'}
      </button>}
      <span className="text-xs text-terminal-faint">Source · Equibles</span>
    </div>
    {history.isPending && <Loading>Loading earnings calls…</Loading>}
    {history.error && <ReadError error={history.error} retry={() => history.isFetchNextPageError ? void history.fetchNextPage() : void history.refetch()} />}
    {stalePage && <p role="status" className="text-xs text-terminal-muted">{stalePage.notice || 'Showing cached call history.'}</p>}
    {!selected && history.isSuccess && <p className="text-sm text-terminal-muted">Equibles has no earnings calls listed for {symbol}.</p>}
    {selected && <CallReader call={selected} initialTab="brief" />}
  </>;
}

const callTabs = [
  { id: 'brief', label: 'Call Brief' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'questions', label: 'Analyst Q&A' },
  { id: 'trends', label: 'Trends' },
] as const;
type CallTab = (typeof callTabs)[number]['id'];

function CallReader({ call, initialTab }: { call: EarningsCallEvent; initialTab: CallTab }) {
  const id = useId();
  const [tab, setTab] = useState<CallTab>(initialTab);
  const [target, setTarget] = useState<{ eventId: string; range: TranscriptRange } | null>(null);
  function openTranscript(range: TranscriptRange) {
    setTarget({ eventId: call.id, range });
    setTab('transcript');
    document.getElementById(id + '-tab-transcript')?.focus({ preventScroll: true });
  }
  return <article className="space-y-4">
    <header className="space-y-2 border-b border-terminal-border pb-3">
      <h3 className="instrument-heading text-sm font-bold text-terminal-text">{call.title || [call.ticker, quarter(call), 'Earnings call'].filter(Boolean).join(' ')}</h3>
      <p className="text-xs text-terminal-muted">{[quarter(call), formatCallDate(call), call.statusName || call.status].filter(Boolean).join(' · ')}</p>
      {(call.presentationOnly || call.partialRecording) && <p className="text-xs text-terminal-muted">
        {[call.presentationOnly && 'Prepared remarks only', call.partialRecording && 'Partial recording'].filter(Boolean).join(' · ')}
      </p>}
      {(call.hasAudio || call.webcastUrl || call.hasSlides) && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {call.hasAudio && (call.replayUrl
          ? <a className={linkClass} href={call.replayUrl} target="_blank" rel="noopener noreferrer">Listen on Equibles <ExternalLink size={11} /></a>
          : <span className="text-terminal-muted">Equibles lists a recording without a replay link.</span>)}
        {call.webcastUrl && <a className={linkClass} href={call.webcastUrl} target="_blank" rel="noopener noreferrer">Company webcast <ExternalLink size={11} /></a>}
        {call.hasSlides && (call.slidesUrl
          ? <a className={linkClass} href={call.slidesUrl} target="_blank" rel="noopener noreferrer">Presentation slides <ExternalLink size={11} /></a>
          : <span className="text-terminal-muted">Equibles lists slides without a presentation link.</span>)}
      </div>}
    </header>
    <div role="tablist" aria-label="Earnings call views" className="flex flex-wrap gap-1 border-b border-terminal-border pb-2">
      {callTabs.map(({ id: key, label }, index) => <button type="button" role="tab" key={key}
        id={id + '-tab-' + key} aria-controls={id + '-view-' + key} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
        onClick={() => { setTarget(null); setTab(key); }}
        onKeyDown={event => {
          // Browse labels with the arrows. Enter or Space opens the tab and loads its data.
          const last = callTabs.length - 1;
          const next = { ArrowLeft: (index + last) % callTabs.length, ArrowRight: (index + 1) % callTabs.length, Home: 0, End: last }[event.key];
          if (next === undefined) return;
          event.preventDefault();
          document.getElementById(id + '-tab-' + callTabs[next].id)?.focus();
        }}
        className={'rounded border px-2.5 py-1 text-xs font-medium focus-visible:outline-terminal-accent ' + (tab === key
          ? 'border-terminal-accent/50 bg-terminal-accent/10 text-terminal-accent'
          : 'border-transparent text-terminal-muted hover:bg-terminal-hover hover:text-terminal-text')}>
        {label}
      </button>)}
    </div>
    {callTabs.map(({ id: key }) => <div key={key} id={id + '-view-' + key} role="tabpanel" aria-labelledby={id + '-tab-' + key} hidden={tab !== key} tabIndex={0}>
      {tab === key && key === 'brief' && <CallBrief key={call.id} call={call} />}
      {tab === key && key === 'transcript' && <Transcript key={call.id} call={call} range={target?.eventId === call.id ? target.range : null} onClearRange={() => setTarget(null)} />}
      {tab === key && key === 'questions' && <AnalystQuestions key={call.id} call={call} onOpenTranscript={openTranscript} />}
      {tab === key && key === 'trends' && <CallTrends key={call.ticker} call={call} />}
    </div>)}
  </article>;
}
