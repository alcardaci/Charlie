import { useEffect, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { fetchConnectionStatuses, fetchMacroReleaseCalendar } from '../api/finance';
import { fetchRecentEarningsCalls } from '../api/earningsCalls';
import { CalendarEvent } from '../types';
import type { EarningsCallEvent } from '../types/earningsCalls';
import { calendarCallLookups, matchCalendarCall } from '../utils/calendarEarningsCalls';
import { useTerminalStore } from '../store/useTerminalStore';
import { EarningsCalls } from './EarningsCalls';
import { OverviewSectionHeader } from './OverviewSectionHeader';

const CATEGORY_COLORS: Record<CalendarEvent['category'], string> = {
  economic: 'text-terminal-blue',
  earnings: 'text-terminal-positive',
  policy: 'text-terminal-accent',
  geopolitical: 'text-terminal-negative',
};

type CategoryFilter = 'all' | CalendarEvent['category'];

const CATEGORY_FILTERS: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'economic', label: 'Economic' },
  { value: 'earnings', label: 'Earnings' },
  { value: 'policy', label: 'Policy' },
  { value: 'geopolitical', label: 'Geopolitical' },
];

const IMPORTANCE_COLORS: Record<CalendarEvent['importance'], string> = {
  high: 'bg-terminal-accent/20 border-terminal-accent/60',
  medium: 'bg-terminal-accent/10 border-terminal-accent/40',
  low: 'bg-terminal-border/20 border-terminal-border/40',
};

function toYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function EventsCalendar({ overview = false }: { overview?: boolean }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [selectedCall, setSelectedCall] = useState<EarningsCallEvent | null>(null);
  const setActivePanel = useTerminalStore(state => state.setActivePanel);

  const from = toYmd(new Date(month.getFullYear(), month.getMonth(), 1));
  const to = toYmd(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const today = new Date();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['macro-calendar', from, to],
    queryFn: () => fetchMacroReleaseCalendar(from, to),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnMount: 'always',
    retry: 1,
  });

  const events = data?.events ?? [];
  const filteredEvents = category === 'all' ? events : events.filter((event) => event.category === category);
  const todayYmd = today.toISOString().slice(0, 10);
  const lookups = calendarCallLookups(filteredEvents, todayYmd);
  const connection = useQuery({
    queryKey: ['connection-status'], queryFn: fetchConnectionStatuses, staleTime: 30_000, enabled: lookups.length > 0,
  });
  const batches = useQueries({
    queries: (connection.data?.equibles ? lookups : []).map(({ since, until, symbols }) => ({
      queryKey: ['equibles', 'recent', since, until, symbols],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const first = await fetchRecentEarningsCalls(since, until, symbols, 0, signal);
        if (!first.meta.hasMore || first.meta.count === 0) return first;
        // A month normally yields at most one call per issuer. Cap paging to
        // protect the shared daily allowance if the provider returns extra rows.
        try {
          const next = await fetchRecentEarningsCalls(since, until, symbols, first.meta.count, signal);
          return { ...next, data: [...first.data, ...next.data], notice: next.notice || first.notice };
        } catch (error) {
          if (signal.aborted) throw error;
          return { ...first, notice: 'Some additional earnings-call listings could not be loaded.' };
        }
      },
      staleTime: 60 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000, retry: false,
    })),
  });
  const calls = [...new Map(batches.flatMap(batch => batch.data?.data ?? []).map(call => [call.id, call])).values()];
  const lookupError = batches.find(batch => batch.error)?.error;
  const availabilityNote = lookupError ? `Transcript lookup: ${lookupError.message}`
    : batches.find(batch => batch.data?.notice)?.data?.notice
    || (batches.some(batch => batch.data?.meta.hasMore) ? 'Transcript coverage is partial for this month.' : null);
  const categoryLabel = CATEGORY_FILTERS.find((filter) => filter.value === category)!.label;
  const monthName = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const monthControls = (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="Previous month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))} className="p-0.5 text-terminal-faint hover:text-terminal-muted">
        <ChevronLeft size={10} />
      </button>
      <span className="text-terminal-text text-xs font-mono w-28 text-center">{monthName}</span>
      <button type="button" aria-label="Next month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))} className="p-0.5 text-terminal-faint hover:text-terminal-muted">
        <ChevronRight size={10} />
      </button>
    </div>
  );
  return (
    <div className="instrument-section flex flex-col h-full bg-terminal-panel">
      {overview ? (
        <OverviewSectionHeader title="EVENTS">{monthControls}</OverviewSectionHeader>
      ) : (
        <div className="instrument-section flex items-center justify-between px-3 py-1.5 panel-border-b flex-shrink-0">
          <span className="text-terminal-accent text-xs font-bold tracking-wider">EVENTS</span>
          {monthControls}
        </div>
      )}

      <div className="px-3 py-2 panel-border-b flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
        <label className="flex items-center gap-2 text-terminal-muted text-xs">
          <span>Event category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as CategoryFilter)}
            className="bg-terminal-elevated border border-terminal-border rounded px-2 py-1 text-terminal-text text-xs focus:outline-none focus:border-terminal-accent"
          >
            {CATEGORY_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
          </select>
        </label>
        {!isLoading && data && <span aria-live="polite" className="text-terminal-faint text-xs">{filteredEvents.length} of {events.length} events</span>}
      </div>

      <div className="px-2 py-1.5 border-b border-terminal-border/40 flex-shrink-0">
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <LegendDot color="bg-terminal-blue" label="Economic" />
          <LegendDot color="bg-terminal-positive" label="Earnings" />
          <LegendDot color="bg-terminal-accent" label="Policy" />
          <LegendDot color="bg-terminal-negative" label="Geopolitical" />
        </div>
      </div>

      {data?.error && (
        <div className="px-3 py-2 border-b border-terminal-border/40 text-terminal-faint text-xs">
          {data.error}
        </div>
      )}

      {availabilityNote && <p role="status" className="px-3 py-1 text-xs text-terminal-muted">{availabilityNote}</p>}
      {category === 'earnings' && lookups.length > 0 && connection.data?.equibles === false && (
        <p className="px-3 py-1 text-xs text-terminal-muted">For transcripts, connect Equibles in{' '}
          <button type="button" className="text-terminal-accent underline" onClick={() => setActivePanel('settings')}>Settings</button>.
        </p>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-20 gap-2 text-terminal-faint text-xs">
            <Loader2 size={12} className="animate-spin" />
            Loading calendar...
          </div>
        ) : isError && events.length === 0 ? (
          <div className="p-4 text-center text-terminal-faint text-xs">
            Could not load calendar data
          </div>
        ) : events.length === 0 ? (
          <div className="p-4 text-center text-terminal-faint text-xs">
            No scheduled events this month
          </div>
        ) : filteredEvents.length === 0 ? (
          <div role="status" className="p-4 text-center text-terminal-faint text-xs">
            No {categoryLabel.toLowerCase()} events this month. Choose All to see other categories.
          </div>
        ) : (
          <div className="divide-y divide-terminal-border/40">
            {filteredEvents.map((event, index) => {
              const eventDate = new Date(`${event.date}T00:00:00`);
              const isToday = eventDate.toDateString() === today.toDateString();
              const isPast = eventDate < today && !isToday;
              const call = matchCalendarCall(event, calls, todayYmd);

              return (
                <div
                  key={`${event.title}-${event.date}-${index}`}
                  className={`px-3 py-2 border-l-2 ${IMPORTANCE_COLORS[event.importance]} ${isPast && !call ? 'opacity-50' : ''} ${isToday ? 'ring-1 ring-inset ring-terminal-accent/30' : ''}`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-terminal-text text-xs font-mono whitespace-nowrap">
                      {eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className={`text-xs font-bold ${CATEGORY_COLORS[event.category]}`}>
                      {event.category.toUpperCase()}
                    </span>
                    {event.country && (
                      <span className="text-terminal-faint text-xs">{event.country}</span>
                    )}
                    {isToday && (
                      <span className="text-terminal-accent text-xs font-bold ml-auto">TODAY</span>
                    )}
                  </div>
                  <p className="text-terminal-text text-xs leading-snug line-clamp-2">{event.title}</p>
                  {(event.description || event.source) && (
                    <p className="text-terminal-faint text-xs mt-0.5">
                      {[event.description, event.source].filter(Boolean).join(' | ')}
                    </p>
                  )}
                  {call && (
                    <button type="button" aria-label={`Open transcript for ${event.symbol} earnings on ${event.date}`}
                      className="mt-1 text-xs font-bold text-terminal-accent hover:underline focus-visible:underline"
                      onClick={e => { e.currentTarget.focus(); setSelectedCall(call); }}>
                      Open transcript
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {selectedCall && <CalendarCallDialog call={selectedCall} onDismiss={() => setSelectedCall(null)} />}
    </div>
  );
}

function CalendarCallDialog({ call, onDismiss }: { call: EarningsCallEvent; onDismiss: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog ref={ref} aria-label={call.ticker + ' earnings call'}
      onCancel={event => { event.preventDefault(); onDismiss(); }}
      onKeyDown={event => event.stopPropagation()}
      className="m-auto max-h-[90dvh] w-[min(56rem,95vw)] overflow-y-auto overscroll-contain rounded border border-terminal-border bg-terminal-panel p-0 text-terminal-text shadow-xl backdrop:bg-black/60">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-terminal-border bg-terminal-panel px-3 py-2">
        <h2 className="instrument-heading text-xs font-bold">{call.ticker} · Earnings calls</h2>
        <button type="button" aria-label="Close earnings call" className="rounded p-1 text-terminal-muted hover:text-terminal-accent"
          onClick={onDismiss}><X size={16} aria-hidden="true" /></button>
      </div>
      <EarningsCalls symbol={call.ticker} initialCall={call} />
    </dialog>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
      <span className="text-terminal-faint">{label}</span>
    </div>
  );
}
