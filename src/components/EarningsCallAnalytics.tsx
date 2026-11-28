import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { earningsBriefQuery, earningsGuidanceQuery } from '../api/earningsCalls';
import type { EarningsCallEvent, EarningsCallGuidanceItem } from '../types/earningsCalls';
import { Loading, ReadError, timestamp } from './EarningsCallReadState';

const heading = 'instrument-heading mb-2 text-xs font-bold tracking-wider';
const muted = 'text-xs leading-relaxed text-terminal-muted';
const pointsClass = 'list-disc space-y-1.5 pl-4 text-sm leading-relaxed';
const number = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 14 });

function Points({ title, items, tone = '' }: { title: string; items: string[]; tone?: string }) {
  if (!items.length) return null;
  return <section>
    <h4 className={heading + ' ' + tone}>{title}</h4>
    <ul className={pointsClass}>{items.map((point, index) => <li key={index}>{point}</li>)}</ul>
  </section>;
}

function valueWithUnit(value: number, unit: string | null) {
  if (unit === 'percent') return number.format(value) + '%';
  return [number.format(value), unit].filter(Boolean).join(' ');
}

function range(item: EarningsCallGuidanceItem) {
  const { low, high, midpoint, unit } = item;
  if (low !== null && high !== null) {
    return low === high ? valueWithUnit(low, unit) : number.format(low) + '–' + valueWithUnit(high, unit);
  }
  if (low !== null) return 'Lower bound ' + valueWithUnit(low, unit);
  if (high !== null) return 'Upper bound ' + valueWithUnit(high, unit);
  return midpoint !== null ? 'Midpoint ' + valueWithUnit(midpoint, unit) : null;
}

function GuidanceItem({ item, comparison = false }: { item: EarningsCallGuidanceItem; comparison?: boolean }) {
  const fiscal = item.fiscalYear && [item.fiscalQuarter && 'Q' + item.fiscalQuarter, 'FY' + item.fiscalYear].filter(Boolean).join(' ');
  return <li className="space-y-1 py-2">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <span className="text-sm font-semibold">{item.metric || 'Company guidance'}</span>
      <span className="text-sm tabular-nums">{range(item)}</span>
    </div>
    <p className={muted}>{[item.period || fiscal, item.basis, item.changeVsPrior].filter(Boolean).join(' · ')}</p>
    {comparison && item.actual !== null && <p className="text-xs">
      Actual {valueWithUnit(item.actual, item.unit)}{item.actualIsDerived && ' (full year less first nine months)'}{item.actualVerdict && ' · ' + item.actualVerdict + ' guidance'}
    </p>}
    {item.quote && <p className="text-xs leading-relaxed text-terminal-muted">{item.quote}</p>}
  </li>;
}

function Source({ form, date, url }: { form: string | null; date: string | null; url: string | null }) {
  const label = [form || (url && 'Filing'), date].filter(Boolean).join(' · ');
  if (!label) return null;
  return url ? <a className="text-xs text-terminal-accent underline underline-offset-2" href={url} target="_blank" rel="noopener noreferrer">{label} ↗</a>
    : <p className={muted}>{label}</p>;
}

function FilingGuidance({ call }: { call: EarningsCallEvent }) {
  const query = useQuery(earningsGuidanceQuery(call));
  if (query.isPending) return <Loading>Checking guidance in the earnings release…</Loading>;
  if (query.isError) return <ReadError error={query.error} retry={() => void query.refetch()} />;
  const emptyByStatus: Record<string, string> = {
    approved: 'Equibles reviewed the earnings release and found no financial guidance.',
    notExtracted: 'Equibles has the earnings release and has yet to extract its guidance.',
    unlinked: 'Equibles has no linked earnings release available for this call.',
  };
  return <>
    {query.data.notice && <p className={muted} role="status">{query.data.notice}</p>}
    {query.data.guidance.length
      ? <ul className="divide-y divide-[var(--section-rule-color)]">{query.data.guidance.map((item, i) => <GuidanceItem key={i} item={item} />)}</ul>
      : <p className={muted}>{emptyByStatus[query.data.guidanceStatus ?? 'unlinked'] || 'Equibles has no financial guidance figures available for this call.'}</p>}
  </>;
}

export function CallBrief({ call }: { call: EarningsCallEvent }) {
  const query = useQuery(earningsBriefQuery(call));
  const [checkGuidance, setCheckGuidance] = useState(false);
  if (!call.fiscalYear || !call.fiscalQuarter) return <p className={muted}>This event has no reported fiscal quarter for a call brief.</p>;
  if (query.isPending) return <Loading>Loading call brief…</Loading>;
  const brief = query.data?.data;
  const issued = brief?.guidanceComparison?.issuedAtCall.filter(filing => filing.items.length) ?? [];
  const comparisons = brief?.guidanceComparison?.reportedVsCompanyGuidance ?? [];
  const shift = brief?.narrativeShift;
  return <div className="min-w-0 space-y-5 text-terminal-text">
    {query.error && <ReadError error={query.error} retry={() => void query.refetch()} />}
    {query.data?.notice && <p className={muted} role="status">{query.data.notice}</p>}
    {brief?.tldr && <section><h4 className={heading}>Executive summary</h4><p className="max-w-[100ch] text-sm leading-relaxed">{brief.tldr}</p></section>}
    {!brief && !query.error && <p className={muted}>Equibles has no verified brief for this quarter.</p>}
    {brief && (brief.bullish.length > 0 || brief.bearish.length > 0) && <div className="grid gap-4 md:grid-cols-2">
      <Points title="Bullish points" items={brief.bullish} tone="text-terminal-positive" />
      <Points title="Bearish points" items={brief.bearish} tone="text-terminal-negative" />
    </div>}
    <section className="border-t border-[var(--section-rule-color)] pt-3">
      <h4 className={heading}>Management guidance</h4>
      {issued.map((filing, i) => <div key={i} className="mb-3">
        <Source form={filing.form} date={filing.filedDate} url={filing.filingUrl} />
        <ul className="divide-y divide-[var(--section-rule-color)]">{filing.items.map((item, j) => <GuidanceItem key={j} item={item} />)}</ul>
      </div>)}
      {!issued.length && (checkGuidance ? <FilingGuidance call={call} /> :
        <button type="button" className="rounded border border-terminal-border px-2.5 py-1 text-xs hover:border-terminal-accent"
          onClick={() => setCheckGuidance(true)}>Check earnings release for guidance</button>)}
      {comparisons.length > 0 && <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-terminal-accent">Results against earlier company guidance</summary>
        <ul>{comparisons.map((row, i) => <li key={i} className="border-b border-[var(--section-rule-color)] py-2">
          <Source form={row.guidanceForm} date={row.guidanceFiledDate} url={row.guidanceFilingUrl} />
          <ul><GuidanceItem item={row.item} comparison /></ul>
        </li>)}</ul>
      </details>}
    </section>
    {shift && (shift.newBullish.length > 0 || shift.newBearish.length > 0 || shift.noLongerRaised.length > 0) && <section className="border-t border-[var(--section-rule-color)] pt-3">
      <h4 className={heading}>Changes from the previous brief</h4>
      {shift.priorFiscalYear && shift.priorFiscalQuarter && <p className={muted}>Compared with Q{shift.priorFiscalQuarter} FY{shift.priorFiscalYear}</p>}
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <Points title="New bullish points" items={shift.newBullish} />
        <Points title="New risks" items={shift.newBearish} />
        <Points title="No longer raised" items={shift.noLongerRaised} />
      </div>
    </section>}
    {brief && brief.quotes.length > 0 && <section className="border-t border-[var(--section-rule-color)] pt-3">
      <h4 className={heading}>Notable quotes</h4>
      <div className="space-y-3">{brief.quotes.map((quote, i) => <figure key={i} className="max-w-[100ch]">
        <blockquote className="text-sm leading-relaxed">“{quote.text}”</blockquote>
        <figcaption className={muted}>{[quote.speakerName || quote.speakerRole || 'Unidentified speaker',
          quote.speakerName && quote.speakerRole, timestamp(quote.startSeconds)].filter(Boolean).join(' · ')}</figcaption>
      </figure>)}</div>
    </section>}
  </div>;
}
