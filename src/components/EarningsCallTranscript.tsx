import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { earningsGuidanceQuery, earningsTranscriptQuery } from '../api/earningsCalls';
import { EARNINGS_TRANSCRIPT_PAGE_SIZE, type EarningsCallCorrection, type EarningsCallEvent, type EarningsCallTranscriptPage, type EarningsCallTurn } from '../types/earningsCalls';
import { Loading, ReadError, timestamp } from './EarningsCallReadState';

const buttonClass = 'rounded border border-terminal-border bg-terminal-elevated px-2.5 py-1 text-xs text-terminal-text hover:border-terminal-accent disabled:opacity-60';

function speakerLabel(turn: EarningsCallTurn, hasLabels: boolean) {
  if (!hasLabels) return '';
  const speaker = turn.speakerName || (turn.speakerIndex !== null ? 'Speaker ' + turn.speakerIndex : '');
  return [speaker, turn.speakerRole].filter(Boolean).join(' · ') || 'Unidentified speaker';
}

export interface TranscriptRange {
  /** Original, zero-based speaker turn offsets. The end is exclusive. */
  start: number;
  end: number;
  totalTurnCount?: number | null;
}

function transcriptTurns(pages: EarningsCallTranscriptPage[]) {
  return pages.flatMap(page => page.data.map(turn => ({
    index: turn.turnIndex,
    speaker: speakerLabel(turn, page.hasSpeakerLabels),
    time: turn.startSeconds === null && turn.endSeconds !== null ? 'Ends at ' + timestamp(turn.endSeconds) :
      [timestamp(turn.startSeconds), timestamp(turn.endSeconds)].filter(Boolean).join('–'),
    turn,
  })));
}

function TurnList({ turns, highlight = null }: { turns: ReturnType<typeof transcriptTurns>; highlight?: RegExp | null }) {
  return <ol aria-label="Transcript turns" className="divide-y divide-terminal-border">
    {turns.map(({ index, speaker, time, turn }) => <li key={index} data-turn-index={index} tabIndex={-1} className="space-y-1.5 py-3">
      {(speaker || time) && <div className="flex flex-wrap items-baseline gap-x-3 text-xs">
        {speaker && <strong className="text-terminal-text"><Highlighted text={speaker} pattern={highlight} /></strong>}
        {time && <span className="tabular-nums text-terminal-faint" aria-label={'Audio timestamp ' + time}>{time}</span>}
      </div>}
      <p className="max-w-[100ch] whitespace-pre-line break-words text-sm leading-relaxed text-terminal-text"><Highlighted text={turn.text} pattern={highlight} /></p>
    </li>)}
  </ol>;
}

function FilingCorrections({ call, reported = [] }: { call: EarningsCallEvent; reported?: EarningsCallCorrection[] }) {
  const [requested, setRequested] = useState(false);
  const hasPeriod = Boolean(call.fiscalYear && call.fiscalQuarter);
  const release = useQuery({ ...earningsGuidanceQuery(call), enabled: hasPeriod && requested });
  const entries = new Map<string, EarningsCallCorrection>();
  const fromRelease = requested ? release.data?.corrections ?? [] : [];
  for (const row of [...reported, ...fromRelease]) {
    if (Object.values(row).some(Boolean)) entries.set(JSON.stringify(row), row);
  }
  if (!entries.size && !hasPeriod) return null;
  if (!entries.size && !requested) return <button type="button" className={buttonClass}
    onClick={() => setRequested(true)}>Check filing corrections</button>;
  return <div className="space-y-1">
    {requested && release.isPending && <Loading>Checking filing corrections…</Loading>}
    {requested && release.error && <ReadError error={release.error} retry={() => void release.refetch()} />}
    {requested && release.data?.notice && <p role="status" className="text-xs text-terminal-muted">{release.data.notice}</p>}
    {!entries.size && release.data && <p role="status" className="text-xs text-terminal-muted">Equibles lists no filing corrections for this call.</p>}
    {entries.size > 0 && <details open={requested || undefined} className="text-xs text-terminal-muted">
      <summary className="cursor-pointer text-terminal-accent">Filing corrections ({entries.size})</summary>
      <ul className="mt-2 divide-y divide-terminal-border">
        {Array.from(entries, ([key, row]) => <li key={key} className="space-y-1 py-2">
          {row.metricLabel && <strong className="text-terminal-text">{row.metricLabel}</strong>}
          {row.transcriptQuote && <blockquote className="border-l-2 border-terminal-border pl-2">{row.transcriptQuote}</blockquote>}
          {row.transcriptValue && <p>Spoken figure · <span className="text-terminal-text">{row.transcriptValue}</span></p>}
          {row.filingValue && <p>Filed figure · <span className="text-terminal-text">{row.filingValue}</span></p>}
          {(row.filingForm || row.filingFiledDate) && <p>{[row.filingForm, row.filingFiledDate].filter(Boolean).join(' · ')}</p>}
          {row.note && <p>{row.note}</p>}
        </li>)}
      </ul>
    </details>}
  </div>;
}

/** Read only pages intersecting the source-provided range. Pages share the main reader's cache. */
export function TranscriptExchange({ eventId, range, focus = false }: { eventId: string; range: TranscriptRange; focus?: boolean }) {
  const area = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const query = useInfiniteQuery({
    ...earningsTranscriptQuery(eventId),
    queryKey: ['equibles', 'exchange', eventId, String(range.start), String(range.end)],
    initialPageParam: Math.floor(range.start / EARNINGS_TRANSCRIPT_PAGE_SIZE) * EARNINGS_TRANSCRIPT_PAGE_SIZE,
    getNextPageParam: page => {
      const next = page.offset + page.turnCount;
      if (page.hasMore && page.turnCount > 0 && next < range.end) return Math.max(next, range.start);
    },
  });
  const pages = query.data?.pages;
  const loaded = pages?.length ?? 0;
  const { hasNextPage, isFetching, isError, fetchNextPage } = query;
  // Questions and turns may be republished at different times. A mismatched
  // transcript length makes the published turn offsets unsafe to attribute.
  const revised = range.totalTurnCount != null && pages?.some(page =>
    page.totalTurnCount != null && page.totalTurnCount !== range.totalTurnCount);
  useEffect(() => {
    if (!revised && loaded === 1 && hasNextPage && !isFetching && !isError) void fetchNextPage();
  }, [revised, loaded, hasNextPage, isFetching, isError, fetchNextPage]);
  const turns = useMemo(() => transcriptTurns(pages ?? []).filter(row => row.index >= range.start && row.index < range.end),
    [pages, range.start, range.end]);
  useEffect(() => {
    if (!focus || !turns.length || focused.current || revised) return;
    const first = area.current?.querySelector<HTMLElement>('[data-turn-index]');
    if (first) {
      first.focus({ preventScroll: true });
      first.scrollIntoView({ block: 'nearest' });
      focused.current = true;
    }
  }, [focus, turns, revised]);
  if (revised) return <p role="status" className="text-xs text-terminal-muted">The transcript has changed since this exchange was indexed. Open the full transcript to search for the question.</p>;
  const stale = pages?.find(page => page.stale);
  const last = pages?.[pages.length - 1];
  const endedEarly = last && !last.hasMore && last.offset + last.turnCount < range.end;
  return <div ref={area} className="space-y-2">
    {(query.isPending || query.isFetchingNextPage) && <Loading>Loading transcript section…</Loading>}
    {query.error && <ReadError error={query.error} retry={() => query.isFetchNextPageError ? void fetchNextPage() : void query.refetch()} />}
    {stale && <p className="text-xs text-terminal-muted" role="status">{stale.notice || 'Showing cached transcript text.'}</p>}
    {turns.length > 0 && <TurnList turns={turns} />}
    {pages && !turns.length && !hasNextPage && <p className="text-xs text-terminal-muted">No transcript text is available for this exchange.</p>}
    {endedEarly && turns.length > 0 && <p className="text-xs text-terminal-muted">Only part of this exchange is available in the transcript.</p>}
    {hasNextPage && loaded >= 2 && !query.isFetchNextPageError && <button type="button" className={buttonClass} disabled={isFetching}
      onClick={() => void fetchNextPage()}>Continue exchange</button>}
  </div>;
}

export function Transcript({ call, range, onClearRange }: {
  call: EarningsCallEvent; range?: TranscriptRange | null; onClearRange?: () => void;
}) {
  if (!call.hasTranscript) return <div className="space-y-3">
    <p role="status" className="text-sm text-terminal-muted">{call.materials.transcript?.reason || 'A transcript is unavailable for this call.'}</p>
    <FilingCorrections call={call} />
  </div>;
  if (!range) return <FullTranscript call={call} />;
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="instrument-heading text-xs font-bold">Selected exchange</h4>
      {onClearRange && <button type="button" className={buttonClass} onClick={onClearRange}>Read full transcript</button>}
    </div>
    <TranscriptExchange key={call.id + ':' + range.start} eventId={call.id} range={range} focus />
  </div>;
}

function FullTranscript({ call }: { call: EarningsCallEvent }) {
  const [search, setSearch] = useState('');
  const [searchAll, setSearchAll] = useState(false);
  const term = useDeferredValue(search.trim());
  const query = useInfiniteQuery(earningsTranscriptQuery(call.id));
  const { hasNextPage, isFetching, isError, fetchNextPage } = query;
  const pages = query.data?.pages;
  const loadedPages = pages?.length ?? 0;
  useEffect(() => {
    if (searchAll && hasNextPage && !isFetching && !isError) void fetchNextPage();
  }, [searchAll, hasNextPage, isFetching, isError, fetchNextPage, loadedPages]);

  const highlight = useMemo(() => {
    if (!term) return null;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(' + escaped + ')', 'i');
  }, [term]);
  const turns = useMemo(() => transcriptTurns(pages ?? []), [pages]);
  const visible = highlight ? turns.filter(({ turn, speaker }) => highlight.test(turn.text) || highlight.test(speaker)) : turns;
  const stalePage = pages?.find(page => page.stale);
  let countLabel = turns.length + (turns.length === 1 ? ' turn' : ' turns');
  if (hasNextPage) {
    const total = pages?.[0].totalTurnCount;
    countLabel = total == null ? countLabel + ' loaded' : turns.length + ' of ' + total + ' turns loaded';
  }
  if (term) {
    countLabel = visible.length + (visible.length === 1 ? ' matching turn' : ' matching turns');
    if (hasNextPage) countLabel += ' in loaded text';
  }

  return <div className="space-y-3">
    {query.isPending && <Loading>Loading transcript…</Loading>}
    {query.error && <ReadError error={query.error} retry={() => query.isFetchNextPageError ? void fetchNextPage() : void query.refetch()} />}
    {stalePage && <p role="status" className="text-xs text-terminal-muted">{stalePage.notice || 'Showing the cached transcript.'}</p>}
    {!query.isPending && <FilingCorrections call={call} reported={pages?.flatMap(page => page.corrections)} />}
    {pages && <>
      {pages[0].isFiledRecord && <p className="text-xs text-terminal-muted">Company-filed summary of the call.</p>}
      {(turns.length > 0 || hasNextPage) && <>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex w-full items-center gap-2 rounded border border-terminal-border px-2 py-1.5 sm:max-w-sm">
            <Search aria-hidden="true" size={13} className="shrink-0 text-terminal-faint" />
            <input type="search" aria-label="Search transcript" placeholder="Search words or speakers" value={search}
              onChange={event => { setSearch(event.target.value); if (!event.target.value.trim()) setSearchAll(false); }}
              className="min-w-0 flex-1 bg-transparent text-xs text-terminal-text" />
          </label>
          <span aria-live="polite" className="text-xs text-terminal-faint">{countLabel}</span>
          {hasNextPage && term && !query.isFetchNextPageError && <button type="button" className={buttonClass} disabled={isFetching} onClick={() => setSearchAll(true)}>
            {isFetching ? 'Loading transcript…' : 'Search full transcript'}
          </button>}
        </div>
        {visible.length > 0 && <TurnList turns={visible} highlight={highlight} />}
        {hasNextPage && !query.isFetchNextPageError && <button type="button" className={buttonClass} disabled={isFetching} onClick={() => void fetchNextPage()}>
          {isFetching ? 'Loading…' : 'Load more turns'}
        </button>}
      </>}
      {turns.length === 0 && !hasNextPage && <p className="text-sm text-terminal-muted">Equibles returned no transcript text for this call.</p>}
    </>}
  </div>;
}

function Highlighted({ text, pattern }: { text: string; pattern: RegExp | null }) {
  if (!pattern) return <>{text}</>;
  return <>{text.split(pattern).map((part, i) => i % 2
    ? <mark key={i} className="rounded-sm bg-terminal-accent/20 text-terminal-accent">{part}</mark>
    : <Fragment key={i}>{part}</Fragment>)}</>;
}
