import type { EurostatIndicator } from '../types';
import type { EurostatSeriesDefinition } from './eurostatRegistry';

type EurostatPayload = {
  id?: string[];
  size?: number[];
  value?: Record<string, number>;
  dimension?: Record<string, { category?: { index?: Record<string, number> } }>;
};

export function normalizeEurostatPeriod(value: string, frequency: EurostatSeriesDefinition['frequency']): string | null {
  if (frequency === 'monthly' && /^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  const quarter = value.match(/^(\d{4})-Q([1-4])$/);
  if (frequency === 'quarterly' && quarter) {
    const month = String((Number(quarter[2]) - 1) * 3 + 1).padStart(2, '0');
    return `${quarter[1]}-${month}-01`;
  }
  return null;
}

export function normalizeEurostatSeries(payload: EurostatPayload, definition: EurostatSeriesDefinition): EurostatIndicator {
  const timeIndex = payload.dimension?.time?.category?.index ?? {};
  const series = Object.entries(timeIndex)
    .map(([period, index]) => ({ date: normalizeEurostatPeriod(period, definition.frequency), value: Number(payload.value?.[String(index)]) }))
    .filter((point): point is { date: string; value: number } => Boolean(point.date) && Number.isFinite(point.value))
    .filter((point) => Math.abs(point.value) <= (definition.unit === '%' ? 50 : 1_000))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-24);
  const latest = series[series.length - 1];
  const previous = series[series.length - 2];
  return {
    id: definition.id,
    label: definition.label,
    value: latest?.value ?? null,
    previous: previous?.value ?? null,
    change: latest && previous ? latest.value - previous.value : null,
    date: latest?.date,
    unit: definition.unit,
    frequency: definition.frequency,
    placement: definition.placement,
    metricKey: definition.metricKey,
    areaScope: definition.areaScope,
    series,
    sourceUrl: definition.sourceUrl,
  };
}
