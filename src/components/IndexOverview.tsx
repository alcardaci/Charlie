import { marketQuoteTime } from '../api/finance';
import { indexProfiles, indexReferenceLevels } from '../data/indexResearch';
import type { Quote } from '../types';
import { changeColor, fmt } from '../utils/formatters';
import { DailyCloseSparkline } from './DailyCloseSparkline';

export function IndexOverview({ quote }: { quote: Quote }) {
  const profile = indexProfiles[quote.symbol];
  const comparisons = indexReferenceLevels(quote);
  const asOf = marketQuoteTime(quote.regularMarketTime);
  return (
    <div className="section-stack space-y-4 p-3 sm:p-4">
      <section className="instrument-card rounded border border-terminal-border bg-terminal-panel p-4">
        <h2 className="instrument-heading mb-3 text-xs font-bold tracking-wider">INDEX OVERVIEW</h2>
        {profile && <p className="mb-3 text-xs leading-relaxed text-terminal-text">
          {profile.description}{' '}
          <a className="text-terminal-accent hover:underline" href={profile.url} target="_blank" rel="noreferrer">{profile.provider} ↗</a>
        </p>}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="text-xs text-terminal-muted">Yahoo Finance{asOf != null && <span> · Quote as of <time dateTime={new Date(asOf).toISOString()}>
            {new Date(asOf).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} local time
          </time></span>}</div>
          <div className="flex items-center gap-3 text-xs text-terminal-muted">
            <span>Daily closes · 30D</span><DailyCloseSparkline symbol={quote.symbol} name={quote.shortName} timeZone={quote.exchangeTimezoneName} />
          </div>
        </div>
      </section>
      <section className="instrument-card overflow-x-auto rounded border border-terminal-border bg-terminal-panel p-4">
        <h2 className="instrument-heading mb-3 text-xs font-bold tracking-wider">INDEX LEVEL COMPARISON</h2>
        {comparisons.length > 0 ? <table className="data-table w-full" aria-label="Current index level compared with reference levels">
          <thead><tr><th scope="col">Reference</th><th scope="col">Level</th><th scope="col">Gap (pts)</th><th scope="col">Gap (%)</th></tr></thead>
          <tbody>{comparisons.map(({ label, level, points, percent }) => <tr key={label}>
            <td>{label}</td><td>{fmt.price(level)}</td>
            <td className={changeColor(points)}>{fmt.change(points)}</td><td className={changeColor(percent)}>{fmt.pct(percent)}</td>
          </tr>)}</tbody>
        </table> : <p className="text-xs text-terminal-muted">Reference levels are unavailable for this index.</p>}
      </section>
    </div>
  );
}
