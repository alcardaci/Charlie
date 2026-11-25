import type { EurostatIndicator } from '../types';
import type { EurostatSeriesDefinition } from './eurostatRegistry';

type EurostatPayload = {
  id?: string[];
  size?: number[];
  value?: Record<string, number>;
  dimension?: Record<string, { category?: { index?: Record<string, number> } }>;
};

function matchesEurostatContract(payload: EurostatPayload, definition: EurostatSeriesDefinition): boolean {
  if (!definition.publicApi) return false;
  const expected = { ...definition.params, geo: 'EA21' };
  return Object.entries(expected).every(([dimension, code]) => {
    const index = payload.dimension?.[dimension]?.category?.index;
    return Boolean(index && Object.prototype.hasOwnProperty.call(index, code));
  });
}

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
  const validContract = matchesEurostatContract(payload, definition);
  const timeIndex = payload.dimension?.time?.category?.index ?? {};
  const series = validContract ? Object.entries(timeIndex)
    .map(([period, index]) => ({ date: normalizeEurostatPeriod(period, definition.frequency), value: payload.value?.[String(index)] }))
    .filter((point): point is { date: string; value: number } => Boolean(point.date) && typeof point.value === 'number' && Number.isFinite(point.value))
    .filter((point) => Math.abs(point.value) <= definition.maxAbsValue)
    .sort((left, right) => left.date.localeCompare(right.date)) : [];
  const latest = series[series.length - 1];
  const previous = series[series.length - 2];
  return {
    id: definition.id,
    label: definition.label,
    shortLabel: definition.shortLabel,
    value: latest?.value ?? null,
    previous: previous?.value ?? null,
    change: latest && previous ? latest.value - previous.value : null,
    date: latest?.date,
    unit: definition.unit,
    unitLabel: definition.unitLabel,
    frequency: definition.frequency,
    seasonalAdjustment: definition.seasonalAdjustment,
    transformation: definition.transformation,
    placement: definition.placement,
    group: definition.group,
    metricKey: definition.metricKey,
    areaScope: definition.areaScope,
    series,
    sourceUrl: definition.sourceUrl,
    coverageNote: definition.coverageNote,
  };
}
