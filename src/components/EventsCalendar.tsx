import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { fetchMacroReleaseCalendar } from '../api/finance';
import { CalendarEvent } from '../types';

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

export function EventsCalendar() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [category, setCategory] = useState<CategoryFilter>('all');

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
  const categoryLabel = CATEGORY_FILTERS.find((filter) => filter.value === category)!.label;
  const monthName = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="instrument-section flex flex-col h-full bg-terminal-panel">
      <div className="instrument-section flex items-center justify-between px-3 py-1.5 panel-border-b flex-shrink-0">
        <span className="text-terminal-accent text-xs font-bold tracking-wider">EVENTS</span>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))} className="p-0.5 text-terminal-faint hover:text-terminal-muted">
            <ChevronLeft size={10} />
          </button>
          <span className="text-terminal-text text-xs font-mono w-28 text-center">{monthName}</span>
          <button type="button" aria-label="Next month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))} className="p-0.5 text-terminal-faint hover:text-terminal-muted">
            <ChevronRight size={10} />
          </button>
        </div>
      </div>

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

              return (
                <div
                  key={`${event.title}-${event.date}-${index}`}
                  className={`px-3 py-2 border-l-2 ${IMPORTANCE_COLORS[event.importance]} ${isPast ? 'opacity-50' : ''} ${isToday ? 'ring-1 ring-inset ring-terminal-accent/30' : ''}`}
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
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
