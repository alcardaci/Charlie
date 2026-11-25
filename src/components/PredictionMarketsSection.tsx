import { PredictionForecast } from '../types';
import { fmt } from '../utils/formatters';
import { formatPredictionMove, formatPredictionProbability } from '../utils/marketPanelDisplay';

function formatPredictionDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function PredictionMarketsSection({
  predictions,
  loading,
  updatedAt,
  compact = false,
  showHeader = true,
  onOpenPanel,
}: {
  predictions: PredictionForecast[];
  loading: boolean;
  updatedAt?: string | null;
  compact?: boolean;
  showHeader?: boolean;
  onOpenPanel?: () => void;
}) {
  const gridClassName = compact
    ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2'
    : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3';
  const placeholderCount = compact ? 4 : 6;

  return (
    <div>
      {showHeader && (
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-terminal-muted text-xs font-bold tracking-wider">PREDICTION MARKETS</div>
          <div className="flex items-center gap-2">
            {onOpenPanel && compact && (
              <button
                onClick={onOpenPanel}
                className="px-2 py-1 rounded border border-terminal-border text-[11px] text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors"
              >
                OPEN PANEL
              </button>
            )}
            <div className="text-[11px] text-terminal-faint">
              Public Polymarket feed
              {updatedAt ? ` | Updated ${new Date(updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className={gridClassName}>
          {Array.from({ length: placeholderCount }).map((_, index) => (
            <div
              key={index}
              className={`shimmer rounded ${compact ? 'h-32' : 'h-48'}`}
            />
          ))}
        </div>
      ) : predictions.length > 0 ? (
        <div className={gridClassName}>
          {predictions.map((forecast) => (
            <PredictionForecastCard key={forecast.url ?? forecast.id} forecast={forecast} compact={compact} />
          ))}
        </div>
      ) : (
        <div className="bg-terminal-panel border border-terminal-border rounded p-4 text-terminal-faint text-xs">
          Polymarket forecasts are temporarily unavailable.
        </div>
      )}
    </div>
  );
}

function DailyMove({ change }: { change: number | null | undefined }) {
  const color = change == null || change === 0 ? 'text-terminal-faint' : change > 0 ? 'text-terminal-positive' : 'text-terminal-negative';
  return <span className={color}>{formatPredictionMove(change)}</span>;
}

function dollars(value: number | null): string {
  return value == null ? '—' : '$' + fmt.volume(value);
}

function PredictionForecastCard({ forecast, compact }: { forecast: PredictionForecast; compact: boolean }) {
  const group = forecast.outcomeGroup;
  const title = group ? forecast.eventTitle || forecast.question : forecast.question;
  const metrics = group ?? forecast;
  const shownOutcomes = group?.outcomes.slice(0, compact ? 2 : 3);
  const scope = group ? 'Event' : 'Contract';
  return (
    <article aria-label={title} className={'flex min-w-0 flex-col gap-2 rounded border border-terminal-border bg-terminal-panel ' + (compact ? 'p-3' : 'p-4')}>
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="font-bold uppercase tracking-wide text-terminal-accent">{forecast.theme}</span>
        <span className="text-terminal-faint">By {formatPredictionDate(group ? group.endDate : forecast.endDate)}</span>
      </div>
      <h3 className={'text-terminal-text leading-snug ' + (compact ? 'text-[13px]' : 'text-sm font-bold')}>{title}</h3>
      {group && shownOutcomes ? (
        <div className="space-y-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 gap-y-1 text-xs tabular-nums">
            <span className="text-[10px] text-terminal-faint">Top {shownOutcomes.length} of {group.count} priced choices</span>
            <span className="text-right text-[10px] text-terminal-faint">Price</span>
            <span className="text-right text-[10px] text-terminal-faint">24h change</span>
            {shownOutcomes.map((outcome, index) => (
              <div className="contents" key={outcome.label + index}>
                <span className="break-words text-terminal-text">{outcome.label}</span>
                <span className="text-right font-bold text-terminal-text">{formatPredictionProbability(outcome.yesPrice)}</span>
                <span className="text-right"><DailyMove change={outcome.yesChange24hr} /></span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-between gap-3 text-xs font-bold tabular-nums">
            <span className="text-terminal-positive">YES {formatPredictionProbability(forecast.yesPrice)}</span>
            <span className="text-terminal-negative">NO {formatPredictionProbability(forecast.noPrice)}</span>
          </div>
          <div aria-hidden="true" className="flex h-1.5 overflow-hidden rounded-full bg-terminal-elevated">
            <div className="bg-terminal-positive" style={{ width: (forecast.yesPrice ?? 0) * 100 + '%' }} />
            <div className="bg-terminal-negative" style={{ width: (forecast.noPrice ?? 0) * 100 + '%' }} />
          </div>
          <div className="text-[11px] text-terminal-faint">YES 24h change <DailyMove change={forecast.yesChange24hr} /></div>
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pt-1 text-[10px] text-terminal-faint">
        <span>{scope} 24h volume {dollars(metrics.volume24hr)}</span>
        {!compact && <span>{scope} liquidity {dollars(metrics.liquidity)}</span>}
        {forecast.url && <a className="text-terminal-accent hover:underline" href={forecast.url} target="_blank" rel="noreferrer">Open market</a>}
      </div>
    </article>
  );
}
