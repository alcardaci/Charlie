import { Fragment, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { earningsInsightsQuery, earningsPhraseTrendQuery, earningsThemeHistoryQuery } from '../api/earningsCalls';
import type { EarningsCallEvent, EarningsFiscalPeriod } from '../types/earningsCalls';
import { fmt } from '../utils/formatters';
import { Loading, ReadError } from './EarningsCallReadState';

const heading = 'instrument-heading mb-2 text-xs font-bold tracking-wider';
const muted = 'text-xs leading-relaxed text-terminal-muted';
const section = 'border-t border-[var(--section-rule-color)] pt-3';
const control = 'rounded border border-terminal-border bg-terminal-elevated px-2 py-1.5 text-xs text-terminal-text focus-visible:outline-terminal-accent';
const dateLabel = (period: EarningsFiscalPeriod) => 'Q' + period.fiscalQuarter + ' FY' + period.fiscalYear;
const statusLabel = { new: 'New', recurring: 'Recurring', dropped: 'No longer raised', unknown: 'Uncertain' };
const textSource: Record<string, string> = {
  speakerTurns: 'Speaker transcript', transcriptDocument: 'Published transcript',
  unsupportedLanguage: 'Language not supported for counts', none: 'Transcript text unavailable',
};

function ThemeHistory({ symbol }: { symbol: string }) {
  const query = useQuery(earningsThemeHistoryQuery(symbol));
  if (query.isPending) return <Loading>Loading theme history…</Loading>;
  if (query.isError) return <ReadError error={query.error} retry={() => void query.refetch()} />;
  const { calls, themes, note, notice } = query.data;
  if (!calls.length || !themes.length) return <p className={muted}>{notice || note || 'Equibles has no scored theme history available for this company.'}</p>;
  const latest = calls[calls.length - 1];
  return <div className="mt-2 space-y-2">
    <p className={muted}>{calls.length === 1
      ? 'Only ' + dateLabel(latest) + ' has a score. Topic changes need an earlier call for comparison.'
      : 'Status in ' + dateLabel(latest) + ' compared with the earlier calls shown.'} Counts are keyword mentions.</p>
    {(notice || note) && <p role="status" className={muted}>{notice || note}</p>}
    {calls.some(c => (c.unscoredQuartersBefore ?? 0) > 0) && <p className={muted}>Some intervening quarters have no scores. A gap can leave a topic’s status uncertain.</p>}
    <div className="max-w-full overflow-x-auto">
      <table className="data-table w-full" aria-label="Keyword mentions by theme across scored calls">
        <thead><tr><th scope="col">Topic</th><th scope="col">Status</th>{calls.map(c => <th key={dateLabel(c)} scope="col" className="whitespace-nowrap">{dateLabel(c)}</th>)}</tr></thead>
        <tbody>{themes.map(theme => <tr key={theme.name}>
          <th scope="row" className="min-w-32 text-left font-normal">{theme.name}</th>
          <td className={'whitespace-nowrap ' + (calls.length > 1 && theme.status === 'new' ? 'text-terminal-accent' : 'text-terminal-muted')}>{calls.length > 1 ? statusLabel[theme.status] : 'No comparison'}</td>
          {calls.map(c => {
            const entry = theme.entries.find(item => c.fiscalYear === item.fiscalYear && c.fiscalQuarter === item.fiscalQuarter);
            const missing = entry ? 'Topic was not raised' : 'Count unavailable';
            return <td key={dateLabel(c)} className="tabular-nums" title={entry?.mentionCount == null ? missing : undefined}>{fmt.integer(entry?.mentionCount)}</td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

function PhraseResults({ symbol, phrase, calls }: { symbol: string; phrase: string; calls: number }) {
  const query = useQuery(earningsPhraseTrendQuery(symbol, phrase, calls));
  if (query.isPending) return <Loading>Counting phrase mentions…</Loading>;
  if (query.isError) return <ReadError error={query.error} retry={() => void query.refetch()} />;
  const data = query.data;
  if (!data.calls.length) return <p className={muted}>{data.notice || data.note || 'Equibles has no calls available to search.'}</p>;
  return <div className="mt-3 space-y-2">
    <p className="text-sm text-terminal-text">“{phrase}” <span className={muted}>· {data.calls.length} {data.calls.length === 1 ? 'call' : 'calls'} · {symbol}</span></p>
    {(data.notice || data.note) && <p className={muted} role="status">{data.notice || data.note}</p>}
    <div className="max-w-full overflow-x-auto">
      <table className="data-table w-full" aria-label="Phrase frequency across fiscal quarters">
        <thead><tr><th scope="col">Quarter</th><th scope="col">Mentions</th><th scope="col">Per 10k words</th><th scope="col">Source</th></tr></thead>
        <tbody>{data.calls.map(row => <Fragment key={dateLabel(row)}>
          {!!row.missingQuartersBefore && <tr><td colSpan={4} className={muted}>{row.missingQuartersBefore} intervening {row.missingQuartersBefore === 1 ? 'quarter' : 'quarters'} without a call</td></tr>}
          <tr>
            <th scope="row" className="whitespace-nowrap text-left font-normal">{dateLabel(row)}</th>
            <td className="tabular-nums">{fmt.integer(row.mentions)}</td>
            <td className="tabular-nums">{fmt.number(row.ratePer10kWords, 1)}</td>
            <td className="text-terminal-muted">{textSource[row.textSource ?? ''] ?? 'Source unspecified'}</td>
          </tr>
          {row.quotes.length > 0 && <tr><td colSpan={4}>
            <details className="py-1 text-xs">
              <summary className="cursor-pointer text-terminal-accent">Passages from {dateLabel(row)}</summary>
              <div className="mt-1 space-y-2">{row.quotes.map((quote, i) => <blockquote key={i} className="max-w-[100ch] whitespace-normal leading-relaxed">
                {quote.text}{quote.section && <span className="ml-2 text-terminal-muted">{quote.section === 'preparedRemarks' ? 'Prepared remarks' : quote.section === 'qa' ? 'Q&A' : quote.section}</span>}
              </blockquote>)}</div>
            </details>
          </td></tr>}
        </Fragment>)}</tbody>
      </table>
    </div>
  </div>;
}

export function CallTrends({ call }: { call: EarningsCallEvent }) {
  const insights = useQuery(earningsInsightsQuery(call));
  const [showHistory, setShowHistory] = useState(false);
  const [draft, setDraft] = useState('');
  const [windowSize, setWindowSize] = useState(8);
  const [submitted, setSubmitted] = useState<{ phrase: string; calls: number } | null>(null);
  const phraseInput = useRef<HTMLInputElement>(null);
  const phrase = draft.trim().replace(/\s+/g, ' ');
  const validPhrase = phrase.length >= 2 && phrase.length <= 80;
  const themes = insights.data?.data?.themes ?? [];

  return <div className="min-w-0 space-y-5">
    <section>
      <h4 className={heading}>Key themes</h4>
      {!call.fiscalYear || !call.fiscalQuarter ? <p className={muted}>This call has no reported fiscal quarter for theme analysis.</p> :
        insights.isPending ? <Loading>Loading call themes…</Loading> :
        insights.error ? <ReadError error={insights.error} retry={() => void insights.refetch()} /> :
        !themes.length && <p className={muted}>Equibles has no scored themes for this quarter.</p>}
      {insights.data?.notice && <p className={muted} role="status">{insights.data.notice}</p>}
      {themes.length > 0 && <div className="divide-y divide-[var(--section-rule-color)]">
        {themes.map(theme => <div key={theme.name} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2">
          <span className="text-sm font-semibold">{theme.name}</span>
          <span className="text-xs tabular-nums text-terminal-muted">{theme.mentionCount == null ? 'Count unavailable' : fmt.integer(theme.mentionCount) + ' keyword mentions'}</span>
          {theme.keywords.length > 0 && <div className="flex w-full flex-wrap gap-x-3 gap-y-1">
            {theme.keywords.map(word => word.length < 2 || word.length > 80 ? <span key={word} className={muted}>{word}</span> :
              <button type="button" key={word} aria-label={'Track “' + word + '” across calls'} className="text-xs text-terminal-accent hover:underline"
                onClick={() => { setDraft(word); setSubmitted({ phrase: word, calls: windowSize }); phraseInput.current?.focus(); }}>{word}</button>)}
          </div>}
        </div>)}
      </div>}
    </section>
    <details className={section} onToggle={e => setShowHistory(e.currentTarget.open)}>
      <summary className="cursor-pointer text-xs font-bold text-terminal-accent">Compare topics across calls</summary>
      {showHistory && <ThemeHistory symbol={call.ticker} />}
    </details>
    <section className={section}>
      <h4 className={heading}>Phrase trends</h4>
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault();
        if (validPhrase) setSubmitted({ phrase, calls: windowSize });
      }}>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-terminal-muted">Word or phrase
          <input ref={phraseInput} className={control} value={draft} onChange={e => setDraft(e.target.value)}
            type="search" minLength={2} maxLength={80} required placeholder="e.g. pricing power" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-terminal-muted">Lookback
          <select className={control} value={windowSize} onChange={e => setWindowSize(Number(e.target.value))}>
            {[4, 8, 12].map(n => <option key={n} value={n}>Latest {n} calls</option>)}
          </select>
        </label>
        <button type="submit" className={control + ' text-terminal-accent hover:border-terminal-accent disabled:opacity-50'} disabled={!validPhrase}>Track phrase</button>
      </form>
      {submitted && <PhraseResults symbol={call.ticker} phrase={submitted.phrase} calls={submitted.calls} />}
    </section>
  </div>;
}
