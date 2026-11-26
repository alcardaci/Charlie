import type { MacroSeriesPoint } from '../types';

type TrendPalette = {
  accent: string;
  blue: string;
  purple: string;
  positive: string;
  negative: string;
};

const DASH_PATTERNS = ['0.1 3.6', '8 4', '2 4', '10 3 2 3', '4 3', '12 4', '2 2', '8 3 2 3', '4 2 2 2', '12 3 3 3'];

const MACRO_NUMBER_FORMATS = [0, 1, 2].map(maximumFractionDigits => (
  new Intl.NumberFormat('en-US', { maximumFractionDigits })
));

export function formatMacroNumber(value: number, decimals: 0 | 1 | 2 = 2): string {
  return Number.isFinite(value) ? MACRO_NUMBER_FORMATS[decimals].format(value) : '—';
}

export function formatMacroReading(value: number | null, unit: string): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const n = formatMacroNumber(value, unit === 'jobs' ? 0 : 2);
  if (unit.startsWith('%')) return n + unit;
  if (unit === 'billion EUR') return `€${n}bn`;
  if (unit === 'USD/hour') return `$${n}/hour`;
  return `${n} ${unit}`;
}

/** Keep each effective change and both ends of the observed date range. */
export function collapseRateHistory(series: MacroSeriesPoint[]): MacroSeriesPoint[] {
  return series.filter((point, index) => index === 0 || index === series.length - 1 || point.value !== series[index - 1].value);
}

/** Keep longer comparisons distinguishable in either theme, including their legend labels. */
export function getMacroSeriesStyle(index: number, palette: TrendPalette) {
  const colors = Array.from(new Set([
    palette.accent, palette.blue, palette.purple, palette.positive, palette.negative,
    ...['#e0a526', '#21b7c7', '#ef80b0', '#9bbf45', '#a2a9bd', '#b78c63']
      .map(color => `color-mix(in srgb, ${color} 64%, var(--terminal-text))`),
  ]));
  return {
    stroke: colors[index % colors.length],
    strokeDasharray: DASH_PATTERNS[index % DASH_PATTERNS.length],
  };
}

/** Missing observations stay missing rather than being interpolated across dates. */
export function buildMacroTrendRows(indicators: Array<{
  id: string;
  series: Array<{ date: string; value: number }>;
}>): Array<Record<string, string | number | null>> {
  const rows = new Map<string, Record<string, string | number | null>>();
  for (const indicator of indicators) {
    for (const point of indicator.series) {
      if (!Number.isFinite(point.value)) continue;
      let row = rows.get(point.date);
      if (!row) {
        row = { date: point.date };
        for (const item of indicators) row[item.id] = null;
        rows.set(point.date, row);
      }
      row[indicator.id] = point.value;
    }
  }
  return [...rows.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, row]) => row);
}

/** A change between percentage readings is measured in percentage points. */
export function macroDeltaUnit(unit: string): string {
  return unit.trim().startsWith('%') ? 'pp' : unit;
}

/** An observation date is not the time its API response was retrieved. */
export function macroObservationAge(date: string | undefined, frequency: string | undefined, now = Date.now()): string | null {
  if (!date) return null;
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp)) return 'Observation date unavailable';
  const ageDays = (now - timestamp) / 86_400_000;
  if (ageDays < -7) return 'Future observation date';
  const thresholds: Record<string, number> = { daily: 14, monthly: 120, quarterly: 240, annual: 730 };
  const threshold = thresholds[frequency ?? ''] ?? 365;
  return ageDays > threshold ? `Older observation · ${Math.floor(ageDays)} days since reference date` : null;
}
