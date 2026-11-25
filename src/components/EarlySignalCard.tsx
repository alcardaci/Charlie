import { ArrowUpRight, ExternalLink } from 'lucide-react';
import type { EarlySignal } from '../utils/earlySignalsEngine';
import { fmt } from '../utils/formatters';

function gradeTone(grade: EarlySignal['evidenceGrade']): string {
  if (grade === 'supported') return 'text-terminal-positive border-terminal-positive/30';
  if (grade === 'developing') return 'text-terminal-accent border-terminal-accent/30';
  return 'text-amber-300 border-amber-300/30';
}

export function EarlySignalCard({
  signal,
  onOpenSymbol,
}: {
  signal: EarlySignal;
  onOpenSymbol: (symbol: string) => void;
}) {
  const headingId = `early-signal-${signal.id}`;
  const evidencedCompanies = signal.beneficiaries.flatMap((beneficiary) => beneficiary.companies);

  return (
    <article className="instrument-section border-b border-terminal-border py-5 first:pt-1 last:border-0" aria-labelledby={headingId}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={headingId} className="text-sm font-bold tracking-[0.12em] text-terminal-text">
              {signal.label.toUpperCase()}
            </h3>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-[0.12em] ${gradeTone(signal.evidenceGrade)}`}>
              {signal.evidenceGrade.toUpperCase()} EVIDENCE
            </span>
            <span className="text-[11px] text-terminal-faint">{signal.horizon}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-terminal-text">{signal.whyEmerging}</p>
        </div>

        <div className="text-right">
          <div className="text-lg font-bold text-terminal-accent">{signal.rankingScore}</div>
          <div className="text-[10px] tracking-[0.12em] text-terminal-faint" title="Relative research priority, not a probability or price forecast.">
            RESEARCH PRIORITY
          </div>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 border-y border-terminal-border py-3 text-xs md:grid-cols-5">
        <div>
          <dt className="text-[10px] tracking-[0.12em] text-terminal-faint">ACCELERATION</dt>
          <dd className="mt-0.5 font-bold text-terminal-text">{signal.accelerationRatio.toFixed(1)}× baseline</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-[0.12em] text-terminal-faint">PERSISTENCE</dt>
          <dd className="mt-0.5 font-bold text-terminal-text">{signal.activeWeekCount} active weeks</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-[0.12em] text-terminal-faint">INDEPENDENT SOURCES</dt>
          <dd className="mt-0.5 font-bold text-terminal-text">{signal.independentSourceCount}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-[0.12em] text-terminal-faint">BASELINE</dt>
          <dd className="mt-0.5 font-bold text-terminal-text">
            {signal.baselineSpanDays > 0 ? `${signal.baselineSpanDays} days` : 'cold start'}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-[0.12em] text-terminal-faint">UNCERTAINTY</dt>
          <dd className="mt-0.5 font-bold capitalize text-terminal-text">{signal.uncertainty}</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] xl:gap-8">
        <div className="min-w-0">
          <div className="text-[10px] tracking-[0.16em] text-terminal-faint">LONG-RUN IMPLICATION</div>
          <p className="mt-1 text-xs leading-relaxed text-terminal-text">{signal.longRunImplication}</p>

          <div className="mt-4 text-[10px] tracking-[0.16em] text-terminal-faint">VALUE-CHAIN ROLES</div>
          <div className="mt-1 divide-y divide-terminal-border border-y border-terminal-border">
            {signal.beneficiaries.map((beneficiary) => (
              <div key={beneficiary.role} className="py-2.5">
                <div className="text-xs font-bold text-terminal-text">{beneficiary.role}</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-terminal-muted">{beneficiary.rationale}</div>
                {beneficiary.companies.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Evidence-supported companies for ${beneficiary.role}`}>
                    {beneficiary.companies.map((company) => (
                      <button
                        key={company.symbol}
                        type="button"
                        onClick={() => onOpenSymbol(company.symbol)}
                        title={`${company.evidenceCount} articles from ${company.independentSourceCount} independent sources explicitly reference ${company.name}.`}
                        className="inline-flex items-center gap-1 rounded border border-terminal-accent/30 px-2 py-1 text-[11px] text-terminal-accent transition-colors hover:bg-terminal-hover"
                      >
                        {company.symbol}
                        <ArrowUpRight size={10} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {evidencedCompanies.length === 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-terminal-faint">
              No company clears the two-source evidence rule. Roles are shown without speculative tickers.
            </p>
          )}
        </div>

        <div className="min-w-0">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <section aria-label="Confirmation conditions">
              <div className="text-[10px] tracking-[0.16em] text-terminal-faint">WHAT WOULD CONFIRM IT</div>
              <ul className="mt-1 space-y-1.5">
                {signal.confirmationConditions.map((condition) => (
                  <li key={condition} className="text-xs leading-relaxed text-terminal-text">+ {condition}</li>
                ))}
              </ul>
            </section>

            <section aria-label="Invalidation conditions">
              <div className="text-[10px] tracking-[0.16em] text-terminal-faint">WHAT WOULD INVALIDATE IT</div>
              <ul className="mt-1 space-y-1.5">
                {signal.invalidationConditions.map((condition) => (
                  <li key={condition} className="text-xs leading-relaxed text-terminal-text">− {condition}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>

      <details className="group mt-4 border-t border-terminal-border pt-3">
        <summary className="cursor-pointer list-none text-[10px] tracking-[0.16em] text-terminal-faint marker:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="transition-transform group-open:rotate-90">›</span>
            EVIDENCE · {signal.currentEvidenceCount} recent / {signal.baselineEvidenceCount} baseline
          </span>
        </summary>
        <div className="mt-2 divide-y divide-terminal-border border-y border-terminal-border">
          {signal.evidence.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-start justify-between gap-3 px-1 py-2.5 transition-colors hover:bg-terminal-hover"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-terminal-text">{item.title}</div>
                <div className="mt-0.5 text-[11px] text-terminal-muted">
                  {item.publisher} · {fmt.timeAgo(item.publishedAt)}
                </div>
              </div>
              <ExternalLink size={11} className="mt-0.5 flex-shrink-0 text-terminal-faint" />
            </a>
          ))}
        </div>
      </details>
    </article>
  );
}
