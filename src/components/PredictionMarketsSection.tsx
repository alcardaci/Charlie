import { TrendingDown, TrendingUp } from 'lucide-react';
import { PredictionForecast } from '../types';
import { fmt } from '../utils/formatters';

function formatPredictionProbability(value: number | null | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatPredictionDate(value: string | null): string {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
            <PredictionForecastCard key={forecast.id} forecast={forecast} compact={compact} />
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

function PredictionForecastCard({ forecast, compact }: { forecast: PredictionForecast; compact: boolean }) {
  const yesWidth = Math.max(0, Math.min(100, (forecast.yesPrice ?? 0) * 100));
  const noWidth = Math.max(0, Math.min(100, (forecast.noPrice ?? 0) * 100));

  if (compact) {
    return (
      <div className="bg-terminal-panel border border-terminal-border rounded p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded border border-terminal-accent/30 bg-terminal-accent/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-terminal-accent">
            {forecast.theme.toUpperCase()}
          </span>
          <span className="text-[10px] text-terminal-faint">{formatPredictionDate(forecast.endDate)}</span>
        </div>

        <div className="mt-2 min-h-[2.5rem] max-h-[2.5rem] overflow-hidden text-[13px] leading-snug text-terminal-text">
          {forecast.question}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
          <span className="text-terminal-positive">YES {formatPredictionProbability(forecast.yesPrice)}</span>
          <span className="text-terminal-negative">NO {formatPredictionProbability(forecast.noPrice)}</span>
        </div>

        <div className="mt-2 flex overflow-hidden rounded-full bg-terminal-elevated h-1.5">
          <div className="h-full bg-terminal-positive" style={{ width: `${yesWidth}%` }} />
          <div className="h-full bg-terminal-negative" style={{ width: `${noWidth}%` }} />
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-terminal-faint">
          <span>
            {forecast.leadingOutcome === 'Yes' ? 'Lean YES' : 'Lean NO'} {formatPredictionProbability(forecast.leadingProbability)}
          </span>
          <span>24H {fmt.volume(forecast.volume24hr)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-terminal-panel border border-terminal-border rounded p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded border border-terminal-accent/30 bg-terminal-accent/10 px-2 py-0.5 text-[11px] font-bold tracking-wide text-terminal-accent">
          {forecast.theme.toUpperCase()}
        </span>
        <span className="text-[11px] text-terminal-faint">By {formatPredictionDate(forecast.endDate)}</span>
      </div>

      <div className="mt-3 min-h-[3.75rem] text-sm leading-snug text-terminal-text">
        {forecast.question}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded border border-terminal-positive/20 bg-terminal-positive/5 px-3 py-2">
          <div className="text-[11px] text-terminal-faint">YES</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-terminal-positive">
            {formatPredictionProbability(forecast.yesPrice)}
          </div>
        </div>
        <div className="rounded border border-terminal-negative/20 bg-terminal-negative/5 px-3 py-2">
          <div className="text-[11px] text-terminal-faint">NO</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-terminal-negative">
            {formatPredictionProbability(forecast.noPrice)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex overflow-hidden rounded-full bg-terminal-elevated h-1.5">
        <div className="h-full bg-terminal-positive" style={{ width: `${yesWidth}%` }} />
        <div className="h-full bg-terminal-negative" style={{ width: `${noWidth}%` }} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-terminal-faint">
        <span>24H VOL {fmt.volume(forecast.volume24hr)}</span>
        <span>LIQ {fmt.volume(forecast.liquidity)}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
        <span className="flex items-center gap-1 text-terminal-faint">
          {forecast.leadingOutcome === 'Yes' ? (
            <TrendingUp size={12} className="text-terminal-positive" />
          ) : (
            <TrendingDown size={12} className="text-terminal-negative" />
          )}
          <span>Implied lean <span className="text-terminal-text">{forecast.leadingOutcome.toUpperCase()} {formatPredictionProbability(forecast.leadingProbability)}</span></span>
        </span>
        {forecast.url ? (
          <a
            href={forecast.url}
            target="_blank"
            rel="noreferrer"
            className="text-terminal-accent hover:underline"
          >
            OPEN MARKET
          </a>
        ) : (
          <span className="text-terminal-faint">{forecast.source}</span>
        )}
      </div>
    </div>
  );
}
