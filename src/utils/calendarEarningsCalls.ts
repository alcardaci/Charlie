import type { CalendarEvent } from '../types';
import type { EarningsCallEvent } from '../types/earningsCalls';

interface CalendarCallLookup {
  since: string;
  until: string;
  symbols: string[];
}

const usTradingDate = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York',
});

function shiftDate(ymd: string, days: number) {
  const date = new Date(ymd + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function calendarCallLookups(events: CalendarEvent[], today: string): CalendarCallLookup[] {
  const eligible = events.filter(event => event.category === 'earnings' && event.symbol && event.date <= today);
  const lookups: CalendarCallLookup[] = [];
  // A release and its call can straddle a weekend or month boundary. Group nearby
  // report dates within Equibles' 31-day, 25-ticker limits rather than polling each issuer.
  const tomorrow = shiftDate(today, 1);
  for (const event of eligible.sort((a, b) => a.date.localeCompare(b.date))) {
    const symbol = event.symbol!;
    const since = shiftDate(event.date, -1);
    const afterRelease = shiftDate(event.date, 8);
    const until = afterRelease < tomorrow ? afterRelease : tomorrow;
    const batch = lookups[lookups.length - 1];
    if (!batch || until > shiftDate(batch.since, 31) || (batch.symbols.length >= 25 && !batch.symbols.includes(symbol))) {
      lookups.push({ since, until, symbols: [symbol] });
    } else {
      batch.until = until;
      if (!batch.symbols.includes(symbol)) batch.symbols.push(symbol);
    }
  }
  for (const batch of lookups) batch.symbols.sort();
  return lookups;
}

function actualCallDay(call: EarningsCallEvent): string | null {
  if (call.callDateIsPeriodEnd || !call.callDate) return null;
  const date = new Date(call.callDate);
  if (!Number.isFinite(date.getTime())) return null;
  // Equibles encodes a date without a known time as midnight UTC. Keep that
  // date intact. Timestamped calls correspond to the US calendar's exchange day.
  const utc = date.toISOString();
  return utc.endsWith('T00:00:00.000Z') ? utc.slice(0, 10) : usTradingDate.format(date);
}

export function matchCalendarCall(event: CalendarEvent, calls: EarningsCallEvent[], today: string): EarningsCallEvent | undefined {
  if (event.category !== 'earnings' || !event.symbol || event.date > today) return;
  const candidates = calls.filter(call =>
    call.hasTranscript && call.ticker === event.symbol
    && call.status !== 'Scheduled' && call.status !== 'NoCallHeld'
    && (actualCallDay(call) ?? '') <= today
    && !(call.fiscalYear && event.fiscalYear && call.fiscalYear !== event.fiscalYear)
    && !(call.fiscalQuarter && event.fiscalQuarter && call.fiscalQuarter !== event.fiscalQuarter)
  );
  const period = candidates.filter(call => event.fiscalYear && event.fiscalQuarter
    && call.fiscalYear === event.fiscalYear && call.fiscalQuarter === event.fiscalQuarter);
  if (period.length === 1) return period[0];
  const sameDay = (period.length ? period : candidates).filter(call => actualCallDay(call) === event.date);
  return sameDay.length === 1 ? sameDay[0] : undefined;
}
