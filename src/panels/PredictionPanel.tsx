import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchPredictionPage } from '../api/finance';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { PredictionMarketsSection } from '../components/PredictionMarketsSection';
import { predictionRowsFromPages } from '../utils/marketPanelDisplay';

const cardsPerBatch = 12;

export function PredictionPanel() {
  const [visibleCount, setVisibleCount] = useState(cardsPerBatch);
  const [scanning, setScanning] = useState(false);
  const {
    data, isLoading, isError, isFetching, isFetchNextPageError, isRefetchError,
    hasNextPage, fetchNextPage, refetch,
  } = useInfiniteQuery({
    queryKey: ['prediction-market-pages'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => fetchPredictionPage(pageParam, signal),
    getNextPageParam: (last, _pages, _param, params) =>
      last.nextCursor && !params.includes(last.nextCursor) ? last.nextCursor : undefined,
    refetchInterval: query => visibleCount <= cardsPerBatch && (query.state.data?.pages.length ?? 0) <= 1 ? 2 * 60_000 : false,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const forecasts = useMemo(() => predictionRowsFromPages(data?.pages ?? []), [data]);
  const displayed = forecasts.slice(0, visibleCount);
  const remaining = forecasts.length - displayed.length;
  const updatedAt = data?.pages[0]?.updatedAt;

  async function showMore() {
    if (remaining > 0) {
      setVisibleCount(displayed.length + Math.min(cardsPerBatch, remaining));
      return;
    }
    if (!hasNextPage || isFetching || scanning) return;
    setScanning(true);
    try {
      // A raw source page can contain only sports, expired contracts or previously seen events.
      // Continue through a few such pages per click, keeping the already-read cards in place.
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await fetchNextPage({ cancelRefetch: false });
        if (result.isFetchNextPageError || !result.data) return;
        const count = predictionRowsFromPages(result.data.pages).length;
        if (count > displayed.length) {
          setVisibleCount(Math.min(count, displayed.length + cardsPerBatch));
          return;
        }
        if (!result.hasNextPage) return;
      }
    } finally {
      setScanning(false);
    }
  }

  return <>
    <WorkspaceHeader title="PREDICTION MARKETS">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-terminal-muted">
        <button type="button" disabled={isFetching || scanning} onClick={() => void refetch()} className="rounded border border-terminal-border px-3 py-1 text-terminal-muted hover:text-terminal-text disabled:opacity-50">{isFetching && !scanning ? 'Refreshing…' : 'Refresh'}</button>
        {updatedAt && <div>{data && data.pages.length > 1 ? 'First page checked ' : 'Feed checked '}{new Date(updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>}
      </div>
    </WorkspaceHeader>
    <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
      {isError && !data && <p role="status" className="text-xs text-terminal-muted">The public Polymarket feed is unavailable. Use Refresh to try again.</p>}
      {isRefetchError && data && <p role="status" className="text-xs text-terminal-muted">Refresh failed. Previously received prices remain visible.</p>}
      {isLoading || displayed.length > 0 ? (
        <PredictionMarketsSection predictions={displayed} loading={isLoading} showHeader={false} />
      ) : data && (
        <p className="text-xs text-terminal-muted">No eligible open markets in the events checked so far.</p>
      )}
      {data && (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 text-xs">
          <p className="w-full text-terminal-muted">
            Selected from Polymarket’s busiest open events. Contested outcomes with recent trading appear first.
            Single-winner events show the leading choices together. Daily changes are in percentage points.
          </p>
          <span role="status" className="text-terminal-muted">Showing {displayed.length} of {forecasts.length} loaded events</span>
          {isFetchNextPageError && <span role="status" className="text-terminal-muted">More events could not be loaded. Your current cards are still available.</span>}
          {(remaining > 0 || hasNextPage) && <button type="button" onClick={() => void showMore()} disabled={scanning || (isFetching && !remaining)}
            className="rounded border border-terminal-border px-3 py-1.5 text-terminal-accent hover:border-terminal-accent disabled:opacity-50">
            {scanning ? 'Finding more events…' : remaining > 0 ? 'Show ' + Math.min(cardsPerBatch, remaining) + ' more' : isFetchNextPageError ? 'Retry more events' : 'Load more events'}
          </button>}
        </div>
      )}
    </div>
  </>;
}
