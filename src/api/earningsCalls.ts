import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import type {
  EarningsCallBriefPage, EarningsCallEvent, EarningsCallGuidancePage, EarningsCallInsightsPage,
  EarningsCallListPage, EarningsCallPhraseTrend, EarningsCallQuestionsPage, EarningsCallThemeHistory,
  EarningsCallTranscriptPage,
} from '../types/earningsCalls';

export class EarningsCallsRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function readEquibles<T>(route: string, params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/equibles/${route}?${params}`, { signal });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = typeof payload?.error === 'string' ? payload.error : 'Equibles could not complete this request.';
    throw new EarningsCallsRequestError(response.status, message);
  }
  return response.json();
}

export function fetchRecentEarningsCalls(since: string, until: string, symbols: string[], offset: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ since, until, symbols: symbols.join(','), offset: String(offset) });
  return readEquibles<EarningsCallListPage>('recent', params, signal);
}

const queryPolicy = {
  retry: false,
  staleTime: 60 * 60 * 1000,
  gcTime: 3 * 60 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};

export function earningsCallsQuery(symbol: string) {
  return infiniteQueryOptions({
    ...queryPolicy,
    queryKey: ['equibles', 'calls', symbol],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => readEquibles<EarningsCallListPage>('calls', new URLSearchParams({
      symbol, offset: String(pageParam),
    }), signal),
    getNextPageParam: ({ meta }) => meta.hasMore && meta.count > 0 ? meta.offset + meta.count : undefined,
  });
}

export function earningsTranscriptQuery(eventId: string) {
  return infiniteQueryOptions({
    ...queryPolicy,
    queryKey: ['equibles', 'transcript', eventId],
    initialPageParam: 0,
    queryFn: ({ client, pageParam }) => client.fetchQuery(earningsTranscriptPageQuery(eventId, pageParam)),
    getNextPageParam: (page) => page.hasMore && page.turnCount > 0 ? page.offset + page.turnCount : undefined,
  });
}

// Answer excerpts and the full transcript read the same source pages.
export function earningsTranscriptPageQuery(eventId: string, offset: number) {
  return analyticsQuery<EarningsCallTranscriptPage>('transcript', { eventId, offset: String(offset) });
}

function analyticsQuery<T>(route: string, params: Record<string, string>, enabled = true) {
  return queryOptions({
    ...queryPolicy,
    queryKey: ['equibles', route, params],
    enabled,
    queryFn: ({ signal }) => readEquibles<T>(route, new URLSearchParams(params), signal),
  });
}

function fiscalPeriod(call: EarningsCallEvent) {
  return {
    symbol: call.ticker,
    fiscalYear: String(call.fiscalYear ?? ''),
    fiscalQuarter: String(call.fiscalQuarter ?? ''),
  };
}

export function earningsBriefQuery(call: EarningsCallEvent) {
  return analyticsQuery<EarningsCallBriefPage>('brief', fiscalPeriod(call), Boolean(call.fiscalYear && call.fiscalQuarter));
}

export function earningsInsightsQuery(call: EarningsCallEvent) {
  return analyticsQuery<EarningsCallInsightsPage>('insights', fiscalPeriod(call), Boolean(call.fiscalYear && call.fiscalQuarter));
}

export function earningsGuidanceQuery(call: EarningsCallEvent) {
  return analyticsQuery<EarningsCallGuidancePage>('guidance', { ...fiscalPeriod(call), eventId: call.id }, Boolean(call.fiscalYear && call.fiscalQuarter));
}

export function earningsQuestionsQuery(eventId: string) {
  return analyticsQuery<EarningsCallQuestionsPage>('questions', { eventId });
}

export function earningsThemeHistoryQuery(symbol: string, calls = 8) {
  return analyticsQuery<EarningsCallThemeHistory>('theme-history', { symbol, calls: String(calls) });
}

export function earningsPhraseTrendQuery(symbol: string, phrase: string, calls = 8) {
  // Equibles counts whole words case-insensitively, so "AI" and "ai" share one lookup.
  const normalized = phrase.trim().replace(/\s+/g, ' ').toLowerCase();
  return analyticsQuery<EarningsCallPhraseTrend>('phrase-trend', { symbol, phrase: normalized, calls: String(calls) },
    normalized.length >= 2 && normalized.length <= 80);
}
