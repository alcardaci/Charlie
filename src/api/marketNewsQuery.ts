import type { QueryClient } from '@tanstack/react-query';
import { EMPTY_LIVE_NEWS, updateLiveNews, type LiveNewsState } from '../utils/liveNews';
import { fetchNewsFeed } from './finance';

export const NEWS_REFRESH_INTERVAL_MS = 60_000;
const marketNewsKey = ['news-feed', 'markets', 'all'] as const;

export function marketNewsQuery(client: QueryClient) {
  return {
    queryKey: marketNewsKey,
    staleTime: NEWS_REFRESH_INTERVAL_MS,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const batch = await fetchNewsFeed('markets', 'all', 30, signal);
      const previous = client.getQueryData<LiveNewsState>(marketNewsKey) ?? EMPTY_LIVE_NEWS;
      return updateLiveNews(previous, batch, Date.now(), true);
    },
  };
}
