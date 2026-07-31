import type { EarlySignalEvidence } from './earlySignalsEngine';

const EARLY_SIGNALS_STORAGE_KEY = 'charlie-early-signals-history-v1';
const LOCAL_STATE_API_PREFIX = '/api/local-state/';

type EarlySignalsHistoryEnvelope = {
  version: 1;
  savedAt: string;
  evidence: EarlySignalEvidence[];
};

function parseEnvelope(value: string | null): EarlySignalsHistoryEnvelope | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as EarlySignalsHistoryEnvelope;
    if (parsed?.version !== 1 || !Array.isArray(parsed.evidence)) return null;
    return parsed;
  } catch {
    return null;
  }
}
function localStateUrl(): string {
  return `${LOCAL_STATE_API_PREFIX}${encodeURIComponent(EARLY_SIGNALS_STORAGE_KEY)}`;
}

export async function loadEarlySignalEvidence(signal?: AbortSignal): Promise<EarlySignalEvidence[]> {
  if (typeof window === 'undefined') return [];

  const local = parseEnvelope(window.localStorage.getItem(EARLY_SIGNALS_STORAGE_KEY));
  if (local) return local.evidence;

  try {
    const response = await fetch(localStateUrl(), {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { value?: string | null };
    const disk = parseEnvelope(typeof payload.value === 'string' ? payload.value : null);
    if (!disk) return [];
    window.localStorage.setItem(EARLY_SIGNALS_STORAGE_KEY, JSON.stringify(disk));
    return disk.evidence;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return [];
  }
}

export async function saveEarlySignalEvidence(
  evidence: EarlySignalEvidence[],
  signal?: AbortSignal,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const envelope: EarlySignalsHistoryEnvelope = {
    version: 1,
    savedAt: new Date().toISOString(),
    evidence,
  };
  const value = JSON.stringify(envelope);
  window.localStorage.setItem(EARLY_SIGNALS_STORAGE_KEY, value);

  try {
    await fetch(localStateUrl(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    // Browser storage remains the primary cache if disk mirroring is unavailable.
  }
}
