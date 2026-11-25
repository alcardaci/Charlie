import type { MacroSeriesPoint } from '../types';

export const MACRO_WINDOWS = [
  { key: '1M', months: 1 }, { key: '3M', months: 3 }, { key: '6M', months: 6 },
  { key: '1Y', months: 12 }, { key: '2Y', months: 24 }, { key: '5Y', months: 60 },
  { key: '10Y', months: 120 },
] as const;
export type MacroWindow = typeof MACRO_WINDOWS[number]['key'] | 'All';
export type MacroHistory = { series: MacroSeriesPoint[]; step?: boolean };

function monthsBefore(end: number, months: number): number {
  const d = new Date(end);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months + 1, 0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, Math.min(d.getUTCDate(), lastDay));
}

export function macroBounds(histories: MacroHistory[]): [number, number] {
  const nonempty = histories.filter(h => h.series.length);
  return [
    Math.min(...nonempty.map(h => Date.parse(h.series[0].date))),
    Math.max(...nonempty.map(h => Date.parse(h.series[h.series.length - 1].date))),
  ];
}

/** Dates come in ascending order from the provider adapters. Require real coverage for each line. */
export function availableMacroWindows(histories: MacroHistory[]): MacroWindow[] {
  const nonempty = histories.filter(h => h.series.length);
  const [, end] = macroBounds(nonempty);
  if (!Number.isFinite(end)) return [];
  const windows = MACRO_WINDOWS.filter(({ months }) => {
    const start = monthsBefore(end, months);
    return nonempty.every(({ series, step }) => {
      if (Date.parse(series[0].date) > start || series.length < 2) return false;
      const last = Date.parse(series[series.length - 1].date);
      return step ? last > start : Date.parse(series[series.length - 2].date) >= start;
    });
  });
  return [...windows.map(w => w.key), 'All'];
}

export function windowStart(range: MacroWindow, bounds: [number, number]): number {
  const preset = MACRO_WINDOWS.find(w => w.key === range);
  return preset ? monthsBefore(bounds[1], preset.months) : bounds[0];
}

export function sliceMacroHistory({ series, step }: MacroHistory, start: number): MacroSeriesPoint[] {
  const first = series.findIndex(p => Date.parse(p.date) >= start);
  if (first < 0) return [];
  const visible = series.slice(first);
  // A published policy rate stays in force until its next effective change.
  if (step && first > 0 && Date.parse(visible[0].date) > start) {
    visible.unshift({ date: new Date(start).toISOString().slice(0, 10), value: series[first - 1].value });
  }
  return visible;
}
