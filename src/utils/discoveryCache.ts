import type { DiscoveryDashboard } from './themeDiscoveryEngine';

export type CachedDiscoverySnapshot = {
  dashboard: DiscoveryDashboard;
  evidenceKey: string;
};

function isAIDiscoveryDashboard(value: unknown): value is DiscoveryDashboard {
  if (!value || typeof value !== 'object') return false;

  const dashboard = value as Partial<DiscoveryDashboard>;
  return dashboard.mode === 'ai' &&
    typeof dashboard.generatedAt === 'string' &&
    typeof dashboard.model === 'string' &&
    Array.isArray(dashboard.themes) &&
    Boolean(dashboard.brief && typeof dashboard.brief === 'object') &&
    Boolean(dashboard.stats && typeof dashboard.stats === 'object');
}

export function isCachedDiscoverySnapshot(value: unknown): value is CachedDiscoverySnapshot {
  if (!value || typeof value !== 'object') return false;

  const snapshot = value as Partial<CachedDiscoverySnapshot>;
  return typeof snapshot.evidenceKey === 'string' && isAIDiscoveryDashboard(snapshot.dashboard);
}
