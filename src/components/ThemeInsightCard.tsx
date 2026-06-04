import { AlertTriangle, ArrowUpRight, ExternalLink, Info, Sparkles } from 'lucide-react';
import type { DiscoveredTheme } from '../utils/themeDiscoveryEngine';
import { changeColor, fmt } from '../utils/formatters';

function themeScoreTone(score: number): string {
  if (score >= 78) return 'text-terminal-positive border-terminal-positive/30 bg-terminal-positive/10';
  if (score >= 62) return 'text-terminal-accent border-terminal-accent/30 bg-terminal-accent/10';
  return 'text-terminal-muted border-terminal-border bg-terminal-elevated/40';
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
  return (
    <div className="min-w-0 rounded border border-terminal-border bg-terminal-panel px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-terminal-faint">
        <span className="truncate">{label[0].toUpperCase() + label.slice(1)}</span>
        <InfoTooltip label={label} description={help.description} source={help.source} />
      </div>
      <div className="mt-1 font-bold text-terminal-text">{value}</div>
    </div>
  );
}

export function ThemeStatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded border border-terminal-border bg-terminal-elevated/30 p-3">
      <div className="text-[10px] tracking-[0.2em] text-terminal-faint">{label}</div>
      <div className="mt-1 text-lg font-bold text-terminal-text">{value}</div>
      <div className="mt-1 text-xs text-terminal-muted">{detail}</div>
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
  return (
    <article className="rounded border border-terminal-border bg-terminal-panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 panel-border-b bg-terminal-elevated/40">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-terminal-accent text-xs font-bold tracking-[0.22em]">{theme.label.toUpperCase()}</span>
            <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${themeScoreTone(theme.score)}`}>
              SCORE {theme.score}
            </span>
            <span className="text-[11px] text-terminal-faint">{theme.signalCount} signals · {theme.sourceDiversity} source types</span>
          </div>
          <div className="mt-2 text-sm text-terminal-text">{theme.summary}</div>
          <div className="mt-1 text-xs text-terminal-muted">
            Freshest signal {fmt.timeAgo(theme.freshestAt)} · Keywords: {theme.keywords.join(', ')}
          </div>
        </div>

        <div className="grid min-w-[320px] grid-cols-4 gap-2 text-[11px]">
          <ScoreTile label="emergence" value={theme.emergenceScore} help={SCORE_HELP.emergence} />
          <ScoreTile label="breadth" value={theme.breadthScore} help={SCORE_HELP.breadth} />
          <ScoreTile label="urgency" value={theme.urgencyScore} help={SCORE_HELP.urgency} />
          <ScoreTile label="relevance" value={theme.relevanceScore} help={SCORE_HELP.relevance} />
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)]">
        <div className="space-y-4">
          <section className="rounded border border-terminal-border bg-terminal-elevated/30 p-3">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.2em] text-terminal-faint">
              <Sparkles size={12} />
              THEME READ
            </div>
            <div className="mt-2 space-y-3">
              <div className="rounded border border-terminal-border bg-terminal-panel px-3 py-2">
                <div className="text-[10px] tracking-[0.18em] text-terminal-faint">THESIS</div>
                <div className="mt-1 text-xs text-terminal-text leading-relaxed">{theme.thesis}</div>
              </div>
              <div className="rounded border border-terminal-border bg-terminal-panel px-3 py-2">
                <div className="text-[10px] tracking-[0.18em] text-terminal-faint">WHY IT MATTERS</div>
                <div className="mt-1 text-xs text-terminal-text leading-relaxed">{theme.whyItMatters}</div>
              </div>
              <div className="rounded border border-terminal-border bg-terminal-panel px-3 py-2">
                <div className="text-[10px] tracking-[0.18em] text-terminal-faint">RECOMMENDED MOVE</div>
                <div className="mt-1 text-xs text-terminal-text leading-relaxed">{theme.actionSummary || theme.primaryRecommendation}</div>
              </div>
            </div>
          </section>

          <section className="rounded border border-terminal-border bg-terminal-elevated/30 p-3">
            <div className="text-[10px] tracking-[0.2em] text-terminal-faint">TRIGGERS</div>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              <div className="rounded border border-terminal-border bg-terminal-panel px-3 py-2">
                <div className="text-[10px] tracking-[0.18em] text-terminal-faint">CATALYSTS</div>
                <div className="mt-1 space-y-1.5">
                  {(theme.catalysts.length > 0 ? theme.catalysts : ['No clear catalyst identified yet']).map((item) => (
                    <div key={item} className="text-xs text-terminal-text leading-relaxed">{item}</div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-terminal-border bg-terminal-panel px-3 py-2">
                <div className="text-[10px] tracking-[0.18em] text-terminal-faint">WATCH NEXT</div>
                <div className="mt-1 space-y-1.5">
                  {(theme.watchItems.length > 0 ? theme.watchItems : theme.playbook).slice(0, 3).map((item) => (
                    <div key={item} className="text-xs text-terminal-text leading-relaxed">{item}</div>
                  ))}
                </div>
              </div>
              <div className="rounded border border-terminal-border bg-terminal-panel px-3 py-2">
                <div className="flex items-center gap-1 text-[10px] tracking-[0.18em] text-terminal-faint">
                  <AlertTriangle size={11} />
                  INVALIDATION
                </div>
                <div className="mt-1 space-y-1.5">
                  {(theme.invalidationSignals.length > 0 ? theme.invalidationSignals : ['No invalidation conditions provided']).map((item) => (
                    <div key={item} className="text-xs text-terminal-text leading-relaxed">{item}</div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded border border-terminal-border bg-terminal-elevated/30 p-3">
            <div className="text-[10px] tracking-[0.2em] text-terminal-faint">EVIDENCE</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {theme.sourceMix.map((source) => (
                <span
                  key={source.source}
                  className="rounded border border-terminal-border bg-terminal-panel px-2 py-1 text-xs text-terminal-text"
                >
                  {source.source.toUpperCase()} {source.count}
                </span>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {theme.evidence.map((item) => {
                const content = (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-terminal-text">{item.title}</div>
                      <div className="mt-1 text-[11px] text-terminal-muted">
                        {item.sourceLabel} · {item.detail} · {fmt.timeAgo(item.timestamp)}
                      </div>
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
                    className="block rounded border border-terminal-border bg-terminal-panel px-3 py-2 hover:bg-terminal-hover transition-colors"
                  >
                    {content}
                  </a>
                ) : (
                  <div key={item.id} className="rounded border border-terminal-border bg-terminal-panel px-3 py-2">
                    {content}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded border border-terminal-border bg-terminal-elevated/30 p-3">
            <div className="text-[10px] tracking-[0.2em] text-terminal-faint">EXPOSURE AND RESEARCH PATH</div>
            <div className="mt-2 text-sm text-terminal-text">{theme.portfolioImpact.label}</div>

            <div className="mt-3 grid gap-3">
              <div className="rounded border border-terminal-border bg-terminal-panel px-3 py-3">
                <div className="text-[10px] tracking-[0.18em] text-terminal-faint">PORTFOLIO</div>
                <div className="mt-1 text-xs text-terminal-text leading-relaxed">{theme.portfolioAngle || theme.portfolioImpact.portfolioRecommendation}</div>
                <div className="mt-1 text-[11px] text-terminal-muted">Weight touched: {fmt.pct(theme.portfolioImpact.portfolioWeightPct)}</div>
              </div>
              <div className="rounded border border-terminal-border bg-terminal-panel px-3 py-3">
                <div className="text-[10px] tracking-[0.18em] text-terminal-faint">WATCHLIST</div>
                <div className="mt-1 text-xs text-terminal-text leading-relaxed">{theme.watchlistAngle || theme.portfolioImpact.watchlistRecommendation}</div>
                <div className="mt-1 text-[11px] text-terminal-muted">
                  {theme.portfolioImpact.watchlistOverlap.length > 0 ? theme.portfolioImpact.watchlistOverlap.join(', ') : 'No overlap'}
                </div>
              </div>
              <div className="rounded border border-terminal-border bg-terminal-panel px-3 py-3">
                <div className="text-[10px] tracking-[0.18em] text-terminal-faint">OUTSIDE IDEAS</div>
                <div className="mt-1 text-xs text-terminal-text leading-relaxed">{theme.opportunityAngle || theme.portfolioImpact.opportunityRecommendation}</div>
                <div className="mt-1 text-[11px] text-terminal-muted">
                  {theme.portfolioImpact.externalIdeas.length > 0 ? theme.portfolioImpact.externalIdeas.join(', ') : 'No obvious gap'}
                </div>
              </div>
            </div>

            {theme.portfolioImpact.holdings.length > 0 && (
              <div className="mt-3 space-y-2">
                {theme.portfolioImpact.holdings.map((holding) => (
                  <div key={holding.symbol} className="flex items-center justify-between gap-3 rounded border border-terminal-border bg-terminal-panel px-3 py-2 text-xs">
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

          <section className="rounded border border-terminal-border bg-terminal-elevated/30 p-3">
            <div className="text-[10px] tracking-[0.2em] text-terminal-faint">LIQUID VEHICLES</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {theme.linkedAssets.map((asset) => (
                <button
                  key={`${asset.symbol}-${asset.overlap}`}
                  onClick={() => onOpenSymbol(asset.symbol)}
                  className={`rounded border px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-terminal-hover ${overlapTone(asset.overlap)}`}
                >
                  <div className="flex items-center gap-1">
                    <span className="font-bold">{asset.symbol}</span>
                    <ArrowUpRight size={11} />
                  </div>
                  <div className="mt-0.5 text-[11px] opacity-80">{asset.overlap.toUpperCase()} · {asset.mentionCount} mentions</div>
                  <div className="mt-1 text-[11px] text-terminal-text">
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
