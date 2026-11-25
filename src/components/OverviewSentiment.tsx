import { useId } from 'react';
import { Info } from 'lucide-react';
import type { MarketSentimentPillar, MarketSentimentSnapshot } from '../types';
import { changeColor } from '../utils/formatters';
import { formatSentimentScore } from '../utils/marketPanelDisplay';
import './OverviewSentiment.css';

const SENTIMENT_EXPLAINERS: Record<'composite' | MarketSentimentPillar['key'], { description: string; source: string }> = {
  composite: {
    description: 'The score is the equal-weight average of the available pillars. A higher score indicates greater risk appetite.',
    source: 'Derived from latest available Yahoo Finance quotes for ^VIX, SPY, QQQ, IWM, RSP, HYG, LQD, TLT, and GLD.',
  },
  volatility: {
    description: 'A lower score indicates greater market stress. The score reaches zero when the VIX is at least 32 and has risen at least 4% from its previous close.',
    source: 'Latest available Yahoo Finance quote data from ^VIX.',
  },
  breadth: {
    description: 'Measures how broad market participation is by comparing small caps and equal-weight performance against the S&P 500.',
    source: 'Latest available Yahoo Finance quote data from SPY, IWM, and RSP.',
  },
  credit: {
    description: 'Measures risk appetite across credit and duration by comparing high-yield credit, investment grade credit, and Treasury behavior.',
    source: 'Latest available Yahoo Finance quote data from HYG, LQD, and TLT.',
  },
  leadership: {
    description: 'Starts at 50, adds 10 times the daily QQQ return and 14 times its lead over SPY, then subtracts 6 times the GLD return. Returns are in percentage points. The score is capped at 0 and 100.',
    source: 'Latest available Yahoo Finance quote data from QQQ, SPY, and GLD.',
  },
};

const sentimentQuoteClock = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short',
});

function SentimentSymbolLinks({ symbols, onSelect }: {
  symbols: string[];
  onSelect: (symbol: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {symbols.map(symbol => {
        const label = symbol === '^VIX' ? 'VIX' : symbol;
        return (
          <button key={symbol} type="button" onClick={() => onSelect(symbol)} title={`Open ${label}`}
            className="rounded border border-terminal-border bg-terminal-elevated px-1.5 py-0.5 text-[11px] text-terminal-faint hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors">
            {label}
          </button>
        );
      })}
    </div>
  );
}

function SentimentQuoteDetail({ pillar }: { pillar: MarketSentimentPillar }) {
  return (
    <>
      <div className="text-terminal-text text-xs mt-2 leading-relaxed">
        {pillar.detail.split(/([+-]\d+(?:\.\d+)?(?:%| pp))/).map((part, index) =>
          index % 2 === 1 ? <span key={index} className={changeColor(parseFloat(part))}>{part}</span> : part
        )}
      </div>
      {pillar.quoteTime != null && (
        <div className="mt-1 text-[11px] text-terminal-muted">
          {pillar.symbols.length === 1 ? 'Quote' : 'Oldest quote'}{' '}
          <time dateTime={new Date(pillar.quoteTime).toISOString()}>{sentimentQuoteClock.format(pillar.quoteTime)}</time>
        </div>
      )}
    </>
  );
}

const gaugeRings = [37, 34, 31, 28].map((count, ring) => {
  const radius = 110 - ring * 9;
  return Array.from({ length: count }, (_, index) => {
    const angle = Math.PI * (1 - index / (count - 1));
    return {
      x: 122 + radius * Math.cos(angle),
      y: 117 - radius * Math.sin(angle),
      radius: 2.8 - ring * 0.13,
      threshold: (index + 0.5) * 100 / count,
    };
  });
}).flat();

function CompositeDial({ score, regime }: Pick<MarketSentimentSnapshot, 'score' | 'regime'>) {
  const value = formatSentimentScore(score);
  const available = score != null && Number.isFinite(score);
  return (
    <div className="sentiment-dial" role="img"
      aria-label={available ? `Composite score ${value} out of 100, ${regime}` : 'Composite score unavailable'}>
      <svg viewBox="0 0 244 140" aria-hidden="true">
        {gaugeRings.map((dot, index) => (
          <circle key={index} cx={dot.x} cy={dot.y} r={dot.radius}
            fill={available && score >= dot.threshold ? 'var(--terminal-accent)' : 'var(--sentiment-track)'} />
        ))}
      </svg>
      <span className="sentiment-dial-value instrument-value" aria-hidden="true">{available ? value : '—'}</span>
      <span className={`sentiment-dial-regime ${available ? 'text-terminal-accent' : 'text-terminal-faint'}`} aria-hidden="true">
        {regime}
      </span>
    </div>
  );
}

export function OverviewSentiment({ sentiment, isLoading, onSelectSymbol }: {
  sentiment?: MarketSentimentSnapshot;
  isLoading: boolean;
  onSelectSymbol: (symbol: string) => void;
}) {
  const id = useId();
  const tracked = [...new Set(sentiment?.pillars.flatMap(pillar => pillar.symbols))];
  return (
    <section className="overview-primary-panel overview-sentiment" aria-labelledby={id}>
      <h2 className="instrument-heading text-xs font-bold" id={id}>MARKET SENTIMENT</h2>
      {!sentiment ? (
        <p className="py-3 text-terminal-faint text-xs" role="status">
          {isLoading ? 'Loading sentiment…' : 'Sentiment inputs are unavailable right now.'}
        </p>
      ) : (
        <>
          <div className="sentiment-instrument">
            <div className="min-w-0">
              <div className="relative flex items-center justify-between gap-2 text-terminal-faint text-xs">
                Composite Regime
                <details className="sentiment-help">
                  <summary aria-label="About Composite Regime" className="hover:text-terminal-accent"><Info size={13} /></summary>
                  <div className="absolute left-0 top-full z-20 mt-1 rounded border border-terminal-border bg-terminal-elevated p-3 shadow-xl">
                    <p className="text-terminal-text">{SENTIMENT_EXPLAINERS.composite.description}</p>
                    <p className="mt-2 text-[11px]">{SENTIMENT_EXPLAINERS.composite.source}</p>
                  </div>
                </details>
              </div>
              <CompositeDial score={sentiment.score} regime={sentiment.regime} />
              <p className="text-[11px] leading-relaxed text-terminal-muted">{sentiment.summary}</p>
            </div>
            <div className="sentiment-pillars">
              {sentiment.pillars.map(pillar => {
                const { description, source } = SENTIMENT_EXPLAINERS[pillar.key];
                return (
                  <details key={pillar.key} name={id} className="sentiment-pillar">
                    <summary>
                      <span className="min-w-0 text-terminal-muted">
                        {pillar.label}
                        <span className="instrument-meter sentiment-meter mt-1 block h-1.5 rounded-full overflow-hidden" aria-hidden="true">
                          <span className="block h-full bg-terminal-accent" style={{ width: `${pillar.score ?? 0}%` }} />
                        </span>
                      </span>
                      <span className={pillar.score == null ? 'sentiment-pillar-missing' : 'instrument-value sentiment-pillar-score'}>
                        {formatSentimentScore(pillar.score)}
                      </span>
                      <span className="sr-only"> · {pillar.signal} signal</span>
                      <span className="sentiment-chevron" aria-hidden="true" />
                    </summary>
                    <div className="pb-2.5">
                      <SentimentQuoteDetail pillar={pillar} />
                      <div className="my-2"><SentimentSymbolLinks symbols={pillar.symbols} onSelect={onSelectSymbol} /></div>
                      <p className="text-[11px] leading-relaxed text-terminal-faint">{description}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-terminal-faint">{source}</p>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
          {tracked.length > 0 && (
            <div className="sentiment-tracked">
              <div className="mb-1 text-[11px] text-terminal-faint">Tracked instruments</div>
              <SentimentSymbolLinks symbols={tracked} onSelect={onSelectSymbol} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
