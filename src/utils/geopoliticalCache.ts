import type { CountryNewsCount, NewsItem, NewsRegionKey } from '../types';

const NEWS_REGION_KEYS = new Set<NewsRegionKey>([
  'north-america',
  'latin-america',
  'europe',
  'africa',
  'middle-east',
  'asia-pacific',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isCachedNewsItem(value: unknown): value is NewsItem {
  if (!isRecord(value)) return false;

  return typeof value.title === 'string' &&
    typeof value.publisher === 'string' &&
    typeof value.link === 'string' &&
    isFiniteNumber(value.publishedAt);
}

function isPersistedCountryCount(value: unknown): value is CountryNewsCount {
  if (!isRecord(value)) return false;

  return typeof value.key === 'string' && value.key.trim().length > 0 &&
    typeof value.label === 'string' && value.label.trim().length > 0 &&
    typeof value.shortLabel === 'string' && value.shortLabel.trim().length > 0 &&
    typeof value.countryCode === 'string' && value.countryCode.trim().length > 0 &&
    typeof value.region === 'string' && NEWS_REGION_KEYS.has(value.region as NewsRegionKey) &&
    isFiniteNumber(value.count) && value.count >= 0 &&
    typeof value.query === 'string' &&
    typeof value.source === 'string' &&
    isNullableFiniteNumber(value.latestAt) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y);
}

export function sanitizePersistedCountryCounts(value: unknown): CountryNewsCount[] | null {
  if (!Array.isArray(value)) return null;

  const countries = value
    .filter(isPersistedCountryCount)
    .map((country) => ({
      ...country,
      countryCode: country.countryCode.trim().toUpperCase(),
      stories: Array.isArray(country.stories)
        ? country.stories.filter(isCachedNewsItem)
        : [],
      hotspotSummarySources: Array.isArray(country.hotspotSummarySources)
        ? country.hotspotSummarySources.filter(isCachedNewsItem)
        : [],
    }));

  if (countries.length === 0 && value.length > 0) return null;
  return countries;
}
