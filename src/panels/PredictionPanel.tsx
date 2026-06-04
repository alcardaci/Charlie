import { useQuery } from '@tanstack/react-query';
import { fetchPredictionForecasts } from '../api/finance';
import { PredictionMarketsSection } from '../components/PredictionMarketsSection';

export function PredictionPanel() {
  const { data: predictionSnapshot, isLoading } = useQuery({
    queryKey: ['prediction-markets-panel', 12],
    queryFn: () => fetchPredictionForecasts(12),
    refetchInterval: 2 * 60 * 1000,
    staleTime: 60 * 1000,
    retry: 1,
  });

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-terminal-accent font-bold text-sm tracking-wider">PREDICTION MARKETS</h1>
          <p className="text-xs text-terminal-faint mt-1">
            Polymarket forecasts across macro, politics, geopolitics, crypto, and business themes.
          </p>
        </div>
        <div className="text-xs text-terminal-faint">
          Read-only Polymarket forecast feed
          {predictionSnapshot?.updatedAt ? ` | Updated ${new Date(predictionSnapshot.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </div>
      </div>

      <PredictionMarketsSection
        predictions={predictionSnapshot?.forecasts ?? []}
        loading={isLoading}
        updatedAt={predictionSnapshot?.updatedAt ?? null}
        showHeader={false}
      />
    </div>
  );
}
