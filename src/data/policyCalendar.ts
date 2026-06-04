import { CalendarEvent } from '../types';

function buildPolicyEvents(
  dates: string[],
  title: string,
  description: string,
  country: string,
  source: string
): CalendarEvent[] {
  return dates.map((date) => ({
    date,
    title,
    category: 'policy',
    importance: 'high',
    description,
    country,
    source,
  }));
}

// Official 2026 central-bank policy calendars curated from published schedules.
export const POLICY_SCHEDULE_EVENTS: CalendarEvent[] = [
  ...buildPolicyEvents(
    ['2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-16'],
    'FOMC Rate Decision',
    'US Federal Reserve rate decision and press conference.',
    'US',
    'Federal Reserve'
  ),
  ...buildPolicyEvents(
    ['2026-01-30', '2026-03-05', '2026-04-16', '2026-06-04', '2026-07-16', '2026-09-10', '2026-10-22', '2026-12-10'],
    'ECB Rate Decision',
    'European Central Bank monetary policy decision.',
    'EA',
    'European Central Bank'
  ),
  ...buildPolicyEvents(
    ['2026-02-05', '2026-03-19', '2026-05-07', '2026-06-18', '2026-08-06', '2026-09-17', '2026-11-05', '2026-12-17'],
    'BOE Rate Decision',
    'Bank of England monetary policy decision.',
    'GB',
    'Bank of England'
  ),
  ...buildPolicyEvents(
    ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-10', '2026-07-15', '2026-09-02', '2026-10-28', '2026-12-09'],
    'Bank of Canada Rate Decision',
    'Bank of Canada overnight rate announcement.',
    'CA',
    'Bank of Canada'
  ),
  ...buildPolicyEvents(
    ['2026-01-23', '2026-03-19', '2026-04-28', '2026-06-16', '2026-07-31', '2026-09-18', '2026-10-30', '2026-12-18'],
    'BOJ Policy Decision',
    'Bank of Japan monetary policy meeting decision.',
    'JP',
    'Bank of Japan'
  ),
  ...buildPolicyEvents(
    ['2026-03-19', '2026-06-18', '2026-09-24', '2026-12-10'],
    'SNB Monetary Policy Assessment',
    'Swiss National Bank monetary policy assessment and press conference.',
    'CH',
    'Swiss National Bank'
  ),
  ...buildPolicyEvents(
    ['2026-01-29', '2026-03-19', '2026-05-07', '2026-06-17', '2026-08-20', '2026-09-24', '2026-11-04', '2026-12-16'],
    'Riksbank Policy Decision',
    'Sveriges Riksbank policy rate decision and publication.',
    'SE',
    'Sveriges Riksbank'
  ),
  ...buildPolicyEvents(
    ['2026-01-22', '2026-03-26', '2026-05-07', '2026-06-18', '2026-08-13', '2026-09-24', '2026-11-05', '2026-12-17'],
    'Norges Bank Policy Decision',
    'Norges Bank policy rate decision and monetary policy publication.',
    'NO',
    'Norges Bank'
  ),
  ...buildPolicyEvents(
    ['2026-02-03', '2026-03-17', '2026-05-05', '2026-06-16', '2026-08-11', '2026-09-29', '2026-11-03', '2026-12-08'],
    'RBA Rate Decision',
    'Reserve Bank of Australia monetary policy board decision.',
    'AU',
    'Reserve Bank of Australia'
  ),
  ...buildPolicyEvents(
    ['2026-02-18', '2026-04-08', '2026-05-27', '2026-07-08', '2026-09-02', '2026-10-28', '2026-12-09'],
    'RBNZ OCR Decision',
    'Reserve Bank of New Zealand OCR decision and monetary policy publication.',
    'NZ',
    'Reserve Bank of New Zealand'
  ),
];
