import { AlertTriangle, ArrowUpRight, ExternalLink, Info } from 'lucide-react';
import type { DiscoveredTheme } from '../utils/themeDiscoveryEngine';
import { changeColor, fmt } from '../utils/formatters';

function themeScoreTone(score: number): string {
  if (score >= 78) return 'text-terminal-positive';
  if (score >= 62) return 'text-terminal-accent';
  return 'text-terminal-muted';
}

function formatSignalTiming(timestamp: number): string {
  const deltaMs = timestamp - Date.now();
  if (deltaMs <= 0) return fmt.timeAgo(timestamp);

  const hours = Math.round(deltaMs / 3_600_000);
  if (hours < 24) return `in ${Math.max(hours, 1)}h`;

  return `in ${Math.round(hours / 24)}d`;
}

function overlapTone(overlap: DiscoveredTheme['linkedAssets'][number]['overlap']): string {
  switch (overlap) {
    case 'portfolio':
      return 'border-terminal-positive/30 text-terminal-positive bg-terminal-positive/10';
    case 'watchlist':
      return 'border-terminal-accent/30 text-terminal-accent bg-terminal-accent/10';
    default:
      return 'border-terminal-border text-terminal-muted bg-terminal-elevated/40';
  }
}

function scoreIntensityTone(value: number): string {
  if (value >= 80) return 'text-terminal-negative';
  if (value >= 65) return 'text-amber-300';
  if (value >= 40) return 'text-terminal-muted';
  return 'text-terminal-positive';
}

const SCORE_HELP: Record<'emergence' | 'breadth' | 'urgency' | 'relevance', { description: string; source: string }> = {
  emergence: {
    description: 'How newly and quickly this theme is starting to form.',
    source: 'Used in the opportunities ranking.',
  },
  breadth: {
    description: 'How widely the signal is showing up across sources and angles.',
    source: 'Used in the opportunities ranking.',
  },
  urgency: {
    description: 'How immediate the catalyst and follow-through look right now.',
    source: 'Used in the opportunities ranking.',
  },
  relevance: {
    description: 'How directly this theme maps to current market context and exposure.',
    source: 'Used in the opportunities ranking.',
  },
};

function InfoTooltip({
  label,
  description,
  source,
}: {
  label: string;
  description: string;
  source: string;
}) {
  return (
    <div className="relative flex-shrink-0 group/tooltip">
      <button
        type="button"
        className="text-terminal-faint transition-colors hover:text-terminal-accent"
        aria-label={`About ${label}`}
      >
        <Info size={12} />
      </button>
      <div className="pointer-events-none absolute left-0 top-5 z-20 w-64 rounded border border-terminal-border bg-terminal-elevated p-3 opacity-0 shadow-2xl transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100">
        <div className="text-terminal-accent text-[11px] font-bold tracking-wide">{label.toUpperCase()}</div>
        <div className="mt-1 text-terminal-text text-xs leading-relaxed">{description}</div>
        <div className="mt-2 text-terminal-faint text-[11px] leading-relaxed">{source}</div>
      </div>
    </div>
  );
}

function ScoreTile({
  label,
  value,
  help,
}: {
  label: keyof typeof SCORE_HELP;
  value: number;
  help: { description: string; source: string };
}) {
  const displayLabel = label[0].toUpperCase() + label.slice(1);

  return (
    <div className="grid min-h-[5rem] min-w-0 grid-rows-[minmax(2.25rem,1fr)_auto] border-l border-terminal-border pl-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-[13px] font-semibold leading-tight tracking-[0.04em] text-terminal-muted">
          {displayLabel}
        </span>
        <InfoTooltip label={label} description={help.description} source={help.source} />
      </div>
      <div
        className={`flex items-baseline gap-0.5 text-xl font-bold leading-none ${scoreIntensityTone(value)}`}
        aria-label={`${label} score ${value} out of 100; color indicates relative score intensity, not direction or recommendation`}
        title="Relative score intensity only; color does not indicate a positive or negative market outcome."
      >
        {value}<span className="text-[11px] font-normal text-terminal-faint">/100</span>
      </div>
    </div>
  );
}

export function ThemeStatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <div className="flex items-baseline gap-2">
        <div className="text-base font-bold text-terminal-text">{value}</div>
        <div className="truncate text-[10px] tracking-[0.16em] text-terminal-faint">{label}</div>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-terminal-muted">{detail}</div>
    </div>
  );
}

export function ThemeInsightCard({
  theme,
  onOpenSymbol,
}: {
  theme: DiscoveredTheme;
  onOpenSymbol: (symbol: string) => void;
}) {
  const headingId = `theme-${theme.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  return (
    <article className="instrument-section overflow-hidden rounded border border-terminal-border bg-terminal-panel" aria-labelledby={headingId}>
      <header className="px-4 py-3 panel-border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 id={headingId} className="text-xs font-bold tracking-[0.18em] text-terminal-accent">{theme.label.toUpperCase()}</h3>
              <span
                className={`text-[11px] font-bold ${themeScoreTone(theme.score)}`}
                aria-label={`Relative signal score ${theme.score} out of 100; this is not a probability`}
                title="Relative rank within this signal snapshot, not a probability or forecast."
              >
                SIGNAL {theme.score}
              </span>
              <span className="text-[11px] text-terminal-faint">{theme.signalCount} signals · {theme.sourceDiversity} source types</span>
            </div>
            <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-terminal-text">
              <p>
                <span className="mr-2 text-[10px] font-bold tracking-[0.14em] text-terminal-faint">WHAT IT IS</span>
                {theme.summary}
              </p>
              <p className="text-xs text-terminal-muted">
                <span className="mr-2 text-[10px] font-bold tracking-[0.14em] text-terminal-faint">WHY IT MATTERS</span>
                {theme.whyItMatters}
              </p>
            </div>
            <p className="mt-1 text-[11px] text-terminal-muted">
              Nearest signal {formatSignalTiming(theme.freshestAt)} · {theme.keywords.join(', ')}
            </p>
          </div>

          <div className="grid w-full grid-cols-2 gap-x-4 gap-y-4 border-t border-terminal-border pt-3 md:w-[32rem] md:border-0 md:pt-0">
            <ScoreTile label="emergence" value={theme.emergenceScore} help={SCORE_HELP.emergence} />
            <ScoreTile label="breadth" value={theme.breadthScore} help={SCORE_HELP.breadth} />
            <ScoreTile label="urgency" value={theme.urgencyScore} help={SCORE_HELP.urgency} />
            <ScoreTile label="relevance" value={theme.relevanceScore} help={SCORE_HELP.relevance} />
          </div>
        </div>
      </header>

      <div className="grid gap-5 p-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)] 2xl:gap-0 2xl:divide-x 2xl:divide-terminal-border">
        <div className="min-w-0 space-y-4 2xl:pr-4">
          <section aria-label="Theme analysis">
            <div className="text-[10px] tracking-[0.18em] text-terminal-faint">THEME READ</div>
            <dl className="mt-1 divide-y divide-terminal-border">
              <div className="grid gap-1 py-2.5 md:grid-cols-[8rem_minmax(0,1fr)] md:gap-3">
                <dt className="text-[10px] tracking-[0.14em] text-terminal-faint">THESIS</dt>
                <dd className="text-xs leading-relaxed text-terminal-text">{theme.thesis}</dd>
              </div>
              <div className="grid gap-1 py-2.5 md:grid-cols-[8rem_minmax(0,1fr)] md:gap-3">
                <dt className="text-[10px] tracking-[0.14em] text-terminal-faint">NEXT MOVE</dt>
                <dd className="text-xs leading-relaxed text-terminal-text">{theme.actionSummary || theme.primaryRecommendation}</dd>
              </div>
            </dl>
          </section>

          <details className="group border-t border-terminal-border pt-3">
            <summary className="cursor-pointer list-none text-[10px] tracking-[0.16em] text-terminal-faint marker:hidden">
              <span className="inline-flex items-center gap-2">
                <span className="transition-transform group-open:rotate-90">›</span>
                TRIGGERS, WATCH ITEMS & INVALIDATION
              </span>
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-3 md:gap-0 md:divide-x md:divide-terminal-border">
              <div className="md:pr-3">
                <div className="text-[10px] tracking-[0.14em] text-terminal-faint">CATALYSTS</div>
                <ul className="mt-1 space-y-1.5">
                  {(theme.catalysts.length > 0 ? theme.catalysts : ['No clear catalyst identified yet']).map((item) => (
                    <li key={item} className="text-xs leading-relaxed text-terminal-text">{item}</li>
                  ))}
                </ul>
              </div>
              <div className="md:px-3">
                <div className="text-[10px] tracking-[0.14em] text-terminal-faint">WATCH NEXT</div>
                <ul className="mt-1 space-y-1.5">
                  {(theme.watchItems.length > 0 ? theme.watchItems : theme.playbook).slice(0, 3).map((item) => (
                    <li key={item} className="text-xs leading-relaxed text-terminal-text">{item}</li>
                  ))}
                </ul>
              </div>
              <div className="md:pl-3">
                <div className="flex items-center gap-1 text-[10px] tracking-[0.14em] text-terminal-faint">
                  <AlertTriangle size={11} />
                  INVALIDATION
                </div>
                <ul className="mt-1 space-y-1.5">
                  {(theme.invalidationSignals.length > 0 ? theme.invalidationSignals : ['No invalidation conditions provided']).map((item) => (
                    <li key={item} className="text-xs leading-relaxed text-terminal-text">{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>

          <details className="group border-t border-terminal-border pt-3">
            <summary className="cursor-pointer list-none marker:hidden">
              <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.16em] text-terminal-faint">
                <span className="transition-transform group-open:rotate-90">›</span>
                EVIDENCE · {theme.evidence.length}
              </span>
              <span className="ml-3 text-[11px] text-terminal-muted">
                {theme.sourceMix.map((source) => `${source.source} ${source.count}`).join(' · ')}
              </span>
            </summary>
            <div className="mt-2 divide-y divide-terminal-border border-y border-terminal-border">
              {theme.evidence.map((item) => {
                const content = (
                  <div className="flex items-start justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-terminal-text">{item.title}</div>
                      <div className="mt-0.5 text-[11px] text-terminal-muted">
                        {item.sourceLabel} · {item.detail} · {fmt.timeAgo(item.timestamp)}
                      </div>
                      {item.context && (
                        <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-terminal-faint">{item.context}</div>
                      )}
                    </div>
                    {item.url && <ExternalLink size={11} className="mt-0.5 flex-shrink-0 text-terminal-faint" />}
                  </div>
                );

                return item.url ? (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block px-1 transition-colors hover:bg-terminal-hover"
                  >
                    {content}
                  </a>
                ) : (
                  <div key={item.id} className="px-1">{content}</div>
                );
              })}
            </div>
            {theme.filingEvidence && theme.filingEvidence.length > 0 && (
              <div className="mt-3 border-t border-terminal-border pt-2">
                <div className="text-[10px] tracking-[0.14em] text-terminal-faint">FILING EVIDENCE</div>
                <div className="mt-1 space-y-1">
                  {theme.filingEvidence.slice(0, 3).map((item) => (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-2 text-[11px] text-terminal-muted hover:text-terminal-text"
                    >
                      <span>{item.symbol} · {item.form} · filed {item.filedDate}</span>
                      <ExternalLink size={10} className="flex-shrink-0 text-terminal-faint" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </details>
        </div>

        <div className="min-w-0 space-y-4 2xl:pl-4">
          <section aria-label="Exposure and research path">
            <div className="text-[10px] tracking-[0.18em] text-terminal-faint">EXPOSURE & RESEARCH PATH</div>
            <div className="mt-1 text-sm text-terminal-text">{theme.portfolioImpact.label}</div>

            <dl className="mt-2 divide-y divide-terminal-border border-y border-terminal-border">
              <div className="py-2.5">
                <dt className="text-[10px] tracking-[0.14em] text-terminal-faint">PORTFOLIO</dt>
                <dd className="mt-1 text-xs leading-relaxed text-terminal-text">{theme.portfolioAngle || theme.portfolioImpact.portfolioRecommendation}</dd>
                <div className="mt-1 text-[11px] text-terminal-muted">Weight touched: {fmt.pct(theme.portfolioImpact.portfolioWeightPct)}</div>
              </div>
              <div className="py-2.5">
                <dt className="text-[10px] tracking-[0.14em] text-terminal-faint">WATCHLIST</dt>
                <dd className="mt-1 text-xs leading-relaxed text-terminal-text">{theme.watchlistAngle || theme.portfolioImpact.watchlistRecommendation}</dd>
                <div className="mt-1 text-[11px] text-terminal-muted">
                  {theme.portfolioImpact.watchlistOverlap.length > 0 ? theme.portfolioImpact.watchlistOverlap.join(', ') : 'No overlap'}
                </div>
              </div>
              <div className="py-2.5">
                <dt className="text-[10px] tracking-[0.14em] text-terminal-faint">OUTSIDE IDEAS</dt>
                <dd className="mt-1 text-xs leading-relaxed text-terminal-text">{theme.opportunityAngle || theme.portfolioImpact.opportunityRecommendation}</dd>
                <div className="mt-1 text-[11px] text-terminal-muted">
                  {theme.portfolioImpact.externalIdeas.length > 0 ? theme.portfolioImpact.externalIdeas.join(', ') : 'No obvious gap'}
                </div>
              </div>
            </dl>

            {theme.portfolioImpact.holdings.length > 0 && (
              <div className="divide-y divide-terminal-border">
                {theme.portfolioImpact.holdings.map((holding) => (
                  <div key={holding.symbol} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <div>
                      <div className="font-bold text-terminal-text">{holding.symbol}</div>
                      <div className="text-terminal-faint">{holding.label}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-terminal-text">{fmt.marketCap(holding.currentValue)}</div>
                      <div className="text-terminal-muted">{fmt.pct(holding.weightPct)} weight</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="border-t border-terminal-border pt-3">
            <div className="text-[10px] tracking-[0.18em] text-terminal-faint">LIQUID VEHICLES</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {theme.linkedAssets.map((asset) => (
                <button
                  type="button"
                  key={`${asset.symbol}-${asset.overlap}`}
                  onClick={() => onOpenSymbol(asset.symbol)}
                  className={`rounded border px-2 py-1.5 text-left text-xs transition-colors hover:bg-terminal-hover ${overlapTone(asset.overlap)}`}
                >
                  <div className="flex items-center gap-1">
                    <span className="font-bold">{asset.symbol}</span>
                    <span className="text-[10px] opacity-75">{asset.mentionCount}×</span>
                    <ArrowUpRight size={10} />
                  </div>
                  <div className="mt-0.5 text-[11px] text-terminal-text">
                    {fmt.price(asset.price)} {asset.changePct != null && <span className={changeColor(asset.changePct)}>{fmt.pct(asset.changePct)}</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </article>
  );
}
