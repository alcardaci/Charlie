import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import {
  congressMemberKey, congressPageSize, congressTickers, filingDelay,
  type Chamber, type CongressCoverage, type CongressMember, type CongressPage, type CongressTrade,
} from '../data/congress';
import { useTerminalStore } from '../store/useTerminalStore';

const control = 'rounded border border-terminal-border bg-terminal-panel px-2 py-1.5 text-xs text-terminal-text';
const button = `${control} hover:border-terminal-accent hover:text-terminal-accent disabled:opacity-50`;
const label = 'flex min-w-0 max-w-full flex-col gap-1 text-xs text-terminal-muted';
const link = 'text-terminal-accent hover:underline';
const dayFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayText = (date: string | null) => date ? dayFormat.format(new Date(date)) : '—';
const columns = ['Member', 'Owner', 'Asset / ticker', 'Action', 'Reported amount', 'Traded', 'Filed', 'Delay', 'Source'];

// Back pops Charlie's existing history entry. An explicit F11 or CONGRESS command pushes a new one.
let equityReturn: { historyHead: object | undefined; chamber: Chamber | ''; member: string; ticker: string; offset: number } | undefined;

function OriginalFiling({ url }: { url: string | null }) {
  if (!url || !/^https:\/\/(?:disclosures-clerk\.house\.gov|efdsearch\.senate\.gov)\//i.test(url)) {
    return <span aria-label="Original filing unavailable">—</span>;
  }
  return <a className={link} href={url} target="_blank" rel="noreferrer" aria-label="Open original filing">Filing ↗</a>;
}

function Coverage({ info }: { info: CongressCoverage }) {
  const [shown, setShown] = useState(10);
  return (
    <div className="space-y-1">
      <details>
        <summary className="cursor-pointer text-xs text-terminal-muted hover:text-terminal-text">
          <strong className="text-terminal-text">{info.chamber}</strong> · latest filing {dayText(info.latestFiling)}
          {' · '}{info.gaps.length.toLocaleString()} known {info.gaps.length === 1 ? 'gap' : 'gaps'}
        </summary>
        <div className="mt-2 space-y-2 pl-3 text-xs text-terminal-muted">
          <p>NexusTrade snapshot {dayText(info.snapshotAsOf)} · last successful check {dayText(info.snapshotChecked)}</p>
          {info.chamber === 'House' ? (
            <p>House Clerk index checked {dayText(info.indexChecked)}. {info.windowStart && `Recent reports reconciled from ${dayText(info.windowStart)}.`}</p>
          ) : (
            <p>Senate coverage follows the published snapshot. Additional filings may already be available through Senate eFD.</p>
          )}
          {info.gaps.length > 0 && (
            <ul className="space-y-1">
              {info.gaps.slice(0, shown).map(gap => (
                <li key={gap.filingId}>
                  {dayText(gap.filingDate)} · {gap.memberName} · {gap.reason} <OriginalFiling url={gap.filingUrl} />
                </li>
              ))}
            </ul>
          )}
          {shown < info.gaps.length && (
            <button type="button" className={button} onClick={() => setShown(n => n + 25)}>Show more gaps</button>
          )}
        </div>
      </details>
      {info.warnings.map(message => <p role="status" key={message} className="text-xs text-terminal-accent">{message}</p>)}
    </div>
  );
}

function memberRegion(member: CongressMember) {
  if (member.chamber !== 'House' || member.district == null) return member.state ?? 'State unspecified';
  const district = member.district === '0' ? 'At-large' : `District ${member.district}`;
  return member.state ? `${member.state} · ${district}` : district;
}

async function getTrades(chamber: string, member: string, ticker: string, offset: number, signal?: AbortSignal, refresh = false): Promise<CongressPage> {
  const params = new URLSearchParams({ chamber, member, ticker, offset: String(offset) });
  if (refresh) params.set('refresh', '1');
  const res = await fetch(`/api/congress/trades?${params}`, { signal });
  if (!res.ok) throw new Error('Congressional disclosures could not be loaded.');
  return res.json();
}

interface TradesTableProps {
  rows: CongressTrade[];
  selectMember: (member: string) => void;
  openTicker: (symbol: string) => void;
}
function TradesTable({ rows, selectMember, openTicker }: TradesTableProps) {
  return (
    <div role="region" aria-label="Scrollable disclosures table" tabIndex={0} className="max-w-full overflow-x-auto focus-visible:outline-terminal-accent">
      <table className="data-table congress-table">
        <caption className="sr-only">Reported congressional trades sorted by filing date, newest first</caption>
        <thead>
          <tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const delay = filingDelay(row.tradeDate, row.filingDate);
            const symbols = congressTickers(row.ticker);
            return (
              <tr key={row.id}>
                <td>
                  <button type="button" className={`${link} text-left`} onClick={() => selectMember(congressMemberKey(row.memberId, row.chamber))}>
                    {row.memberName}
                  </button>
                  <div className="text-terminal-muted">{row.chamber}</div>
                </td>
                <td>{row.owner ?? '—'}</td>
                <td>
                  {symbols.map(symbol => (
                    <button type="button" key={symbol} className={`${link} mr-2 font-bold`}
                      title={`Open ${symbol} in Equity Research`} onClick={() => openTicker(symbol)}>
                      {symbol}
                    </button>
                  ))}
                  <div className="text-terminal-muted">{row.asset ?? (symbols.length ? '' : row.ticker ?? '—')}</div>
                </td>
                <td>
                  {row.action}
                  {row.amendment && <div className="text-terminal-accent">Amendment</div>}
                </td>
                <td className="whitespace-nowrap">{row.amount ?? '—'}</td>
                <td className="whitespace-nowrap">{dayText(row.tradeDate)}</td>
                <td className="whitespace-nowrap">{dayText(row.filingDate)}</td>
                <td className="whitespace-nowrap">{delay == null ? '—' : `${delay} ${delay === 1 ? 'day' : 'days'}`}</td>
                <td><OriginalFiling url={row.filingUrl} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CongressPanel() {
  const client = useQueryClient();
  const [returnView] = useState(() => equityReturn?.historyHead === useTerminalStore.getState().navHistory[0] ? equityReturn : undefined);
  const [chamber, setChamber] = useState<Chamber | ''>(returnView?.chamber ?? '');
  const [member, setMember] = useState(returnView?.member ?? '');
  const [input, setInput] = useState(returnView?.ticker ?? '');
  const [ticker, setTicker] = useState(returnView?.ticker ?? '');
  const [offset, setOffset] = useState(returnView?.offset ?? 0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  useEffect(() => { equityReturn = undefined; }, []);
  const normalizedTicker = input.trim().toUpperCase();
  useEffect(() => {
    if (normalizedTicker === ticker) return;
    const timer = setTimeout(() => {
      setTicker(normalizedTicker);
      setOffset(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [normalizedTicker, ticker]);

  const key = ['congress-trades', chamber, member, ticker, offset];
  const { data, isLoading, isFetching, isError, isPlaceholderData } = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getTrades(chamber, member, ticker, offset, signal),
    staleTime: 15 * 60_000,
    refetchInterval: query => query.state.data?.refreshing ? 3000 : 15 * 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });

  async function refresh() {
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      const result = await getTrades(chamber, member, ticker, offset, undefined, true);
      await client.invalidateQueries({ queryKey: ['congress-trades'], refetchType: 'none' });
      client.setQueryData(key, result);
      await client.refetchQueries({ queryKey: ['congress-trades'], type: 'active', stale: true });
    } catch {
      setRefreshFailed(true);
    } finally {
      setRefreshing(false);
    }
  }

  function selectMember(value: string) {
    setMember(value);
    setOffset(0);
  }
  function selectChamber(value: string) {
    setChamber(value === 'House' || value === 'Senate' ? value : '');
    selectMember('');
  }
  function clearFilters() {
    selectChamber('');
    setInput('');
    setTicker('');
  }
  function openTicker(symbol: string) {
    const { navHistory, setActivePanel } = useTerminalStore.getState();
    equityReturn = { historyHead: navHistory[0], chamber, member, ticker, offset };
    setActivePanel('equity', symbol);
  }
  const selected = data?.members.find(m => congressMemberKey(m.id, m.chamber) === member);
  const politicians = data?.members.filter(m => !chamber || chamber === m.chamber);
  const changingFilter = isPlaceholderData || normalizedTicker !== ticker;

  return (
    <>
      <WorkspaceHeader title="Congressional Trades">
        <button type="button" className={button} disabled={refreshing || isFetching} onClick={() => void refresh()}>
          {refreshing || isFetching ? 'Checking…' : 'Refresh'}
        </button>
      </WorkspaceHeader>
      <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className={label}>Chamber
            <select className={control} value={chamber} onChange={e => selectChamber(e.target.value)}>
              <option value="">Both chambers</option><option>House</option><option>Senate</option>
            </select>
          </label>
          <label className={label}>Politician
            <select className={`${control} max-w-full sm:min-w-48`} value={member} onChange={e => selectMember(e.target.value)}>
              <option value="">All politicians</option>
              {politicians?.map(m => {
                const id = congressMemberKey(m.id, m.chamber);
                return <option key={id} value={id}>{m.name} · {m.chamber}{m.state && ` · ${m.state}`}</option>;
              })}
            </select>
          </label>
          <label className={label}>Ticker
            <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder="e.g. ROK"
              spellCheck={false} autoCapitalize="characters" className={`${control} w-28`} />
          </label>
          {Boolean(member || input || chamber) && (
            <button type="button" className={button} onClick={clearFilters}>Clear filters</button>
          )}
        </div>
        {selected && (
          <section aria-label="Selected politician" className="space-y-1">
            <h2 className="text-sm font-bold text-terminal-text">{selected.name}</h2>
            <p className="text-xs text-terminal-muted">
              {selected.isNonMember && 'Non-member filer · '}{selected.party ?? 'Party unspecified'} · {selected.chamber} · {memberRegion(selected)}
            </p>
          </section>
        )}
        {data && (
          <div className="grid gap-2 border-y border-terminal-border py-2 sm:grid-cols-2">
            {data.coverage.map(info => <Coverage key={info.chamber} info={info} />)}
          </div>
        )}
        {(isError || refreshFailed) && (
          <p role="status" className="text-xs text-terminal-muted">
            Disclosures could not be refreshed. {data ? 'Showing the last received results.' : 'Use Refresh to try again.'}
          </p>
        )}
        {data?.refreshing && <p role="status" className="text-xs text-terminal-muted">Showing saved disclosures while sources refresh…</p>}
        {isLoading && <p role="status" className="text-xs text-terminal-muted">Loading the public filing index and disclosure snapshot…</p>}
        {data && (
          <section aria-label="Disclosed trades" aria-busy={isPlaceholderData}>
            <p role="status" className="mb-2 text-xs text-terminal-muted">
              {isPlaceholderData ? 'Filtering disclosures…' : `${data.total.toLocaleString()} disclosed trades · newest filings first`}
            </p>
            {data.rows.length > 0 && !isPlaceholderData && <TradesTable rows={data.rows} selectMember={selectMember} openTicker={openTicker} />}
            {!data.total && !isPlaceholderData && <p className="py-4 text-sm text-terminal-muted">No disclosed trades match these filters.</p>}
            {data.total > congressPageSize && (
              <nav aria-label="Disclosures pages" className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <button type="button" className={button} disabled={changingFilter || data.offset === 0}
                  onClick={() => setOffset(data.offset - congressPageSize)}>Previous</button>
                <span>{(data.offset + 1).toLocaleString()}–{(data.offset + data.rows.length).toLocaleString()} of {data.total.toLocaleString()}</span>
                <button type="button" className={button} disabled={changingFilter || data.offset + data.rows.length >= data.total}
                  onClick={() => setOffset(data.offset + congressPageSize)}>Next</button>
              </nav>
            )}
          </section>
        )}
        <p className="text-xs text-terminal-muted">Local personal research ·{' '}
          <a href="https://huggingface.co/datasets/austin-starks/congressional-stock-trades/blob/main/LICENSE_DATA.md"
            className="underline" target="_blank" rel="noreferrer">Disclosure data use restrictions ↗</a>
        </p>
      </div>
    </>
  );
}

export default CongressPanel;
